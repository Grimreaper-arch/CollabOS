import mongoose from "mongoose";

const { ObjectId } = mongoose.Schema.Types;

const activitySchema = new mongoose.Schema(
    {
        org: { type: ObjectId, ref: "Organization", required: true },
        // Empty for organization-level events (role changes, invites...), which form the audit log.
        project: { type: ObjectId, ref: "Project", default: null },
        actor: { type: ObjectId, ref: "User", required: true },
        text: { type: String, required: true }
    },
    { timestamps: true }
);

export default mongoose.model("Activity", activitySchema);
