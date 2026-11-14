import { Router } from "express";
import * as org from "../controllers/orgController.js";
import * as roles from "../controllers/roleController.js";
import * as invitations from "../controllers/invitationController.js";
import { protect, requireOrg, requirePermission } from "../middleware/auth.js";

const router = Router();

router.use(protect);

// Anyone can create an organization and become its Owner.
router.post("/", org.createOrg);

router.use(requireOrg);

router.route("/")
    .get(org.getOrg)
    .put(requirePermission("org.manage"), org.updateOrg)
    .delete(org.deleteOrg);

router.get("/permissions", org.listPermissions);
router.get("/audit", org.auditLog);
router.post("/leave", org.leaveOrg);
router.post("/transfer-ownership", org.transferOwnership);

router.get("/members", org.listMembers);
router.patch("/members/:userId/role", requirePermission("members.assign_role"), org.changeMemberRole);
router.delete("/members/:userId", requirePermission("members.remove"), org.removeMember);

router.route("/roles")
    .get(roles.listRoles)
    .post(requirePermission("roles.manage"), roles.createRole);
router.route("/roles/:id")
    .put(requirePermission("roles.manage"), roles.updateRole)
    .delete(requirePermission("roles.manage"), roles.deleteRole);

router.route("/invitations")
    .get(requirePermission("members.invite"), invitations.listOrgInvitations)
    .post(requirePermission("members.invite"), invitations.sendInvitations);
router.delete("/invitations/:id", requirePermission("members.invite"), invitations.cancelInvitation);

export default router;
