import mongoose from "mongoose";

const { ObjectId } = mongoose.Schema.Types;

// Metadata for a file Multer saved to disk. The bytes live in uploads/files/<storedName>.
const fileSchema = new mongoose.Schema(
    {
        project: { type: ObjectId, ref: "Project", required: true },
        task: { type: ObjectId, ref: "Task", default: null },
        uploadedBy: { type: ObjectId, ref: "User", required: true },
        originalName: { type: String, required: true },
        storedName: { type: String, required: true },
        mimeType: { type: String, required: true },
        size: { type: Number, required: true }
    },
    { timestamps: true }
);

export default mongoose.model("File", fileSchema);
