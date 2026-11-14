import { useEffect, useState } from "react";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import useApi from "../utils/useApi";
import PricingTable from "../components/PricingTable";
import { Link } from "react-router-dom";
import { Badge, Empty, ErrorText, Field, Icon, Input, Modal, PageHeader, PageSkeleton, Panel, Ring, Segmented } from "../components/ui";
import { formatBytes, rupees, USAGE_ROWS } from "../utils/plans";

const longDate = (value) => new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
const METHOD_LABELS = { upi: "UPI", card: "Card", netbanking: "Net banking", wallet: "Wallet", demo: "Demo" };

// Razorpay's checkout script, loaded only when someone pays.
function loadRazorpay() {
    if (window.Razorpay) return Promise.resolve();
    return new Promise((resolve, reject) => {
        const script = Object.assign(document.createElement("script"), { src: "https://checkout.razorpay.com/v1/checkout.js", onload: resolve });
        script.onerror = () => reject(new Error("Couldn't load Razorpay. Check your internet connection."));
        document.body.appendChild(script);
    });
}

// ---------- Current plan + usage ----------

const PLAN_ICONS = { starter: "eco", pro: "bolt", scale: "rocket_launch" };
const USAGE_ICONS = { projects: "folder", members: "group", customRoles: "badge", storageBytes: "database" };

