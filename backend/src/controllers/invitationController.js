import Invitation from "../models/Invitation.js";
import Membership from "../models/Membership.js";
import Role from "../models/Role.js";
import User from "../models/User.js";
import ApiError from "../utils/ApiError.js";
import { loadAccess } from "../middleware/auth.js";
import { sessionPayload } from "../services/orgService.js";
import { OWNER_LEVEL } from "../config/permissions.js";
import { assertBelowMe } from "../utils/rbac.js";
import { logAudit, notify } from "../utils/events.js";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ---- Managing invitations (inside an organization) ----

// POST /api/org/invitations  body: { emails: "a@x.com, b@y.com", roleId }  (members.invite)
export async function sendInvitations(req, res) {
    const role = await Role.findOne({ _id: req.body.roleId, org: req.org._id });
    if (!role) throw new ApiError(404, "Choose a role for the invitation.");
    if (role.level === OWNER_LEVEL) throw new ApiError(400, "You can't invite someone as Owner.");
    assertBelowMe(req, role.level, "invite people");

    const emails = [...new Set(String(req.body.emails || "").split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean))];
    if (!emails.length) throw new ApiError(400, "Enter at least one email address.");

    const invited = [];
    const skipped = [];
    for (const email of emails) {
        if (!EMAIL.test(email)) { skipped.push(`${email} (not a valid email)`); continue; }

        const user = await User.findOne({ email });
        if (user && (await Membership.exists({ user: user._id, org: req.org._id }))) { skipped.push(`${email} (already a member)`); continue; }
        if (await Invitation.exists({ org: req.org._id, email, status: "pending", expiresAt: { $gt: new Date() } })) { skipped.push(`${email} (already invited)`); continue; }

        await Invitation.create({ org: req.org._id, email, role: role._id, invitedBy: req.user._id });
        if (user) await notify(user._id, `${req.user.fullName} invited you to join ${req.org.name} as ${role.name}.`, "/welcome", "people");
        invited.push(email);
    }

    if (invited.length) {
        await logAudit(req.org._id, req.user._id, `${req.user.fullName} invited ${invited.join(", ")} as ${role.name}.`);
    }
    res.status(201).json({ invited, skipped });
}

// GET /api/org/invitations  (members.invite)
export async function listOrgInvitations(req, res) {
    const invitations = await Invitation.find({ org: req.org._id, status: "pending" })
        .populate("role", "name level")
        .populate("invitedBy", "fullName")
        .sort({ createdAt: -1 });
    res.json({ invitations: invitations.map((i) => ({ ...i.toObject(), expired: !i.isOpen() })) });
}

// DELETE /api/org/invitations/:id  (members.invite)
export async function cancelInvitation(req, res) {
    const invitation = await Invitation.findOne({ _id: req.params.id, org: req.org._id, status: "pending" }).populate("role");
    if (!invitation) throw new ApiError(404, "Invitation not found.");
    if (invitation.role) assertBelowMe(req, invitation.role.level, "cancel invitations");

    invitation.status = "cancelled";
    await invitation.save();
    await logAudit(req.org._id, req.user._id, `${req.user.fullName} cancelled the invitation for ${invitation.email}.`);
    res.json({ message: "Invitation cancelled." });
}

// ---- Responding to invitations (the invited person) ----

async function getMyInvitation(req) {
    const invitation = await Invitation.findOne({ _id: req.params.id, email: req.user.email, status: "pending" })
        .populate("org")
        .populate("role");
    if (!invitation || !invitation.org || !invitation.role) throw new ApiError(404, "Invitation not found.");
    if (!invitation.isOpen()) throw new ApiError(400, "This invitation has expired. Ask for a new one.");
    return invitation;
}

// GET /api/invitations/mine
export async function myInvitations(req, res) {
    const invitations = await Invitation.find({ email: req.user.email, status: "pending", expiresAt: { $gt: new Date() } })
        .populate("org", "name description")
        .populate("role", "name description")
        .populate("invitedBy", "fullName")
        .sort({ createdAt: -1 });
    res.json({ invitations: invitations.filter((i) => i.org && i.role) });
}

// POST /api/invitations/:id/accept
export async function acceptInvitation(req, res) {
    if (req.org) throw new ApiError(400, `You already belong to ${req.org.name}. Leave it before joining another organization.`);
    const invitation = await getMyInvitation(req);

    await Membership.create({ user: req.user._id, org: invitation.org._id, role: invitation.role._id });
    invitation.status = "accepted";
    await invitation.save();

    await notify(invitation.invitedBy, `${req.user.fullName} joined ${invitation.org.name} as ${invitation.role.name}.`, "/organization", "people");
    await logAudit(invitation.org._id, req.user._id, `${req.user.fullName} accepted the invitation and joined as ${invitation.role.name}.`);

    await loadAccess(req);
    res.json(sessionPayload(req));
}

// POST /api/invitations/:id/decline
export async function declineInvitation(req, res) {
    const invitation = await getMyInvitation(req);
    invitation.status = "declined";
    await invitation.save();
    await notify(invitation.invitedBy, `${req.user.fullName} declined the invitation to ${invitation.org.name}.`, "", "people");
    res.json({ message: "Invitation declined." });
}
