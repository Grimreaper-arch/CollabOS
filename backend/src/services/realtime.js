// Real-time updates with Socket.io: chat messages, typing indicators, who's online, read receipts,
// notifications and live task changes, without the browser having to keep asking.
//
// Rooms (a socket joins several):
//   user:<userId>        everything addressed to one person (notifications, direct messages)
//   org:<orgId>          everyone currently working in an organization (presence)
//   project:<projectId>  members of a project (channel messages, task changes)
//
// Controllers call emitToUser / emitToProject / emitToOrg. Before the server starts (seed scripts,
// tests) those do nothing.
import jwt from "jsonwebtoken";
import { Server } from "socket.io";
import User from "../models/User.js";
import Project from "../models/Project.js";
import Message from "../models/Message.js";
import Membership from "../models/Membership.js";
import Meeting from "../models/Meeting.js";
import CodeFile from "../models/CodeFile.js";
import * as Y from "yjs";
import { canManageProject } from "../utils/access.js";
import { limitsOf } from "./plans.js";
import { loadAccess } from "../middleware/auth.js";
import { visibleProjectFilter } from "../utils/access.js";

let io = null;

// orgId → Map(userId → number of open tabs). Someone is online while they have at least one.
const online = new Map();

export const emitToUser = (userId, event, payload) => io?.to(`user:${userId}`).emit(event, payload);
export const emitToProject = (projectId, event, payload) => io?.to(`project:${projectId}`).emit(event, payload);
export const emitToOrg = (orgId, event, payload) => io?.to(`org:${orgId}`).emit(event, payload);

// Keep project rooms in sync when people are added to or removed from a project.
export function joinProjectRoom(userId, projectId) {
    io?.in(`user:${userId}`).socketsJoin(`project:${projectId}`);
}
export function leaveProjectRoom(userId, projectId) {
    io?.in(`user:${userId}`).socketsLeave(`project:${projectId}`);
}

// The user's role or membership changed: their open tabs reload the session (permissions, org list).
// If they were removed from the organization, its sockets are closed as well.
export async function sessionChanged(userId, { removedFrom } = {}) {
    if (!io) return;
    io.to(`user:${userId}`).emit("session:changed");
    if (removedFrom) {
        const sockets = await io.in(`user:${userId}`).fetchSockets();
        sockets.filter((s) => s.data.orgId === String(removedFrom)).forEach((s) => s.disconnect(true));
    }
}

function setOnline(orgId, userId, delta) {
    const users = online.get(orgId) ?? new Map();
    const count = (users.get(userId) || 0) + delta;
    if (count > 0) users.set(userId, count);
    else users.delete(userId);
    online.set(orgId, users);
    return count;
}

export const onlineUserIds = (orgId) => [...(online.get(String(orgId))?.keys() ?? [])];

// Checks the access token and organization sent when the socket connects:
//   io({ auth: { token, orgId } })
async function authenticate(socket, next) {
    try {
        const { token, orgId } = socket.handshake.auth || {};
        let payload;
        try {
            payload = jwt.verify(token, process.env.JWT_SECRET);
        } catch (error) {
            return next(new Error(error.name === "TokenExpiredError" ? "TOKEN_EXPIRED" : "UNAUTHORIZED"));
        }
        const user = await User.findById(payload.id);
        if (!user || payload.type !== "access" || payload.v !== (user.tokenVersion || 0) || !user.emailVerified) {
            return next(new Error("UNAUTHORIZED"));
        }
        // Reuse the same membership/permission logic as the REST API.
        const access = { user, headers: { "x-org-id": orgId } };
        await loadAccess(access);
        if (!access.org || String(access.org._id) !== String(orgId)) return next(new Error("NOT_A_MEMBER"));
        socket.data = { user, access, orgId: String(access.org._id), userId: String(user._id) };
        next();
    } catch {
        next(new Error("UNAUTHORIZED"));
    }
}

