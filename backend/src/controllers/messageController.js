import Message from "../models/Message.js";
import Project from "../models/Project.js";
import Membership from "../models/Membership.js";
import ApiError from "../utils/ApiError.js";
import { getProjectFor } from "../utils/access.js";
import { notify } from "../utils/events.js";

// Channels: the projects you lead or belong to. Direct messages: anyone in your organization.
async function getConversations(req) {
    const projects = await Project.find({ org: req.org._id, $or: [{ owner: req.user._id }, { members: req.user._id }] }).select("name").sort({ name: 1 });
    const memberships = await Membership.find({ org: req.org._id, user: { $ne: req.user._id } })
        .populate("user", "fullName email avatar")
        .populate("role", "name");
    const contacts = memberships
        .filter((m) => m.user)
        .map((m) => ({ ...m.user.toObject(), roleName: m.role?.name }))
        .sort((a, b) => a.fullName.localeCompare(b.fullName));
    return { projects, contacts };
}

// GET /api/messages/conversations
export async function listConversations(req, res) {
    const { projects, contacts } = await getConversations(req);
    res.json({ channels: projects.map((p) => ({ _id: p._id, name: p.name })), contacts });
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
    if (!project) await notify(recipient, `New message from ${req.user.fullName}.`, "/messages");

    res.status(201).json({ message: await message.populate("sender", "fullName avatar") });
}
