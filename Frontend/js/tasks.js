// Small helpers used throughout the page.
const getElement = (selector) => document.querySelector(selector);

function getStoredData(key, fallback = []) {
    try {
        return JSON.parse(localStorage.getItem(key)) ?? fallback;
    } catch {
        return fallback;
    }
}

function saveData(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
}

function makeId(prefix) {
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function safeText(value = "") {
    const element = document.createElement("div");
    element.textContent = value;
    return element.innerHTML;
}

function showDate(date) {
    if (!date) return "No due date";
    return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

const currentUser = getStoredData("loggedInUser", null);

if (!currentUser?.email || !currentUser?.role) {
    window.location.replace("login.html");
    throw new Error("No active session");
}

const isTeacher = currentUser.role === "teacher";

function getProjects() {
    return getStoredData("projects").map((project) => ({ ...project, members: project.members || [] }));
}

function getTasks() {
    return getStoredData("tasks");
}

function findProject(projectId) {
    return getProjects().find((project) => project.id === projectId);
}

// Teachers see projects they created. Students see projects they joined.
function getVisibleProjects() {
    return getProjects().filter((project) => isTeacher
        ? project.teacherEmail === currentUser.email
        : project.members.includes(currentUser.email));
}

// Teachers see every task in their projects. Students see only their own tasks.
function getVisibleTasks() {
    const visibleProjectIds = getVisibleProjects().map((project) => project.id);
    return isTeacher
        ? getTasks().filter((task) => visibleProjectIds.includes(task.projectId))
        : getTasks().filter((task) => task.assigneeEmail === currentUser.email);
}

function addActivity(projectId, message) {
    const activities = getStoredData("activities");
    activities.unshift({ id: makeId("activity"), projectId, text: message, createdAt: new Date().toISOString() });
    saveData("activities", activities.slice(0, 100));
}

function notifyUser(email, message) {
    const notifications = getStoredData("notifications");
    notifications.unshift({ id: makeId("notification"), recipientEmail: email, text: message, read: false, createdAt: new Date().toISOString() });
    saveData("notifications", notifications.slice(0, 100));
}

function getPriorityColor(priority) {
    if (priority === "high") return "text-red-300";
    if (priority === "low") return "text-emerald-300";
    return "text-amber-300";
}

function createTaskCard(task) {
    const isComplete = task.status === "completed";
    const project = findProject(task.projectId);
    const priority = task.priority || "medium";
    const details = isTeacher
        ? `Assigned to ${safeText(task.assigneeName || task.assigneeEmail)}`
        : `Project: ${safeText(project?.name || "Deleted project")}`;
    const status = isComplete ? `Completed${task.completedAt ? ` on ${new Date(task.completedAt).toLocaleDateString()}` : ""}` : "Pending";
    const completeButton = !isTeacher && !isComplete
        ? `<button data-complete-task="${task.id}" class="shrink-0 rounded-md bg-[#54d7ff] px-3 py-2 text-xs font-semibold text-[#07151b] hover:bg-[#8de3ff]">Mark complete</button>`
        : "";

    return `
        <article class="rounded-md border ${isComplete ? "border-emerald-500/40" : "border-[#464751]"} bg-[#15161a] p-4">
            <div class="flex items-start justify-between gap-4">
                <div>
                    <h4 class="font-semibold ${isComplete ? "line-through text-[#bcbcc6]" : ""}">${safeText(task.title)}</h4>
                    <p class="mt-1 text-sm text-[#bcbcc6]">${details}</p>
                    <div class="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                        <span class="${isComplete ? "text-emerald-300" : "text-amber-300"}">${status}</span>
                        <span class="${getPriorityColor(priority)}">${safeText(priority)} priority</span>
                        <span class="text-[#bcbcc6]">Due: ${showDate(task.dueDate)}</span>
                    </div>
                </div>
                ${completeButton}
            </div>
        </article>`;
}

function updateProjectFilter() {
    const projectFilter = getElement("#projectFilter");
    const selectedProject = projectFilter.value;
    const options = getVisibleProjects().map((project) => `<option value="${safeText(project.id)}">${safeText(project.name)}</option>`);

    projectFilter.innerHTML = `<option value="all">All projects</option>${options.join("")}`;
    projectFilter.value = [...projectFilter.options].some((option) => option.value === selectedProject) ? selectedProject : "all";
}

function getFilteredTasks(tasks, projects) {
    const searchText = getElement("#searchInput").value.trim().toLowerCase();
    const selectedStatus = getElement("#statusFilter").value;
    const selectedProject = getElement("#projectFilter").value;

    return tasks.filter((task) => {
        const project = projects.find((item) => item.id === task.projectId);
        const searchableText = [task.title, project?.name, task.assigneeName, task.assigneeEmail].join(" ").toLowerCase();
        const matchesSearch = !searchText || searchableText.includes(searchText);
        const matchesStatus = selectedStatus === "all" || task.status === selectedStatus;
        const matchesProject = selectedProject === "all" || task.projectId === selectedProject;
        return matchesSearch && matchesStatus && matchesProject;
    }).sort((firstTask, secondTask) => {
        const firstIsComplete = firstTask.status === "completed";
        const secondIsComplete = secondTask.status === "completed";
        if (firstIsComplete !== secondIsComplete) return firstIsComplete ? 1 : -1;
        return (firstTask.dueDate || "9999-12-31").localeCompare(secondTask.dueDate || "9999-12-31");
    });
}

function emptyMessage(totalTasks) {
    if (totalTasks) return "No tasks match these filters.";
    return isTeacher ? "Tasks you assign to students will appear here." : "You do not have any assigned tasks yet.";
}

function renderTasksPage() {
    const tasks = getVisibleTasks();
    const projects = getVisibleProjects();
    const completedTasks = tasks.filter((task) => task.status === "completed");

    getElement("#roleLabel").textContent = isTeacher ? "Teacher workspace" : "Student workspace";
    getElement("#subtitle").textContent = isTeacher ? "Every task you have assigned across your projects." : "Every task assigned to you by your teachers.";
    getElement("#totalCount").textContent = tasks.length;
    getElement("#pendingCount").textContent = tasks.length - completedTasks.length;
    getElement("#completedCount").textContent = completedTasks.length;

    updateProjectFilter();
    const filteredTasks = getFilteredTasks(tasks, projects);
    getElement("#resultCount").textContent = `${filteredTasks.length} of ${tasks.length} task${tasks.length === 1 ? "" : "s"}`;
    getElement("#taskList").innerHTML = filteredTasks.length
        ? filteredTasks.map(createTaskCard).join("")
        : `<p class="rounded-md border border-dashed border-[#464751] p-4 text-sm text-[#bcbcc6]">${emptyMessage(tasks.length)}</p>`;
}

function completeStudentTask(taskId) {
    const tasks = getTasks();
    const task = tasks.find((item) => item.id === taskId && item.assigneeEmail === currentUser.email);
    if (!task || task.status === "completed") return;

    task.status = "completed";
    task.completedAt = new Date().toISOString();
    saveData("tasks", tasks);

    const project = findProject(task.projectId);
    if (project) notifyUser(project.teacherEmail, `${currentUser.fullName} completed “${task.title}” in ${project.name}.`);
    addActivity(task.projectId, `${currentUser.fullName} completed “${task.title}”.`);
    renderTasksPage();
}

getElement("#searchInput").addEventListener("input", renderTasksPage);
getElement("#statusFilter").addEventListener("change", renderTasksPage);
getElement("#projectFilter").addEventListener("change", renderTasksPage);

document.addEventListener("click", (event) => {
    const completeButton = event.target.closest("[data-complete-task]");
    if (completeButton && !isTeacher) completeStudentTask(completeButton.dataset.completeTask);
});

renderTasksPage();
