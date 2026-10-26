import mongoose from "mongoose";

const organizationSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true, maxlength: 80 },
        description: { type: String, trim: true, maxlength: 250, default: "" },
        owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }
    },
    { timestamps: true }
);

export default mongoose.model("Organization", organizationSchema);
