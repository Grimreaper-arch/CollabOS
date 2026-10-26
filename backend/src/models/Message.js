import mongoose from "mongoose";

const { ObjectId } = mongoose.Schema.Types;

// A message goes either to a project channel (project) or to one person (recipient).
const messageSchema = new mongoose.Schema(
    {
        org: { type: ObjectId, ref: "Organization", required: true },
        sender: { type: ObjectId, ref: "User", required: true },
        project: { type: ObjectId, ref: "Project", default: null },
        recipient: { type: ObjectId, ref: "User", default: null },
        text: { type: String, required: true, trim: true, maxlength: 2000 }
    },
    { timestamps: true }
);

export default mongoose.model("Message", messageSchema);
