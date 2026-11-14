import Organization from "../models/Organization.js";
import Payment from "../models/Payment.js";
import Membership from "../models/Membership.js";
import ApiError from "../utils/ApiError.js";
import { can } from "../middleware/auth.js";
import { COUPONS, FREE_PLAN, LIMIT_LABELS, PERIODS, PLAN_ORDER, PLANS } from "../config/plans.js";
import { activePlanId, getUsage, limitsOf, planSummary } from "../services/plans.js";
import * as razorpay from "../services/razorpay.js";
import { sendPaymentReceipt } from "../services/mailer.js";
import { logAudit, notify } from "../utils/events.js";

const rupees = (paise) => `₹${(paise / 100).toLocaleString("en-IN")}`;

function addMonths(date, months) {
    const d = new Date(date);
    d.setMonth(d.getMonth() + months);
    return d;
}

// Price for a plan and period, after any coupon. Throws for unknown plans, periods or coupons.
export function quote(planId, period, couponCode = "") {
    const plan = PLANS[planId];
    if (!plan || planId === FREE_PLAN) throw new ApiError(400, "Choose the Pro or Scale plan.");
    if (!PERIODS[period]) throw new ApiError(400, "Choose monthly or yearly billing.");

    const code = String(couponCode || "").trim().toUpperCase();
    const coupon = code ? COUPONS[code] : null;
    if (code && !coupon) throw new ApiError(400, `"${code}" isn't a valid coupon code.`);

    const listPrice = plan.price[period];
    const discount = coupon ? Math.round((listPrice * coupon.percentOff) / 100) : 0;
    return { plan: planId, period, listPrice, discount, amount: listPrice - discount, coupon: coupon ? code : "", couponDescription: coupon?.description || "" };
}

// GET /api/billing/plans — public, used by the pricing section and the billing page.
export function listPlans(_req, res) {
    res.json({
        plans: PLAN_ORDER.map((id) => PLANS[id]),
        periods: PERIODS,
        limitLabels: LIMIT_LABELS,
        // "razorpay" when real (test-mode) checkout is set up, otherwise "demo".
        provider: razorpay.razorpayConfigured() ? "razorpay" : "demo"
    });
}

// GET /api/billing — the organization's plan, limits and usage; payments for billing managers.
export async function getBilling(req, res) {
    const canManage = can(req, "billing.manage");
    const payments = canManage
        ? await Payment.find({ org: req.org._id, status: { $ne: "created" } }).populate("user", "fullName email").sort({ createdAt: -1 }).limit(50)
        : [];
    res.json({
        plan: planSummary(req.org),
        limits: limitsOf(req.org),
        usage: await getUsage(req.org._id),
        canManage,
        payments
    });
}

// POST /api/billing/quote  body: { plan, period, coupon }
export function getQuote(req, res) {
    res.json(quote(req.body.plan, req.body.period, req.body.coupon));
}

// POST /api/billing/checkout  body: { plan, period, coupon }  (billing.manage)
// Creates a pending Payment and, with Razorpay set up, a Razorpay order for the browser to pay.
export async function checkout(req, res) {
    const price = quote(req.body.plan, req.body.period, req.body.coupon);
    const provider = razorpay.razorpayConfigured() ? "razorpay" : "demo";
    const payment = await Payment.create({ ...price, org: req.org._id, user: req.user._id, provider });

    if (provider === "razorpay") {
        const order = await razorpay.createOrder({
            amount: price.amount,
            receipt: String(payment._id),
            notes: { org: String(req.org._id), plan: price.plan, period: price.period }
        });
        payment.razorpayOrderId = order.id;
        await payment.save();
    }

    res.status(201).json({
        provider,
        paymentId: payment._id,
        amount: payment.amount,
        currency: payment.currency,
        keyId: provider === "razorpay" ? razorpay.razorpayKeyId() : null,
        orderId: payment.razorpayOrderId || null,
        description: `${PLANS[price.plan].name} plan · ${PERIODS[price.period].label}`,
        organization: req.org.name,
        prefill: { name: req.user.fullName, email: req.user.email, contact: req.user.phone || "" }
    });
}

