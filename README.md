# CollabOS

CollabOS is a SaaS-style collaboration platform where teams in companies, colleges and communities manage workspaces, projects, tasks, communication, files and analytics in one place. It uses secure authentication, organization-level role-based access control (RBAC) and a production-style backend.

**Stack (MERN):** MongoDB · Express.js · React · Node.js, plus Multer for uploads and JWT + bcrypt for auth.

## Folder structure

```
CollabOS-main/
├── Start CollabOS.bat    starts backend + website and opens the browser
│                         (also: Stop, Load Demo Data, Reset Database, Change Database)
├── backend/              Node.js + Express REST API (port 5000)
│   ├── src/
│   │   ├── config/       env loading, MongoDB connection, permissions.js (the permission catalog)
│   │   ├── models/       Mongoose schemas: User, Organization, Role, Membership, Invitation,
│   │   │                 Project, Task, Comment, File, CodeFile, Message, Notification, Activity
│   │   ├── middleware/   auth.js (JWT + requirePermission), upload.js (Multer), error.js
│   │   ├── services/     orgService.js (new organization + default roles), reminders.js (due-date alerts)
│   │   ├── controllers/  request handlers
│   │   ├── routes/       URL → controller mapping
│   │   ├── utils/        access.js (project/task access), rbac.js (hierarchy rules), events
│   │   ├── app.js        Express app setup
│   │   ├── server.js     entry point
│   │   ├── seed.js       demo data
│   │   └── reset.js      erase everything
│   ├── scripts/          helpers used by the .bat launchers
│   └── uploads/          files saved by Multer (not committed)
└── client/               React app (Vite + React Router + Tailwind CSS, port 5173)
    └── src/
        ├── api/          fetch wrapper that sends the JWT
        ├── context/      AuthContext (user, organization, role, permissions, can()), ToastContext
        ├── components/   layout, sidebar, command palette, shared UI (date picker, select, modal…)
        ├── pages/        one file per screen
        └── utils/        dates, formatting, file types, desktop alerts
```

## Running the project

### Easy way (Windows): double-click

| File | What it does |
|---|---|
| `Start CollabOS.bat` | Installs packages on first run, asks for your MongoDB connection string if it isn't set, starts the server and website, and opens the browser |
| `Stop CollabOS.bat` | Shuts everything down |
| `Load Demo Data.bat` | **Erases the database** (after asking) and loads the demo company "Acme Corp" |
| `Change Database.bat` | Pastes in a different MongoDB connection string |
| `Reset Database.bat` | **Erases everything** (after asking) so you can start from a blank app |

### Manual way

You need **Node.js 18+** and a **MongoDB Atlas** cluster.

1. **Atlas (one time):** create a free M0 cluster, add a database user (**Database Access**), allow your IP (**Network Access**), then copy the connection string from **Connect → Drivers** into `backend/.env` as `MONGO_URI`, with `collabos` as the database name. On a new machine, copy `.env.example` to `.env` first.
2. **Backend (terminal 1):**
   ```bash
   cd backend
   npm install
   npm run seed -- --reset   # optional: erase and load demo data
   npm run dev               # API on http://localhost:5000
   ```
3. **Frontend (terminal 2):**
   ```bash
   cd client
   npm install
   npm run dev               # open http://localhost:5173
   ```

### Demo accounts (after loading demo data)

All demo accounts use the password `demo12345`. Organization: **Acme Corp**.

| Email | Role (level) | What to show |
|---|---|---|
| priya@collabos.dev | **Owner** (0) | Company Head: Organization page, create roles, change anyone's role, audit log, transfer ownership |
| neha@collabos.dev | Admin (1) | All permissions but can't touch the Owner |
| aarav@collabos.dev | Manager (2) | Leads "Website Redesign"; can invite only roles below Manager; can't edit roles |
| meera@collabos.dev | Developer (3, custom role) | Works on tasks, uploads files; no admin buttons |
| kabir@collabos.dev | no organization | Sees the welcome screen with a pending **Intern** invitation |

## Highlights