async function onConnection(socket) {
    const { userId, orgId, access, user } = socket.data;
    socket.join(`user:${userId}`);
    socket.join(`org:${orgId}`);
    const projects = await Project.find(visibleProjectFilter(access)).select("_id owner members");
    projects.filter((p) => p.hasAccess(user._id)).forEach((p) => socket.join(`project:${p._id}`));

    // Presence: tell the organization when someone's first tab connects / last tab closes.
    if (setOnline(orgId, userId, 1) === 1) socket.to(`org:${orgId}`).emit("presence", { userId, online: true });
    socket.emit("presence:list", { userIds: onlineUserIds(orgId) });

    // Typing indicator: { project } or { user }. Relayed, never stored.
    socket.on("typing", async ({ project, user: toUser, typing } = {}) => {
        const payload = { from: userId, name: user.fullName, typing: Boolean(typing) };
        if (project && socket.rooms.has(`project:${project}`)) socket.to(`project:${project}`).emit("typing", { ...payload, project });
        else if (toUser && (await Membership.exists({ org: orgId, user: toUser }))) io.to(`user:${toUser}`).emit("typing", { ...payload, user: userId, orgId });
    });

    // Read receipts for direct messages: { user: <the other person> }.
    socket.on("messages:read", async ({ user: otherId } = {}) => {
        if (!otherId) return;
        const at = new Date();
        const { modifiedCount } = await Message.updateMany(
            { org: orgId, project: null, sender: otherId, recipient: userId, readAt: null },
            { readAt: at }
        );
        if (modifiedCount) io.to(`user:${otherId}`).emit("messages:read", { by: userId, orgId, at });
    });

    registerMeetingHandlers(socket);
    registerCodeHandlers(socket);

    socket.on("disconnect", () => {
        leaveMeeting(socket);
        leaveAllCodeDocs(socket);
        if (setOnline(orgId, userId, -1) === 0) io.to(`org:${orgId}`).emit("presence", { userId, online: false });
    });
}

export function initRealtime(httpServer) {
    io = new Server(httpServer, {
        cors: { origin: process.env.CLIENT_URL || "http://localhost:5173", credentials: true }
    });
    io.use(authenticate);
    io.on("connection", (socket) => onConnection(socket).catch((error) => console.error("Socket error:", error.message)));
    return io;
}

// ---------------------------------------------------------------------------------------------
// Meetings: WebRTC signalling.
// Each browser connects directly to every other browser in the room ("mesh"). The server only
// passes along the messages they need to find each other (SDP offers/answers and ICE candidates),
// keeps the participant list, and ends the meeting when the plan's time limit is reached.

// roomId → { meetingId, orgId, endsAt, timer, peers: Map(socketId → { userId, name, avatar, audio, video, screen }) }
const meetingRooms = new Map();

export const meetingRoomSize = (roomId) => meetingRooms.get(roomId)?.peers.size || 0;

async function endMeeting(roomId, reason) {
    const room = meetingRooms.get(roomId);
    if (!room) return;
    clearTimeout(room.timer);
    meetingRooms.delete(roomId);
    io.to(`meet:${roomId}`).emit("meet:ended", { reason });
    io.in(`meet:${roomId}`).socketsLeave(`meet:${roomId}`);
    await Meeting.updateOne({ _id: room.meetingId }, { status: "ended", endedAt: new Date() });
}

function leaveMeeting(socket) {
    const roomId = socket.data.meetingRoom;
    const room = roomId && meetingRooms.get(roomId);
    socket.data.meetingRoom = null;
    if (!room) return;
    room.peers.delete(socket.id);
    socket.leave(`meet:${roomId}`);
    socket.to(`meet:${roomId}`).emit("meet:peer-left", { socketId: socket.id });
    if (!room.peers.size) endMeeting(roomId, "Everyone left.").catch(() => {});
}

