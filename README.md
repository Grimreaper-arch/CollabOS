# CollabOS

CollabOS is a SaaS-style collaboration platform where teams in companies, colleges and communities manage workspaces, projects, tasks, communication, files and analytics in one place. It uses secure authentication, organization-level role-based access control (RBAC) and a production-style backend.

**Stack (MERN):** MongoDB · Express.js · React · Node.js, plus Multer (uploads), JWT + bcrypt (auth), Socket.io (real time), WebRTC (meetings), Nodemailer (email), Razorpay (payments), Google OAuth + Calendar API, and Azure OpenAI (AI assistant).

## Folder structure

```
CollabOS-main/
├── Start CollabOS.bat    starts backend + website and opens the browser
│                         (also: Stop, Load Demo Data, Reset Database, Change Database)
├── backend/              Node.js + Express REST API (port 5000)
│   ├── src/
│   │   ├── config/       env loading, MongoDB connection, permissions.js (permission catalog), plans.js (Starter/Pro/Scale)
│   │   ├── models/       Mongoose schemas: User, Organization, Role, Membership, Invitation,
│   │   │                 Project, Task, Comment, File, CodeFile, Message, Notification, Activity,
│   │   │                 Payment, Meeting, AiConversation
│   │   ├── middleware/   auth.js (JWT + requirePermission), upload.js (Multer), security.js
│   │   │                 (rate limits, injection guard), error.js
│   │   ├── services/     orgService.js, reminders.js, mailer.js (Nodemailer), plans.js (limits),
│   │   │                 razorpay.js, realtime.js (Socket.io + meeting signalling), google.js, ai.js
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

Acme Corp is on the **Pro** plan (yearly). Demo accounts are already verified, and their email reminders are off because the addresses aren't real.

A second organization, **Hackathon Squad**, shows that one account can belong to several: Meera is its Owner, Aarav an Admin and Priya only a Member. Log in as Priya and use the switcher at the top of the sidebar to see her rights change.

## Highlights

- **My Calendar** (`/calendar`): a month view of your task due dates and project deadlines, the agenda for the selected day, overdue and upcoming lists, and an **.ics export** (each event has a reminder the day before) for Google Calendar or Outlook.
- **Due-date alerts:** a background job (`backend/src/services/reminders.js`, every 15 minutes) notifies people when a task is due today or tomorrow and when it becomes overdue; the assigner is told about overdue work too. Each alert is sent once per task. In the app, alerts appear as toasts and, if enabled, as **desktop notifications**.
- **Code** (`/code`): a VS Code-style editor built on **Monaco** (the editor inside VS Code), with an explorer tree, tabs, syntax highlighting for 25+ languages, **Ctrl + S** to save and **Ctrl + Enter** to run. Code files are stored per project in MongoDB (`models/CodeFile.js`). Limits: 500 KB per file, 10 MB per project. See "Code runner and live editing" below.
- **Command palette:** press **Ctrl + K** anywhere to jump to a page or project, or to add a task.
- **Design system ("Midnight, Steel & Teal"):** `client/src/components/ui.jsx` holds the reusable parts (stat tiles, badges, progress bars and rings, tooltips, drawer, modal, popover, select, date picker, tabs, toggle, skeletons, empty states), and `context/ToastContext.jsx` the toast notifications. The visual rules and colour tokens live at the top of `client/src/index.css`: layered midnight surfaces, steel borders and secondary text, teal for actions, focus and active states, green for progress and success, amber and red only for warnings and problems. Project covers and marks are generated from the project id (`components/ProjectCard.jsx`); task details open in a side drawer (`components/TaskDrawer.jsx`); charts on the Analytics page are plain SVG/CSS with no chart library. The interface font is Inter; Geist Mono is used only for code; icons are Material Symbols Outlined.

## Role-based access control (RBAC)

### How it works

1. **Sign up → no role.** A new account doesn't belong to any organization.
2. **Welcome screen:** the user either **creates an organization**, becoming its **Owner** (the Company Head / Super Admin), or **accepts an invitation**.
3. When an organization is created it gets 5 default roles: Owner (locked), Admin, Manager, Member and Viewer. The Owner can edit them or **create custom roles**, ticking permissions from a fixed catalog.
4. People with `members.invite` **invite by email with a role**. The invited person sees it the next time they log in or sign up with that email. Invitations expire after 7 days.
5. Every API request loads the user's membership and role **from the database**, so permission changes apply on the next request, without logging in again.
6. **Multiple organizations:** one account can create or join any number of organizations, with a different role in each. The sidebar's **organization switcher** changes the active one. The browser sends its id with every request in the `X-Org-Id` header, and the server only accepts organizations the user really belongs to. The last-used organization opens at the next login.

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

## Evaluation 3 features

| Feature | How it works | Where |
|---|---|---|
| **Multiple organizations** | One account can belong to many organizations with a different role in each. The sidebar switcher changes the active one; the browser sends it as `X-Org-Id`. | `middleware/auth.js → loadAccess`, `components/AppLayout.jsx → OrgSwitcher` |
| **Real email** | Nodemailer through Gmail (App Password): verification codes, password resets, invitations, due-date reminders, payment receipts, meeting invites. | `services/mailer.js` |
| **Email verification** | Sign-up emails a 6-digit code (stored as an HMAC, 10-minute expiry, 5 tries, 1-minute resend cooldown). The app stays locked until it's entered. Changing your email asks again. **Forgot password** uses the same codes. | `utils/oneTimeCode.js`, `pages/VerifyEmail.jsx`, `pages/ForgotPassword.jsx` |
| **Plans and payments** | Starter (free), Pro and Scale per organization, limits in `config/plans.js`, enforced on the server (HTTP 402 `PLAN_LIMIT` opens an upgrade dialog). Razorpay test-mode checkout with signature verification, webhook, coupons (`STUDENT50`), invoices, receipts, renewal reminders. Demo checkout when no keys are set. | `services/plans.js`, `controllers/billingController.js`, `pages/Billing.jsx` |
| **Security hardening** | helmet headers, rate limits (API, login per IP+email, auth emails), account lockout after 5 wrong passwords, password policy, NoSQL-injection guard (body sanitizer + simple query parser), 15-minute access tokens + httpOnly refresh cookie, "sign out everywhere", file content checks (magic numbers), encrypted Google tokens. | `middleware/security.js`, `middleware/auth.js`, `utils/fileSignature.js`, `utils/secretBox.js` |
| **Real-time (Socket.io)** | Instant chat, typing indicators, online dots, unread counts and "Seen" receipts; live notifications; pages refresh themselves when a project changes; permissions update the moment a role changes. | `services/realtime.js`, `context/RealtimeContext.jsx`, `pages/Messages.jsx` |
| **Kanban board** | To do / In progress / In review / Done with drag and drop (`@dnd-kit`). Moves are saved with a position number and appear live for everyone. Done = completed, so calendar, reminders and analytics still work. | `components/KanbanBoard.jsx`, `PATCH /api/tasks/:id/stage` |
| **Meetings (WebRTC)** | Video calls inside CollabOS: camera, microphone, screen sharing, in-call chat. Browsers connect directly to each other; Socket.io only carries the setup (offers, answers, ICE candidates). Schedule or start instantly ("ringing" invitees); plan limits on length and size. | `pages/MeetingRoom.jsx`, `pages/Meetings.jsx`, `services/realtime.js` |
| **Google sign-in + Calendar** | "Continue with Google". Connecting Google Calendar puts task deadlines and meetings in it (with an optional Google Meet link) and shows your Google events in My Calendar. | `services/google.js`, `controllers/googleController.js` |
| **AI assistant** | Floating assistant (**Ctrl + J**) that knows your projects, tasks and meetings. Answers stream word by word (Server-Sent Events) from Azure OpenAI (Microsoft Foundry); chats are saved; daily limit per plan. | `services/ai.js`, `controllers/aiController.js`, `components/AssistantPanel.jsx` |

### Code runner and live editing

- **Run button** (`utils/runners.js`, `services/codeRunner.js`): programs read their input from the **Input** tab and print to the **Output** tab, with exit code and run time.
  - **JavaScript and Python run in the browser**, in a Web Worker. Python is Pyodide (real CPython compiled to WebAssembly, including numpy). Nothing reaches the server, so it is free and can't harm the host.
  - **C, C++ and Java run on the server inside Docker**: a fresh container per run with no network, 256 MB of memory, one CPU, a process limit, a read-only file system and a 5-second time limit. The source and input travel through the container's stdin; nothing from the host is mounted. This needs **Docker Desktop** running on the host; without it those languages show "Sandbox offline" and everything else still works. The compiler images download on first use.
- **Run history** (`models/CodeRun.js`): every run is saved with who ran it, its input and output (kept 30 days), and counted against the plan's daily limit.
- **Templates**: New file offers starting points (Hello world in 5 languages, reading input, binary search, NumPy...).
- **Live collaborative editing** (`utils/collab.js`, `services/realtime.js`): everyone who opens a file edits the same text at once, with coloured cursors and name tags. The text is a **Yjs CRDT** (a data structure that merges simultaneous edits the same way for everyone); edits travel over Socket.io. Saving still writes to MongoDB.
- **AI in the editor**: "Explain" and "Ask AI to fix this" send the code and the error to the assistant.

### The AI agent

The assistant doesn't only answer: it uses **tools** (function calling) to act in the workspace (`services/aiTools.js`, 28 tools). Examples: "create a high priority task for Meera due Friday", "who is overloaded?", "summarize this project's chat", "schedule a design review tomorrow at 4", "write a binary search in C++ and save it to the code workspace".

- Each tool calls the **same controller functions as the website, as the logged-in user**, so permissions, hierarchy rules, plan limits, notifications and live updates all apply. The assistant can never do more than the user could.
- **Risky actions wait for a Confirm button**: deleting tasks or code, sending chat messages, inviting people, cancelling meetings, overwriting code. The exact action is shown first.
- It cannot delete projects, remove or re-role people, or touch billing at all.
- Text it reads (chat messages, task titles, files) is treated as data, not instructions, to resist prompt injection.
- The agent loop (`services/ai.js → runAgent`): the model answers or asks for tools → tools run → results go back → repeat (up to 8 rounds), streamed to the browser with a chip per action.
- Shortcuts: **Daily brief** (dashboard), **Ask AI** (project page), **Summarize** (chat), **Explain / fix** (code editor).

### Keys to add in `backend/.env`

Everything above works without extra keys except where noted. Each feature shows a clear "not set up yet" message until its keys are added; see `backend/.env.example`.

| Setting | Needed for | Without it |
|---|---|---|
| `EMAIL_USER`, `EMAIL_PASS` | Sending real email | Emails are printed in the server window |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | Real Razorpay (test-mode) checkout | Demo checkout screen |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google sign-in and Google Calendar | Google buttons explain it isn't set up |
| `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_DEPLOYMENT` | AI assistant | Assistant explains it isn't set up (or set `AI_PROVIDER=mock` for demo answers) |

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

All routes except register/login need the header `Authorization: Bearer <token>`. Requests inside an organization may also send `X-Org-Id: <organization id>`; without it the last-used organization is used. "lead" means the project's creator.

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
| DELETE | `/api/org` (body `{ confirmName }`; deletes everything in it) | Owner |
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
| POST | `/api/auth/verify-email`, `/api/auth/resend-code`, `/api/auth/forgot-password`, `/api/auth/reset-password` | logged in / public |
| POST | `/api/auth/refresh` (refresh cookie), `/api/auth/logout`, `/api/auth/logout-all` | cookie / logged in |
| DELETE | `/api/org` (body `{ confirmName }`) | Owner |
| PATCH | `/api/tasks/:id/stage` (Kanban move) | assignee or task manager |
| GET / POST | `/api/billing/plans` (public), `/api/billing`, `/quote`, `/checkout`, `/verify`, `/payments/:id` | member / `billing.manage` |
| POST | `/api/billing/webhook` (Razorpay, signed) | Razorpay |
| GET / POST / DELETE | `/api/meetings`, `/api/meetings/room/:roomId`, `/api/meetings/:id` | member / invited / host |
| GET / POST | `/api/google/login-url`, `/callback`, `/status`, `/connect-url`, `/events`, `/sync`, `/disconnect` | public / logged in |
| GET / POST / DELETE | `/api/ai/status`, `/api/ai/chat` (streams), `/api/ai/confirm` (streams), `/api/ai/conversations[/:id]` | member |
| GET / POST | `/api/projects/:id/code/runner`, `/code/run` (Docker sandbox), `/code/runs` (history) | project access / in the project |

## Still to do

- **Deployment.** Note that free hosts can't run Docker, so C, C++ and Java would need a server that can (JavaScript and Python keep working anywhere).
- A second Atlas cluster for code files, if storage ever becomes a concern (code is stored in Atlas for now).
- Automated tests in the repository (the feature checks were run as scripts against a temporary database)
