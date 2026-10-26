import Role from "../models/Role.js";
import Membership from "../models/Membership.js";
import Invitation from "../models/Invitation.js";
import ApiError from "../utils/ApiError.js";
import { assertBelowMe, assertGrantable } from "../utils/rbac.js";
import { logAudit } from "../utils/events.js";

// GET /api/org/roles — every member can see the roles (needed for invite forms and the people list).
export async function listRoles(req, res) {
    const roles = await Role.find({ org: req.org._id }).sort({ level: 1, name: 1 });
    const counts = await Membership.aggregate([
        { $match: { org: req.org._id } },
        { $group: { _id: "$role", count: { $sum: 1 } } }
    ]);
    const countMap = new Map(counts.map((c) => [String(c._id), c.count]));

    res.json({
        roles: roles.map((role) => ({
            ...role.toObject(),
            permissions: role.effectivePermissions(),
            memberCount: countMap.get(String(role._id)) || 0,
            // Whether the current user is allowed to edit/delete/assign this role.
            manageable: !role.isSystem && role.level > req.role.level
        }))
    });
}

function readRoleBody(body) {
    const level = Number(body.level);
    if (!Number.isInteger(level) || level < 1 || level > 99) throw new ApiError(400, "Level must be a whole number from 1 to 99.");
    return {
        name: String(body.name || "").trim(),
        description: String(body.description || "").trim(),
        level,
        permissions: [...new Set(Array.isArray(body.permissions) ? body.permissions : [])]
    };
}

// POST /api/org/roles  (roles.manage)
export async function createRole(req, res) {
    const data = readRoleBody(req.body);
    if (!data.name) throw new ApiError(400, "Role name is required.");
    assertBelowMe(req, data.level, "create roles");
    assertGrantable(req, data.permissions);

    const role = await Role.create({ ...data, org: req.org._id });
    await logAudit(req.org._id, req.user._id, `${req.user.fullName} created the role ${role.name}.`);
    res.status(201).json({ role });
}

async function getManageableRole(req) {
    const role = await Role.findOne({ _id: req.params.id, org: req.org._id });
    if (!role) throw new ApiError(404, "Role not found.");
    if (role.isSystem) throw new ApiError(400, "The Owner role can't be changed.");
    assertBelowMe(req, role.level, "edit roles");
    return role;
}

// PUT /api/org/roles/:id  (roles.manage)
export async function updateRole(req, res) {
    const role = await getManageableRole(req);
    const data = readRoleBody({ ...role.toObject(), ...req.body });
    assertBelowMe(req, data.level, "move roles");
    assertGrantable(req, data.permissions);

    Object.assign(role, data);
    await role.save();
    await logAudit(req.org._id, req.user._id, `${req.user.fullName} updated the role ${role.name}.`);
    res.json({ role });
}

// DELETE /api/org/roles/:id  (roles.manage) — only when nobody holds it.
export async function deleteRole(req, res) {
    const role = await getManageableRole(req);
    const inUse = await Membership.countDocuments({ role: role._id });
    if (inUse) throw new ApiError(400, `${inUse} ${inUse === 1 ? "person has" : "people have"} this role. Move them to another role first.`);

    await Invitation.updateMany({ role: role._id, status: "pending" }, { status: "cancelled" });
    await role.deleteOne();
    await logAudit(req.org._id, req.user._id, `${req.user.fullName} deleted the role ${role.name}.`);
    res.json({ message: "Role deleted." });
}
