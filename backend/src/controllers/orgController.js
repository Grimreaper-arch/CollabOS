import Organization from "../models/Organization.js";
import Membership from "../models/Membership.js";
import Role from "../models/Role.js";
import Project from "../models/Project.js";
import Activity from "../models/Activity.js";
import ApiError from "../utils/ApiError.js";
import { createOrganization, deleteOrganization, sessionPayload } from "../services/orgService.js";
import { loadAccess } from "../middleware/auth.js";
import { PERMISSION_GROUPS, OWNER_LEVEL } from "../config/permissions.js";
import { assertBelowMe } from "../utils/rbac.js";
import { logAudit, notify } from "../utils/events.js";
import { same } from "../utils/access.js";
import { assertCanCreateFreeOrg, limitsOf } from "../services/plans.js";
import { sessionChanged } from "../services/realtime.js";

// POST /api/org — the creator becomes the Owner (Company Head) and switches to it.
// A user can create or join any number of organizations.
export async function createOrg(req, res) {
    if (!req.body.name?.trim()) throw new ApiError(400, "Organization name is required.");
    await assertCanCreateFreeOrg(req.user._id);

    const { org } = await createOrganization(req.user, req.body);
    await loadAccess(req, org._id);
    res.status(201).json(sessionPayload(req));
}

// GET /api/org
export async function getOrg(req, res) {
    const [members, roles, projects] = await Promise.all([
        Membership.countDocuments({ org: req.org._id }),
        Role.countDocuments({ org: req.org._id }),
        Project.countDocuments({ org: req.org._id })
    ]);
    res.json({ organization: req.org, counts: { members, roles, projects } });
}

// PUT /api/org  (org.manage)
export async function updateOrg(req, res) {
    const org = await Organization.findById(req.org._id);
    if (req.body.name !== undefined) org.name = req.body.name;
    if (req.body.description !== undefined) org.description = req.body.description;
    await org.save();
    await logAudit(org._id, req.user._id, `${req.user.fullName} updated the organization details.`);
    res.json({ organization: org });
}

// GET /api/org/permissions — the catalog shown in the role editor.
export function listPermissions(_req, res) {
    res.json({ groups: PERMISSION_GROUPS });
}

// GET /api/org/members
export async function listMembers(req, res) {
    const memberships = await Membership.find({ org: req.org._id })
        .populate("user", "fullName email avatar department")
        .populate("role", "name level isSystem");
    memberships.sort((a, b) => a.role.level - b.role.level || a.user.fullName.localeCompare(b.user.fullName));
    res.json({ members: memberships });
}

async function getMembership(req, userId) {
    const membership = await Membership.findOne({ org: req.org._id, user: userId }).populate("role").populate("user", "fullName");
    if (!membership) throw new ApiError(404, "That person is not in this organization.");
    return membership;
}

// PATCH /api/org/members/:userId/role  body: { roleId }  (members.assign_role)
export async function changeMemberRole(req, res) {
    const membership = await getMembership(req, req.params.userId);
    if (same(membership.user, req.user._id)) throw new ApiError(400, "You can't change your own role.");
    assertBelowMe(req, membership.role.level, "change roles of people");

    const newRole = await Role.findOne({ _id: req.body.roleId, org: req.org._id });
    if (!newRole) throw new ApiError(404, "Role not found.");
    if (newRole.level === OWNER_LEVEL) throw new ApiError(400, "Use 'Transfer ownership' to make someone the Owner.");
    assertBelowMe(req, newRole.level, "assign roles");

    const oldName = membership.role.name;
    membership.role = newRole._id;
    await membership.save();
    await sessionChanged(membership.user._id);

    await notify(membership.user._id, `Your role in ${req.org.name} was changed to ${newRole.name}.`, "/organization", "people", req.org._id);
    await logAudit(req.org._id, req.user._id, `${req.user.fullName} changed ${membership.user.fullName}'s role from ${oldName} to ${newRole.name}.`);
    res.json({ message: "Role updated." });
}

