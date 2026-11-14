import { Router } from "express";
import * as billing from "../controllers/billingController.js";
import { protect, requireOrg, requirePermission } from "../middleware/auth.js";

const router = Router();

// Public: the pricing section on the landing page reads this.
router.get("/plans", billing.listPlans);

router.use(protect, requireOrg);

// Every member can see the plan and usage; only billing managers can pay or see invoices.
router.get("/", billing.getBilling);
router.post("/quote", billing.getQuote);
router.post("/checkout", requirePermission("billing.manage"), billing.checkout);
router.post("/verify", requirePermission("billing.manage"), billing.verifyPayment);
router.post("/payments/:id/fail", requirePermission("billing.manage"), billing.markFailed);
router.get("/payments/:id", requirePermission("billing.manage"), billing.getInvoice);

export default router;