function registerMeetingHandlers(socket) {
    const { userId, orgId, user, access } = socket.data;

    // Join a room. Replies (ack) with the people already there; the newcomer then sends each of
    // them a WebRTC offer.
    socket.on("meet:join", async ({ roomId } = {}, ack = () => {}) => {
        try {
            const meeting = await Meeting.findOne({ roomId, org: orgId });
            if (!meeting || meeting.status === "cancelled") return ack({ error: "Meeting not found." });
            const project = meeting.project ? await Project.findById(meeting.project) : null;
            if (!meeting.canJoin(userId, project)) return ack({ error: "You weren't invited to this meeting." });

            const limits = limitsOf(access.org);
            let room = meetingRooms.get(roomId);
            if (room && room.peers.size >= limits.meetingParticipants) {
                return ack({ error: `This meeting is full. The ${access.org.subscription?.plan === "starter" || !access.org.subscription?.plan ? "Starter" : "current"} plan allows ${limits.meetingParticipants} people per meeting.`, code: "PLAN_LIMIT" });
            }
            if (socket.data.meetingRoom) leaveMeeting(socket);

            if (!room) {
                // First person in: the meeting goes live, and the plan's time limit starts counting.
                const endsAt = limits.meetingMinutes === null ? null : new Date(Date.now() + limits.meetingMinutes * 60000);
                room = { meetingId: meeting._id, orgId, endsAt, peers: new Map(), timer: null };
                if (endsAt) room.timer = setTimeout(() => endMeeting(roomId, `The ${limits.meetingMinutes}-minute limit of the free plan was reached.`).catch(() => {}), endsAt - Date.now());
                meetingRooms.set(roomId, room);
                await Meeting.updateOne({ _id: meeting._id }, { status: "live", startedAt: new Date(), endedAt: null });
            }

            const me = { userId, name: user.fullName, avatar: user.avatar || "", audio: true, video: true, screen: false };
            const peers = [...room.peers.entries()].map(([socketId, peer]) => ({ socketId, ...peer }));
            room.peers.set(socket.id, me);
            socket.data.meetingRoom = roomId;
            socket.join(`meet:${roomId}`);
            socket.to(`meet:${roomId}`).emit("meet:peer-joined", { socketId: socket.id, ...me });
            ack({ peers, endsAt: room.endsAt, selfId: socket.id });
        } catch (error) {
            ack({ error: error.message });
        }
    });

    // SDP offers/answers and ICE candidates, passed to one other person in the same room.
    socket.on("meet:signal", ({ to, data } = {}) => {
        const roomId = socket.data.meetingRoom;
        if (roomId && meetingRooms.get(roomId)?.peers.has(to)) io.to(to).emit("meet:signal", { from: socket.id, data });
    });

    // Microphone / camera / screen-share on or off, shown on everyone's tiles.
    socket.on("meet:state", (state = {}) => {
        const roomId = socket.data.meetingRoom;
        const peer = roomId && meetingRooms.get(roomId)?.peers.get(socket.id);
        if (!peer) return;
        ["audio", "video", "screen"].forEach((key) => { if (typeof state[key] === "boolean") peer[key] = state[key]; });
        socket.to(`meet:${roomId}`).emit("meet:peer-state", { socketId: socket.id, audio: peer.audio, video: peer.video, screen: peer.screen });
    });

    // In-meeting chat (not saved).
    socket.on("meet:chat", ({ text } = {}) => {
        const roomId = socket.data.meetingRoom;
        const clean = String(text || "").trim().slice(0, 500);
        if (roomId && clean) io.to(`meet:${roomId}`).emit("meet:chat", { from: user.fullName, userId, text: clean, at: new Date() });
    });

    socket.on("meet:leave", () => leaveMeeting(socket));

    // The host can end the meeting for everyone.
    socket.on("meet:end", async () => {
        const roomId = socket.data.meetingRoom;
        const room = roomId && meetingRooms.get(roomId);
        if (!room) return;
        const meeting = await Meeting.findById(room.meetingId);
        if (meeting && String(meeting.host) === userId) await endMeeting(roomId, `${user.fullName} ended the meeting.`);
    });
}

// ---------------------------------------------------------------------------------------------
// Code page: live collaborative editing.
// Each open file has a shared document (a Yjs "CRDT": a data structure that lets several people
// type at once and always end up with the same text, whatever order the edits arrive in).
// The server keeps one copy in memory while anyone has the file open, applies everyone's edits to
// it and passes them on. Saving (Ctrl+S) still writes the text to MongoDB through the REST API.

// fileId → { doc, text, projectId, peers: Map(socketId → { userId, name, avatar, clientId, canEdit }) }
const codeDocs = new Map();
const normalize = (text) => String(text || "").replace(/\r\n?/g, "\n");

function presenceOf(entry) {
    const seen = new Map();
    entry.peers.forEach((p) => seen.set(p.userId, { userId: p.userId, name: p.name, avatar: p.avatar }));
    return [...seen.values()];
}

// Who has which file open in a project (shown as avatars in the file explorer).
export function codePresence(projectId) {
    const result = {};
    codeDocs.forEach((entry, fileId) => { if (entry.projectId === String(projectId)) result[fileId] = presenceOf(entry); });
    return result;
}

function announcePresence(fileId, entry) {
    io.to(`project:${entry.projectId}`).emit("code:presence", { fileId, users: presenceOf(entry) });
}

function leaveCodeDoc(socket, fileId) {
    const entry = codeDocs.get(fileId);
    const peer = entry?.peers.get(socket.id);
    if (!peer) return;
    entry.peers.delete(socket.id);
    socket.leave(`code:${fileId}`);
    socket.to(`code:${fileId}`).emit("code:peer-left", { fileId, clientId: peer.clientId });
    announcePresence(fileId, entry);
    if (!entry.peers.size) {
        entry.doc.destroy();
        codeDocs.delete(fileId);
    }
}

