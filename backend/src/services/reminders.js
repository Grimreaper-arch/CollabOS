// Due-date alerts. Runs every 15 minutes and creates notifications for:
//   - tasks due today or tomorrow   → reminder to the assignee
//   - tasks that are now overdue    → alert to the assignee and whoever assigned it
// Each alert is sent once per task (tracked with dueSoonNotifiedAt / overdueNotifiedAt).
import Task from "../models/Task.js";
// Registered here because tasks are populated with their project and assignee.
import "../models/Project.js";
import "../models/User.js";
import { notify } from "../utils/events.js";
import { sendRenewalReminder, sendTaskReminderEmail } from "./mailer.js";
import Organization from "../models/Organization.js";
import { PLANS } from "../config/plans.js";

const DAY = 24 * 60 * 60 * 1000;
const INTERVAL = 15 * 60 * 1000;

// Due dates are stored as midnight UTC, so compare against UTC days.
const startOfUtcDay = (date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
const inProject = (task) => (task.project?.name ? ` in ${task.project.name}` : "");

// In-app notification for everyone, plus an email for people who haven't turned email reminders off.
async function alert(user, text, link, kind, task) {
    await notify(user._id, text, link, kind, task.org);
    if (user.emailReminders !== false && user.email) {
        const subject = kind === "overdue" ? `Overdue: ${task.title}` : `Due soon: ${task.title}`;
        await sendTaskReminderEmail(user, { subject, heading: kind === "overdue" ? "A task is overdue" : "A task is due soon", message: text, link });
    }
}
const PEOPLE = "fullName email emailReminders";

export async function sendDueDateReminders(now = new Date()) {
    const today = startOfUtcDay(now);
    const tomorrow = new Date(today.getTime() + DAY);
    const dayAfter = new Date(today.getTime() + 2 * DAY);

    const dueSoon = await Task.find({
        status: "pending",
        dueSoonNotifiedAt: null,
        dueDate: { $gte: today, $lt: dayAfter }
    }).populate("project", "name").populate("assignee", PEOPLE);

    for (const task of dueSoon) {
        if (!task.assignee) continue;
        const when = task.dueDate < tomorrow ? "today" : "tomorrow";
        await alert(task.assignee, `Reminder: "${task.title}"${inProject(task)} is due ${when}.`, "/calendar", "reminder", task);
        task.dueSoonNotifiedAt = now;
        await task.save();
    }

    const overdue = await Task.find({
        status: "pending",
        overdueNotifiedAt: null,
        dueDate: { $lt: today }
    }).populate("project", "name").populate("assignee", PEOPLE).populate("assignedBy", PEOPLE);

    for (const task of overdue) {
        if (!task.assignee) continue;
        await alert(task.assignee, `Overdue: "${task.title}"${inProject(task)} has passed its due date.`, "/calendar", "overdue", task);
        if (task.assignedBy && String(task.assignedBy._id) !== String(task.assignee._id)) {
            await alert(task.assignedBy, `${task.assignee.fullName}'s task "${task.title}" is overdue.`, "/tasks", "overdue", task);
        }
        task.overdueNotifiedAt = now;
        await task.save();
    }

    return { dueSoon: dueSoon.length, overdue: overdue.length };
}

// Paid plans: remind the Owner 3 days before the plan ends, and tell them when it has ended.
export async function sendPlanReminders(now = new Date()) {
    const soon = new Date(now.getTime() + 3 * DAY);
    const ending = await Organization.find({
        "subscription.plan": { $ne: "starter" },
        "subscription.expiresAt": { $gt: now, $lte: soon },
        "subscription.renewalReminderSentAt": null
    }).populate("owner", PEOPLE);
    for (const org of ending) {
        const planName = PLANS[org.subscription.plan].name;
        await notify(org.owner._id, `${org.name}'s ${planName} plan ends on ${org.subscription.expiresAt.toDateString()}. Renew to keep your limits.`, "/billing", "reminder", org._id);
        await sendRenewalReminder(org.owner, { org, planName, expiresAt: org.subscription.expiresAt });
        org.subscription.renewalReminderSentAt = now;
        await org.save();
    }

    const ended = await Organization.find({
        "subscription.plan": { $ne: "starter" },
        "subscription.expiresAt": { $lte: now },
        "subscription.expiredNoticeSentAt": null
    });
    for (const org of ended) {
        await notify(org.owner, `${org.name}'s ${PLANS[org.subscription.plan].name} plan has ended. It's on Starter now; renew any time from Billing.`, "/billing", "overdue", org._id);
        org.subscription.expiredNoticeSentAt = now;
        await org.save();
    }
    return { ending: ending.length, ended: ended.length };
}

export function startReminderScheduler() {
    const run = () => Promise.all([sendDueDateReminders(), sendPlanReminders()])
        .then(([{ dueSoon, overdue }, { ending, ended }]) => {
            if (dueSoon || overdue) console.log(`Reminders sent: ${dueSoon} due soon, ${overdue} overdue.`);
            if (ending || ended) console.log(`Plan reminders sent: ${ending} ending soon, ${ended} ended.`);
        })
        .catch((error) => console.error("Reminder job failed:", error.message));
    run();
    return setInterval(run, INTERVAL);
}
