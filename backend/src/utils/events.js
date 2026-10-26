import Activity from "../models/Activity.js";
import Notification from "../models/Notification.js";

// Project activity: shown on dashboards to project members.
export function logActivity(project, actorId, text) {
    return Activity.create({ org: project.org, project: project._id, actor: actorId, text });
}

// Organization activity (no project): the audit log of role changes, invites, removals.
export function logAudit(orgId, actorId, text) {
    return Activity.create({ org: orgId, project: null, actor: actorId, text });
}

export function notify(recipientId, text, link = "", kind = "info") {
    return Notification.create({ recipient: recipientId, text, link, kind });
}
