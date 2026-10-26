import mongoose from "mongoose";

const { ObjectId } = mongoose.Schema.Types;

const taskSchema = new mongoose.Schema(
    {
        title: { type: String, required: true, trim: true, maxlength: 100 },
        description: { type: String, trim: true, maxlength: 500, default: "" },
        org: { type: ObjectId, ref: "Organization", required: true },
        project: { type: ObjectId, ref: "Project", required: true },
        assignee: { type: ObjectId, ref: "User", required: true },
        assignedBy: { type: ObjectId, ref: "User", required: true },
        status: { type: String, enum: ["pending", "completed"], default: "pending" },
        priority: { type: String, enum: ["low", "medium", "high"], default: "medium" },
        dueDate: { type: Date, default: null },
        completedAt: { type: Date, default: null },
        // When the due-date reminders were sent, so each one goes out only once.
        dueSoonNotifiedAt: { type: Date, default: null },
        overdueNotifiedAt: { type: Date, default: null }
    },
    { timestamps: true }
);

export default mongoose.model("Task", taskSchema);
