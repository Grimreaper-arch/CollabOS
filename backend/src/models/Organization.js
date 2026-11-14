import mongoose from "mongoose";

const organizationSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true, maxlength: 80 },
        description: { type: String, trim: true, maxlength: 250, default: "" },
        owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        // The paid plan, if any. When expiresAt passes, the organization is back on Starter
        // (see services/plans.js). Nothing is deleted; it just can't grow past Starter's limits.
        subscription: {
            plan: { type: String, enum: ["starter", "pro", "scale"], default: "starter" },
            period: { type: String, enum: ["monthly", "yearly", null], default: null },
            expiresAt: { type: Date, default: null },
            renewalReminderSentAt: { type: Date, default: null },
            expiredNoticeSentAt: { type: Date, default: null }
        }
    },
    { timestamps: true }
);

export default mongoose.model("Organization", organizationSchema);
