import mongoose from "mongoose";
import bcrypt from "bcryptjs";

// A one-time code sent by email (verification or password reset). Only a hash is stored.
const oneTimeCodeSchema = new mongoose.Schema(
    {
        hash: String,
        expiresAt: Date,
        sentAt: Date,
        attempts: { type: Number, default: 0 }
    },
    { _id: false }
);

const userSchema = new mongoose.Schema(
    {
        fullName: { type: String, required: true, trim: true, maxlength: 80 },
        email: { type: String, required: true, unique: true, lowercase: true, trim: true, match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
        // select: false keeps the hash out of every query unless explicitly asked for.
        password: { type: String, required: true, minlength: 8, select: false },
        institution: { type: String, trim: true, default: "" },
        department: { type: String, trim: true, default: "" },
        phone: { type: String, trim: true, default: "" },
        bio: { type: String, trim: true, maxlength: 250, default: "" },
        avatar: { type: String, default: "" },
        // The organization the user last worked in; used when a request doesn't name one.
        lastOrg: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", default: null },
        // New accounts must confirm their email with a code before using the app.
        emailVerified: { type: Boolean, default: false },
        // Due-date reminders are also emailed unless the user turns this off.
        emailReminders: { type: Boolean, default: true },
        passwordChangedAt: { type: Date, default: null },
        // Part of every login token. Raising it signs the user out everywhere (see middleware/auth.js).
        tokenVersion: { type: Number, default: 0 },
        // Account lockout: 5 wrong passwords in a row lock the account for 15 minutes.
        failedLogins: { type: Number, default: 0, select: false },
        lockedUntil: { type: Date, default: null, select: false },
        // Google Calendar connection. Tokens are encrypted (utils/secretBox.js) and never sent to the browser.
        google: {
            connected: { type: Boolean, default: false },
            email: { type: String, default: "" },
            refreshToken: { type: String, select: false },
            accessToken: { type: String, select: false },
            expiresAt: Date,
            connectedAt: Date
        },
        verifyCode: { type: oneTimeCodeSchema, default: null, select: false },
        resetCode: { type: oneTimeCodeSchema, default: null, select: false }
    },
    { timestamps: true }
);

// Hash the password whenever it is set or changed.
userSchema.pre("save", async function () {
    if (!this.isModified("password")) return;
    this.password = await bcrypt.hash(this.password, 10);
    if (!this.isNew) {
        this.passwordChangedAt = new Date();
        this.tokenVersion = (this.tokenVersion || 0) + 1;
    }
});

userSchema.methods.comparePassword = function (plain) {
    return bcrypt.compare(plain, this.password);
};

userSchema.set("toJSON", {
    transform: (_doc, ret) => {
        delete ret.password;
        delete ret.verifyCode;
        delete ret.resetCode;
        if (ret.google) {
            delete ret.google.refreshToken;
            delete ret.google.accessToken;
        }
        delete ret.__v;
        return ret;
    }
});

export default mongoose.model("User", userSchema);
