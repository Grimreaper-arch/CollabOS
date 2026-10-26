import mongoose from "mongoose";
import { ALL_PERMISSIONS, OWNER_LEVEL } from "../config/permissions.js";

// A named set of permissions, created per organization.
const roleSchema = new mongoose.Schema(
    {
        org: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true },
        name: { type: String, required: true, trim: true, maxlength: 40 },
        description: { type: String, trim: true, maxlength: 160, default: "" },
        // Seniority: 0 = Owner, bigger = more junior. Used for the hierarchy rules.
        level: { type: Number, required: true, min: 0, max: 99 },
        permissions: {
            type: [String],
            validate: {
                validator: (list) => list.every((p) => ALL_PERMISSIONS.includes(p)),
                message: "Unknown permission."
            }
        },
        // The Owner role is created automatically and can never be edited or deleted.
        isSystem: { type: Boolean, default: false }
    },
    { timestamps: true }
);

// Role names are unique inside an organization.
roleSchema.index({ org: 1, name: 1 }, { unique: true, collation: { locale: "en", strength: 2 } });

// The Owner always has every permission, even ones added to the catalog later.
roleSchema.methods.effectivePermissions = function () {
    return this.level === OWNER_LEVEL ? [...ALL_PERMISSIONS] : this.permissions.filter((p) => ALL_PERMISSIONS.includes(p));
};

export default mongoose.model("Role", roleSchema);
