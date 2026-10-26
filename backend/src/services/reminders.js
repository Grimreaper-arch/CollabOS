// Due-date alerts. Runs every 15 minutes and creates notifications for:
//   - tasks due today or tomorrow   → reminder to the assignee
//   - tasks that are now overdue    → alert to the assignee and whoever assigned it
// Each alert is sent once per task (tracked with dueSoonNotifiedAt / overdueNotifiedAt).
import Task from "../models/Task.js";
// Registered here because tasks are populated with their project and assignee.
import "../models/Project.js";
import "../models/User.js";
import { notify } from "../utils/events.js";

const DAY = 24 * 60 * 60 * 1000;
const INTERVAL = 15 * 60 * 1000;

// Due dates are stored as midnight UTC, so compare against UTC days.
const startOfUtcDay = (date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
const inProject = (task) => (task.project?.name ? ` in ${task.project.name}` : "");

export async function sendDueDateReminders(now = new Date()) {
    const today = startOfUtcDay(now);
    const tomorrow = new Date(today.getTime() + DAY);
    const dayAfter = new Date(today.getTime() + 2 * DAY);

    const dueSoon = await Task.find({
        status: "pending",
        dueSoonNotifiedAt: null,
        dueDate: { $gte: today, $lt: dayAfter }
    }).populate("project", "name");

    for (const task of dueSoon) {
        const when = task.dueDate < tomorrow ? "today" : "tomorrow";
        await notify(task.assignee, `Reminder: "${task.title}"${inProject(task)} is due ${when}.`, "/calendar", "reminder");
        task.dueSoonNotifiedAt = now;
        await task.save();
    }

    const overdue = await Task.find({
        status: "pending",
        overdueNotifiedAt: null,
        dueDate: { $lt: today }
    }).populate("project", "name").populate("assignee", "fullName");

    for (const task of overdue) {
        await notify(task.assignee._id, `Overdue: "${task.title}"${inProject(task)} has passed its due date.`, "/calendar", "overdue");
        if (String(task.assignedBy) !== String(task.assignee._id)) {
            await notify(task.assignedBy, `${task.assignee.fullName}'s task "${task.title}" is overdue.`, "/tasks", "overdue");
        }
        task.overdueNotifiedAt = now;
        await task.save();
    }

    return { dueSoon: dueSoon.length, overdue: overdue.length };
}

export function startReminderScheduler() {
    const run = () => sendDueDateReminders()
        .then(({ dueSoon, overdue }) => {
            if (dueSoon || overdue) console.log(`Reminders sent: ${dueSoon} due soon, ${overdue} overdue.`);
        })
        .catch((error) => console.error("Reminder job failed:", error.message));
    run();
    return setInterval(run, INTERVAL);
}
