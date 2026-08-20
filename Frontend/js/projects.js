const getElement = (selector) => document.querySelector(selector);

function getStoredData(key, fallback = []) {
    try {
        return JSON.parse(localStorage.getItem(key)) ?? fallback;
    } catch {
        return fallback;
    }
}

function safeText(value = "") {
    const element = document.createElement("div");
    element.textContent = value;
    return element.innerHTML;
}

function showDate(date) {
    if (!date) return "No due date";

    return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric"
    });
}


// Current user and page elements
const currentUser = getStoredData("loggedInUser", null);

if (!currentUser?.email || !currentUser?.role) {
    window.location.replace("login.html");
    throw new Error("No active session");
}

const isTeacher = currentUser.role === "teacher";

const page = {
    roleLabel: getElement("#roleLabel"),
    subtitle: getElement("#subtitle"),
    projectCount: getElement("#projectCount"),
    middleLabel: getElement("#middleLabel"),
    middleCount: getElement("#middleCount"),
    completedCount: getElement("#completedCount"),
    searchInput: getElement("#searchInput"),
    resultCount: getElement("#resultCount"),
    projectList: getElement("#projectList")
};

function getProjects() {
    // Older projects may not have a members list yet.
    return getStoredData("projects").map((project) => ({
        ...project,
        members: project.members || []
    }));
}

function getTasks() {
    return getStoredData("tasks");
}

// Teachers see projects they created. Students see joined projects.
function getVisibleProjects() {
    return getProjects().filter((project) => {
        return isTeacher
            ? project.teacherEmail === currentUser.email
            : project.members.includes(currentUser.email);
    });
}

function getProjectTasks(projectId, tasks) {
    return tasks.filter((task) => task.projectId === projectId);
}


// Project card
function createProjectCard(project, tasks) {
    const projectTasks = getProjectTasks(project.id, tasks);
    const completedCount = projectTasks.filter((task) => task.status === "completed").length;
    const pendingCount = projectTasks.length - completedCount;
    const progress = projectTasks.length ? (completedCount / projectTasks.length) * 100 : 0;
    const teacherName = safeText(project.teacherName || "Not available");
    const projectDetail = isTeacher
        ? `${project.members.length} student${project.members.length === 1 ? "" : "s"} joined`
        : `Teacher: ${teacherName}`;
    const firstMetricLabel = isTeacher ? "Students" : "Teacher";
    const firstMetricValue = isTeacher ? project.members.length : teacherName;

    return `
        <article class="rounded-lg border border-[#464751] bg-[#15161a] p-5">
            <div class="flex items-start justify-between gap-3">
                <div>
                    <h4 class="text-lg font-semibold">${safeText(project.name)}</h4>
                    <p class="mt-2 text-sm text-[#bcbcc6]">${safeText(project.description || "No description")}</p>
                </div>
                <span class="rounded bg-[#2b2c31] px-2 py-1 text-xs text-[#c7c7d1]">${projectTasks.length} tasks</span>
            </div>

            <div class="mt-5 grid grid-cols-2 gap-3 border-t border-[#34353c] pt-4 text-sm">
                <div>
                    <p class="text-xs uppercase tracking-wide text-[#bcbcc6]">${firstMetricLabel}</p>
                    <p class="mt-1 font-medium">${firstMetricValue}</p>
                </div>
                <div>
                    <p class="text-xs uppercase tracking-wide text-[#bcbcc6]">Progress</p>
                    <p class="mt-1 font-medium text-[#54d7ff]">${completedCount}/${projectTasks.length} complete</p>
                </div>
            </div>

            <div class="mt-4 h-2 overflow-hidden rounded bg-[#2b2c31]">
                <div class="h-full bg-[#54d7ff]" style="width:${progress}%"></div>
            </div>

            <p class="mt-4 text-xs text-[#bcbcc6]">${projectDetail} · ${pendingCount} pending · Due: ${showDate(project.dueDate)}</p>
        </article>`;
}

// Filtering and rendering
function getMatchingProjects(projects) {
    const searchText = page.searchInput.value.trim().toLowerCase();

    return projects.filter((project) => {
        const projectText = [project.name, project.description, project.teacherName]
            .join(" ")
            .toLowerCase();

        return projectText.includes(searchText);
    });
}

function getEmptyMessage(totalProjects) {
    if (totalProjects) return "No projects match your search.";

    return isTeacher
        ? "Projects you create will appear here."
        : "Join a project invitation to see it here.";
}

function renderProjectsPage() {
    const projects = getVisibleProjects();
    const tasks = getTasks();
    const visibleProjectIds = projects.map((project) => project.id);
    const visibleTasks = tasks.filter((task) => visibleProjectIds.includes(task.projectId));
    const completedTasks = visibleTasks.filter((task) => task.status === "completed");
    const matchingProjects = getMatchingProjects(projects);

    page.roleLabel.textContent = isTeacher ? "Teacher workspace" : "Student workspace";
    page.subtitle.textContent = isTeacher
        ? "Every project you manage and the work assigned within it."
        : "Every project you have joined and the work assigned to you.";
    page.projectCount.textContent = projects.length;
    page.middleLabel.textContent = isTeacher ? "JOINED STUDENTS" : "ASSIGNED TASKS";
    page.middleCount.textContent = isTeacher
        ? projects.reduce((total, project) => total + project.members.length, 0)
        : tasks.filter((task) => task.assigneeEmail === currentUser.email).length;
    page.completedCount.textContent = isTeacher
        ? completedTasks.length
        : completedTasks.filter((task) => task.assigneeEmail === currentUser.email).length;
    page.resultCount.textContent = `${matchingProjects.length} of ${projects.length} project${projects.length === 1 ? "" : "s"}`;
    page.projectList.innerHTML = matchingProjects.length
        ? matchingProjects.map((project) => createProjectCard(project, tasks)).join("")
        : `<p class="rounded-md border border-dashed border-[#464751] p-4 text-sm text-[#bcbcc6] xl:col-span-2">${getEmptyMessage(projects.length)}</p>`;
}

// Update the list as the user types in the search box.
page.searchInput.addEventListener("input", renderProjectsPage);
renderProjectsPage();
