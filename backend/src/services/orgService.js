import Organization from "../models/Organization.js";
import Role from "../models/Role.js";
import Membership from "../models/Membership.js";
import { DEFAULT_ROLES } from "../config/permissions.js";
import { logAudit } from "../utils/events.js";

// Creates an organization, its default roles, and makes the creator its Owner.
export async function createOrganization(user, { name, description = "" }) {
    const org = await Organization.create({ name, description, owner: user._id });
    const roles = await Role.insertMany(DEFAULT_ROLES.map((role) => ({ ...role, org: org._id })));
    const ownerRole = roles.find((r) => r.isSystem);

    await Membership.create({ user: user._id, org: org._id, role: ownerRole._id });
    await logAudit(org._id, user._id, `${user.fullName} created the organization ${org.name}.`);
    return { org, roles };
}

// What the frontend needs to know about the logged-in user.
export function sessionPayload(req) {
    return {
        user: req.user,
        organization: req.org ? { _id: req.org._id, name: req.org.name, description: req.org.description, owner: req.org.owner, createdAt: req.org.createdAt } : null,
        role: req.role ? { _id: req.role._id, name: req.role.name, level: req.role.level } : null,
        permissions: [...(req.permissions || [])]
    };
}
