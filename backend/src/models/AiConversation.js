import mongoose from "mongoose";

const { ObjectId } = mongoose.Schema.Types;

// One chat with the AI assistant. Messages are kept inside the conversation (newest last).
const aiConversationSchema = new mongoose.Schema(
    {
        org: { type: ObjectId, ref: "Organization", required: true },
        user: { type: ObjectId, ref: "User", required: true },
        title: { type: String, trim: true, maxlength: 80, default: "New chat" },
        messages: [
            {
                role: { type: String, enum: ["user", "assistant"], required: true },
                content: { type: String, required: true, maxlength: 20000 },
                // What the assistant did while writing this reply, shown as chips: [{ label, ok }]
                actions: { type: [{ label: String, ok: Boolean, _id: false }], default: undefined },
                // The same, with results, as a note for the model so it remembers ids and outcomes.
                toolLog: { type: String, default: undefined },
                createdAt: { type: Date, default: Date.now }
            }
        ],
        // An action waiting for the user to press Confirm (see services/aiTools.js).
        // { id, tool, args, summary }
        pending: { type: mongoose.Schema.Types.Mixed, default: null }
    },
    { timestamps: true }
);

aiConversationSchema.index({ user: 1, org: 1, updatedAt: -1 });

export default mongoose.model("AiConversation", aiConversationSchema);
