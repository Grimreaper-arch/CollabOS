// What the AI assistant can do in CollabOS ("tools" / function calling).
//
// The model never touches the database itself. It asks for a tool by name with JSON arguments;
// this file runs it by calling the SAME controller functions the website uses, as the logged-in
// user. So every permission check, plan limit, notification and live update applies exactly as if
// the user had clicked the button, and the assistant can never do more than the user could.
//
// Tools marked `confirm: true` (deleting, messaging people, inviting, overwriting code) are not
// run straight away: the user sees what is about to happen and has to press Confirm.
import * as projects from "../controllers/projectController.js";
import * as tasks from "../controllers/taskController.js";
import * as org from "../controllers/orgController.js";
import * as roles from "../controllers/roleController.js";
import * as invitations from "../controllers/invitationController.js";
import * as meetings from "../controllers/meetingController.js";
import * as messages from "../controllers/messageController.js";
import * as code from "../controllers/codeController.js";
import * as files from "../controllers/fileController.js";
import * as billing from "../controllers/billingController.js";
import { listActivity } from "../controllers/activityController.js";
import ApiError from "../utils/ApiError.js";

// Calls an Express controller directly and returns what it would have sent as JSON.
async function call(handler, ctx, { params = {}, body = {}, query = {} } = {}) {
    const req = {
        user: ctx.user, org: ctx.org, role: ctx.role, permissions: ctx.permissions,
        membership: ctx.membership, memberships: ctx.memberships, headers: {}, params, body, query
    };
    let data = {};
    const res = { status() { return this; }, json(payload) { data = payload; return this; } };
    await handler(req, res);
    return JSON.parse(JSON.stringify(data));
}

const fail = (message) => { throw new ApiError(400, message); };
const same = (a, b) => String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
const day = (date) => (date ? String(date).slice(0, 10) : null);
const isId = (text) => /^[a-f0-9]{24}$/i.test(String(text));

// Finds one item by id, exact name or a unique partial name. Tells the model what exists otherwise.
function pick(list, ref, nameOf, what) {
    const text = String(ref ?? "").trim();
    if (!text) fail(`Which ${what}?`);
    const exact = list.filter((item) => String(item._id) === text || same(nameOf(item), text));
    if (exact.length === 1) return exact[0];
    const partial = list.filter((item) => nameOf(item).toLowerCase().includes(text.toLowerCase()));
    if (partial.length === 1) return partial[0];
    const options = (partial.length ? partial : list).slice(0, 15).map(nameOf).join("; ") || "none";
    fail(partial.length > 1 ? `"${text}" matches several ${what}s: ${options}. Ask the user which one.` : `No ${what} called "${text}". Available: ${options}.`);
}

async function findProject(ctx, ref) {
    const { projects: list } = await call(projects.listProjects, ctx);
    return pick(list, ref, (p) => p.name, "project");
}

async function people(ctx) {
    const { members } = await call(org.listMembers, ctx);
    return members.filter((m) => m.user).map((m) => ({ _id: m.user._id, fullName: m.user.fullName, email: m.user.email, role: m.role?.name }));
}

async function findPeople(ctx, refs) {
    const list = await people(ctx);
    return [...new Set([].concat(refs || []))].map((ref) => {
        if (["me", "myself", "i"].includes(String(ref).trim().toLowerCase())) return list.find((p) => String(p._id) === String(ctx.user._id));
        const byEmail = list.find((p) => same(p.email, ref));
        return byEmail || pick(list, ref, (p) => p.fullName, "person");
    });
}

async function findTask(ctx, ref, projectRef) {
    const query = projectRef ? { project: String((await findProject(ctx, projectRef))._id) } : {};
    const { tasks: list } = await call(tasks.listTasks, ctx, { query });
    return pick(list, ref, (t) => t.title, "task");
}

async function findCodeFile(ctx, project, path) {
    const { files: list } = await call(code.listFiles, ctx, { params: { id: project._id } });
    return pick(list, path, (f) => f.path, "code file");
}

