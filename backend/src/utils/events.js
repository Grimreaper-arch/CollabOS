import Activity from "../models/Activity.js";
import Notification from "../models/Notification.js";
import { emitToProject, emitToUser } from "../services/realtime.js";

// Project activity: shown on dashboards to project members. Every change to a project's tasks,
// files or comments goes through here, so this is also where open pages are told to refresh.
export async function logActivity(project, actorId, text) {
    const activity = await Activity.create({ org: project.org, project: project._id, actor: actorId, text });
    emitToProject(project._id, "project:changed", { project: String(project._id), actor: String(actorId), text });
    return activity;
}

// Organization activity (no project): the audit log of role changes, invites, removals.
export function logAudit(orgId, actorId, text) {
    return Activity.create({ org: orgId, project: null, actor: actorId, text });
}

// Saves a notification and pushes it to the person's open tabs straight away.
export async function notify(recipientId, text, link = "", kind = "info", orgId = null) {
    const notification = await Notification.create({ recipient: recipientId, text, link, kind, org: orgId });
    emitToUser(recipientId, "notification:new", { _id: notification._id, kind, text, link });
    return notification;
}
