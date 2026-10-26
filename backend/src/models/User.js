import mongoose from "mongoose";
import bcrypt from "bcryptjs";

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
        avatar: { type: String, default: "" }
    },
    { timestamps: true }
);

// Hash the password whenever it is set or changed.
userSchema.pre("save", async function () {
    if (!this.isModified("password")) return;
    this.password = await bcrypt.hash(this.password, 10);
});

userSchema.methods.comparePassword = function (plain) {
    return bcrypt.compare(plain, this.password);
};

userSchema.set("toJSON", {
    transform: (_doc, ret) => {
        delete ret.password;
        delete ret.__v;
        return ret;
    }
});

export default mongoose.model("User", userSchema);