function CurrentPlan({ billing, canManage }) {
    const { plan, limits, usage } = billing;
    const paid = plan.id !== "starter";
    const daysLeft = paid ? Math.ceil((new Date(plan.expiresAt) - Date.now()) / 864e5) : null;
    const allowances = [
        ["upload_file", "Largest file", formatBytes(limits.maxFileBytes)],
        ["videocam", "Meetings", `${limits.meetingMinutes === null ? "Unlimited" : `${limits.meetingMinutes} min`} · ${limits.meetingParticipants} people`],
        ["auto_awesome", "Assistant", limits.aiMessagesPerDay === null ? "Unlimited" : `${limits.aiMessagesPerDay} messages a day`],
        ["play_circle", "Code runs", limits.codeRunsPerDay === null ? "Unlimited" : `${limits.codeRunsPerDay} a day`]
    ];

    return (
        <div className="grid items-stretch gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
            {/* The subscription */}
            <section className="card relative flex flex-col overflow-hidden p-5">
                <div className="pointer-events-none absolute inset-0" aria-hidden="true" style={{ background: "radial-gradient(360px 180px at 100% 0%, rgb(54 198 181 / 0.14), transparent 70%)" }} />
                <div className="relative flex items-start justify-between gap-3">
                    <p className="eyebrow">Current plan</p>
                    {paid ? <Badge tone={daysLeft <= 3 ? "amber" : "green"} dot>{daysLeft <= 3 ? "Expiring soon" : "Active"}</Badge> : plan.lapsed ? <Badge tone="amber" dot>Lapsed</Badge> : <Badge tone="steel" dot>Free</Badge>}
                </div>
                <div className="relative mt-3 flex items-center gap-3.5">
                    <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-[#2a9d7c] text-primary-ink shadow-[inset_0_1px_0_rgb(255_255_255/0.3)]"><Icon name={PLAN_ICONS[plan.id] || "star"} fill className="text-[26px]" /></span>
                    <div>
                        <h2 className="text-[26px] leading-tight font-semibold text-ink">{plan.name}</h2>
                        <p className="text-[14.5px] text-muted">{paid ? `${plan.period === "yearly" ? "Yearly" : "Monthly"} billing, prepaid` : "Free forever"}</p>
                    </div>
                </div>

                <dl className="relative mt-5 space-y-2.5 border-t border-line-soft pt-4 text-[14.5px]">
                    {paid ? (
                        <>
                            <div className="flex justify-between gap-3"><dt className="text-muted">Active until</dt><dd className="font-medium text-zinc-100">{longDate(plan.expiresAt)}</dd></div>
                            <div className="flex justify-between gap-3"><dt className="text-muted">Time left</dt><dd className={`font-medium ${daysLeft <= 3 ? "text-warning" : "text-zinc-100"}`}>{daysLeft} day{daysLeft === 1 ? "" : "s"}</dd></div>
                            <div className="flex justify-between gap-3"><dt className="text-muted">Renewal</dt><dd className="text-zinc-300">Manual, nothing auto-renews</dd></div>
                        </>
                    ) : (
                        <>
                            <div className="flex justify-between gap-3"><dt className="text-muted">Price</dt><dd className="font-medium text-zinc-100">₹0</dd></div>
                            <div className="flex justify-between gap-3"><dt className="text-muted">Renewal</dt><dd className="text-zinc-300">Never expires</dd></div>
                        </>
                    )}
                </dl>

                {plan.lapsed && !paid && (
                    <p className="relative mt-4 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-[14px] text-warning">
                        <Icon name="warning" className="text-[18px]" />
                        Your {plan.lapsed === "pro" ? "Pro" : "Scale"} plan has ended. Everything is still here, but you can't add more than Starter allows until you renew.
                    </p>
                )}
                <div className="relative mt-auto pt-5">
                    <a href="#plans" className={canManage ? "btn-primary w-full" : "btn-secondary w-full"}><Icon name={paid ? "autorenew" : "arrow_upward"} className="text-[18px]" />{paid ? "Renew or change plan" : "See upgrade options"}</a>
                    {!canManage && <p className="mt-2 text-center text-[13.5px] text-faint">Only people with billing access can change the plan.</p>}
                </div>
            </section>

            {/* Usage */}
            <section className="card flex flex-col">
                <div className="flex items-center justify-between border-b border-line-soft px-4 py-3">
                    <div>
                        <h3 className="text-[15px] font-semibold text-zinc-100">Usage</h3>
                        <p className="mt-0.5 text-[14px] text-muted">What your organization is using right now, against the {plan.name} limits.</p>
                    </div>
                </div>
                <div className="grid flex-1 gap-px bg-line-soft sm:grid-cols-2">
                    {USAGE_ROWS.map(([usageKey, limitKey, label, format]) => {
                        const used = usage[usageKey];
                        const limit = limits[limitKey];
                        const unlimited = limit === null;
                        const excluded = limit === 0;
                        const percent = unlimited || excluded ? 0 : Math.min(100, (used / limit) * 100);
                        const tone = !unlimited && !excluded && used >= limit ? "danger" : percent > 80 ? "warning" : "primary";
                        return (
                            <div key={usageKey} className="flex items-center gap-4 bg-panel p-4">
                                <Ring percent={unlimited ? 100 : percent} size={54} stroke={5} tone={unlimited ? "success" : excluded ? "default" : tone}>
                                    <Icon name={USAGE_ICONS[usageKey] || "data_usage"} className="text-[20px] text-muted" />
                                </Ring>
                                <div className="min-w-0 flex-1">
                                    <p className="text-[14px] text-muted">{label}</p>
                                    <p className="mt-0.5 text-[18px] leading-tight font-semibold text-ink tabular-nums">
                                        {format(used)} <span className="text-[14.5px] font-normal text-faint">{excluded ? "· not included" : `of ${unlimited ? "unlimited" : format(limit)}`}</span>
                                    </p>
                                    <p className={`mt-1 text-[13px] ${tone === "danger" ? "text-danger" : tone === "warning" ? "text-warning" : "text-faint"}`}>
                                        {excluded ? "Available on paid plans" : unlimited ? "No limit on your plan" : tone === "danger" ? "Limit reached" : `${Math.round(percent)}% used`}
                                        {usageKey === "members" && usage.pendingInvites > 0 && ` · ${usage.pendingInvites} pending invite${usage.pendingInvites === 1 ? "" : "s"} hold a seat`}
                                    </p>
                                </div>
                            </div>
                        );
                    })}
                </div>
                <dl className="grid grid-cols-2 gap-px border-t border-line-soft bg-line-soft lg:grid-cols-4">
                    {allowances.map(([icon, label, value]) => (
                        <div key={label} className="bg-panel px-4 py-3">
                            <dt className="flex items-center gap-1.5 text-[13px] text-faint"><Icon name={icon} className="text-[15px]" />{label}</dt>
                            <dd className="mt-0.5 text-[14px] font-medium text-zinc-200">{value}</dd>
                        </div>
                    ))}
                </dl>
            </section>
        </div>
    );
}

// ---------- Checkout ----------

// Pretend payment screen used when Razorpay keys aren't set up, so the whole flow can still be shown.
function DemoPayment({ amount, onPay, busy }) {
    const [method, setMethod] = useState("upi");
    return (
        <div className="space-y-4">
            <p className="flex items-start gap-2 rounded-lg border border-accent/30 bg-accent/10 p-3 text-[14px] text-accent">
                <Icon name="science" className="text-[17px]" />Demo mode: no money moves. Add Razorpay test keys to use the real Razorpay checkout.
            </p>
            <Segmented ariaLabel="Payment method" value={method} onChange={setMethod}
                options={[{ value: "upi", label: "UPI", icon: "qr_code_2" }, { value: "card", label: "Card", icon: "credit_card" }, { value: "netbanking", label: "Bank", icon: "account_balance" }]} />
            {method === "upi" && <Field label="UPI ID"><Input icon="alternate_email" defaultValue="success@demo" aria-label="UPI ID" /></Field>}
            {method === "card" && (
                <div className="grid grid-cols-2 gap-3">
                    <Field label="Card number" className="col-span-2"><Input icon="credit_card" defaultValue="4111 1111 1111 1111" aria-label="Card number" /></Field>
                    <Field label="Expiry"><Input defaultValue="12/30" aria-label="Expiry" /></Field>
                    <Field label="CVV"><Input defaultValue="123" aria-label="CVV" /></Field>
                </div>
            )}
            {method === "netbanking" && <Field label="Bank"><Input icon="account_balance" defaultValue="Demo Bank" aria-label="Bank" /></Field>}
            <button disabled={busy} onClick={() => onPay(method)} className="btn-primary h-11 w-full">
                {busy ? <><Icon name="progress_activity" className="animate-spin text-[20px]" />Processing…</> : <><Icon name="lock" className="text-[20px]" />Pay {rupees(amount)}</>}
            </button>
        </div>
    );
}

function CheckoutModal({ selection, onClose, onPaid }) {
    const toast = useToast();
    const [coupon, setCoupon] = useState("");
    const [price, setPrice] = useState(null);
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const [demo, setDemo] = useState(null);

    const loadQuote = (code = "") => api("/billing/quote", { method: "POST", body: { ...selection, coupon: code } })
        .then((q) => { setPrice(q); setError(""); })
        .catch((e) => setError(e.message));

    useEffect(() => { loadQuote(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const verify = async (body) => {
        const result = await api("/billing/verify", { method: "POST", body });
        toast.success(`You're on ${result.plan.name}!`, `Active until ${longDate(result.plan.expiresAt)}. A receipt is on its way to your email.`);
        onPaid();
    };

    const pay = async () => {
        setBusy(true);
        setError("");
        try {
            const order = await api("/billing/checkout", { method: "POST", body: { ...selection, coupon: price?.coupon || "" } });
            if (order.provider === "demo") {
                setDemo(order);
                setBusy(false);
                return;
            }
            await loadRazorpay();
            const checkout = new window.Razorpay({
                key: order.keyId,
                order_id: order.orderId,
                amount: order.amount,
                currency: order.currency,
                name: "CollabOS",
                description: `${order.description} · ${order.organization}`,
                prefill: order.prefill,
                theme: { color: "#1fa596" },
                handler: (response) => verify({ paymentId: order.paymentId, ...response }).catch((e) => setError(e.message)).finally(() => setBusy(false)),
                modal: {
                    ondismiss: () => {
                        api(`/billing/payments/${order.paymentId}/fail`, { method: "POST" }).catch(() => {});
                        setBusy(false);
                    }
                }
            });
            checkout.on("payment.failed", (response) => setError(response.error?.description || "The payment failed."));
            checkout.open();
        } catch (e) {
            setError(e.message);
            setBusy(false);
        }
    };

    const payDemo = async (method) => {
        setBusy(true);
        await new Promise((r) => setTimeout(r, 1200));
        try {
            await verify({ paymentId: demo.paymentId, method });
        } catch (e) {
            setError(e.message);
            setBusy(false);
        }
    };

    const close = () => {
        if (demo && !busy) api(`/billing/payments/${demo.paymentId}/fail`, { method: "POST" }).catch(() => {});
        onClose();
    };

    const planName = selection.plan === "pro" ? "Pro" : "Scale";
    return (
        <Modal open onClose={close} title={`Upgrade to ${planName}`} description={selection.period === "yearly" ? "Billed yearly. Renew any time; nothing renews automatically." : "Billed monthly. Renew any time; nothing renews automatically."}>
            {demo ? <DemoPayment amount={demo.amount} onPay={payDemo} busy={busy} /> : (
                <div className="space-y-5">
                    <div className="rounded-lg border border-line bg-inset p-4 text-[15px]">
                        <div className="flex justify-between text-muted"><span>{planName} · {selection.period === "yearly" ? "1 year" : "1 month"}</span><span className="tabular-nums text-zinc-200">{price ? rupees(price.listPrice) : "…"}</span></div>
                        {price?.discount > 0 && <div className="mt-2 flex justify-between text-success"><span>{price.coupon} · {price.couponDescription}</span><span className="tabular-nums">−{rupees(price.discount)}</span></div>}
                        <div className="mt-3 flex justify-between border-t border-line-soft pt-3 font-semibold text-white"><span>Total</span><span className="tabular-nums">{price ? rupees(price.amount) : "…"}</span></div>
                    </div>
                    <form onSubmit={(e) => { e.preventDefault(); loadQuote(coupon); }} className="flex gap-2">
                        <div className="flex-1"><Input icon="sell" value={coupon} onChange={(e) => setCoupon(e.target.value.toUpperCase())} placeholder="Coupon code (try STUDENT50)" aria-label="Coupon code" className="tabular-nums" /></div>
                        <button disabled={!coupon} className="btn-secondary shrink-0">Apply</button>
                    </form>
                    <ErrorText>{error}</ErrorText>
                    <button disabled={busy || !price} onClick={pay} className="btn-primary h-11 w-full">
                        {busy ? <><Icon name="progress_activity" className="animate-spin text-[20px]" />Opening checkout…</> : <><Icon name="lock" className="text-[20px]" />Continue to payment</>}
                    </button>
                    <p className="flex items-center justify-center gap-1.5 text-center text-[13px] text-faint"><Icon name="lock" className="text-[14.5px]" />Payments are processed by Razorpay (test mode). UPI, cards and net banking supported.</p>
                </div>
            )}
            {demo && <div className="mt-3"><ErrorText>{error}</ErrorText></div>}
        </Modal>
    );
}

// ---------- Invoices ----------

function printInvoice({ payment, organization, planName, periodLabel }) {
    const row = (label, value, strong) => `<tr><td style="padding:8px 0;color:${strong ? "#111" : "#666"};${strong ? "font-weight:700;border-top:2px solid #111" : ""}">${label}</td><td style="text-align:right;${strong ? "font-weight:700;border-top:2px solid #111" : ""}">${value}</td></tr>`;
    const esc = (t) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
    const html = `<!doctype html><html><head><title>Invoice ${esc(payment.invoiceNumber)}</title></head>
<body style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:640px;margin:40px auto;color:#111;padding:0 20px">
<div style="display:flex;justify-content:space-between;align-items:flex-start"><div><h1 style="margin:0;font-size:22px">◆ CollabOS</h1><p style="color:#666;margin:4px 0 0">Tax invoice (demo)</p></div>
<div style="text-align:right"><p style="margin:0;font-weight:700">${esc(payment.invoiceNumber)}</p><p style="color:#666;margin:4px 0 0">${longDate(payment.paidAt)}</p></div></div>
<hr style="margin:28px 0;border:none;border-top:1px solid #ddd">
<p style="margin:0;color:#666">Billed to</p><p style="margin:4px 0 0;font-weight:600">${esc(organization.name)}</p><p style="margin:2px 0 0;color:#666">${esc(payment.user?.fullName)} · ${esc(payment.user?.email)}</p>
<table style="width:100%;border-collapse:collapse;margin-top:28px;font-size:14px">
${row(`CollabOS ${esc(planName)} plan (${esc(periodLabel.toLowerCase())})<br><span style="font-size:12px;color:#888">${longDate(payment.periodStart)} – ${longDate(payment.periodEnd)}</span>`, rupees(payment.listPrice))}
${payment.discount ? row(`Coupon ${esc(payment.coupon)}`, `−${rupees(payment.discount)}`) : ""}
${row("Total paid", rupees(payment.amount), true)}
</table>
<p style="margin-top:28px;color:#666;font-size:13px">Paid by ${esc(METHOD_LABELS[payment.method] || payment.method || "online payment")}${payment.razorpayPaymentId ? ` · Razorpay ${esc(payment.razorpayPaymentId)}` : ""}.</p>
<p style="color:#999;font-size:12px">This invoice was generated for a college project demo. No real money was charged.</p>
<script>window.onload = () => window.print()</script></body></html>`;
    const win = window.open("", "_blank");
    if (!win) return false;
    win.document.write(html);
    win.document.close();
    return true;
}

function PaymentHistory({ payments }) {
    const toast = useToast();
    const open = async (id) => {
        try {
            if (!printInvoice(await api(`/billing/payments/${id}`))) toast.error("Pop-up blocked", "Allow pop-ups for this site to open the invoice.");
        } catch (e) {
            toast.error("Couldn't open invoice", e.message);
        }
    };

    return (
        <Panel title="Billing history" icon="receipt_long" description="An invoice for every payment. Open one to print or save it as a PDF." bodyClassName="p-0">
            {payments.length ? (
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[680px] text-left text-[14.5px]">
                        <thead className="border-b border-line-soft bg-white/[0.015] text-[13px] text-faint">
                            <tr>{["Date", "Plan", "Paid by", "Amount", "Status", "Invoice"].map((h, i) => <th key={h} className={`px-4 py-2.5 font-medium ${i === 5 ? "text-right" : ""}`}>{h}</th>)}</tr>
                        </thead>
                        <tbody className="divide-y divide-line-soft">
                            {payments.map((p) => (
                                <tr key={p._id} className="text-zinc-300 transition-colors hover:bg-white/[0.02]">
                                    <td className="px-4 py-3 whitespace-nowrap">{longDate(p.paidAt || p.createdAt)}</td>
                                    <td className="px-4 py-3 whitespace-nowrap"><span className="font-medium text-zinc-100">{p.plan === "pro" ? "Pro" : "Scale"}</span> <span className="text-faint">· {p.period}</span>{p.coupon && <span className="ml-2"><Badge tone="teal" icon="sell">{p.coupon}</Badge></span>}</td>
                                    <td className="px-4 py-3 whitespace-nowrap">{p.user?.fullName}</td>
                                    <td className="px-4 py-3 font-medium text-zinc-100 tabular-nums">{rupees(p.amount)}</td>
                                    <td className="px-4 py-3">
                                        {p.status === "paid"
                                            ? <Badge tone="green" dot>Paid · {METHOD_LABELS[p.method] || p.method}</Badge>
                                            : <Badge tone="red" dot>Cancelled</Badge>}
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        {p.status === "paid" ? <button onClick={() => open(p._id)} className="btn-ghost btn-sm font-mono text-[13.5px]"><Icon name="download" className="text-[17px]" />{p.invoiceNumber}</button> : <span className="text-faint">–</span>}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : <Empty icon="receipt_long" title="No payments yet">Invoices appear here after your first upgrade.</Empty>}
        </Panel>
    );
}

// ---------- Page ----------

export default function Billing() {
    const { refresh, organization } = useAuth();
    const billing = useApi("/billing");
    const [selection, setSelection] = useState(null);

    if (billing.loading && !billing.data) return <PageSkeleton />;
    if (!billing.data) return <ErrorText>{billing.error}</ErrorText>;
    const { plan, canManage, payments } = billing.data;

    const action = (option, period) => {
        if (option.id === "starter") {
            return <button disabled className="btn-secondary w-full">{plan.id === "starter" ? "Your current plan" : "Included free"}</button>;
        }
        if (!canManage) return <button disabled className="btn-secondary w-full">Ask your Owner to upgrade</button>;
        const label = option.id === plan.id ? `Renew ${option.name}` : plan.id === "scale" && option.id === "pro" ? `Switch to ${option.name}` : `Upgrade to ${option.name}`;
        return <button onClick={() => setSelection({ plan: option.id, period })} className={option.id === "pro" ? "btn-primary w-full" : "btn-secondary w-full"}>{label}</button>;
    };

    const paid = async () => {
        setSelection(null);
        await Promise.all([billing.reload(), refresh()]);
    };

    return (
        <>
            <PageHeader title="Plan & billing" subtitle={`The subscription, usage and invoices for ${organization.name}. One plan covers everyone in the organization.`}>
                <Link to="/organization" className="btn-secondary"><Icon name="apartment" className="text-[17px]" />Organization</Link>
            </PageHeader>
            <div className="mt-6 space-y-8">
                <CurrentPlan billing={billing.data} canManage={canManage} />
                <section id="plans" className="scroll-mt-20">
                    <h2 className="text-[18px] font-semibold text-ink">Plans</h2>
                    <p className="mt-1 text-[14.5px] text-muted">Prepaid: pay for a month or a year, renew whenever you like. Downgrading never deletes anything.</p>
                    <div className="mt-6"><PricingTable currentPlan={plan.id} renderAction={action} /></div>
                </section>
                {canManage && <PaymentHistory payments={payments} />}
            </div>
            {selection && <CheckoutModal selection={selection} onClose={() => setSelection(null)} onPaid={paid} />}
        </>
    );
}
