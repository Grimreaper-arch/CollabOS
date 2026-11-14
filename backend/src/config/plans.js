// The subscription plans. Like permissions.js, this is the single place where plans are defined:
// the limits here are enforced by services/plans.js and shown on the pricing and billing pages.
// A limit of null means unlimited. Prices are in paise (₹1 = 100 paise), as Razorpay expects.
const MB = 1024 * 1024;
const GB = 1024 * MB;

export const PLANS = {
    starter: {
        id: "starter",
        name: "Starter",
        tagline: "For small teams getting started.",
        price: { monthly: 0, yearly: 0 },
        limits: {
            projects: 3,
            members: 8,
            customRoles: 0,
            storageBytes: 1 * GB,
            maxFileBytes: 10 * MB,
            meetingMinutes: 40,
            meetingParticipants: 4,
            aiMessagesPerDay: 20,
            codeRunsPerDay: 50,
            auditDays: 7
        }
    },
    pro: {
        id: "pro",
        name: "Pro",
        tagline: "For growing teams that need more room.",
        price: { monthly: 49900, yearly: 499900 },
        limits: {
            projects: 50,
            members: 100,
            customRoles: 25,
            storageBytes: 100 * GB,
            maxFileBytes: 500 * MB,
            meetingMinutes: null,
            meetingParticipants: 25,
            aiMessagesPerDay: 500,
            codeRunsPerDay: 2000,
            auditDays: 365
        }
    },
    scale: {
        id: "scale",
        name: "Scale",
        tagline: "For organizations that don't want limits.",
        price: { monthly: 149900, yearly: 1499900 },
        limits: {
            projects: null,
            members: null,
            customRoles: null,
            storageBytes: 1024 * GB,
            maxFileBytes: 5 * GB,
            meetingMinutes: null,
            meetingParticipants: 100,
            aiMessagesPerDay: null,
            codeRunsPerDay: null,
            auditDays: null
        }
    }
};

export const PLAN_ORDER = ["starter", "pro", "scale"];
export const FREE_PLAN = "starter";

export const PERIODS = {
    monthly: { label: "Monthly", months: 1 },
    yearly: { label: "Yearly", months: 12 }
};

// Coupon codes, checked at checkout. percentOff applies to the plan price.
export const COUPONS = {
    STUDENT50: { percentOff: 50, description: "50% off for students" },
    LAUNCH20: { percentOff: 20, description: "20% launch discount" }
};

// Human-readable names for the limits, used in error messages and on the billing page.
export const LIMIT_LABELS = {
    projects: "projects",
    members: "members",
    customRoles: "custom roles",
    storageBytes: "file storage",
    maxFileBytes: "file size",
    meetingMinutes: "meeting length",
    meetingParticipants: "people per meeting",
    aiMessagesPerDay: "AI messages per day",
    codeRunsPerDay: "code runs per day",
    auditDays: "days of activity history"
};
