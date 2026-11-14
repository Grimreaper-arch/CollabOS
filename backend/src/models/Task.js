import mongoose from "mongoose";

const { ObjectId } = mongoose.Schema.Types;

// Kanban columns. "done" is the same as status "completed"; the other stages are "pending".
export const STAGES = ["todo", "in_progress", "review", "done"];

const taskSchema = new mongoose.Schema(
    {
        title: { type: String, required: true, trim: true, maxlength: 100 },
        description: { type: String, trim: true, maxlength: 500, default: "" },
        org: { type: ObjectId, ref: "Organization", required: true },
        project: { type: ObjectId, ref: "Project", required: true },
        assignee: { type: ObjectId, ref: "User", required: true },
        assignedBy: { type: ObjectId, ref: "User", required: true },
        status: { type: String, enum: ["pending", "completed"], default: "pending" },
        stage: { type: String, enum: STAGES, default: "todo" },
        // Order inside a Kanban column (smaller = higher up).
        position: { type: Number, default: () => Date.now() },
        priority: { type: String, enum: ["low", "medium", "high"], default: "medium" },
        dueDate: { type: Date, default: null },
        // The matching all-day event in the assignee's Google Calendar, if they connected it.
        googleEventId: { type: String, default: null },
        completedAt: { type: Date, default: null },
        // When the due-date reminders were sent, so each one goes out only once.
        dueSoonNotifiedAt: { type: Date, default: null },
        overdueNotifiedAt: { type: Date, default: null }
    },
    { timestamps: true }
);

// Keep `status` and `stage` in agreement, whichever one was changed.
taskSchema.pre("save", function () {
    if (this.isModified("stage")) {
        this.status = this.stage === "done" ? "completed" : "pending";
    } else if (this.isModified("status")) {
        if (this.status === "completed") this.stage = "done";
        else if (this.stage === "done") this.stage = "todo";
    }
    if (this.isModified("status")) this.completedAt = this.status === "completed" ? new Date() : null;
});

taskSchema.index({ project: 1, stage: 1, position: 1 });

export default mongoose.model("Task", taskSchema);
