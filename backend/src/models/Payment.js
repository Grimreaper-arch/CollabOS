import mongoose from "mongoose";

const { ObjectId } = mongoose.Schema.Types;

// One purchase of a plan for an organization. Created when checkout starts ("created"),
// then marked "paid" once Razorpay's signature is verified (or "failed").
const paymentSchema = new mongoose.Schema(
    {
        org: { type: ObjectId, ref: "Organization", required: true },
        user: { type: ObjectId, ref: "User", required: true },
        plan: { type: String, enum: ["pro", "scale"], required: true },
        period: { type: String, enum: ["monthly", "yearly"], required: true },
        // Amounts in paise.
        listPrice: { type: Number, required: true },
        discount: { type: Number, default: 0 },
        amount: { type: Number, required: true },
        currency: { type: String, default: "INR" },
        coupon: { type: String, default: "" },
        status: { type: String, enum: ["created", "paid", "failed"], default: "created" },
        // "razorpay" for real (test-mode) payments, "demo" when Razorpay keys aren't set up.
        provider: { type: String, enum: ["razorpay", "demo"], required: true },
        razorpayOrderId: { type: String, default: "" },
        razorpayPaymentId: { type: String, default: "" },
        method: { type: String, default: "" },
        invoiceNumber: { type: String, default: "" },
        // The subscription period this payment covers.
        periodStart: Date,
        periodEnd: Date,
        paidAt: Date
    },
    { timestamps: true }
);

paymentSchema.index({ org: 1, createdAt: -1 });
paymentSchema.index({ razorpayOrderId: 1 });

export default mongoose.model("Payment", paymentSchema);
