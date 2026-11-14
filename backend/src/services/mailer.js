// Sends email with Nodemailer through a Gmail account (EMAIL_USER + an App Password in EMAIL_PASS).
// Without those settings, emails are printed in the server console instead, so the app still
// works on a machine that isn't set up for email (verification codes appear in the console).
import nodemailer from "nodemailer";

const APP_URL = () => process.env.CLIENT_URL || "http://localhost:5173";

let transporter = null;
function getTransporter() {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) return null;
    transporter ??= nodemailer.createTransport({
        service: "gmail",
        auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS.replace(/\s/g, "") }
    });
    return transporter;
}

export const emailConfigured = () => Boolean(getTransporter());

// Escapes text before putting it into HTML (names and titles come from users).
export const esc = (text) => String(text ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// Wraps content in the CollabOS email layout. `body` is HTML; `button` is { label, url }.
function layout({ heading, body, button, footer = "" }) {
    const cta = button
        ? `<p style="margin:28px 0 8px"><a href="${esc(button.url)}" style="display:inline-block;background:#a8a4ff;color:#0b0b10;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:10px">${esc(button.label)}</a></p>`
        : "";
    return `<!doctype html><html><body style="margin:0;background:#f4f4f7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#18181b">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px"><tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;padding:32px;border:1px solid #e4e4e7">
<tr><td>
<p style="margin:0 0 24px;font-size:15px;font-weight:700;letter-spacing:-.01em">◆ CollabOS</p>
<h1 style="margin:0 0 12px;font-size:22px;letter-spacing:-.02em">${esc(heading)}</h1>
<div style="font-size:15px;line-height:1.6;color:#3f3f46">${body}</div>
${cta}
<p style="margin:28px 0 0;font-size:12px;color:#a1a1aa">${footer || "You received this email because of your CollabOS account."}</p>
</td></tr></table></td></tr></table></body></html>`;
}

// Sends one email. Never throws: returns true if it was sent (or printed), false on failure,
// so a mail problem can't break sign-up or invitations.
export async function sendMail({ to, subject, heading, body, button, footer, text }) {
    const html = layout({ heading, body, button, footer });
    const mailer = getTransporter();

    if (!mailer) {
        console.log(`\n[email not configured — would send]\n  To: ${to}\n  Subject: ${subject}\n  ${text || ""}\n`);
        return true;
    }
    try {
        await mailer.sendMail({ from: `"CollabOS" <${process.env.EMAIL_USER}>`, to, subject, html, text });
        return true;
    } catch (error) {
        console.error(`Email to ${to} failed:`, error.message);
        return false;
    }
}

// ---- The emails CollabOS sends ----

const codeBox = (code) =>
    `<p style="margin:20px 0;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:32px;font-weight:700;letter-spacing:10px;background:#f4f4f7;border-radius:12px;padding:16px;text-align:center">${esc(code)}</p>`;

export const sendVerificationCode = (user, code) => sendMail({
    to: user.email,
    subject: `${code} is your CollabOS verification code`,
    heading: "Verify your email",
    body: `<p>Hi ${esc(user.fullName.split(" ")[0])}, enter this code in CollabOS to confirm this is your email address:</p>${codeBox(code)}<p>It expires in 10 minutes.</p>`,
    footer: "If you didn't create a CollabOS account, you can ignore this email.",
    text: `Your CollabOS verification code is ${code}. It expires in 10 minutes.`
});

export const sendPasswordResetCode = (user, code) => sendMail({
    to: user.email,
    subject: `${code} is your CollabOS password reset code`,
    heading: "Reset your password",
    body: `<p>Someone (hopefully you) asked to reset the password for ${esc(user.email)}. Enter this code to choose a new one:</p>${codeBox(code)}<p>It expires in 10 minutes.</p>`,
    footer: "If you didn't ask for this, ignore this email. Your password won't change.",
    text: `Your CollabOS password reset code is ${code}. It expires in 10 minutes.`
});

export const sendWelcome = (user) => sendMail({
    to: user.email,
    subject: "Welcome to CollabOS",
    heading: `Welcome aboard, ${user.fullName.split(" ")[0]}!`,
    body: "<p>Your email is verified. Create an organization for your team, or accept an invitation to join one.</p>",
    button: { label: "Open CollabOS", url: `${APP_URL()}/dashboard` },
    text: `Your email is verified. Open CollabOS: ${APP_URL()}/dashboard`
});

export const sendInvitationEmail = ({ email, orgName, roleName, inviterName, hasAccount }) => sendMail({
    to: email,
    subject: `${inviterName} invited you to ${orgName} on CollabOS`,
    heading: `Join ${orgName}`,
    body: `<p><b>${esc(inviterName)}</b> invited you to join <b>${esc(orgName)}</b> on CollabOS as <b>${esc(roleName)}</b>.</p>
<p>${hasAccount ? "Log in to accept the invitation." : "Create a free account with this email address to accept it."} The invitation expires in 7 days.</p>`,
    button: hasAccount
        ? { label: "Log in and accept", url: `${APP_URL()}/login` }
        : { label: "Create your account", url: `${APP_URL()}/signup?email=${encodeURIComponent(email)}` },
    text: `${inviterName} invited you to join ${orgName} on CollabOS as ${roleName}. ${APP_URL()}/${hasAccount ? "login" : "signup"}`
});

export const sendTaskReminderEmail = (user, { subject, heading, message, link }) => sendMail({
    to: user.email,
    subject,
    heading,
    body: `<p>${esc(message)}</p>`,
    button: { label: "Open in CollabOS", url: `${APP_URL()}${link}` },
    footer: "You can turn off email reminders in CollabOS → Settings.",
    text: `${message} ${APP_URL()}${link}`
});

const inr = (paise) => `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
const day = (date) => new Date(date).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });

export const sendPaymentReceipt = (user, { org, payment, planName, periodLabel }) => sendMail({
    to: user.email,
    subject: `Receipt ${payment.invoiceNumber}: CollabOS ${planName} for ${org.name}`,
    heading: "Payment received, thank you!",
    body: `<p>${esc(org.name)} is now on <b>${esc(planName)}</b> until <b>${day(payment.periodEnd)}</b>.</p>
<table style="width:100%;border-collapse:collapse;font-size:14px;margin-top:12px">
<tr><td style="padding:6px 0;color:#71717a">Invoice</td><td style="text-align:right">${esc(payment.invoiceNumber)}</td></tr>
<tr><td style="padding:6px 0;color:#71717a">Plan</td><td style="text-align:right">${esc(planName)} · ${esc(periodLabel)}</td></tr>
<tr><td style="padding:6px 0;color:#71717a">Price</td><td style="text-align:right">${inr(payment.listPrice)}</td></tr>
${payment.discount ? `<tr><td style="padding:6px 0;color:#71717a">Coupon ${esc(payment.coupon)}</td><td style="text-align:right">−${inr(payment.discount)}</td></tr>` : ""}
<tr><td style="padding:10px 0 0;font-weight:700;border-top:1px solid #e4e4e7">Total paid</td><td style="text-align:right;font-weight:700;padding-top:10px;border-top:1px solid #e4e4e7">${inr(payment.amount)}</td></tr>
</table>`,
    button: { label: "View billing", url: `${APP_URL()}/billing` },
    text: `Payment received: ${planName} (${periodLabel}) for ${org.name}, ${inr(payment.amount)}. Invoice ${payment.invoiceNumber}.`
});

export const sendRenewalReminder = (user, { org, planName, expiresAt }) => sendMail({
    to: user.email,
    subject: `${org.name}'s ${planName} plan ends on ${day(expiresAt)}`,
    heading: "Your plan is ending soon",
    body: `<p>${esc(org.name)}'s <b>${esc(planName)}</b> plan ends on <b>${day(expiresAt)}</b>. Renew it to keep your limits; otherwise the organization moves back to Starter. Nothing is deleted.</p>`,
    button: { label: "Renew now", url: `${APP_URL()}/billing` },
    text: `${org.name}'s ${planName} plan ends on ${day(expiresAt)}. Renew: ${APP_URL()}/billing`
});

export const sendMeetingInvite = (user, { meeting, hostName, when }) => sendMail({
    to: user.email,
    subject: `Meeting: ${meeting.title} (${when})`,
    heading: meeting.title,
    body: `<p><b>${esc(hostName)}</b> invited you to a video meeting on CollabOS.</p>
<p style="margin:16px 0;padding:12px 16px;background:#f4f4f7;border-radius:12px"><b>When:</b> ${esc(when)} (IST)<br><b>Length:</b> ${meeting.durationMinutes} minutes</p>
${meeting.description ? `<p>${esc(meeting.description)}</p>` : ""}`,
    button: { label: "Join the meeting", url: `${APP_URL()}/meet/${meeting.roomId}` },
    text: `${hostName} invited you to "${meeting.title}" on ${when}. Join: ${APP_URL()}/meet/${meeting.roomId}`
});
