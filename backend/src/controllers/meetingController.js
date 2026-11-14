import crypto from "node:crypto";
import Meeting from "../models/Meeting.js";
import Membership from "../models/Membership.js";
import Project from "../models/Project.js";
import ApiError from "../utils/ApiError.js";
import { getProjectFor } from "../utils/access.js";
import { notify } from "../utils/events.js";
import { limitsOf, planError } from "../services/plans.js";
import { createMeetingEvent, deleteEvent } from "../services/google.js";
import { sendMeetingInvite } from "../services/mailer.js";
import { emitToUser, meetingRoomSize } from "../services/realtime.js";

const PEOPLE = "fullName email avatar";
const roomCode = () => crypto.randomBytes(9).toString("base64url").replace(/[-_]/g, "x").slice(0, 10).toLowerCase();

// STUN lets browsers find their public address; a TURN relay (optional, set in .env) helps when
// two people are behind strict networks that block direct connections.
export function iceServers() {
    const servers = [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }];
    if (process.env.TURN_URL) {
        servers.push({ urls: process.env.TURN_URL.split(","), username: process.env.TURN_USERNAME, credential: process.env.TURN_CREDENTIAL });
    }
    return servers;
}

function present(meeting, req) {
    const plain = meeting.toObject();
    return {
        ...plain,
        isHost: String(meeting.host?._id ?? meeting.host) === String(req.user._id),
        endsAt: new Date(meeting.startsAt.getTime() + meeting.durationMinutes * 60000),
        live: meetingRoomSize(meeting.roomId)
    };
}

// GET /api/meetings — meetings you host, were invited to, or that belong to your projects.
export async function listMeetings(req, res) {
    const myProjects = (await Project.find({ org: req.org._id, $or: [{ owner: req.user._id }, { members: req.user._id }] }).select("_id")).map((p) => p._id);
    const meetings = await Meeting.find({
        org: req.org._id,
        status: { $ne: "cancelled" },
        $or: [{ host: req.user._id }, { participants: req.user._id }, { project: { $in: myProjects } }, { openToOrg: true }],
        startsAt: { $gte: new Date(Date.now() - 30 * 864e5) }
    })
        .populate("host", PEOPLE)
        .populate("participants", PEOPLE)
        .populate("project", "name")
        .sort({ startsAt: 1 })
        .limit(200);
    res.json({ meetings: meetings.map((m) => present(m, req)), limits: { minutes: limitsOf(req.org).meetingMinutes, participants: limitsOf(req.org).meetingParticipants } });
}

// GET /api/meetings/room/:roomId — details for the meeting room page.
export async function getMeeting(req, res) {
    const meeting = await Meeting.findOne({ roomId: req.params.roomId, org: req.org._id })
        .populate("host", PEOPLE).populate("participants", PEOPLE).populate("project", "name owner members");
    if (!meeting || meeting.status === "cancelled") throw new ApiError(404, "Meeting not found.");
    if (!meeting.canJoin(req.user._id, meeting.project)) throw new ApiError(403, "You weren't invited to this meeting.");
    res.json({ meeting: present(meeting, req), iceServers: iceServers(), limits: { minutes: limitsOf(req.org).meetingMinutes, participants: limitsOf(req.org).meetingParticipants } });
}

// POST /api/meetings
// body: { title, description, startsAt, durationMinutes, participantIds: [], projectId?, addGoogleMeet?, instant? }
// "instant" starts now and lets anyone in the project (or organization) join.
export async function createMeeting(req, res) {
    const limits = limitsOf(req.org);
    const instant = Boolean(req.body.instant);
    const title = String(req.body.title || "").trim() || (instant ? "Quick meeting" : "");
    if (!title) throw new ApiError(400, "Give the meeting a title.");

    const durationMinutes = Number(req.body.durationMinutes) || 30;
    if (durationMinutes < 5 || durationMinutes > 600) throw new ApiError(400, "Meetings can be 5 minutes to 10 hours long.");
    if (limits.meetingMinutes !== null && durationMinutes > limits.meetingMinutes) throw planError(req.org, "meetingMinutes", limits.meetingMinutes);

    const startsAt = instant ? new Date() : new Date(req.body.startsAt);
    if (Number.isNaN(startsAt.getTime())) throw new ApiError(400, "Choose when the meeting starts.");
    if (!instant && startsAt < new Date(Date.now() - 5 * 60000)) throw new ApiError(400, "That time has already passed.");

    const project = req.body.projectId ? await getProjectFor(req, req.body.projectId) : null;
    if (project && !project.hasAccess(req.user._id)) throw new ApiError(403, "You can only start meetings in projects you're part of.");

    // Only people in this organization can be invited.
    const requested = [...new Set((req.body.participantIds || []).map(String))].filter((id) => id !== String(req.user._id));
    const members = await Membership.find({ org: req.org._id, user: { $in: requested } }).populate("user", "fullName email emailReminders");
    const participants = members.map((m) => m.user).filter(Boolean);
    if (!instant && !participants.length && !project) throw new ApiError(400, "Invite at least one person, or pick a project.");
    if (participants.length + 1 > limits.meetingParticipants) throw planError(req.org, "meetingParticipants", limits.meetingParticipants);

    const meeting = await Meeting.create({
        org: req.org._id,
        project: project?._id || null,
        title,
        description: String(req.body.description || "").trim(),
        host: req.user._id,
        participants: participants.map((p) => p._id),
        openToOrg: instant && !project,
        startsAt,
        durationMinutes,
        roomId: roomCode()
    });

    // Google Calendar (host connected): the event invites everyone, optionally with a Meet link.
    let googleInvited = false;
    try {
        const event = await createMeetingEvent(req.user._id, meeting, participants.map((p) => p.email), { withMeet: Boolean(req.body.addGoogleMeet) });
        if (event) {
            meeting.googleEventId = event.id;
            meeting.meetLink = event.meetLink;
            await meeting.save();
            googleInvited = true;
        }
    } catch (error) {
        console.error("Google Calendar meeting failed:", error.message);
    }

    const when = instant ? "now" : startsAt.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });
    await Promise.all(participants.map(async (person) => {
        await notify(person._id, `${req.user.fullName} invited you to "${title}" (${when}).`, `/meet/${meeting.roomId}`, "people", req.org._id);
        // Google already emailed an invitation if the host's calendar is connected.
        if (!googleInvited && !instant) await sendMeetingInvite(person, { meeting, hostName: req.user.fullName, when });
        if (instant) emitToUser(person._id, "meeting:ring", { roomId: meeting.roomId, title, host: req.user.fullName, orgId: String(req.org._id) });
    }));

    await meeting.populate([{ path: "host", select: PEOPLE }, { path: "participants", select: PEOPLE }, { path: "project", select: "name" }]);
    res.status(201).json({ meeting: present(meeting, req), googleInvited });
}

// DELETE /api/meetings/:id — the host cancels it.
export async function cancelMeeting(req, res) {
    const meeting = await Meeting.findOne({ _id: req.params.id, org: req.org._id });
    if (!meeting) throw new ApiError(404, "Meeting not found.");
    if (String(meeting.host) !== String(req.user._id)) throw new ApiError(403, "Only the host can cancel this meeting.");
    meeting.status = "cancelled";
    await meeting.save();
    if (meeting.googleEventId) await Promise.resolve(deleteEvent(req.user._id, meeting.googleEventId)).catch(() => {});
    await Promise.all(meeting.participants.map((p) => notify(p, `${req.user.fullName} cancelled "${meeting.title}".`, "/meetings", "people", req.org._id)));
    res.json({ message: "Meeting cancelled." });
}
