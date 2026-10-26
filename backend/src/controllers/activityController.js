import Activity from "../models/Activity.js";
import { visibleProjectIds } from "../utils/access.js";

// GET /api/activity?limit=10 — recent events in the projects you can see.
export async function listActivity(req, res) {
    const limit = Math.min(Number(req.query.limit) || 10, 50);
    const activity = await Activity.find({ org: req.org._id, project: { $in: await visibleProjectIds(req) } })
        .populate("project", "name")
        .sort({ createdAt: -1 })
        .limit(limit);
    res.json({ activity });
}
