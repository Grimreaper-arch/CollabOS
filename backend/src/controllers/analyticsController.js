import Project from "../models/Project.js";
import Task from "../models/Task.js";
import Membership from "../models/Membership.js";
import { can } from "../middleware/auth.js";

const rate = (done, total) => (total ? Math.round((done / total) * 100) : 0);

function summarize(tasks) {
    const completed = tasks.filter((t) => t.status === "completed").length;
    return { total: tasks.length, completed, percent: rate(completed, tasks.length) };
}

function groupBy(items, keyFn) {
    const groups = new Map();
    items.forEach((item) => {
        const key = keyFn(item);
        groups.set(key, [...(groups.get(key) || []), item]);
    });
    return groups;
}

const isOverdue = (t, now) => t.status !== "completed" && t.dueDate && t.dueDate < now;

function breakdown(tasks, projects, now) {
    const byProject = groupBy(tasks, (t) => String(t.project));
    return {
        overall: summarize(tasks),
        overdue: tasks.filter((t) => isOverdue(t, now)).length,
        priorities: ["high", "medium", "low"].map((priority) => ({
            label: priority,
            ...summarize(tasks.filter((t) => (t.priority || "medium") === priority))
        })),
        projects: projects
            .map((p) => ({ id: p._id, label: p.name, ...summarize(byProject.get(String(p._id)) || []) }))
            .filter((p) => p.total > 0)
    };
}

// GET /api/analytics
// Everyone gets their personal stats. "org.analytics" adds organization-wide stats.
export async function getAnalytics(req, res) {
    const now = new Date();
    const projects = await Project.find({ org: req.org._id }).select("name");

    const myTasks = await Task.find({ org: req.org._id, assignee: req.user._id }).select("status priority dueDate project");
    const personal = breakdown(myTasks, projects, now);

    let organization = null;
    if (can(req, "org.analytics")) {
        const tasks = await Task.find({ org: req.org._id }).populate("assignee", "fullName").select("status priority dueDate project assignee");
        const people = groupBy(tasks.filter((t) => t.assignee), (t) => String(t.assignee._id));
        organization = {
            ...breakdown(tasks, projects, now),
            projectCount: projects.length,
            memberCount: await Membership.countDocuments({ org: req.org._id }),
            people: [...people.values()]
                .map((list) => ({ id: list[0].assignee._id, label: list[0].assignee.fullName, ...summarize(list) }))
                .sort((a, b) => b.percent - a.percent)
        };
    }

    res.json({ personal, organization });
}
