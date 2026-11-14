import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import morgan from "morgan";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { apiLimiter, sanitizeBody } from "./middleware/security.js";
import authRoutes from "./routes/authRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import projectRoutes from "./routes/projectRoutes.js";
import taskRoutes from "./routes/taskRoutes.js";
import orgRoutes from "./routes/orgRoutes.js";
import invitationRoutes from "./routes/invitationRoutes.js";
import miscRoutes from "./routes/miscRoutes.js";
import billingRoutes from "./routes/billingRoutes.js";
import googleRoutes from "./routes/googleRoutes.js";
import meetingRoutes from "./routes/meetingRoutes.js";
import aiRoutes from "./routes/aiRoutes.js";
import { webhook as razorpayWebhook } from "./controllers/billingController.js";
import { notFound, errorHandler } from "./middleware/error.js";
import { UPLOAD_ROOT } from "./middleware/upload.js";

const app = express();

// "simple" parses ?a[b]=c as the plain key "a[b]", so query strings can never contain
// MongoDB operators like ?project[$ne]=x.
app.set("query parser", "simple");
// Behind a proxy (e.g. when deployed) this makes req.ip the real visitor's address for rate limits.
app.set("trust proxy", 1);

// Secure HTTP headers (hides "X-Powered-By: Express", blocks clickjacking and MIME sniffing...).
// Avatars are loaded by the website, so allow them cross-origin.
// The content policy lists the outside services the website loads: Google Fonts, the code editor and
// Python runtime (jsDelivr), and Razorpay's checkout. Code runs in blob: workers, which need "eval".
app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-eval'", "'wasm-unsafe-eval'", "blob:", "https://cdn.jsdelivr.net", "https://checkout.razorpay.com"],
            workerSrc: ["'self'", "blob:"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdn.jsdelivr.net"],
            fontSrc: ["'self'", "data:", "https://fonts.gstatic.com", "https://cdn.jsdelivr.net"],
            imgSrc: ["'self'", "data:", "blob:", "https:"],
            mediaSrc: ["'self'", "blob:"],
            connectSrc: ["'self'", "ws:", "wss:", "https:"],
            frameSrc: ["'self'", "https://api.razorpay.com", "https://checkout.razorpay.com"]
        }
    }
}));
app.use(cors({ origin: process.env.CLIENT_URL || "http://localhost:5173", credentials: true }));
app.use(cookieParser());
app.use("/api", apiLimiter);
// Razorpay signs the exact bytes it sends, so its webhook needs the raw body (before express.json).
app.post("/api/billing/webhook", express.raw({ type: "application/json" }), razorpayWebhook);
// 2 MB leaves room for a 500 KB code file once JSON-escaped.
app.use(express.json({ limit: "2mb" }));
app.use(sanitizeBody);
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
app.use("/api/billing", billingRoutes);
app.use("/api/google", googleRoutes);
app.use("/api/meetings", meetingRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api", miscRoutes);

// In production, once the website has been built (npm run build in client/), this server also serves it, so one
// service runs everything. Any address that isn't an API route gets the app, which then routes itself.
const CLIENT_DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../client/dist");
if (process.env.NODE_ENV === "production" && fs.existsSync(path.join(CLIENT_DIST, "index.html"))) {
    app.use(express.static(CLIENT_DIST, { index: false, maxAge: "7d" }));
    app.get(/^\/(?!api\/|uploads\/|socket\.io\/).*/, (_req, res) => {
        res.set("Cache-Control", "no-cache");
        res.sendFile(path.join(CLIENT_DIST, "index.html"));
    });
}

app.use(notFound);
app.use(errorHandler);

export default app;
