import Message from "../models/Message.js";
import Project from "../models/Project.js";
import Membership from "../models/Membership.js";
import ApiError from "../utils/ApiError.js";
import { getProjectFor } from "../utils/access.js";
import { notify } from "../utils/events.js";
import { emitToProject, emitToUser, onlineUserIds } from "../services/realtime.js";

// Channels: the projects you lead or belong to. Direct messages: anyone in your organization.
async function getConversations(req) {
    const projects = await Project.find({ org: req.org._id, $or: [{ owner: req.user._id }, { members: req.user._id }] }).select("name members").sort({ name: 1 });
    const memberships = await Membership.find({ org: req.org._id, user: { $ne: req.user._id } })
        .populate("user", "fullName email avatar")
        .populate("role", "name");
    const contacts = memberships
        .filter((m) => m.user)
        .map((m) => ({ ...m.user.toObject(), roleName: m.role?.name }))
        .sort((a, b) => a.fullName.localeCompare(b.fullName));
    return { projects, contacts };
}

// GET /api/messages/conversations — channels, people, unread direct messages and who's online.
export async function listConversations(req, res) {
    const { projects, contacts } = await getConversations(req);
    const unread = await Message.aggregate([
        { $match: { org: req.org._id, project: null, recipient: req.user._id, readAt: null } },
        { $group: { _id: "$sender", count: { $sum: 1 } } }
    ]);
    const unreadBy = new Map(unread.map((u) => [String(u._id), u.count]));
    const online = new Set(onlineUserIds(req.org._id));

    // The latest message in each channel and each direct conversation (preview + time in the list).
    const preview = (m) => (m ? { text: m.text.slice(0, 120), at: m.createdAt, mine: String(m.sender) === String(req.user._id), sender: m.sender } : null);
    const [lastInChannel, lastDirect] = await Promise.all([
        Message.aggregate([
            { $match: { project: { $in: projects.map((p) => p._id) } } },
            { $sort: { createdAt: -1 } },
            { $group: { _id: "$project", text: { $first: "$text" }, createdAt: { $first: "$createdAt" }, sender: { $first: "$sender" } } }
        ]),
        Message.aggregate([
            { $match: { org: req.org._id, project: null, $or: [{ sender: req.user._id }, { recipient: req.user._id }] } },
            { $sort: { createdAt: -1 } },
            { $group: { _id: { $cond: [{ $eq: ["$sender", req.user._id] }, "$recipient", "$sender"] }, text: { $first: "$text" }, createdAt: { $first: "$createdAt" }, sender: { $first: "$sender" } } }
        ])
    ]);
    const channelLast = new Map(lastInChannel.map((m) => [String(m._id), m]));
    const directLast = new Map(lastDirect.map((m) => [String(m._id), m]));
    const nameOf = new Map(contacts.map((c) => [String(c._id), c.fullName]));
    const channelPreview = (id) => {
        const last = preview(channelLast.get(String(id)));
        return last ? { ...last, senderName: last.mine ? "You" : nameOf.get(String(last.sender)) || "" } : null;
    };

    res.json({
        channels: projects.map((p) => ({ _id: p._id, name: p.name, memberCount: p.members.length + 1, last: channelPreview(p._id) })),
        contacts: contacts.map((c) => ({ ...c, unread: unreadBy.get(String(c._id)) || 0, online: online.has(String(c._id)), last: preview(directLast.get(String(c._id))) }))
    });
}

// Builds the MongoDB filter for one conversation after checking the user may read it.
async function conversationFilter(req, { project, user: otherUserId }) {
    if (project) {
        const found = await getProjectFor(req, project);
        if (!found.hasAccess(req.user._id)) throw new ApiError(403, "Only project members can use its channel.");
        return { project };
    }
    if (otherUserId) {
        if (!(await Membership.exists({ org: req.org._id, user: otherUserId }))) {
            throw new ApiError(403, "You can only message people in your organization.");
        }
        return {
            org: req.org._id,
            project: null,
            $or: [
                { sender: req.user._id, recipient: otherUserId },
                { sender: otherUserId, recipient: req.user._id }
            ]
        };
    }
    throw new ApiError(400, "Choose a project channel or a person.");
}

// GET /api/messages?project=<id>  or  ?user=<id>   (&after=<ISO date> to fetch only new ones)
export async function listMessages(req, res) {
    const filter = await conversationFilter(req, req.query);
    if (req.query.after) filter.createdAt = { $gt: new Date(req.query.after) };

    const messages = await Message.find(filter).populate("sender", "fullName avatar").sort({ createdAt: 1 }).limit(200);
    res.json({ messages });
}

// POST /api/messages  body: { project | user, text }
export async function sendMessage(req, res) {
    const { project, user: recipient, text } = req.body;
    await conversationFilter(req, { project, user: recipient });

    const message = await Message.create({
        org: req.org._id,
        sender: req.user._id,
        project: project || null,
        recipient: project ? null : recipient,
        text
    });
    await message.populate("sender", "fullName avatar");

    // Deliver instantly: to the project channel, or to both people in a direct message.
    const payload = { message, orgId: String(req.org._id) };
    if (project) {
        emitToProject(project, "message:new", payload);
    } else {
        emitToUser(recipient, "message:new", payload);
        emitToUser(req.user._id, "message:new", payload);
        // Only a bell notification if they aren't online to see it arrive.
        if (!onlineUserIds(req.org._id).includes(String(recipient))) {
            await notify(recipient, `New message from ${req.user.fullName}.`, `/messages?user=${req.user._id}`, "info", req.org._id);
        }
    }
    res.status(201).json({ message });
}
