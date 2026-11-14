import mongoose from "mongoose";

const { ObjectId } = mongoose.Schema.Types;

// One run of a code file (the Code page's Run button). Kept as run history; old runs are
// removed automatically after 30 days by the TTL index below.
const codeRunSchema = new mongoose.Schema(
    {
        org: { type: ObjectId, ref: "Organization", required: true },
        project: { type: ObjectId, ref: "Project", required: true },
        user: { type: ObjectId, ref: "User", required: true },
        path: { type: String, required: true, maxlength: 200 },
        language: { type: String, required: true, maxlength: 20 },
        // "browser" for JavaScript and Python (run on the user's computer), "docker" for C, C++ and Java.
        runner: { type: String, enum: ["browser", "docker"], required: true },
        status: { type: String, enum: ["ok", "runtime_error", "compile_error", "timeout"], required: true },
        exitCode: { type: Number, default: null },
        timeMs: { type: Number, default: 0 },
        stdin: { type: String, default: "" },
        stdout: { type: String, default: "" },
        stderr: { type: String, default: "" }
    },
    { timestamps: { createdAt: true, updatedAt: false } }
);

codeRunSchema.index({ project: 1, path: 1, createdAt: -1 });
codeRunSchema.index({ org: 1, createdAt: -1 });
codeRunSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

export default mongoose.model("CodeRun", codeRunSchema);