const taskView = (t) => ({
    id: t._id, title: t.title, stage: t.stage, priority: t.priority, due: day(t.dueDate),
    overdue: Boolean(t.dueDate && t.status !== "completed" && day(t.dueDate) < day(new Date().toISOString())),
    project: t.project?.name, assignee: t.assignee?.fullName, assignedBy: t.assignedBy?.fullName,
    description: t.description || undefined
});
const projectView = (p) => ({
    id: p._id, name: p.name, description: p.description || undefined, deadline: day(p.dueDate), lead: p.owner?.fullName,
    members: (p.members || []).map((m) => m.fullName), tasks: p.taskCount, completed: p.completedCount, link: `/projects/${p._id}`
});

const str = (description) => ({ type: "string", description });
const params = (properties, required = []) => ({ type: "object", properties, required, additionalProperties: false });

// name → { description, parameters, needs?, confirm?, label(args), run(ctx, args) }
export const TOOLS = {
    // ---------- Reading ----------
    list_projects: {
        description: "List the projects the user can see, with lead, members, deadline and task progress.",
        parameters: params({}),
        label: () => "Looking at your projects",
        run: async (ctx) => (await call(projects.listProjects, ctx)).projects.map(projectView)
    },
    get_project: {
        description: "Details of one project: members, progress and its tasks grouped by stage.",
        parameters: params({ project: str("Project name or id") }, ["project"]),
        label: (a) => `Opening project ${a.project}`,
        run: async (ctx, a) => {
            const project = await findProject(ctx, a.project);
            const { tasks: list } = await call(tasks.listTasks, ctx, { query: { project: String(project._id) } });
            return { ...projectView(project), tasks: list.map(taskView) };
        }
    },
    list_tasks: {
        description: "List tasks the user can see. Filter by project, assignee, or status. Use this before changing a task to get its exact title.",
        parameters: params({
            project: str("Only this project (name or id)"),
            assignee: str("Only tasks assigned to this person (name, email, or 'me')"),
            status: { type: "string", enum: ["open", "completed", "overdue", "all"], description: "Default: open" },
            due_within_days: { type: "number", description: "Only tasks due within this many days from today" }
        }),
        label: (a) => `Checking ${a.status === "overdue" ? "overdue " : ""}tasks${a.project ? ` in ${a.project}` : ""}${a.assignee ? ` for ${a.assignee}` : ""}`,
        run: async (ctx, a) => {
            const query = a.project ? { project: String((await findProject(ctx, a.project))._id) } : {};
            let list = (await call(tasks.listTasks, ctx, { query })).tasks.map(taskView);
            if (a.assignee) {
                const [person] = await findPeople(ctx, [a.assignee]);
                list = list.filter((t) => t.assignee === person.fullName);
            }
            const status = a.status || "open";
            if (status === "open") list = list.filter((t) => t.stage !== "done");
            if (status === "completed") list = list.filter((t) => t.stage === "done");
            if (status === "overdue") list = list.filter((t) => t.overdue);
            if (Number.isFinite(a.due_within_days)) {
                const limit = day(new Date(Date.now() + a.due_within_days * 864e5).toISOString());
                list = list.filter((t) => t.due && t.due <= limit);
            }
            return { count: list.length, tasks: list.slice(0, 60) };
        }
    },
    get_task: {
        description: "One task with its description and comments.",
        parameters: params({ task: str("Task title or id"), project: str("Project name, if the title could be ambiguous") }, ["task"]),
        label: (a) => `Reading task "${a.task}"`,
        run: async (ctx, a) => {
            const task = await findTask(ctx, a.task, a.project);
            const { comments } = await call(tasks.listComments, ctx, { params: { id: task._id } });
            return { ...taskView(task), comments: comments.map((c) => ({ from: c.author?.fullName, text: c.text, at: c.createdAt })) };
        }
    },
    get_workload: {
        description: "How many open and overdue tasks each person has (among tasks the user can see). Use for 'who is overloaded / free'.",
        parameters: params({ project: str("Only this project (optional)") }),
        label: () => "Checking everyone's workload",
        run: async (ctx, a) => {
            const query = a.project ? { project: String((await findProject(ctx, a.project))._id) } : {};
            const list = (await call(tasks.listTasks, ctx, { query })).tasks.map(taskView);
            const byPerson = {};
            list.forEach((t) => {
                const row = (byPerson[t.assignee || "Unassigned"] ||= { open: 0, overdue: 0, in_review: 0, completed: 0 });
                if (t.stage === "done") row.completed += 1; else row.open += 1;
                if (t.overdue) row.overdue += 1;
                if (t.stage === "review") row.in_review += 1;
            });
            return byPerson;
        }
    },
    list_people: {
        description: "Everyone in the organization with their role and email.",
        parameters: params({}),
        label: () => "Looking up people",
        run: async (ctx) => (await people(ctx)).map((p) => ({ name: p.fullName, email: p.email, role: p.role }))
    },
    list_meetings: {
        description: "Meetings the user hosts or is invited to (upcoming and recent), with join links.",
        parameters: params({}),
        label: () => "Checking meetings",
        run: async (ctx) => (await call(meetings.listMeetings, ctx)).meetings.map((m) => ({
            id: m._id, title: m.title, startsAt: m.startsAt, minutes: m.durationMinutes, status: m.live ? "live now" : m.status,
            host: m.host?.fullName, people: (m.participants || []).map((p) => p.fullName), project: m.project?.name, link: `/meet/${m.roomId}`
        }))
    },
    read_chat: {
        description: "Read recent messages from a project's chat channel, or the user's direct messages with one person. Use to summarize discussions.",
        parameters: params({ project: str("Project name (for its channel)"), person: str("Person's name (for direct messages)"), limit: { type: "number", description: "How many recent messages, default 40, max 100" } }),
        label: (a) => `Reading the chat ${a.project ? `in ${a.project}` : `with ${a.person}`}`,
        run: async (ctx, a) => {
            const query = a.project ? { project: String((await findProject(ctx, a.project))._id) } : { user: String((await findPeople(ctx, [a.person]))[0]._id) };
            const list = (await call(messages.listMessages, ctx, { query })).messages;
            return list.slice(-Math.min(Math.max(a.limit || 40, 1), 100)).map((m) => ({ from: m.sender?.fullName, text: m.text, at: m.createdAt }));
        }
    },
    get_activity: {
        description: "Recent activity (who did what) across the user's projects.",
        parameters: params({}),
        label: () => "Checking recent activity",
        run: async (ctx) => (await call(listActivity, ctx, { query: { limit: 30 } })).activity.map((a) => ({ project: a.project?.name, text: a.text, at: a.createdAt }))
    },
    list_project_files: {
        description: "Uploaded files (documents, images) in a project.",
        parameters: params({ project: str("Project name or id") }, ["project"]),
        label: (a) => `Listing files in ${a.project}`,
        run: async (ctx, a) => {
            const project = await findProject(ctx, a.project);
            return (await call(files.listProjectFiles, ctx, { params: { id: project._id } })).files.map((f) => ({ name: f.originalName, size: f.size, by: f.uploadedBy?.fullName, forTask: f.task?.title, at: f.createdAt }));
        }
    },
    list_code_files: {
        description: "Source files in a project's Code workspace.",
        parameters: params({ project: str("Project name or id") }, ["project"]),
        label: (a) => `Listing code in ${a.project}`,
        run: async (ctx, a) => {
            const project = await findProject(ctx, a.project);
            return (await call(code.listFiles, ctx, { params: { id: project._id } })).files.map((f) => ({ path: f.path, bytes: f.size, updatedBy: f.updatedBy?.fullName }));
        }
    },
    read_code_file: {
        description: "Read a source file from a project's Code workspace (to explain, review or fix it).",
        parameters: params({ project: str("Project name or id"), path: str("File path, e.g. src/main.py") }, ["project", "path"]),
        label: (a) => `Reading ${a.path}`,
        run: async (ctx, a) => {
            const project = await findProject(ctx, a.project);
            const file = await findCodeFile(ctx, project, a.path);
            const full = (await call(code.getFile, ctx, { params: { id: project._id, fileId: file._id } })).file;
            return { path: full.path, content: full.content.slice(0, 16000), truncated: full.content.length > 16000 };
        }
    },
    get_plan_usage: {
        description: "The organization's subscription plan, its limits and current usage.",
        parameters: params({}),
        label: () => "Checking the plan",
        run: async (ctx) => {
            const data = await call(billing.getBilling, ctx);
            return { plan: data.plan, limits: data.limits, usage: data.usage };
        }
    },

    // ---------- Tasks ----------
    create_task: {
        description: "Create a task in a project and assign it. One task is created per assignee. Call several times to create several different tasks.",
        parameters: params({
            project: str("Project name or id"), title: str("Short task title"), description: str("Details (optional)"),
            priority: { type: "string", enum: ["low", "medium", "high"] }, due_date: str("YYYY-MM-DD (optional)"),
            assignees: { type: "array", items: { type: "string" }, description: "Names or emails of project members; 'me' for the user" }
        }, ["project", "title", "assignees"]),
        needs: "tasks.assign",
        label: (a) => `Creating task "${a.title}"`,
        run: async (ctx, a) => {
            const project = await findProject(ctx, a.project);
            const who = await findPeople(ctx, a.assignees);
            const { tasks: made } = await call(tasks.createTask, ctx, { body: { projectId: project._id, title: a.title, description: a.description, priority: a.priority || "medium", dueDate: a.due_date || null, assignees: who.map((p) => p._id) } });
            return { created: made.length, title: a.title, project: project.name, assignedTo: who.map((p) => p.fullName), due: a.due_date || null, link: `/projects/${project._id}` };
        }
    },
    update_task: {
        description: "Change a task's title, description, priority or due date.",
        parameters: params({
            task: str("Task title or id"), project: str("Project name, if needed to tell tasks apart"), title: str("New title"), description: str("New description"),
            priority: { type: "string", enum: ["low", "medium", "high"] }, due_date: str("New due date YYYY-MM-DD, or empty string to remove it")
        }, ["task"]),
        label: (a) => `Updating task "${a.task}"`,
        run: async (ctx, a) => {
            const task = await findTask(ctx, a.task, a.project);
            const body = {};
            ["title", "description", "priority"].forEach((key) => { if (a[key] !== undefined) body[key] = a[key]; });
            if (a.due_date !== undefined) body.dueDate = a.due_date || null;
            return taskView((await call(tasks.updateTask, ctx, { params: { id: task._id }, body })).task);
        }
    },
    move_task: {
        description: "Move a task to a Kanban stage: todo, in_progress, review or done (done = completed).",
        parameters: params({ task: str("Task title or id"), project: str("Project name, if needed"), stage: { type: "string", enum: ["todo", "in_progress", "review", "done"] } }, ["task", "stage"]),
        label: (a) => `Moving "${a.task}" to ${String(a.stage).replace("_", " ")}`,
        run: async (ctx, a) => {
            const task = await findTask(ctx, a.task, a.project);
            return taskView((await call(tasks.moveTask, ctx, { params: { id: task._id }, body: { stage: a.stage } })).task);
        }
    },
    comment_on_task: {
        description: "Add a comment to a task (max 240 characters).",
        parameters: params({ task: str("Task title or id"), project: str("Project name, if needed"), text: str("The comment") }, ["task", "text"]),
        label: (a) => `Commenting on "${a.task}"`,
        run: async (ctx, a) => {
            const task = await findTask(ctx, a.task, a.project);
            await call(tasks.addComment, ctx, { params: { id: task._id }, body: { text: String(a.text).slice(0, 240) } });
            return { commented: true, task: task.title };
        }
    },
    delete_task: {
        description: "Delete a task permanently.",
        parameters: params({ task: str("Task title or id"), project: str("Project name, if needed") }, ["task"]),
        confirm: true,
        prepare: async (ctx, a) => { const task = await findTask(ctx, a.task, a.project); return { args: { task: String(task._id) }, summary: `Delete the task "${task.title}" (${task.project?.name}). This can't be undone.` }; },
        label: (a) => `Deleting task "${a.task}"`,
        run: async (ctx, a) => { await call(tasks.deleteTask, ctx, { params: { id: a.task } }); return { deleted: true }; }
    },

    // ---------- Projects ----------
    create_project: {
        description: "Create a new project. The user becomes its lead.",
        parameters: params({ name: str("Project name"), description: str("What it's about (optional)"), due_date: str("Deadline YYYY-MM-DD (optional)") }, ["name"]),
        needs: "projects.create",
        label: (a) => `Creating project "${a.name}"`,
        run: async (ctx, a) => {
            const { project } = await call(projects.createProject, ctx, { body: { name: a.name, description: a.description || "", dueDate: a.due_date || null } });
            return { id: project._id, name: project.name, link: `/projects/${project._id}` };
        }
    },
    add_project_members: {
        description: "Add people from the organization to a project.",
        parameters: params({ project: str("Project name or id"), people: { type: "array", items: { type: "string" }, description: "Names or emails" } }, ["project", "people"]),
        label: (a) => `Adding ${[].concat(a.people || []).join(", ")} to ${a.project}`,
        run: async (ctx, a) => {
            const project = await findProject(ctx, a.project);
            const who = await findPeople(ctx, a.people);
            const result = await call(projects.addMembers, ctx, { params: { id: project._id }, body: { userIds: who.map((p) => p._id) } });
            return { added: result.added, project: project.name, people: who.map((p) => p.fullName) };
        }
    },

    // ---------- Meetings ----------
    schedule_meeting: {
        description: "Schedule a video meeting and invite people (they are notified and emailed).",
        parameters: params({
            title: str("Meeting title"), start: str("Start as local date and time, YYYY-MM-DDTHH:mm"), duration_minutes: { type: "number", description: "Default 30" },
            people: { type: "array", items: { type: "string" }, description: "Names or emails to invite" }, project: str("Project name: everyone in it can join (optional)"),
            agenda: str("Agenda / description (optional)"), add_google_meet: { type: "boolean", description: "Also create a Google Meet link (needs Google Calendar connected)" }
        }, ["title", "start"]),
        label: (a) => `Scheduling "${a.title}"`,
        run: async (ctx, a) => {
            const startsAt = new Date(a.start);
            if (Number.isNaN(startsAt.getTime())) fail("start must look like 2026-11-20T15:30.");
            const who = a.people?.length ? await findPeople(ctx, a.people) : [];
            const project = a.project ? await findProject(ctx, a.project) : null;
            const { meeting, googleInvited } = await call(meetings.createMeeting, ctx, { body: { title: a.title, description: a.agenda || "", startsAt: startsAt.toISOString(), durationMinutes: a.duration_minutes || 30, participantIds: who.map((p) => p._id), projectId: project?._id, addGoogleMeet: Boolean(a.add_google_meet) } });
            return { title: meeting.title, startsAt: meeting.startsAt, minutes: meeting.durationMinutes, invited: who.map((p) => p.fullName), link: `/meet/${meeting.roomId}`, googleMeetLink: meeting.meetLink || undefined, invitedThroughGoogleCalendar: googleInvited };
        }
    },
    start_meeting_now: {
        description: "Start an instant video meeting and ring the invited people. Returns the link to join.",
        parameters: params({ title: str("Meeting title (optional)"), people: { type: "array", items: { type: "string" }, description: "Names or emails to ring" }, project: str("Project name (optional)") }),
        label: () => "Starting a meeting",
        run: async (ctx, a) => {
            const who = a.people?.length ? await findPeople(ctx, a.people) : [];
            const project = a.project ? await findProject(ctx, a.project) : null;
            const { meeting } = await call(meetings.createMeeting, ctx, { body: { instant: true, title: a.title || "Quick meeting", durationMinutes: 30, participantIds: who.map((p) => p._id), projectId: project?._id } });
            return { title: meeting.title, ringing: who.map((p) => p.fullName), link: `/meet/${meeting.roomId}` };
        }
    },
    cancel_meeting: {
        description: "Cancel a meeting the user hosts.",
        parameters: params({ meeting: str("Meeting title or id") }, ["meeting"]),
        confirm: true,
        prepare: async (ctx, a) => {
            const list = (await call(meetings.listMeetings, ctx)).meetings.filter((m) => m.isHost && m.status !== "ended");
            const meeting = pick(list, a.meeting, (m) => m.title, "meeting you host");
            return { args: { meeting: String(meeting._id) }, summary: `Cancel the meeting "${meeting.title}" on ${new Date(meeting.startsAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}. Everyone invited will be told.` };
        },
        label: () => "Cancelling the meeting",
        run: async (ctx, a) => call(meetings.cancelMeeting, ctx, { params: { id: a.meeting } })
    },

    // ---------- Messages and people ----------
    send_message: {
        description: "Send a chat message as the user: to a project's channel, or directly to one person.",
        parameters: params({ project: str("Project name (channel message)"), person: str("Person's name (direct message)"), text: str("The message, max 2000 characters") }, ["text"]),
        confirm: true,
        prepare: async (ctx, a) => {
            if (!a.project && !a.person) fail("Say which project channel or which person to message.");
            const text = String(a.text || "").trim().slice(0, 2000);
            if (!text) fail("The message is empty.");
            if (a.project) { const project = await findProject(ctx, a.project); return { args: { project: String(project._id), text }, summary: `Send this to the #${project.name} channel:\n\n"${text}"` }; }
            const [person] = await findPeople(ctx, [a.person]);
            return { args: { user: String(person._id), text }, summary: `Send this message to ${person.fullName}:\n\n"${text}"` };
        },
        label: () => "Sending the message",
        run: async (ctx, a) => { await call(messages.sendMessage, ctx, { body: a }); return { sent: true }; }
    },
    invite_people: {
        description: "Invite people to the organization by email with a role (sends invitation emails).",
        parameters: params({ emails: { type: "array", items: { type: "string" } }, role: str("Role name, e.g. Member") }, ["emails", "role"]),
        needs: "members.invite",
        confirm: true,
        prepare: async (ctx, a) => {
            const role = pick((await call(roles.listRoles, ctx)).roles, a.role, (r) => r.name, "role");
            const emails = [].concat(a.emails || []).map((e) => String(e).trim().toLowerCase()).filter(Boolean);
            if (!emails.length) fail("No email addresses given.");
            return { args: { emails: emails.join(", "), roleId: String(role._id) }, summary: `Invite ${emails.join(", ")} to ${ctx.org.name} as ${role.name}. Each gets an invitation email.` };
        },
        label: () => "Sending invitations",
        run: async (ctx, a) => call(invitations.sendInvitations, ctx, { body: a })
    },

    // ---------- Code ----------
    create_code_file: {
        description: "Create a new source file in a project's Code workspace with the given content (e.g. a program the user asked for). Fails if the path already exists.",
        parameters: params({ project: str("Project name or id"), path: str("File path, e.g. algorithms/binary_search.cpp"), content: str("The full file content") }, ["project", "path", "content"]),
        label: (a) => `Creating ${a.path}`,
        run: async (ctx, a) => {
            const project = await findProject(ctx, a.project);
            const { file } = await call(code.createFile, ctx, { params: { id: project._id }, body: { path: a.path, content: a.content } });
            return { created: file.path, project: project.name, link: `/code?project=${project._id}` };
        }
    },
    update_code_file: {
        description: "Replace the whole content of an existing source file (e.g. with a fixed version). Read the file first.",
        parameters: params({ project: str("Project name or id"), path: str("Existing file path"), content: str("The complete new content") }, ["project", "path", "content"]),
        confirm: true,
        prepare: async (ctx, a) => {
            const project = await findProject(ctx, a.project);
            const file = await findCodeFile(ctx, project, a.path);
            return { args: { project: String(project._id), file: String(file._id), content: String(a.content ?? "") }, summary: `Replace the contents of ${file.path} in ${project.name} (${String(a.content ?? "").split("\n").length} lines). Teammates editing it will see the change immediately.` };
        },
        label: (a) => `Updating ${a.path || "the file"}`,
        run: async (ctx, a) => {
            const { file } = await call(code.updateFile, ctx, { params: { id: a.project, fileId: a.file }, body: { content: a.content, force: true } });
            return { updated: file.path, link: `/code?project=${a.project}` };
        }
    },
    delete_code_file: {
        description: "Delete a source file from a project's Code workspace.",
        parameters: params({ project: str("Project name or id"), path: str("File path") }, ["project", "path"]),
        confirm: true,
        prepare: async (ctx, a) => {
            const project = await findProject(ctx, a.project);
            const file = await findCodeFile(ctx, project, a.path);
            return { args: { project: String(project._id), file: String(file._id) }, summary: `Delete ${file.path} from ${project.name}. Everyone in the project loses it.` };
        },
        label: (a) => `Deleting ${a.path || "the file"}`,
        run: async (ctx, a) => call(code.deleteFile, ctx, { params: { id: a.project, fileId: a.file } })
    }
};

