import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import useApi from "../utils/useApi";
import { Avatar, Empty, ErrorText, Icon, Input, PageSkeleton } from "../components/ui";

const POLL_MS = 4000;

const dayLabel = (date) => {
    const d = new Date(date);
    const today = new Date();
    const yesterday = new Date(Date.now() - 864e5);
    if (d.toDateString() === today.toDateString()) return "Today";
    if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
    return d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
};
const timeOf = (date) => new Date(date).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

export default function Messages() {
    const { user } = useAuth();
    const { data, loading } = useApi("/messages/conversations");
    const [params, setParams] = useSearchParams();
    const [messages, setMessages] = useState([]);
    const [text, setText] = useState("");
    const [search, setSearch] = useState("");
    const [error, setError] = useState("");
    const feed = useRef(null);

    // The open conversation lives in the URL: ?project=<id> or ?user=<id>.
    const channels = data?.channels || [];
    const contacts = data?.contacts || [];
    const type = params.get("user") ? "user" : "project";
    const activeId = params.get("user") || params.get("project") || channels[0]?._id;
    const active = type === "user" ? contacts.find((c) => c._id === activeId) : channels.find((c) => c._id === activeId);

    // Load the conversation, then poll for new messages.
    // (Evaluation 3: replace polling with Socket.io for true real-time delivery.)
    useEffect(() => {
        if (!activeId) return;
        let latest = null;
        let cancelled = false;
        setMessages([]);
        setError("");

        const load = async () => {
            try {
                const query = `${type}=${activeId}${latest ? `&after=${encodeURIComponent(latest)}` : ""}`;
                const { messages: fresh } = await api(`/messages?${query}`);
                if (cancelled || !fresh.length) return;
                latest = fresh[fresh.length - 1].createdAt;
                setMessages((prev) => [...prev, ...fresh.filter((m) => !prev.some((p) => p._id === m._id))]);
            } catch (e) {
                if (!cancelled) setError(e.message);
            }
        };

        load();
        const timer = setInterval(load, POLL_MS);
        return () => { cancelled = true; clearInterval(timer); };
    }, [type, activeId]);

    useEffect(() => {
        feed.current?.scrollTo({ top: feed.current.scrollHeight, behavior: "smooth" });
    }, [messages]);

    const send = async (event) => {
        event.preventDefault();
        if (!text.trim()) return;
        try {
            const { message } = await api("/messages", { method: "POST", body: { [type]: activeId, text } });
            setMessages((prev) => [...prev, message]);
            setText("");
        } catch (e) {
            setError(e.message);
        }
    };

    if (loading) return <PageSkeleton />;

    const q = search.trim().toLowerCase();
    const item = (kind, entry, label, leading, sub) => {
        const selected = activeId === entry._id && type === kind;
        return (
            <li key={entry._id}>
                <button onClick={() => setParams({ [kind]: entry._id })}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition ${selected ? "bg-white/[0.07] text-white" : "text-muted hover:bg-white/[0.03] hover:text-zinc-200"}`}>
                    {leading}
                    <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium">{label}</span>
                        {sub && <span className="block truncate text-[11px] text-faint">{sub}</span>}
                    </span>
                </button>
            </li>
        );
    };

    return (
        <div className="card flex h-[calc(100vh-9.5rem)] min-h-[520px] flex-col overflow-hidden md:flex-row">
            <aside className="flex max-h-56 shrink-0 flex-col border-b border-line-soft bg-sidebar/60 md:max-h-none md:w-72 md:border-r md:border-b-0">
                <div className="p-3"><Input icon="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search conversations" aria-label="Search conversations" className="h-9" /></div>
                <div className="flex-1 overflow-y-auto px-2 pb-3">
                    <p className="px-2.5 pt-2 pb-1.5 font-mono text-[10px] uppercase tracking-[.2em] text-faint">Channels</p>
                    <ul className="space-y-0.5">
                        {channels.filter((c) => c.name.toLowerCase().includes(q)).map((c) => item("project", c, c.name,
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/12 font-mono text-sm text-primary">#</span>))}
                        {!channels.length && <li className="px-2.5 text-xs text-faint">Join a project to get its channel.</li>}
                    </ul>
                    <p className="mt-4 px-2.5 pt-2 pb-1.5 font-mono text-[10px] uppercase tracking-[.2em] text-faint">Direct messages</p>
                    <ul className="space-y-0.5">
                        {contacts.filter((c) => c.fullName.toLowerCase().includes(q)).map((c) => item("user", c, c.fullName, <Avatar user={c} size="h-7 w-7 text-[10px]" />, c.roleName))}
                    </ul>
                </div>
            </aside>

            <section className="flex min-w-0 flex-1 flex-col">
                {active ? (
                    <>
                        <header className="flex items-center gap-3 border-b border-line-soft px-5 py-3.5">
                            {type === "user"
                                ? <Avatar user={active} size="h-9 w-9 text-xs" />
                                : <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/12 font-mono text-primary">#</span>}
                            <div className="min-w-0">
                                <h2 className="truncate font-semibold text-white">{type === "user" ? active.fullName : active.name}</h2>
                                <p className="truncate text-xs text-faint">{type === "user" ? active.roleName : "Project channel · visible to project members"}</p>
                            </div>
                        </header>

                        <div ref={feed} className="flex-1 space-y-1 overflow-y-auto px-5 py-5">
                            {messages.length ? messages.map((m, i) => {
                                const mine = m.sender?._id === user._id;
                                const prev = messages[i - 1];
                                const newDay = !prev || new Date(prev.createdAt).toDateString() !== new Date(m.createdAt).toDateString();
                                const grouped = !newDay && prev?.sender?._id === m.sender?._id && new Date(m.createdAt) - new Date(prev.createdAt) < 5 * 60e3;
                                return (
                                    <div key={m._id}>
                                        {newDay && (
                                            <div className="my-4 flex items-center gap-3 text-[11px] text-faint">
                                                <span className="h-px flex-1 bg-line-soft" />{dayLabel(m.createdAt)}<span className="h-px flex-1 bg-line-soft" />
                                            </div>
                                        )}
                                        <div className={`flex items-end gap-2.5 ${mine ? "flex-row-reverse" : ""} ${grouped ? "" : "mt-3"}`}>
                                            <div className="w-8 shrink-0">{!grouped && !mine && <Avatar user={m.sender} size="h-8 w-8 text-[10px]" />}</div>
                                            <div className={`flex max-w-[75%] flex-col ${mine ? "items-end" : "items-start"}`}>
                                                {!grouped && <p className="mb-1 px-1 text-[11px] text-faint">{mine ? "You" : m.sender?.fullName} · {timeOf(m.createdAt)}</p>}
                                                <p className={`rounded-2xl px-3.5 py-2 text-[14px] leading-relaxed break-words whitespace-pre-wrap ${mine ? "rounded-br-md bg-primary text-primary-ink" : "rounded-bl-md bg-white/[0.06] text-zinc-100"}`}>{m.text}</p>
                                            </div>
                                        </div>
                                    </div>
                                );
                            }) : <Empty icon="waving_hand" title="No messages yet">Say hello and start the conversation.</Empty>}
                        </div>

                        <form onSubmit={send} className="border-t border-line-soft p-4">
                            <ErrorText>{error}</ErrorText>
                            <div className="flex items-center gap-2 rounded-2xl border border-line bg-inset p-1.5 pl-4 transition focus-within:border-primary/50 focus-within:ring-4 focus-within:ring-primary/10">
                                <input value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} className="h-9 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-faint"
                                    placeholder={`Message ${type === "user" ? active.fullName : `#${active.name}`}`} aria-label="Message" />
                                <button disabled={!text.trim()} className="btn-primary h-9 w-9 rounded-xl px-0" aria-label="Send"><Icon name="arrow_upward" className="text-[18px]" /></button>
                            </div>
                        </form>
                    </>
                ) : (
                    <div className="m-auto"><Empty icon="forum" title="No conversation selected">Pick a channel or a person on the left.</Empty></div>
                )}
            </section>
        </div>
    );
}
