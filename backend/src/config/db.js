import mongoose from "mongoose";
import Membership from "../models/Membership.js";
import User from "../models/User.js";
import "../models/Task.js";

export async function connectDB(uri) {
    if (!uri) throw new Error("MONGO_URI is missing. Copy .env.example to .env and set it.");
    await mongoose.connect(uri);
    console.log(`MongoDB connected: ${mongoose.connection.host}/${mongoose.connection.name}`);

    // Databases from before multiple organizations have a unique index on "user" alone,
    // which would stop anyone joining a second organization. syncIndexes drops it.
    await Membership.syncIndexes();

    // Tasks from before the Kanban board get a column matching their status.
    const Task = mongoose.model("Task");
    await Task.updateMany({ stage: { $exists: false }, status: "completed" }, { stage: "done" });
    await Task.updateMany({ stage: { $exists: false } }, { stage: "todo" });

    // Accounts created before email verification existed are treated as verified.
    await User.updateMany({ emailVerified: { $exists: false } }, { emailVerified: true });
}
