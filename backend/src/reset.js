// Erases everything: all database collections and all uploaded files.
// Afterwards CollabOS behaves like a brand-new install.
//   npm run reset
import "./config/env.js";
import fs from "node:fs/promises";
import path from "node:path";
import mongoose from "mongoose";
import { connectDB } from "./config/db.js";
import { UPLOAD_ROOT } from "./middleware/upload.js";
// Load every model so their indexes (unique emails, one membership per user...) can be rebuilt.
import "./models/User.js";
import "./models/Organization.js";
import "./models/Role.js";
import "./models/Membership.js";
import "./models/Invitation.js";
import "./models/Project.js";
import "./models/Task.js";
import "./models/Comment.js";
import "./models/File.js";
import "./models/Message.js";
import "./models/Notification.js";
import "./models/Activity.js";
import "./models/CodeFile.js";

await connectDB(process.env.MONGO_URI);
await mongoose.connection.db.dropDatabase();
await Promise.all(mongoose.modelNames().map((name) => mongoose.model(name).syncIndexes()));
console.log("Database erased.");

let removed = 0;
for (const folder of ["files", "avatars"]) {
    const dir = path.join(UPLOAD_ROOT, folder);
    const names = await fs.readdir(dir).catch(() => []);
    for (const name of names) {
        await fs.rm(path.join(dir, name), { force: true });
        removed++;
    }
}
console.log(`Uploaded files deleted: ${removed}.`);

await mongoose.disconnect();