function leaveAllCodeDocs(socket) {
    [...codeDocs.keys()].forEach((fileId) => leaveCodeDoc(socket, fileId));
}

// The file was saved: everyone editing it updates their "saved" marker.
export function codeDocSaved(file) {
    io?.to(`code:${file._id}`).emit("code:saved", { fileId: String(file._id), version: file.updatedAt, updatedBy: file.updatedBy, content: normalize(file.content) });
}

// The file's text was replaced outside the live session (e.g. by the AI assistant): show it to
// everyone who has the file open.
export function codeDocReplace(fileId, content) {
    const entry = codeDocs.get(String(fileId));
    if (!entry) return;
    const next = normalize(content);
    if (entry.text.toString() === next) return;
    entry.doc.transact(() => {
        entry.text.delete(0, entry.text.length);
        entry.text.insert(0, next);
    }, "server");
}

// The file was deleted: close it for everyone.
export function codeDocClosed(fileId) {
    const id = String(fileId);
    const entry = codeDocs.get(id);
    if (!entry) return;
    io.in(`code:${id}`).socketsLeave(`code:${id}`);
    entry.peers.clear();
    announcePresence(id, entry);
    entry.doc.destroy();
    codeDocs.delete(id);
}

function registerCodeHandlers(socket) {
    const { userId, orgId, user, access } = socket.data;

    // Open a file for live editing. `state` is only sent when reconnecting with a document the
    // client already has. Replies with the full shared document and who else is in the file.
    socket.on("code:join", async ({ projectId, fileId, clientId, state } = {}, ack = () => {}) => {
        try {
            const project = await Project.findById(projectId);
            if (!project || String(project.org) !== orgId) return ack({ error: "Project not found." });
            const member = project.hasAccess(user._id);
            const manager = canManageProject(access, project);
            if (!member && !manager && !access.permissions.has("projects.view_all")) return ack({ error: "You can't open this project." });
            const file = await CodeFile.findOne({ _id: fileId, project: project._id });
            if (!file) return ack({ error: "File not found." });
            const id = String(file._id);
            const canEdit = member || manager;

            let entry = codeDocs.get(id);
            if (!entry) {
                const doc = new Y.Doc();
                const text = doc.getText("content");
                // After a server restart the first editor back brings the document with them;
                // otherwise it starts from the saved file.
                if (state && canEdit) Y.applyUpdate(doc, new Uint8Array(state), "client");
                else text.insert(0, normalize(file.content));
                entry = { doc, text, projectId: String(project._id), peers: new Map() };
                // Changes made on the server itself (codeDocReplace) are sent to everyone.
                doc.on("update", (update, origin) => { if (origin === "server") io.to(`code:${id}`).emit("code:update", { fileId: id, update }); });
                codeDocs.set(id, entry);
            } else if (state && canEdit) {
                Y.applyUpdate(entry.doc, new Uint8Array(state), "client");
                socket.to(`code:${id}`).emit("code:update", { fileId: id, update: new Uint8Array(state) });
            }

            const peers = [...entry.peers.values()].map((p) => ({ userId: p.userId, name: p.name, avatar: p.avatar, clientId: p.clientId }));
            entry.peers.set(socket.id, { userId, name: user.fullName, avatar: user.avatar || "", clientId, canEdit });
            socket.join(`code:${id}`);
            // Existing editors answer this by re-sending their cursor positions.
            socket.to(`code:${id}`).emit("code:peer-joined", { fileId: id, userId, name: user.fullName, avatar: user.avatar || "", clientId });
            announcePresence(id, entry);
            ack({ state: Y.encodeStateAsUpdate(entry.doc), peers, canEdit });
        } catch (error) {
            ack({ error: error.message });
        }
    });

    // A text edit from one editor: apply it to the server's copy and pass it to the others.
    socket.on("code:update", ({ fileId, update } = {}) => {
        const entry = codeDocs.get(fileId);
        if (!entry?.peers.get(socket.id)?.canEdit || !update) return;
        try {
            Y.applyUpdate(entry.doc, new Uint8Array(update), "client");
            socket.to(`code:${fileId}`).emit("code:update", { fileId, update });
        } catch { /* ignore malformed updates */ }
    });

    // Cursor and selection positions. Passed along, never stored.
    socket.on("code:awareness", ({ fileId, update } = {}) => {
        if (codeDocs.get(fileId)?.peers.has(socket.id) && update) socket.to(`code:${fileId}`).emit("code:awareness", { fileId, update });
    });

    socket.on("code:leave", ({ fileId } = {}) => leaveCodeDoc(socket, fileId));
}
