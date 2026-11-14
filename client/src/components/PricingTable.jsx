import { useEffect, useState } from "react";
import { api } from "../api/client";
import { Badge, Icon, Skeleton } from "./ui";
import { FEATURE_ROWS, rupees } from "../utils/plans";

const HIGHLIGHT = "pro";
const PLAN_ICONS = { starter: "eco", pro: "bolt", scale: "rocket_launch" };

// The three plan cards with a monthly/yearly switch. Used on the landing page and the billing page.
// renderAction(plan, period) returns the button for each card.
export default function PricingTable({ renderAction, currentPlan }) {
    const [data, setData] = useState(null);
    const [period, setPeriod] = useState("yearly");

    useEffect(() => {
        api("/billing/plans").then(setData).catch(() => setData({ plans: [] }));
    }, []);

    if (!data) return <div className="grid gap-4 lg:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-[480px] rounded-xl" />)}</div>;

    return (
        <div>
            {/* Monthly / yearly switch */}
            <div className="flex justify-center sm:justify-start">
                <div role="radiogroup" aria-label="Billing period" className="inline-flex rounded-full border border-line bg-inset p-1">
                    {[["monthly", "Monthly", null], ["yearly", "Yearly", "2 months free"]].map(([value, label, perk]) => (
                        <button key={value} type="button" role="radio" aria-checked={period === value} onClick={() => setPeriod(value)}
                            className={`flex h-8 items-center gap-2 rounded-full px-4 text-[14.5px] font-medium transition-colors ${period === value ? "bg-raised text-white shadow-[inset_0_0_0_1px_rgb(255_255_255/0.07)]" : "text-muted hover:text-zinc-200"}`}>
                            {label}
                            {perk && <span className={`rounded-full px-1.5 py-px text-[12px] font-semibold ${period === value ? "bg-success/15 text-success" : "bg-white/[0.06] text-faint"}`}>{perk}</span>}
                        </button>
                    ))}
                </div>
            </div>

            <div className="mt-6 grid items-stretch gap-4 lg:grid-cols-3">
                {data.plans.map((plan) => {
                    const price = plan.price[period];
                    const featured = plan.id === HIGHLIGHT;
                    const current = plan.id === currentPlan;
                    return (
                        <article key={plan.id} className={`card relative flex flex-col p-6 ${featured ? "border-accent/45 bg-[#0f191b] shadow-[0_0_0_1px_rgb(54_198_181/0.12),0_24px_50px_-30px_rgb(54_198_181/0.45)]" : ""}`}>
                            {featured && <span className="absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-accent to-transparent" aria-hidden="true" />}
                            <div className="flex items-center gap-3">
                                <span className={`tile ${featured ? "tile-teal" : plan.id === "scale" ? "tile-green" : ""}`}><Icon name={PLAN_ICONS[plan.id] || "star"} /></span>
                                <h3 className="text-[17px] font-semibold text-ink">{plan.name}</h3>
                                <span className="ml-auto">
                                    {current ? <Badge tone="green" icon="check">Current plan</Badge> : featured && <Badge tone="teal">Recommended</Badge>}
                                </span>
                            </div>
                            <p className="mt-3 min-h-[38px] text-[14.5px] leading-[19px] text-muted">{plan.tagline}</p>
                            <p className="mt-4 flex items-baseline gap-1.5">
                                <span className="text-[36px] leading-none font-semibold text-ink tabular-nums">{price ? rupees(price) : "₹0"}</span>
                                <span className="text-[14.5px] text-faint">{price ? (period === "yearly" ? "/ year" : "/ month") : "forever"}</span>
                            </p>
                            <p className="mt-2 h-4 text-[13.5px] text-faint">{price && period === "yearly" ? `${rupees(Math.round(price / 12))} a month, billed yearly` : price ? "Billed monthly, prepaid" : "No card needed"}</p>
                            <div className="mt-5">{renderAction(plan, period)}</div>
                            <ul className="mt-6 space-y-2.5 border-t border-line-soft pt-5">
                                {FEATURE_ROWS.map(([key, icon, text]) => (
                                    <li key={key} className="flex items-start gap-2.5 text-[14.5px] text-zinc-300">
                                        <Icon name={icon} className={`mt-px text-[17px] ${featured ? "text-accent" : "text-faint"}`} />
                                        {text(plan.limits[key], plan.limits)}
                                    </li>
                                ))}
                            </ul>
                        </article>
                    );
                })}
            </div>
        </div>
    );
}