// The tool list in the format the chat completions API expects.
export const toolSchemas = () => Object.entries(TOOLS).map(([name, tool]) => ({ type: "function", function: { name, description: tool.description, parameters: tool.parameters } }));

const missingPermission = (ctx, tool) => (tool.needs && !ctx.permissions.has(tool.needs) ? `The user's role (${ctx.role.name}) isn't allowed to do this (missing permission: ${tool.needs}).` : null);

// Runs a tool the model asked for. Returns one of:
//   { ok: true, result }                 it ran
//   { ok: false, error }                 it couldn't (the model is told why, in plain words)
//   { confirm: { tool, args, summary } } it needs the user's OK first
export async function executeTool(ctx, name, rawArgs) {
    const tool = Object.hasOwn(TOOLS, name) ? TOOLS[name] : null;
    if (!tool) return { ok: false, error: `Unknown tool "${name}".` };
    let args;
    try {
        args = typeof rawArgs === "string" ? JSON.parse(rawArgs || "{}") : rawArgs || {};
    } catch {
        return { ok: false, error: "The arguments were not valid JSON." };
    }
    try {
        const denied = missingPermission(ctx, tool);
        if (denied) return { ok: false, error: denied };
        if (tool.confirm) {
            const prepared = await tool.prepare(ctx, args);
            return { confirm: { tool: name, args: prepared.args, summary: prepared.summary } };
        }
        return { ok: true, result: await tool.run(ctx, args) };
    } catch (error) {
        if (!(error instanceof ApiError) && !error.status && error.name !== "ValidationError" && error.name !== "CastError") console.error(`AI tool ${name} failed:`, error);
        return { ok: false, error: error.message || "That didn't work." };
    }
}

// Runs an action the user has just confirmed (args were prepared and stored by executeTool).
export async function runConfirmed(ctx, name, args) {
    const tool = Object.hasOwn(TOOLS, name) ? TOOLS[name] : null;
    if (!tool?.confirm) return { ok: false, error: "Unknown action." };
    try {
        const denied = missingPermission(ctx, tool);
        if (denied) return { ok: false, error: denied };
        return { ok: true, result: await tool.run(ctx, args) };
    } catch (error) {
        return { ok: false, error: error.message || "That didn't work." };
    }
}

export const toolLabel = (name, rawArgs) => {
    try {
        return TOOLS[name]?.label(typeof rawArgs === "string" ? JSON.parse(rawArgs || "{}") : rawArgs || {}) || name;
    } catch {
        return name;
    }
};
