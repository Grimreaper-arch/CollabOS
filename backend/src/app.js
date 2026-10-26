import path from "node:path";
import express from "express";
import cors from "cors";
import morgan from "morgan";
import authRoutes from "./routes/authRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import projectRoutes from "./routes/projectRoutes.js";
import taskRoutes from "./routes/taskRoutes.js";
import orgRoutes from "./routes/orgRoutes.js";
import invitationRoutes from "./routes/invitationRoutes.js";
import miscRoutes from "./routes/miscRoutes.js";
import { notFound, errorHandler } from "./middleware/error.js";
import { UPLOAD_ROOT } from "./middleware/upload.js";

const app = express();

app.use(cors({ origin: process.env.CLIENT_URL || "http://localhost:5173" }));
// 2 MB leaves room for a 500 KB code file once JSON-escaped.
app.use(express.json({ limit: "2mb" }));
if (process.env.NODE_ENV !== "test") app.use(morgan("dev"));

// Profile pictures are public. Project files are NOT served statically;
// they go through /api/files/:id/download, which checks permissions first.
app.use("/uploads/avatars", express.static(path.join(UPLOAD_ROOT, "avatars")));

app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/org", orgRoutes);
app.use("/api/invitations", invitationRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api", miscRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
