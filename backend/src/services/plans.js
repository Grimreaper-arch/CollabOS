// Works out an organization's current plan, what it is using, and enforces the plan's limits.
// Hitting a limit throws a 402 error with code "PLAN_LIMIT"; the website shows an upgrade prompt for it.
import File from "../models/File.js";
import Project from "../models/Project.js";
import Membership from "../models/Membership.js";
import Role from "../models/Role.js";
import Invitation from "../models/Invitation.js";
import Organization from "../models/Organization.js";
import ApiError from "../utils/ApiError.js";
import { FREE_PLAN, LIMIT_LABELS, PLANS } from "../config/plans.js";

// The plan in force right now: a paid plan until it expires, then Starter.
export function activePlanId(org) {
    const sub = org?.subscription;
    if (sub?.plan && sub.plan !== FREE_PLAN && sub.expiresAt && sub.expiresAt > new Date()) return sub.plan;
    return FREE_PLAN;
}

export const planOf = (org) => PLANS[activePlanId(org)];
export const limitsOf = (org) => planOf(org).limits;

// What the frontend shows about an organization's plan.
export function planSummary(org) {
    const plan = planOf(org);
    const paid = plan.id !== FREE_PLAN;
    return {
        id: plan.id,
        name: plan.name,
        period: paid ? org.subscription.period : null,
        expiresAt: paid ? org.subscription.expiresAt : null,
        // A paid plan that ran out (shown as "expired" on the billing page).
        lapsed: !paid && org?.subscription?.plan && org.subscription.plan !== FREE_PLAN ? org.subscription.plan : null
    };
}

export function formatBytes(bytes) {
    if (bytes >= 1024 ** 4) return `${+(bytes / 1024 ** 4).toFixed(1)} TB`;
    if (bytes >= 1024 ** 3) return `${+(bytes / 1024 ** 3).toFixed(1)} GB`;
    if (bytes >= 1024 ** 2) return `${+(bytes / 1024 ** 2).toFixed(1)} MB`;
    return `${Math.ceil(bytes / 1024)} KB`;
}

async function storageUsed(orgId) {
    const projectIds = (await Project.find({ org: orgId }).select("_id")).map((p) => p._id);
    const [result] = await File.aggregate([
        { $match: { project: { $in: projectIds } } },
        { $group: { _id: null, total: { $sum: "$size" } } }
    ]);
    return result?.total || 0;
}

// Current usage of everything the plans limit.
export async function getUsage(orgId) {
    const [projects, members, pendingInvites, customRoles, storageBytes] = await Promise.all([
        Project.countDocuments({ org: orgId }),
        Membership.countDocuments({ org: orgId }),
        Invitation.countDocuments({ org: orgId, status: "pending", expiresAt: { $gt: new Date() } }),
        Role.countDocuments({ org: orgId, isCustom: true }),
        storageUsed(orgId)
    ]);
    return { projects, members, pendingInvites, customRoles, storageBytes };
}

function limitError(org, key, limit) {
    const plan = planOf(org);
    const amount = key.endsWith("Bytes") ? formatBytes(limit) : limit;
    const what = key === "maxFileBytes" ? `files up to ${amount}` : key === "storageBytes" ? `${amount} of file storage` : `up to ${amount} ${LIMIT_LABELS[key]}`;
    const message = limit === 0
        ? `The ${plan.name} plan doesn't include ${LIMIT_LABELS[key]}. Upgrade to Pro or Scale to use them.`
        : `Your ${plan.name} plan allows ${what}. Upgrade your plan to get more.`;
    return new ApiError(402, message, "PLAN_LIMIT");
}

// How many more of `key` the organization can add (Infinity when unlimited).
// Members count pending invitations too, so you can't invite past the limit.
export async function remaining(org, key) {
    const limit = limitsOf(org)[key];
    if (limit === null) return Infinity;
    const usage = await getUsage(org._id);
    const used = key === "members" ? usage.members + usage.pendingInvites : usage[key];
    return Math.max(0, limit - used);
}

// Throws PLAN_LIMIT if adding `adding` more of `key` would go over the plan.
export async function assertWithinLimit(org, key, adding = 1) {
    if ((await remaining(org, key)) < adding) throw limitError(org, key, limitsOf(org)[key]);
}

// For uploads: the file must fit the per-file limit and the total storage.
export async function assertStorageFor(org, bytes) {
    const limits = limitsOf(org);
    if (bytes > limits.maxFileBytes) throw limitError(org, "maxFileBytes", limits.maxFileBytes);
    const used = await storageUsed(org._id);
    if (used + bytes > limits.storageBytes) throw limitError(org, "storageBytes", limits.storageBytes);
}

// Each person can own only one organization on the free plan.
export async function assertCanCreateFreeOrg(userId) {
    const owned = await Organization.find({ owner: userId });
    const free = owned.find((org) => activePlanId(org) === FREE_PLAN);
    if (free) {
        throw new ApiError(402, `You already own a free organization (${free.name}). Upgrade it to Pro or Scale, then you can create another one.`, "PLAN_LIMIT");
    }
}

export const planError = limitError;
