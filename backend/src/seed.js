// Fills the database with a demo organization for presentations.
//   npm run seed              adds demo data (stops if the demo organization already exists)
//   npm run seed -- --reset   ERASES the whole database first, then adds demo data
import "./config/env.js";
import mongoose from "mongoose";
import { connectDB } from "./config/db.js";
import User from "./models/User.js";
import Organization from "./models/Organization.js";
import Role from "./models/Role.js";
import Membership from "./models/Membership.js";
import Invitation from "./models/Invitation.js";
import Project from "./models/Project.js";
import Task from "./models/Task.js";
import Comment from "./models/Comment.js";
import Message from "./models/Message.js";
import { createOrganization } from "./services/orgService.js";
import { logActivity, logAudit, notify } from "./utils/events.js";

const PASSWORD = "demo12345";
const reset = process.argv.includes("--reset");

await connectDB(process.env.MONGO_URI);

if (reset) {
    await mongoose.connection.db.dropDatabase();
    // Recreate indexes (unique emails, one membership per user...) after dropping.
    await Promise.all(mongoose.modelNames().map((name) => mongoose.model(name).syncIndexes()));
    console.log("Database erased.");
}

if (await Organization.exists({ name: "Acme Corp" })) {
    console.log("Demo data already exists. Nothing to do.");
} else if (!reset && (await User.exists({ email: "priya@collabos.dev" }))) {
    console.log("Old demo accounts found. Run with --reset (or 'Load Demo Data.bat') to replace them.");
    process.exitCode = 1;
} else {
    const people = await User.create([
        { fullName: "Priya Sharma", email: "priya@collabos.dev", password: PASSWORD, department: "Leadership" },
        { fullName: "Neha Kapoor", email: "neha@collabos.dev", password: PASSWORD, department: "Operations" },
        { fullName: "Aarav Patel", email: "aarav@collabos.dev", password: PASSWORD, department: "Engineering" },
        { fullName: "Meera Iyer", email: "meera@collabos.dev", password: PASSWORD, department: "Engineering" },
        { fullName: "Kabir Singh", email: "kabir@collabos.dev", password: PASSWORD, department: "Engineering" }
    ]);
    const [priya, neha, aarav, meera, kabir] = people;

    // Priya creates the organization and becomes Owner. Default roles are created automatically.
    const { org, roles } = await createOrganization(priya, { name: "Acme Corp", description: "A demo company using CollabOS." });
    const role = (name) => roles.find((r) => r.name === name);

    // Two custom roles, to show the Owner can design their own.
    const developer = await Role.create({ org: org._id, name: "Developer", description: "Builds features and submits work.", level: 3, permissions: ["files.upload"] });
    const intern = await Role.create({ org: org._id, name: "Intern", description: "Learns on assigned tasks. No admin rights.", level: 5, permissions: [] });
    await logAudit(org._id, priya._id, "Priya Sharma created the roles Developer and Intern.");

    await Membership.create([
        { user: neha._id, org: org._id, role: role("Admin")._id },
        { user: aarav._id, org: org._id, role: role("Manager")._id },
        { user: meera._id, org: org._id, role: developer._id }
    ]);
    await logAudit(org._id, priya._id, "Neha Kapoor joined as Admin, Aarav Patel as Manager, Meera Iyer as Developer.");

    // Kabir has an account but hasn't accepted his invitation yet.
    await Invitation.create({ org: org._id, email: kabir.email, role: intern._id, invitedBy: aarav._id });
    await notify(kabir._id, "Aarav Patel invited you to join Acme Corp as Intern.", "/welcome", "people");
    await logAudit(org._id, aarav._id, "Aarav Patel invited kabir@collabos.dev as Intern.");

    const inDays = (n) => new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate() + n));

    // Aarav (Manager) leads a project with Meera.
    const website = await Project.create({
        org: org._id, name: "Website Redesign", owner: aarav._id, members: [meera._id],
        description: "Rebuild the company website with React and a new design system.", dueDate: inDays(30)
    });
    // Priya leads a second project that Aarav and Meera can't see, unless they have "projects.view_all".
    const strategy = await Project.create({
        org: org._id, name: "2027 Strategy", owner: priya._id, members: [neha._id],
        description: "Leadership planning for next year.", dueDate: inDays(60)
    });
    await logActivity(website, aarav._id, "Aarav Patel created Website Redesign.");
    await logActivity(strategy, priya._id, "Priya Sharma created 2027 Strategy.");

    const base = { org: org._id, project: website._id, assignedBy: aarav._id };
    const tasks = await Task.create([
        { ...base, title: "Design the database schema", priority: "high", dueDate: inDays(-2), assignee: meera._id, status: "completed", completedAt: new Date() },
        { ...base, title: "Build login API", priority: "high", dueDate: inDays(-1), assignee: meera._id },
        { ...base, title: "Fix navbar on mobile", priority: "medium", dueDate: inDays(0), assignee: meera._id },
        { ...base, title: "Write API documentation", priority: "low", dueDate: inDays(1), assignee: meera._id },
        { ...base, title: "Create React dashboard", priority: "medium", dueDate: inDays(7), assignee: meera._id },
        { ...base, title: "Accessibility audit", priority: "high", dueDate: inDays(12), assignee: meera._id },
        { ...base, title: "Review pull requests", priority: "low", dueDate: inDays(10), assignee: aarav._id },
        { org: org._id, project: strategy._id, assignedBy: priya._id, title: "Draft hiring plan", priority: "medium", dueDate: inDays(14), assignee: neha._id }
    ]);
    await Comment.create({ task: tasks[0]._id, author: meera._id, text: "Schema diagram uploaded to the project files." });
    await Message.create([
        { org: org._id, sender: aarav._id, project: website._id, text: "Welcome to the Website Redesign project! Tasks are on your dashboard." },
        { org: org._id, sender: meera._id, project: website._id, text: "Thanks! Starting on the login API today." }
    ]);
    await logActivity(website, meera._id, `Meera Iyer completed "${tasks[0].title}".`);

    console.log("Demo data created. Every account uses the password:", PASSWORD);
    console.log("  priya@collabos.dev  Owner (Company Head)");
    console.log("  neha@collabos.dev   Admin");
    console.log("  aarav@collabos.dev  Manager (leads Website Redesign)");
    console.log("  meera@collabos.dev  Developer (custom role)");
    console.log("  kabir@collabos.dev  no organization yet, has an invite as Intern");
}

await mongoose.disconnect();
