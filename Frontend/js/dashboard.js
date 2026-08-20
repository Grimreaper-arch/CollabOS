const $ = (selector) => document.querySelector(selector);

const keys = { users: "users", projects: "projects", tasks: "tasks", session: "loggedInUser", notifications: "notifications", activities: "activities", comments: "taskComments" };

const read = (key, fallback = []) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };

const write = (key, value) => localStorage.setItem(key, JSON.stringify(value));

const id = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const escapeHtml = (value = "") => { const node = document.createElement("div"); node.textContent = value; return node.innerHTML; };

const formatDate = (value) => value ? new Date(`${value}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "No due date";

const empty = (text) => `<p class="rounded-md border border-dashed border-[#464751] p-4 text-sm text-[#bcbcc6]">${text}</p>`;

const currentUser = read(keys.session, null);

if (!currentUser?.email || !currentUser?.role) { window.location.replace("login.html"); throw new Error("No active session"); }

const isTeacher = currentUser.role === "teacher";

const projectDialog = $("#projectDialog");

const notificationDialog = $("#notificationDialog");

const getProjects = () => read(keys.projects).map((project) => ({ ...project, members: project.members || [], invites: project.invites || [] }));

const getTasks = () => read(keys.tasks);

const ownedProjects = () => getProjects().filter((project) => project.teacherEmail === currentUser.email);

const joinedProjects = () => getProjects().filter((project) => project.members.includes(currentUser.email));

const visibleProjects = () => isTeacher ? ownedProjects() : joinedProjects();

const projectById = (projectId) => getProjects().find((project) => project.id === projectId);

const canAccessTask = (task) => task.assigneeEmail === currentUser.email || projectById(task.projectId)?.teacherEmail === currentUser.email;

function addActivity(projectId, text) {
    const events = read(keys.activities);
    events.unshift({ id: id("activity"), projectId, text, createdAt: 
    new Date().toISOString() });
    write(keys.activities, events.slice(0, 100));
}
function notify(recipientEmail, text) {
    const notifications = read(keys.notifications);
    notifications.unshift({ id: id("notification"), recipientEmail, text, read: false, createdAt: new Date().toISOString() });
    write(keys.notifications, notifications.slice(0, 100));
}
function showMessage(selector, text, error = false) {
    const element = $(selector); element.textContent = text; 
    element.className = `text-sm ${error ? "text-red-300" : "text-emerald-300"}`;
}
function fillSelect(select, options, label) {
    select.innerHTML = options.length ? `<option value="" disabled selected>${label}</option>${options}` : `<option value="" selected>No projects available</option>`;
}

function renderAssigneeOptions() {
    const project = projectById($("#taskProject").value);
    const users = read(keys.users);
    const students = project ? users.filter((user) => project.members.includes(user.email) && user.role === "student") : [];
    $("#taskAssignees").innerHTML = students.length ? students.map((student) => `<label class="flex cursor-pointer items-center gap-2"><input name="taskAssignee" type="checkbox" value="${escapeHtml(student.email)}" class="accent-indigo-400"><span>${escapeHtml(student.fullName)} <span class="text-xs text-[#bcbcc6]">${escapeHtml(student.email)}</span></span></label>`).join("") : `<p class="text-sm text-[#bcbcc6]">No students have joined this project yet.</p>`;
    $("#assignAll").checked = false;
}
function renderTeacherSelects() {
    const options = ownedProjects().map((project) => `<option value="${project.id}">${escapeHtml(project.name)}</option>`).join("");
    fillSelect($("#inviteProject"), options, "Choose a project");
    fillSelect($("#taskProject"), options, "Choose a project");
    renderAssigneeOptions();
}
function renderNotifications() {
    const notifications = read(keys.notifications).filter((item) => item.recipientEmail === currentUser.email);
    const unread = notifications.filter((item) => !item.read).length;
    const badge = $("#notificationBadge");
    badge.textContent = unread > 9 ? "9+" : unread;
    badge.classList.toggle("hidden", unread === 0);
    $("#notificationList").innerHTML = notifications.length ? notifications.map((item) => `<div class="rounded-md border ${item.read ? "border-[#464751]" : "border-[#54d7ff]/50"} bg-[#15161a] p-4"><p class="text-sm">${escapeHtml(item.text)}</p><p class="mt-1 text-xs text-[#bcbcc6]">${new Date(item.createdAt).toLocaleString()}</p></div>`).join("") : empty("You have no notifications.");
}
function renderActivity() {
    const ids = visibleProjects().map((project) => project.id);
    const activity = read(keys.activities).filter((item) => ids.includes(item.projectId)).slice(0, 8);
    $("#activityList").innerHTML = activity.length ? activity.map((item) => `<div class="flex gap-3 text-sm"><span class="mt-1 h-2 w-2 shrink-0 rounded-full bg-[#54d7ff]"></span><div><p>${escapeHtml(item.text)}</p><p class="mt-1 text-xs text-[#bcbcc6]">${new Date(item.createdAt).toLocaleString()}</p></div></div>`).join("") : empty("Project activity will appear here.");
}
function taskCard(task) {
    const completed = task.status === "completed";
    const project = projectById(task.projectId);
    const subline = isTeacher ? `Assigned to ${escapeHtml(task.assigneeName || task.assigneeEmail)}` : `Project: ${escapeHtml(project?.name || "Deleted project")}`;
    const state = completed ? `Completed by ${escapeHtml(task.assigneeName || task.assigneeEmail)}` : "Pending";
    const priorityClass = task.priority === "high" ? "text-red-300" : task.priority === "low" ? "text-emerald-300" : "text-amber-300";
    const comments = read(keys.comments).filter((comment) => comment.taskId === task.id);
    const action = !isTeacher && !completed ? `<button data-complete-task="${task.id}" class="shrink-0 rounded-md bg-[#54d7ff] px-3 py-2 text-xs font-semibold text-[#07151b] hover:bg-[#8de3ff]">Mark complete</button>` : "";
    const commentsHtml = comments.length ? comments.slice(-2).map((comment) => `<p class="mt-1 text-xs text-[#c7c7d1]"><strong>${escapeHtml(comment.authorName)}:</strong> ${escapeHtml(comment.text)}</p>`).join("") : "";
    return `<div class="rounded-md border ${completed ? "border-emerald-500/40" : "border-[#464751]"} bg-[#15161a] p-4"><div class="flex items-start justify-between gap-4"><div><h4 class="font-semibold ${completed ? "line-through text-[#bcbcc6]" : ""}">${escapeHtml(task.title)}</h4><p class="mt-1 text-sm text-[#bcbcc6]">${subline}</p><div class="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs"><span class="${completed ? "text-emerald-300" : "text-amber-300"}">${state}</span><span class="${priorityClass}">${escapeHtml(task.priority || "medium")} priority</span><span class="text-[#bcbcc6]">Due: ${formatDate(task.dueDate)}</span></div></div>${action}</div><div class="mt-3 border-t border-[#34353c] pt-3">${commentsHtml}<form data-comment-form="${task.id}" class="mt-2 flex gap-2"><input name="comment" maxlength="240" required class="min-w-0 flex-1 rounded border border-[#464751] bg-[#1d1e22] px-2 py-1.5 text-xs" placeholder="Add a comment"><button class="rounded bg-[#2b2c31] px-3 text-xs hover:bg-[#3a3b43]">Send</button></form></div></div>`;
}

function render() {
    const projects = visibleProjects();
    const tasks = getTasks();
    const shownTasks = isTeacher ? tasks.filter((task) => projects.some((project) => project.id === task.projectId)) : tasks.filter((task) => task.assigneeEmail === currentUser.email);
    const completed = shownTasks.filter((task) => task.status === "completed");
    $("#roleLabel").textContent = isTeacher ? "Teacher workspace" : "Student workspace";
    $("#welcome").textContent = `Welcome back, ${currentUser.fullName}`;
    $("#subtitle").textContent = isTeacher ? "Create projects, invite students, and track submitted work." : "Join assigned projects and complete tasks from your teacher.";
    $("#projectCount").textContent = projects.length;
    $("#taskCount").textContent = shownTasks.length;
    $("#completedCount").textContent = completed.length;
    $("#projectRoleNote").textContent = isTeacher ? "Projects you manage" : "Projects you joined";
    $("#taskRoleNote").textContent = isTeacher ? "Student progress" : "Assigned to you";
    $("#projectList").innerHTML = projects.length ? projects.map((project) => {
        const projectTasks = tasks.filter((task) => task.projectId === project.id);
        const done = projectTasks.filter((task) => task.status === "completed").length;
        const details = isTeacher ? `${project.members.length} student${project.members.length === 1 ? "" : "s"} joined · ${done}/${projectTasks.length} completed` : `Teacher: ${escapeHtml(project.teacherName)}`;
        return `<div class="rounded-md border border-[#464751] bg-[#15161a] p-4"><div class="flex items-start justify-between gap-3"><div><h4 class="font-semibold">${escapeHtml(project.name)}</h4><p class="mt-1 text-sm text-[#bcbcc6]">${escapeHtml(project.description || "No description")}</p></div><span class="rounded bg-[#2b2c31] px-2 py-1 text-xs text-[#c7c7d1]">${projectTasks.length} tasks</span></div><p class="mt-3 text-xs text-[#bcbcc6]">${details} · Due: ${formatDate(project.dueDate)}</p></div>`;
    }).join("") : empty(isTeacher ? "Create your first project to start inviting students." : "Join a project invitation to see it here.");
    $("#taskList").innerHTML = shownTasks.length ? shownTasks.map(taskCard).join("") : empty(isTeacher ? "Tasks assigned to students will appear here." : "You do not have any assigned tasks yet.");
    if (isTeacher) renderTeacherSelects();
    else {
        const invites = getProjects().filter((project) => project.invites.includes(currentUser.email));
        $("#inviteList").innerHTML = invites.length ? invites.map((project) => `<div class="flex flex-col gap-3 rounded-md border border-[#464751] bg-[#15161a] p-4 sm:flex-row sm:items-center sm:justify-between"><div><p class="font-semibold">${escapeHtml(project.name)}</p><p class="mt-1 text-sm text-[#bcbcc6]">Invited by ${escapeHtml(project.teacherName)}</p></div><button data-join-project="${project.id}" class="rounded-md bg-[#aaa7ff] px-4 py-2 text-sm font-semibold text-[#17175a] hover:bg-[#c0beff]">Join project</button></div>`).join("") : empty("No pending project invitations.");
    }
    renderNotifications(); renderActivity();
}

if (isTeacher) { $("#teacherControls").classList.replace("hidden", "grid"); $("#newProjectButton").classList.replace("hidden", "inline-flex"); } else $("#studentInvites").classList.remove("hidden");
$("#newProjectButton").addEventListener("click", () => projectDialog.showModal());
$("[data-close-dialog]").addEventListener("click", () => projectDialog.close());
$("#notificationButton").addEventListener("click", () => { const notifications = read(keys.notifications); 
notifications.forEach((item) => { if (item.recipientEmail === currentUser.email) item.read = true; }); 
write(keys.notifications, notifications); 
renderNotifications(); notificationDialog.showModal(); });
$("[data-close-notifications]").addEventListener("click", () => notificationDialog.close());

$("#projectForm").addEventListener("submit", (event) => {
    event.preventDefault(); if (!isTeacher) return; const name = $("#projectName").value.trim(); if (!name) return;
    const projects = getProjects(); 
    const project = { id: id("project"), name, description: $("#projectDescription").value.trim(), dueDate: $("#projectDueDate").value, teacherEmail: currentUser.email, teacherName: currentUser.fullName, members: [], invites: [], createdAt: new Date().toISOString() };
    projects.push(project); 
    write(keys.projects, projects); 
    addActivity(project.id, `${currentUser.fullName} created ${project.name}.`); 
    event.target.reset(); 
    projectDialog.close(); 
    render();
});
$("#inviteForm").addEventListener("submit", (event) => {
    event.preventDefault(); if (!isTeacher) return; 
    const projectId = $("#inviteProject").value; 
    const project = getProjects().find((item) => item.id === projectId && item.teacherEmail === currentUser.email);
    const emails = [...new Set($("#studentEmails").value.split(/[\s,;]+/).map((email) => email.trim().toLowerCase()).filter(Boolean))];
    const users = read(keys.users); 
    if (!project || !emails.length) return showMessage("#inviteMessage", "Choose a project and enter student emails.", true);
    const valid = users.filter((user) => emails.includes(user.email.toLowerCase()) && user.role === "student" && !project.members.includes(user.email) && !project.invites.includes(user.email));
    const projects = getProjects(); 
    const savedProject = projects.find((item) => item.id === project.id); 
    valid.forEach((student) => { 
        savedProject.invites.push(student.email); 
        notify(student.email, `${currentUser.fullName} invited you to join ${savedProject.name}.`); 
    });
    write(keys.projects, projects); 
    if (valid.length) addActivity(project.id, `${currentUser.fullName} invited ${valid.length} student${valid.length === 1 ? "" : "s"}.`); 
    event.target.reset(); showMessage("#inviteMessage", `${valid.length} invitation${valid.length === 1 ? "" : "s"} sent. ${emails.length - valid.length} skipped.`); 
    render();
});
$("#taskProject").addEventListener("change", renderAssigneeOptions);
$("#assignAll").addEventListener("change", (event) => document.querySelectorAll('input[name="taskAssignee"]').forEach((box) => box.checked = event.target.checked));
$("#taskForm").addEventListener("submit", (event) => {
    event.preventDefault(); 
    if (!isTeacher) return; const projectId = $("#taskProject").value, title = $("#taskTitle").value.trim(); 
    const project = ownedProjects().find((item) => item.id === projectId);
    const selected = [...document.querySelectorAll('input[name="taskAssignee"]:checked')].map((box) => box.value); 
    const users = read(keys.users); 
    const students = users.filter((user) => selected.includes(user.email) && project?.members.includes(user.email) && user.role === "student");
    if (!project || !title || !students.length) return showMessage("#taskMessage", "Choose a project, at least one joined student, and a task title.", true);
    const tasks = getTasks(); 
    students.forEach((student) => { tasks.push({ id: id("task"), title, projectId, assigneeEmail: student.email, assigneeName: student.fullName, assignedByEmail: currentUser.email, status: "pending", priority: $("#taskPriority").value, dueDate: $("#taskDueDate").value, completedAt: null }); 
    notify(student.email, `${currentUser.fullName} assigned you “${title}” in ${project.name}.`); 
});
    write(keys.tasks, tasks); addActivity(projectId, `${currentUser.fullName} assigned “${title}” to ${students.length} student${students.length === 1 ? "" : "s"}.`); 
    event.target.reset(); 
    showMessage("#taskMessage", `Task assigned to ${students.length} student${students.length === 1 ? "" : "s"}.`); 
    render();
});

document.addEventListener("click", (event) => {
    const join = event.target.closest("[data-join-project]"), complete = event.target.closest("[data-complete-task]");
    if (join && !isTeacher) { const projects = getProjects(); 
        const project = projects.find((item) => item.id === join.dataset.joinProject && item.invites.includes(currentUser.email)); 
        if (!project) return; 
        project.invites = project.invites.filter((email) => email !== currentUser.email); 
        project.members.push(currentUser.email); 
        write(keys.projects, projects); 
        notify(project.teacherEmail, `${currentUser.fullName} joined ${project.name}.`); 
        addActivity(project.id, `${currentUser.fullName} joined the project.`); 
        render(); 
    }
    if (complete && !isTeacher) { const tasks = getTasks(); 
        const task = tasks.find((item) => item.id === complete.dataset.completeTask && item.assigneeEmail === currentUser.email); 
        if (!task || task.status === "completed") return; 
        task.status = "completed"; 
        task.completedAt = new Date().toISOString(); 
        write(keys.tasks, tasks); 
        const project = projectById(task.projectId); 
        notify(project.teacherEmail, `${currentUser.fullName} completed “${task.title}” in ${project.name}.`); 
        addActivity(task.projectId, `${currentUser.fullName} completed “${task.title}”.`); 
        render(); 
    }
});
document.addEventListener("submit", (event) => {
    const form = event.target.closest("[data-comment-form]"); 
    if (!form) return; event.preventDefault(); 
    const task = getTasks().find((item) => item.id === form.dataset.commentForm); 
    const text = form.elements.comment.value.trim(); if (!task || !text || !canAccessTask(task)) return;
    const comments = read(keys.comments); 
    comments.push({ id: id("comment"), taskId: task.id, authorName: currentUser.fullName, authorEmail: currentUser.email, text, createdAt: new Date().toISOString() 

    }); 
    write(keys.comments, comments); 
    const project = projectById(task.projectId); 
    if (currentUser.email !== task.assigneeEmail) notify(task.assigneeEmail, `${currentUser.fullName} commented on “${task.title}”.`); 
    else notify(project.teacherEmail, `${currentUser.fullName} commented on “${task.title}”.`); 
    addActivity(task.projectId, `${currentUser.fullName} commented on “${task.title}”.`); 
    render();
});
render();
