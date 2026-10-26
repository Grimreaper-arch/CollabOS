import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
    {
        recipient: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        text: { type: String, required: true },
        link: { type: String, default: "" },
        // Drives the icon in the UI: info, task, reminder, overdue, people.
        kind: { type: String, enum: ["info", "task", "reminder", "overdue", "people"], default: "info" },
        read: { type: Boolean, default: false }
    },
    { timestamps: true }
);

export default mongoose.model("Notification", notificationSchema);
