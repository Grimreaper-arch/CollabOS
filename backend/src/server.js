import "./config/env.js";
import app from "./app.js";
import { connectDB } from "./config/db.js";
import { startReminderScheduler } from "./services/reminders.js";

const PORT = process.env.PORT || 5000;

if (!process.env.JWT_SECRET) {
    console.error("JWT_SECRET is missing. Copy .env.example to .env and set it.");
    process.exit(1);
}

connectDB(process.env.MONGO_URI)
    .then(() => {
        app.listen(PORT, () => console.log(`CollabOS API running on http://localhost:${PORT}`));
        startReminderScheduler();
    })
    .catch((error) => {
        console.error("Could not start server:", error.message);
        process.exit(1);
    });
