import mongoose from "mongoose";

const { ObjectId } = mongoose.Schema.Types;

export const MAX_FILE_BYTES = 500 * 1024;          // 500 KB per file
export const MAX_PROJECT_BYTES = 10 * 1024 * 1024; // 10 MB of code per project

// A text source file in a project's code workspace (the Code page).
// Unlike uploads (stored on disk by Multer), code is small text, so it lives in MongoDB
// and every teammate reads and edits the same copy.
const codeFileSchema = new mongoose.Schema(
    {
        org: { type: ObjectId, ref: "Organization", required: true },
        project: { type: ObjectId, ref: "Project", required: true },
        // Full path inside the project, e.g. "src/components/Navbar.jsx".
        path: { type: String, required: true, trim: true, maxlength: 200 },
        content: { type: String, default: "" },
        size: { type: Number, default: 0 },
        createdBy: { type: ObjectId, ref: "User", required: true },
        updatedBy: { type: ObjectId, ref: "User", required: true }
    },
    { timestamps: true }
);

// One file per path inside a project.
codeFileSchema.index({ project: 1, path: 1 }, { unique: true });

codeFileSchema.pre("save", function () {
    this.size = Buffer.byteLength(this.content || "", "utf8");
});

export default mongoose.model("CodeFile", codeFileSchema);
