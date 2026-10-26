// The hierarchy rules that stop people from giving themselves (or others) more power than they have.
import { ALL_PERMISSIONS } from "../config/permissions.js";
import ApiError from "./ApiError.js";

// You can only manage roles (and the people holding them) that are strictly below your own level.
// Level 0 is the Owner; bigger numbers are more junior.
export function assertBelowMe(req, level, action = "manage this") {
    if (!(level > req.role.level)) {
        throw new ApiError(403, `You can only ${action} for roles below your own (${req.role.name}).`);
    }
}

// You can't hand out a permission you don't have yourself (privilege escalation prevention).
export function assertGrantable(req, permissions) {
    const unknown = permissions.filter((p) => !ALL_PERMISSIONS.includes(p));
    if (unknown.length) throw new ApiError(400, `Unknown permission: ${unknown.join(", ")}.`);

    const notMine = permissions.filter((p) => !req.permissions.has(p));
    if (notMine.length) throw new ApiError(403, `You can't grant permissions you don't have: ${notMine.join(", ")}.`);
}
