import mongoose from "mongoose";

const { ObjectId } = mongoose.Schema.Types;

// Links a user to an organization with one role.
const membershipSchema = new mongoose.Schema(
    {
        user: { type: ObjectId, ref: "User", required: true },
        org: { type: ObjectId, ref: "Organization", required: true },
        role: { type: ObjectId, ref: "Role", required: true }
    },
    { timestamps: true }
);

// For now a user belongs to one organization. To allow several later,
// change this to a compound { user, org } index and add an organization switcher.
membershipSchema.index({ user: 1 }, { unique: true });
membershipSchema.index({ org: 1, role: 1 });

export default mongoose.model("Membership", membershipSchema);
