import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Icon, Modal } from "./ui";
import { PLAN_LIMIT_EVENT } from "../utils/plans";

// Opens whenever an API call hits a plan limit (the API client fires PLAN_LIMIT_EVENT),
// so every "create" button in the app gets an upgrade prompt without extra code.
export default function UpgradeDialog() {
    const { organization, can } = useAuth();
    const navigate = useNavigate();
    const [message, setMessage] = useState("");

    useEffect(() => {
        const show = (event) => setMessage(event.detail);
        window.addEventListener(PLAN_LIMIT_EVENT, show);
        return () => window.removeEventListener(PLAN_LIMIT_EVENT, show);
    }, []);

    const close = () => setMessage("");
    const goToBilling = () => { close(); navigate("/billing"); };

    return (
        <Modal open={Boolean(message)} onClose={close} title="You've reached your plan's limit" size="max-w-md">
            <div className="flex items-start gap-3 rounded-lg border border-primary/25 bg-primary/10 p-4">
                <Icon name="workspace_premium" className="text-primary" fill />
                <p className="text-[15px] text-zinc-200">{message}</p>
            </div>
            <p className="mt-4 text-[14.5px] text-muted">
                {organization?.name} is on the <span className="text-zinc-200">{organization?.plan?.name}</span> plan.
                {can("billing.manage") ? " Pro and Scale raise every limit; you can pay by UPI, card or net banking." : " Only people who manage billing (usually the Owner) can upgrade."}
            </p>
            <div className="mt-6 flex justify-end gap-2">
                <button onClick={close} className="btn-ghost">Not now</button>
                <button onClick={goToBilling} className="btn-primary"><Icon name="arrow_upward" className="text-[17px]" />{can("billing.manage") ? "See plans" : "View plans"}</button>
            </div>
        </Modal>
    );
}
