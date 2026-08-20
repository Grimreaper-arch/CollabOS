const get = (key, fallback = []) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };

const current = get("loggedInUser", null);
if (!current?.email || !current?.role) { window.location.replace("login.html"); throw new Error("No active session"); }

const isTeacherAnalytics = current.role === "teacher";

const projects = get("projects").map((project) => ({ ...project, members: project.members || [] }));

const managedProjects = projects.filter((project) => project.teacherEmail === current.email);

const joinedProjects = projects.filter((project) => project.members.includes(current.email));

const tasks = get("tasks");

const scope = isTeacherAnalytics ? tasks.filter((task) => managedProjects.some((project) => project.id === task.projectId)) : tasks.filter((task) => task.assigneeEmail === current.email);

const completed = scope.filter((task) => task.status === "completed");

const overdue = scope.filter((task) => task.status !== "completed" && task.dueDate && task.dueDate < new Date().toISOString().slice(0, 10));

const set = (id, value) => document.getElementById(id).textContent = value;

const rate = (done, total) => total ? Math.round((done / total) * 100) : 0;

set("analyticsRole", isTeacherAnalytics ? "Teacher analytics" : "Student analytics");

set("analyticsTitle", isTeacherAnalytics ? "Classroom progress" : "My progress");

set("analyticsSubtitle", isTeacherAnalytics ? "A live view of projects, workload, and student task completion." : "Track your workload, completion rate, and deadlines.");

const metrics = isTeacherAnalytics
    ? [["metricOneLabel", "Projects", managedProjects.length], ["metricTwoLabel", "Tasks created", scope.length], ["metricThreeLabel", "Completed", completed.length], ["metricFourLabel", "Students involved", new Set(scope.map((task) => task.assigneeEmail)).size]]
    : [["metricOneLabel", "Joined projects", joinedProjects.length], ["metricTwoLabel", "Assigned tasks", scope.length], ["metricThreeLabel", "Completion rate", `${rate(completed.length, scope.length)}%`], ["metricFourLabel", "Overdue tasks", overdue.length]];
metrics.forEach(([label, value, metric]) => { set(label, value); set(label.replace("Label", ""), metric); });

if (isTeacherAnalytics) {
    set("breakdownTitle", "Student completion overview");
    const users = get("users"); 
    const studentEmails = [...new Set(scope.map((task) => task.assigneeEmail))];
    document.getElementById("breakdown").innerHTML = studentEmails.length ? studentEmails.map((email) => { const studentTasks = scope.filter((task) => task.assigneeEmail === email); 
    const done = studentTasks.filter((task) => task.status === "completed").length; 
    const student = users.find((user) => user.email === email); 
    const percent = rate(done, studentTasks.length); 
    return `<div><div class="flex justify-between gap-4 text-sm"><span>${(student?.fullName || email)}</span><span class="text-[#bcbcc6]">${done}/${studentTasks.length} complete</span></div><div class="mt-2 h-2 overflow-hidden rounded bg-[#15161a]"><div class="h-full bg-[#54d7ff]" style="width:${percent}%"></div></div><p class="mt-1 text-right text-xs text-[#bcbcc6]">${percent}%</p></div>`; }).join("") : '<p class="text-sm text-[#bcbcc6]">Assign tasks to students to see their progress here.</p>';
} else {
    set("breakdownTitle", "Project completion");
    document.getElementById("breakdown").innerHTML = joinedProjects.length ? joinedProjects.map((project) => { const projectTasks = scope.filter((task) => task.projectId === project.id); const done = projectTasks.filter((task) => task.status === "completed").length; const percent = rate(done, projectTasks.length); return `<div><div class="flex justify-between gap-4 text-sm"><span>${project.name}</span><span class="text-[#bcbcc6]">${done}/${projectTasks.length} complete</span></div><div class="mt-2 h-2 overflow-hidden rounded bg-[#15161a]"><div class="h-full bg-[#54d7ff]" style="width:${percent}%"></div></div></div>`; }).join("") : '<p class="text-sm text-[#bcbcc6]">Join a project to see your analytics.</p>';
}
