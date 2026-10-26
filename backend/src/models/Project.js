import mongoose from "mongoose";

const { ObjectId } = mongoose.Schema.Types;

const projectSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true, maxlength: 80 },
        org: { type: ObjectId, ref: "Organization", required: true },
        description: { type: String, trim: true, maxlength: 250, default: "" },
        dueDate: { type: Date, default: null },
        // Optional GitHub repository, opened in VS Code online from the Code page.
        repoUrl: {
            type: String, trim: true, default: "",
            match: [/^(https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/?)?$/, "Repository must look like https://github.com/owner/repo"]
        },
        // The project lead: whoever created it. Can manage the project without org-wide permissions.
        owner: { type: ObjectId, ref: "User", required: true },
        members: [{ type: ObjectId, ref: "User" }]
    },
    { timestamps: true }
);

// True when the user leads the project or is a member of it.
projectSchema.methods.hasAccess = function (userId) {
    const id = String(userId);
    const ownerId = String(this.owner?._id ?? this.owner);
    return ownerId === id || this.members.some((member) => String(member._id ?? member) === id);
};

projectSchema.methods.isOwner = function (userId) {
    return String(this.owner?._id ?? this.owner) === String(userId);
};

export default mongoose.model("Project", projectSchema);
