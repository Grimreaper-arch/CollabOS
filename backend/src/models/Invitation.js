import mongoose from "mongoose";

const { ObjectId } = mongoose.Schema.Types;

export const INVITE_DAYS = 7;

// An invitation to join an organization with a given role.
// It is matched by email, so it works even if the person hasn't signed up yet.
const invitationSchema = new mongoose.Schema(
    {
        org: { type: ObjectId, ref: "Organization", required: true },
        email: { type: String, required: true, lowercase: true, trim: true },
        role: { type: ObjectId, ref: "Role", required: true },
        invitedBy: { type: ObjectId, ref: "User", required: true },
        status: { type: String, enum: ["pending", "accepted", "declined", "cancelled"], default: "pending" },
        expiresAt: { type: Date, default: () => new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000) }
    },
    { timestamps: true }
);

invitationSchema.index({ email: 1, status: 1 });

invitationSchema.methods.isOpen = function () {
    return this.status === "pending" && this.expiresAt > new Date();
};

export default mongoose.model("Invitation", invitationSchema);