// Marks a payment as paid and extends or changes the organization's plan. Safe to call twice
// (the browser and the webhook may both report the same payment).
async function activate(payment, details = {}) {
    if (payment.status === "paid") return payment;

    const org = await Organization.findById(payment.org);
    if (!org) throw new ApiError(404, "Organization not found.");

    // Renewing the same plan adds time after the current end date; a different plan starts now.
    const now = new Date();
    const current = activePlanId(org);
    const start = current === payment.plan && org.subscription.expiresAt > now ? org.subscription.expiresAt : now;
    const end = addMonths(start, PERIODS[payment.period].months);

    org.subscription = { plan: payment.plan, period: payment.period, expiresAt: end, renewalReminderSentAt: null, expiredNoticeSentAt: null };
    await org.save();

    const paidCount = await Payment.countDocuments({ status: "paid" });
    Object.assign(payment, details, {
        status: "paid",
        paidAt: now,
        periodStart: start,
        periodEnd: end,
        invoiceNumber: `CO-${now.getFullYear()}-${String(paidCount + 1).padStart(5, "0")}`
    });
    await payment.save();

    const payer = await Membership.findOne({ org: org._id, user: payment.user }).populate("user", "fullName email");
    const name = payer?.user?.fullName || "Someone";
    await logAudit(org._id, payment.user, `${name} upgraded the organization to ${PLANS[payment.plan].name} (${PERIODS[payment.period].label.toLowerCase()}, ${rupees(payment.amount)}).`);
    await notify(payment.user, `Payment received. ${org.name} is on ${PLANS[payment.plan].name} until ${end.toDateString()}.`, "/billing", "info", org._id);
    if (payer?.user) await sendPaymentReceipt(payer.user, { org, payment, planName: PLANS[payment.plan].name, periodLabel: PERIODS[payment.period].label });
    return payment;
}

async function getPendingPayment(req) {
    const payment = await Payment.findOne({ _id: req.body.paymentId, org: req.org._id });
    if (!payment) throw new ApiError(404, "Payment not found.");
    return payment;
}

// POST /api/billing/verify  (billing.manage)
// Razorpay: body { paymentId, razorpay_order_id, razorpay_payment_id, razorpay_signature }.
// Demo mode: body { paymentId } — only allowed when Razorpay isn't set up.
export async function verifyPayment(req, res) {
    const payment = await getPendingPayment(req);
    if (payment.status === "paid") return res.json({ payment, plan: planSummary(await Organization.findById(req.org._id)) });
    if (payment.status === "failed") throw new ApiError(400, "This payment failed. Start a new checkout.");

    let details = {};
    if (payment.provider === "razorpay") {
        const { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = req.body;
        if (orderId !== payment.razorpayOrderId || !razorpay.verifyPaymentSignature(orderId, paymentId, signature)) {
            throw new ApiError(400, "Payment could not be verified. You have not been charged for a plan change.");
        }
        details = { razorpayPaymentId: paymentId };
        const info = await razorpay.fetchPayment(paymentId).catch(() => null);
        if (info?.method) details.method = info.method;
    } else {
        if (razorpay.razorpayConfigured()) throw new ApiError(400, "Demo payments are disabled once Razorpay is set up.");
        details = { method: req.body.method || "demo" };
    }

    await activate(payment, details);
    res.json({ payment, plan: planSummary(await Organization.findById(req.org._id)) });
}

// POST /api/billing/payments/:id/fail — the checkout was closed or the payment failed.
export async function markFailed(req, res) {
    const payment = await Payment.findOne({ _id: req.params.id, org: req.org._id, status: "created" });
    if (payment) {
        payment.status = "failed";
        await payment.save();
    }
    res.json({ message: "Payment cancelled." });
}

// GET /api/billing/payments/:id — one payment, for the invoice.  (billing.manage)
export async function getInvoice(req, res) {
    const payment = await Payment.findOne({ _id: req.params.id, org: req.org._id, status: "paid" }).populate("user", "fullName email phone");
    if (!payment) throw new ApiError(404, "Invoice not found.");
    res.json({
        payment,
        organization: { name: req.org.name },
        planName: PLANS[payment.plan].name,
        periodLabel: PERIODS[payment.period].label
    });
}

// POST /api/billing/webhook — called by Razorpay's servers (needs a public URL, so mainly once deployed).
// Activates the plan even if the browser was closed before it could report the payment.
export async function webhook(req, res) {
    if (!razorpay.verifyWebhookSignature(req.body, req.headers["x-razorpay-signature"])) {
        return res.status(400).json({ message: "Invalid signature." });
    }
    const event = JSON.parse(req.body.toString("utf8"));
    const entity = event.payload?.payment?.entity;
    if (["payment.captured", "order.paid"].includes(event.event) && entity?.order_id) {
        const payment = await Payment.findOne({ razorpayOrderId: entity.order_id });
        if (payment) await activate(payment, { razorpayPaymentId: entity.id, method: entity.method || "" });
    }
    res.json({ received: true });
}
