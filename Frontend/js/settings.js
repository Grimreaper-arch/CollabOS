function readUser() {
    try { 
        return JSON.parse(localStorage.getItem("loggedInUser")); 
    } catch { return null; }
}

let user = readUser();
if (!user?.fullName || !user?.email) { window.location.replace("login.html"); 
    throw new Error("No active session"); 
}

const fields = {
    fullName: document.getElementById("profileName"), email: document.getElementById("profileEmail"),
    institution: document.getElementById("profileInstitution"), department: document.getElementById("profileDepartment"),
    phone: document.getElementById("profilePhone"), bio: document.getElementById("profileBio")
};

function showProfile() {
    document.getElementById("userName").textContent = user.fullName;
    document.getElementById("userEmail").textContent = `${user.email} · ${user.role}`;
    document.getElementById("avatarInitial").textContent = user.fullName.charAt(0).toUpperCase();
    Object.entries(fields).forEach(([key, field]) => { field.value = user[key] || ""; });
}

document.getElementById("profileForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const updated = Object.fromEntries(Object.entries(fields).map(([key, field]) => [key, field.value.trim()]));
    let users;
    try { 
        users = JSON.parse(localStorage.getItem("users")) || []; 
    } catch { users = []; }
    const duplicate = users.some((account) => account.email.toLowerCase() === updated.email.toLowerCase() && account.email !== user.email);
    if (duplicate) { document.getElementById("profileMessage").textContent = "That email is already in use."; 
        document.getElementById("profileMessage").className = "text-sm text-red-300"; return; 
    }
    const previousEmail = user.email;
    user = { ...user, ...updated };
    users = users.map((account) => account.email === previousEmail ? { ...account, ...user } : account);
    localStorage.setItem("users", JSON.stringify(users));

    if (user.fullName) {
        const projects = JSON.parse(localStorage.getItem("projects") || "[]").map((project) => ({
            ...project,
            teacherEmail: project.teacherEmail === previousEmail ? user.email : project.teacherEmail,
            teacherName: project.teacherEmail === previousEmail ? user.fullName : project.teacherName,
            members: (project.members || []).map((email) => email === previousEmail ? user.email : email),
            invites: (project.invites || []).map((email) => email === previousEmail ? user.email : email)
        }));
        const tasks = JSON.parse(localStorage.getItem("tasks") || "[]").map((task) => ({
            ...task,
            assigneeEmail: task.assigneeEmail === previousEmail ? user.email : task.assigneeEmail,
            assigneeName: task.assigneeEmail === previousEmail ? user.fullName : task.assigneeName,
            assignedByEmail: task.assignedByEmail === previousEmail ? user.email : task.assignedByEmail
        }));
        const notifications = JSON.parse(localStorage.getItem("notifications") || "[]").map((item) => ({ ...item, recipientEmail: item.recipientEmail === previousEmail ? user.email : item.recipientEmail }));
        localStorage.setItem("projects", JSON.stringify(projects));
        localStorage.setItem("tasks", JSON.stringify(tasks));
        localStorage.setItem("notifications", JSON.stringify(notifications));
    }
    localStorage.setItem("loggedInUser", JSON.stringify(user));
    document.getElementById("profileMessage").textContent = "Profile saved.";
    document.getElementById("profileMessage").className = "text-sm text-emerald-300";
    showProfile();
});

document.getElementById("logoutBtn").addEventListener("click", () => { localStorage.removeItem("loggedInUser"); 
    window.location.replace("login.html"); 
});
showProfile();
