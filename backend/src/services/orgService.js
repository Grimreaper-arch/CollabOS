import fs from "node:fs/promises";
import path from "node:path";
import Organization from "../models/Organization.js";
import Role from "../models/Role.js";
import Membership from "../models/Membership.js";
import Invitation from "../models/Invitation.js";
import Project from "../models/Project.js";
import Task from "../models/Task.js";
import Comment from "../models/Comment.js";
import File from "../models/File.js";
import Message from "../models/Message.js";
import CodeFile from "../models/CodeFile.js";
import Activity from "../models/Activity.js";
import Notification from "../models/Notification.js";
import Payment from "../models/Payment.js";
import Meeting from "../models/Meeting.js";
import AiConversation from "../models/AiConversation.js";
import CodeRun from "../models/CodeRun.js";
import { DEFAULT_ROLES } from "../config/permissions.js";
import { UPLOAD_ROOT } from "../middleware/upload.js";
import { logAudit } from "../utils/events.js";
import { planSummary } from "./plans.js";

// Creates an organization, its default roles, and makes the creator its Owner.
export async function createOrganization(user, { name, description = "" }) {
    const org = await Organization.create({ name, description, owner: user._id });
    const roles = await Role.insertMany(DEFAULT_ROLES.map((role) => ({ ...role, org: org._id })));
    const ownerRole = roles.find((r) => r.isSystem);

    await Membership.create({ user: user._id, org: org._id, role: ownerRole._id });
    await logAudit(org._id, user._id, `${user.fullName} created the organization ${org.name}.`);
    return { org, roles };
}

// Deletes projects and everything inside them: tasks, comments, files (also from disk), chat, code, activity.
export async function deleteProjects(projectIds) {
    const taskIds = (await Task.find({ project: { $in: projectIds } }).select("_id")).map((t) => t._id);
    const files = await File.find({ project: { $in: projectIds } });

    await Promise.all(files.map((f) => fs.rm(path.join(UPLOAD_ROOT, "files", f.storedName), { force: true })));
    await Promise.all([
        Comment.deleteMany({ task: { $in: taskIds } }),
        Task.deleteMany({ project: { $in: projectIds } }),
        File.deleteMany({ project: { $in: projectIds } }),
        Message.deleteMany({ project: { $in: projectIds } }),
        CodeFile.deleteMany({ project: { $in: projectIds } }),
        CodeRun.deleteMany({ project: { $in: projectIds } }),
        Activity.deleteMany({ project: { $in: projectIds } })
    ]);
    await Project.deleteMany({ _id: { $in: projectIds } });
}

// Deletes an organization with all its projects, roles, members, invitations, chat and history.
// The user accounts themselves stay; they just stop being members.
export async function deleteOrganization(orgId) {
    const projectIds = (await Project.find({ org: orgId }).select("_id")).map((p) => p._id);
    await deleteProjects(projectIds);
    await Promise.all([
        Payment.deleteMany({ org: orgId }),
        Meeting.deleteMany({ org: orgId }),
        AiConversation.deleteMany({ org: orgId }),
        Membership.deleteMany({ org: orgId }),
        Role.deleteMany({ org: orgId }),
        Invitation.deleteMany({ org: orgId }),
        Message.deleteMany({ org: orgId }),
        Activity.deleteMany({ org: orgId }),
        Notification.deleteMany({ org: orgId })
    ]);
    await Organization.deleteOne({ _id: orgId });
}

// What the frontend needs to know about the logged-in user.
export function sessionPayload(req) {
    return {
        user: req.user,
        organization: req.org ? { _id: req.org._id, name: req.org.name, description: req.org.description, owner: req.org.owner, createdAt: req.org.createdAt, plan: planSummary(req.org) } : null,
        role: req.role ? { _id: req.role._id, name: req.role.name, level: req.role.level } : null,
        permissions: [...(req.permissions || [])],
        // Every organization the user belongs to, for the organization switcher.
        organizations: (req.memberships || []).map((m) => ({ _id: m.org._id, name: m.org.name, role: m.role.name, isOwner: m.role.level === 0, plan: planSummary(m.org).id }))
    };
}
