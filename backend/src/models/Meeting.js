import mongoose from "mongoose";

const { ObjectId } = mongoose.Schema.Types;

// A video meeting inside CollabOS. People join the room at /meet/<roomId>; the video itself
// goes browser-to-browser with WebRTC (Socket.io only carries the connection setup).
const meetingSchema = new mongoose.Schema(
    {
        org: { type: ObjectId, ref: "Organization", required: true },
        project: { type: ObjectId, ref: "Project", default: null },
        title: { type: String, required: true, trim: true, maxlength: 100 },
        description: { type: String, trim: true, maxlength: 500, default: "" },
        host: { type: ObjectId, ref: "User", required: true },
        participants: [{ type: ObjectId, ref: "User" }],
        // Anyone in the organization may join (used for "Start a meeting now").
        openToOrg: { type: Boolean, default: false },
        startsAt: { type: Date, required: true },
        durationMinutes: { type: Number, required: true, min: 5, max: 600 },
        roomId: { type: String, required: true, unique: true },
        status: { type: String, enum: ["scheduled", "live", "ended", "cancelled"], default: "scheduled" },
        startedAt: Date,
        endedAt: Date,
        // Google Calendar event in the host's calendar, and its Google Meet link if one was requested.
        googleEventId: { type: String, default: "" },
        meetLink: { type: String, default: "" }
    },
    { timestamps: true }
);

meetingSchema.index({ org: 1, startsAt: 1 });

// Host, invited people, members of the meeting's project, or anyone in the org for open meetings.
meetingSchema.methods.canJoin = function (userId, project) {
    const id = String(userId);
    if (this.openToOrg) return true;
    if (String(this.host?._id ?? this.host) === id) return true;
    if (this.participants.some((p) => String(p?._id ?? p) === id)) return true;
    return Boolean(project?.hasAccess?.(id));
};

export default mongoose.model("Meeting", meetingSchema);
