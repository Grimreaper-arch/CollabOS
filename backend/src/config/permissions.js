// The master list of permissions. Roles are built by picking from this list.
// Permissions live in code (not the database) because each one needs code that enforces it.
export const PERMISSION_GROUPS = [
    {
        group: "Organization",
        permissions: [
            { key: "org.manage", label: "Edit organization details" },
            { key: "org.analytics", label: "View organization-wide analytics" }
        ]
    },
    {
        group: "People",
        permissions: [
            { key: "members.invite", label: "Invite people to the organization" },
            { key: "members.remove", label: "Remove people from the organization" },
            { key: "members.assign_role", label: "Change people's roles" }
        ]
    },
    {
        group: "Roles",
        permissions: [
            { key: "roles.manage", label: "Create, edit and delete roles" }
        ]
    },
    {
        group: "Projects",
        permissions: [
            { key: "projects.create", label: "Create projects" },
            { key: "projects.view_all", label: "See every project in the organization" },
            { key: "projects.manage_all", label: "Edit or delete any project" }
        ]
    },
    {
        group: "Tasks",
        permissions: [
            { key: "tasks.assign", label: "Assign tasks to project members" },
            { key: "tasks.manage_all", label: "Edit or delete anyone's tasks" }
        ]
    },
    {
        group: "Files",
        permissions: [
            { key: "files.upload", label: "Upload shared project files" },
            { key: "files.delete_any", label: "Delete anyone's files" }
        ]
    }
];

export const ALL_PERMISSIONS = PERMISSION_GROUPS.flatMap((g) => g.permissions.map((p) => p.key));

// Level = seniority. 0 is the Owner; a bigger number means a more junior role.
// You can only manage people and roles with a bigger level than your own.
export const OWNER_LEVEL = 0;

// Roles every new organization starts with. Only Owner is locked; the rest can be edited or deleted.
export const DEFAULT_ROLES = [
    {
        name: "Owner",
        description: "Company head. Full control of the organization.",
        level: OWNER_LEVEL,
        isSystem: true,
        permissions: ALL_PERMISSIONS
    },
    {
        name: "Admin",
        description: "Manages people, roles and all projects.",
        level: 1,
        permissions: ALL_PERMISSIONS
    },
    {
        name: "Manager",
        description: "Runs projects and assigns work.",
        level: 2,
        permissions: ["members.invite", "projects.create", "tasks.assign", "files.upload", "org.analytics"]
    },
    {
        name: "Member",
        description: "Works on assigned tasks and shares files.",
        level: 3,
        permissions: ["files.upload"]
    },
    {
        name: "Viewer",
        description: "Read-only access to the projects they are added to.",
        level: 4,
        permissions: []
    }
];
