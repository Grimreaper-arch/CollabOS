import mongoose from "mongoose";

const { ObjectId } = mongoose.Schema.Types;

const commentSchema = new mongoose.Schema(
    {
        task: { type: ObjectId, ref: "Task", required: true },
        author: { type: ObjectId, ref: "User", required: true },
        text: { type: String, required: true, trim: true, maxlength: 240 }
    },
    { timestamps: true }
);

export default mongoose.model("Comment", commentSchema);
