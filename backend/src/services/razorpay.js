// Talks to Razorpay (https://razorpay.com/docs/api/) without the SDK: one REST call to create an
// order, and HMAC-SHA256 checks for the payment signature and webhooks.
// Use TEST keys (rzp_test_...) so no real money moves. Without keys, billing runs in "demo" mode.
import crypto from "node:crypto";
import ApiError from "../utils/ApiError.js";

const API = "https://api.razorpay.com/v1";

export const razorpayConfigured = () => Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
export const razorpayKeyId = () => process.env.RAZORPAY_KEY_ID;

function authHeader() {
    const credentials = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString("base64");
    return `Basic ${credentials}`;
}

async function request(method, path, body) {
    const response = await fetch(`${API}${path}`, {
        method,
        headers: { Authorization: authHeader(), "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new ApiError(502, `Razorpay: ${data.error?.description || `request failed (${response.status})`}`);
    return data;
}

// An order fixes the amount on Razorpay's side, so the browser can't change what gets charged.
export const createOrder = ({ amount, receipt, notes }) =>
    request("POST", "/orders", { amount, currency: "INR", receipt, notes });

export const fetchPayment = (paymentId) => request("GET", `/payments/${paymentId}`);

function safeEqual(a, b) {
    const x = Buffer.from(String(a || ""));
    const y = Buffer.from(String(b || ""));
    return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// After checkout, Razorpay gives the browser a signature = HMAC_SHA256(order_id + "|" + payment_id, key secret).
// Only Razorpay and our server know the secret, so a valid signature proves the payment is real.
export function verifyPaymentSignature(orderId, paymentId, signature) {
    const expected = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET).update(`${orderId}|${paymentId}`).digest("hex");
    return safeEqual(expected, signature);
}

// Webhooks are signed with the webhook secret over the raw request body.
export function verifyWebhookSignature(rawBody, signature) {
    if (!process.env.RAZORPAY_WEBHOOK_SECRET) return false;
    const expected = crypto.createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET).update(rawBody).digest("hex");
    return safeEqual(expected, signature);
}