// Takes someone out of the organization and its projects.
// Projects they led are handed to `newLeadId` so nothing is left without a lead.
async function removeFromOrg(req, membership, newLeadId) {
    const userId = membership.user._id;
    await Project.updateMany({ org: req.org._id }, { $pull: { members: userId } });
    await Project.updateMany({ org: req.org._id, owner: userId }, { owner: newLeadId });
    await membership.deleteOne();
    await sessionChanged(userId, { removedFrom: req.org._id });
}

// DELETE /api/org/members/:userId  (members.remove)
export async function removeMember(req, res) {
    const membership = await getMembership(req, req.params.userId);
    if (same(membership.user, req.user._id)) throw new ApiError(400, "Use 'Leave organization' to remove yourself.");
    assertBelowMe(req, membership.role.level, "remove people");

    await removeFromOrg(req, membership, req.user._id);
    await notify(membership.user._id, `You were removed from ${req.org.name}.`, "", "people");
    await logAudit(req.org._id, req.user._id, `${req.user.fullName} removed ${membership.user.fullName} from the organization.`);
    res.json({ message: "Member removed." });
}

// POST /api/org/leave — returns the new session, switched to another organization if they have one.
export async function leaveOrg(req, res) {
    if (req.role.level === OWNER_LEVEL) throw new ApiError(400, "The Owner can't leave. Transfer ownership first.");
    const membership = await getMembership(req, req.user._id);
    await removeFromOrg(req, membership, req.org.owner);
    await logAudit(req.org._id, req.user._id, `${req.user.fullName} left the organization.`);

    await loadAccess(req);
    res.json({ message: "You left the organization.", ...sessionPayload(req) });
}

// DELETE /api/org  body: { confirmName }  (Owner only)
// Deletes the organization and everything in it. The name must be typed to confirm.
export async function deleteOrg(req, res) {
    if (req.role.level !== OWNER_LEVEL) throw new ApiError(403, "Only the Owner can delete the organization.");
    if (String(req.body?.confirmName || "").trim() !== req.org.name) {
        throw new ApiError(400, "Type the organization's name exactly to confirm.");
    }

    const { _id: orgId, name } = req.org;
    const others = await Membership.find({ org: orgId, user: { $ne: req.user._id } }).select("user");
    await deleteOrganization(orgId);
    await Promise.all(others.map((m) => sessionChanged(m.user, { removedFrom: orgId })));
    await Promise.all(others.map((m) => notify(m.user, `${req.user.fullName} deleted the organization ${name}.`, "", "people")));

    await loadAccess(req);
    res.json({ message: `${name} was deleted.`, ...sessionPayload(req) });
}

// POST /api/org/transfer-ownership  body: { userId }  (Owner only)
// The two people swap roles: the new Owner gets Owner, the old Owner gets their previous role.
export async function transferOwnership(req, res) {
    if (req.role.level !== OWNER_LEVEL) throw new ApiError(403, "Only the Owner can transfer ownership.");
    const target = await getMembership(req, req.body.userId);
    if (same(target.user, req.user._id)) throw new ApiError(400, "You are already the Owner.");

    const mine = await Membership.findById(req.membership._id);
    const previousRole = target.role._id;
    target.role = mine.role;
    mine.role = previousRole;
    await target.save();
    await mine.save();
    await Organization.updateOne({ _id: req.org._id }, { owner: target.user._id });
    await Promise.all([sessionChanged(target.user._id), sessionChanged(req.user._id)]);

    await notify(target.user._id, `You are now the Owner of ${req.org.name}.`, "/organization", "people", req.org._id);
    await logAudit(req.org._id, req.user._id, `${req.user.fullName} transferred ownership to ${target.user.fullName}.`);
    res.json({ message: "Ownership transferred." });
}

// GET /api/org/audit — organization-level events (roles, invites, members).
export async function auditLog(req, res) {
    // How far back the log goes depends on the plan.
    const days = limitsOf(req.org).auditDays;
    const since = days === null ? new Date(0) : new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const events = await Activity.find({ org: req.org._id, project: null, createdAt: { $gte: since } })
        .populate("actor", "fullName avatar")
        .sort({ createdAt: -1 })
        .limit(100);
    res.json({ events, historyDays: days });
}