- **My Calendar** (`/calendar`): a month view of your task due dates and project deadlines, the agenda for the selected day, overdue and upcoming lists, and an **.ics export** (each event has a reminder the day before) for Google Calendar or Outlook.
- **Due-date alerts:** a background job (`backend/src/services/reminders.js`, every 15 minutes) notifies people when a task is due today or tomorrow and when it becomes overdue; the assigner is told about overdue work too. Each alert is sent once per task. In the app, alerts appear as toasts and, if enabled, as **desktop notifications**.
- **Code** (`/code`): a VS Code-style editor built on **Monaco** (the editor inside VS Code), with an explorer tree, tabs, syntax highlighting for 25+ languages, **Ctrl + S** to save, and a status bar. Code files are stored per project in MongoDB (`models/CodeFile.js`), so the whole team edits the same copy. Teammates' saves appear automatically within 15 seconds. If two people edit the same file, the second save gets a **conflict prompt** instead of silently overwriting the first. Limits: 500 KB per file, 10 MB per project. **Open in VS Code** opens vscode.dev, or the project's GitHub repository in VS Code online, in a new tab (Microsoft doesn't allow vscode.dev to be embedded in other sites).
- **Command palette:** press **Ctrl + K** anywhere to jump to a page or project, or to add a task.
- **Design system:** `client/src/components/ui.jsx` holds the reusable parts (custom date picker, select, modal, popover, tabs, toggle, chips, skeletons), and `context/ToastContext.jsx` the toast notifications. Fonts are Geist and Geist Mono; icons are Material Symbols Rounded.

## Role-based access control (RBAC)

### How it works

1. **Sign up → no role.** A new account doesn't belong to any organization.
2. **Welcome screen:** the user either **creates an organization**, becoming its **Owner** (the Company Head / Super Admin), or **accepts an invitation**.
3. When an organization is created it gets 5 default roles: Owner (locked), Admin, Manager, Member and Viewer. The Owner can edit them or **create custom roles**, ticking permissions from a fixed catalog.
4. People with `members.invite` **invite by email with a role**. The invited person sees it the next time they log in or sign up with that email. Invitations expire after 7 days.
5. Every API request loads the user's membership and role **from the database**, so permission changes apply on the next request, without logging in again.

### Data model

```
User ──< Membership >── Organization ──< Role (name, level, permissions[])
              │                │
              └── role         ├──< Invitation (email, role, status, expiresAt)
                               └──< Project ──< Task, File, Message
```

### Permission catalog (`backend/src/config/permissions.js`)

| Group | Permissions |
|---|---|
| Organization | `org.manage`, `org.analytics` |
| People | `members.invite`, `members.remove`, `members.assign_role` |
| Roles | `roles.manage` |
| Projects | `projects.create`, `projects.view_all`, `projects.manage_all` |
| Tasks | `tasks.assign`, `tasks.manage_all` |
| Files | `files.upload`, `files.delete_any` |

Everyone can always see their own tasks, complete them, submit work, comment and chat.

### Security rules

- **Hierarchy:** every role has a **level** (Owner = 0; bigger = more junior). You can only invite, assign, edit or remove roles and people **strictly below your own level** (`utils/rbac.js → assertBelowMe`).
- **No privilege escalation:** you can't put a permission into a role unless you have it yourself (`assertGrantable`).
- **Owner protection:** the Owner role can't be edited, deleted, assigned or removed. Only the Owner can transfer ownership, which swaps roles with the new Owner.
- **Safe deletes:** a role that people still hold can't be deleted.
- **Tenant isolation:** every query is scoped to the user's organization, so other organizations' data returns 404.
- **Two layers:** the org role decides *what* you may do; project membership decides *which projects* you're in. A project's creator is its **lead** and can manage it without the `projects.manage_all` permission.
- The frontend's `can("permission")` only hides buttons. The server's `requirePermission(...)` middleware and the checks in the controllers are the real enforcement.

Example route:

```js
router.post("/", requirePermission("projects.create"), createProject);
```

## Evaluation 2 checklist

| Requirement | Where it is |
|---|---|
| HTML, CSS, JS | JSX markup in `client/src/pages`, Tailwind CSS plus the design system in `client/src/index.css`, and browser APIs (Notifications, FormData uploads, Blob downloads) |
| Node.js | `backend/` runs on Node with ES modules |
| Express.js | `backend/src/app.js` and `routes/`: REST API with routers, middleware and a central error handler |
| Multer | `backend/src/middleware/upload.js`: profile pictures (images, max 2 MB) and project files/task submissions (documents, max 10 MB), with type and size checks and random file names |
| Authentication | bcrypt password hashing (`models/User.js`), JWT login/register (`controllers/authController.js`), `protect` middleware on every private route |
| Authorization | Organization-level dynamic RBAC: custom roles, a permission catalog, `requirePermission` middleware, hierarchy and anti-escalation rules (see above) |
| MongoDB | Mongoose models with validation, references (`populate`), compound and unique indexes, aggregation (task stats, role member counts) |
| React.js | `client/`: React Router, Context API for auth and permissions, nested protected routes, reusable components, hooks |

## API overview

All routes except register/login need the header `Authorization: Bearer <token>`. "lead" means the project's creator.

| Method | Route | Requires |
|---|---|---|
| POST | `/api/auth/register`, `/api/auth/login` | public |
| GET | `/api/auth/me` (user, organization, role, permissions) | logged in |
| PUT | `/api/users/me`, `/api/users/me/password`; POST `/api/users/me/avatar` | logged in |
| GET | `/api/invitations/mine`; POST `/api/invitations/:id/accept` · `/decline` | logged in (no org needed) |
| POST | `/api/org` (create; you become Owner) | logged in, no org |
| GET / PUT | `/api/org` | member / `org.manage` |
| GET | `/api/org/members`, `/api/org/roles`, `/api/org/permissions`, `/api/org/audit` | member |
| PATCH | `/api/org/members/:userId/role` | `members.assign_role` + hierarchy |
| DELETE | `/api/org/members/:userId` | `members.remove` + hierarchy |
| POST / PUT / DELETE | `/api/org/roles`, `/api/org/roles/:id` | `roles.manage` + hierarchy + no escalation |
| GET / POST / DELETE | `/api/org/invitations`, `/api/org/invitations/:id` | `members.invite` + hierarchy |
| POST | `/api/org/leave`; `/api/org/transfer-ownership` | member / Owner |
| GET / POST | `/api/projects` | member / `projects.create` |
| GET / PUT / DELETE | `/api/projects/:id` | project member or `projects.view_all` / lead or `projects.manage_all` |
| POST / DELETE | `/api/projects/:id/members`, `/api/projects/:id/members/:userId` | lead or `projects.manage_all` |
| GET / POST | `/api/projects/:id/files` | project access; shared uploads need `files.upload` |
| GET / DELETE | `/api/files/:id/download`, `/api/files/:id` | file access / uploader, lead or `files.delete_any` |
| GET / POST | `/api/tasks` | member / `tasks.assign` |
| PUT / DELETE | `/api/tasks/:id` | assigner, lead or `tasks.manage_all` |
| PATCH | `/api/tasks/:id/status` | the assignee |
| GET / POST | `/api/tasks/:id/comments` | assignee or task manager |
| GET / POST | `/api/messages`, GET `/api/messages/conversations` | member |
| GET / PATCH | `/api/notifications`, `/api/notifications/read-all` | logged in |
| GET | `/api/activity`; `/api/analytics` (org stats need `org.analytics`) | member |

## Planned for Evaluation 3

- Real invitation **emails** with Nodemailer (invites are currently in-app)
- **Multiple organizations per user** with an organization switcher (the data model already allows it)
- Real-time chat and notifications with **Socket.io** (messages currently refresh every few seconds)
- **AI assistant** for task breakdown and project summaries
- **Kanban board** with drag-and-drop task statuses
- Sprints and calendar views
- Security hardening: rate limiting, helmet, refresh tokens, email verification
- Deployment and automated tests
