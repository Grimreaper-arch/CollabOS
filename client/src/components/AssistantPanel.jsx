import { Fragment, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api, streamApi } from "../api/client";
import { Icon, Kbd, Tooltip } from "./ui";

// Other pages can hand a question to the assistant:
//   window.dispatchEvent(new CustomEvent("collabos:ask-ai", { detail: { prompt } }))
export const askAssistant = (prompt) => window.dispatchEvent(new CustomEvent("collabos:ask-ai", { detail: { prompt } }));

// ---- Tiny, safe Markdown ----
// **bold**, `code`, [links](/path), bullets, numbered lists, headings and ``` code blocks.
// Builds React elements (never innerHTML), so model output can't inject HTML or scripts.
function Inline({ text, onLink }) {
    return text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/g).map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) return <strong key={i} className="font-semibold text-white">{part.slice(2, -2)}</strong>;
        if (part.startsWith("`") && part.endsWith("`")) return <code key={i} className="rounded border border-line bg-white/[0.05] px-1 py-px font-mono text-[13.5px] text-zinc-100">{part.slice(1, -1)}</code>;
        const link = part.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
        if (link) {
            const [, label, href] = link;
            // Links inside the app navigate without reloading; only https links may leave it.
            if (href.startsWith("/") && !href.startsWith("//")) return <button key={i} onClick={() => onLink(href)} className="text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent">{label}</button>;
            if (/^https:\/\//.test(href)) return <a key={i} href={href} target="_blank" rel="noreferrer noopener" className="text-accent underline decoration-accent/40 underline-offset-2">{label}</a>;
            return <Fragment key={i}>{label}</Fragment>;
        }
        return <Fragment key={i}>{part}</Fragment>;
    });
}

function CodeBlock({ language, code }) {
    const [copied, setCopied] = useState(false);
    const copy = () => navigator.clipboard?.writeText(code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {});
    return (
        <div className="overflow-hidden rounded-lg border border-line bg-inset">
            <div className="flex items-center justify-between border-b border-line-soft bg-white/[0.02] px-3 py-1.5 font-mono text-[12px] text-faint">
                <span>{language || "code"}</span>
                <button onClick={copy} className="flex items-center gap-1 hover:text-white"><Icon name={copied ? "check" : "content_copy"} className="text-[14.5px]" />{copied ? "Copied" : "Copy"}</button>
            </div>
            <pre className="max-h-80 overflow-auto p-3 font-mono text-[13.5px] leading-relaxed text-zinc-200"><code>{code}</code></pre>
        </div>
    );
}

function Markdown({ text, onLink }) {
    const blocks = [];
    let list = null;
    let fence = null;
    text.split("\n").forEach((line) => {
        if (fence) {
            if (line.trim().startsWith("```")) { blocks.push(fence); fence = null; } else fence.lines.push(line);
            return;
        }
        if (line.trim().startsWith("```")) { list = null; fence = { code: true, language: line.trim().slice(3).trim(), lines: [] }; return; }
        const bullet = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)/);
        if (bullet) {
            const ordered = /^\s*\d+[.)]/.test(line);
            if (!list || list.ordered !== ordered) { list = { ordered, items: [] }; blocks.push(list); }
            list.items.push(bullet[1]);
            return;
        }
        list = null;
        const heading = line.match(/^#{1,4}\s+(.*)/);
        if (heading) blocks.push({ heading: heading[1] });
        else if (line.trim()) blocks.push({ text: line });
    });
    if (fence) blocks.push(fence); // still streaming: show what has arrived

    return (
        <div className="space-y-2.5">
            {blocks.map((b, i) => {
                if (b.code) return <CodeBlock key={i} language={b.language} code={b.lines.join("\n")} />;
                if (b.heading) return <p key={i} className="pt-1 font-semibold text-white"><Inline text={b.heading} onLink={onLink} /></p>;
                if (b.items) {
                    const items = b.items.map((item, j) => <li key={j}><Inline text={item} onLink={onLink} /></li>);
                    return b.ordered ? <ol key={i} className="list-decimal space-y-1.5 pl-5 marker:text-faint">{items}</ol> : <ul key={i} className="list-disc space-y-1.5 pl-5 marker:text-accent/70">{items}</ul>;
                }
                return <p key={i}><Inline text={b.text} onLink={onLink} /></p>;
            })}
        </div>
    );
}

// What the assistant did while answering: one chip per tool it used.
function Actions({ actions }) {
    if (!actions?.length) return null;
    const STYLE = {
        running: ["progress_activity", "text-accent", "animate-spin"],
        ok: ["check_circle", "text-success", ""],
        error: ["error", "text-danger", ""],
        confirm: ["pending", "text-warning", ""]
    };
    return (
        <div className="mb-2 flex flex-col gap-1">
            {actions.map((a, i) => {
                const [icon, tone, spin] = STYLE[a.status || (a.ok ? "ok" : "error")];
                return (
                    <span key={i} className="flex w-fit max-w-full items-center gap-1.5 rounded-full border border-line bg-white/[0.03] py-0.5 pr-2.5 pl-1.5 text-[13.5px] text-muted" title={a.detail || ""}>
                        <Icon name={icon} className={`shrink-0 text-[15px] ${tone} ${spin}`} />
                        <span className="truncate">{a.label}</span>
                    </span>
                );
            })}
        </div>
    );
}

// What the assistant knows about the page you're on. The page path is sent with every question
// (the server adds it to the model's context), so these labels describe something real.
const CONTEXTS = [
    { match: /^\/projects\/.+/, label: "This project", icon: "folder", prompts: [["summarize", "Summarize this project and its risks"], ["group", "Who is working on what here?"]] },
    { match: /^\/projects/, label: "Projects", icon: "folder", prompts: [["folder", "Summarize my projects"], ["flag", "Which projects are at risk of missing their deadline?"]] },
    { match: /^\/tasks/, label: "Tasks", icon: "task_alt", prompts: [["error", "What tasks are overdue?"], ["sort", "What should I work on first today?"]] },
    { match: /^\/calendar/, label: "Calendar", icon: "calendar_today", prompts: [["event", "What deadlines are coming up?"], ["videocam", "What meetings do I have this week?"]] },
    { match: /^\/messages/, label: "Messages", icon: "chat_bubble", prompts: [["forum", "Summarize my recent conversations"], ["reply", "Is anyone waiting for a reply from me?"]] },
    { match: /^\/meetings/, label: "Meetings", icon: "videocam", prompts: [["videocam", "What meetings do I have coming up?"], ["event", "Schedule a 30 minute meeting tomorrow at 4pm"]] },
    { match: /^\/code/, label: "Code workspace", icon: "code", prompts: [["code", "Write a Python program and save it to the code workspace"], ["folder_open", "What code files does this project have?"]] },
    { match: /^\/organization/, label: "Organization", icon: "apartment", prompts: [["group", "Who is in my organization, and what are their roles?"], ["shield", "Explain what each role can do"]] },
    { match: /^\/analytics/, label: "Analytics", icon: "bar_chart", prompts: [["monitoring", "How is the team doing on completion this month?"], ["person_alert", "Who is overloaded right now?"]] }
];

const GENERAL_PROMPTS = [
    ["wb_sunny", "Give me my daily brief"],
    ["folder", "Summarize my projects"],
    ["error", "What tasks are overdue?"],
    ["event", "What deadlines are coming up?"],
    ["history", "Show me my team's recent activity"],
    ["checklist", "Help me organize my work"]
];

const CAPABILITIES = [
    ["search", "Answers from your workspace", "Projects, tasks, chats, meetings and code."],
    ["bolt", "Takes action", "Creates tasks, schedules meetings, writes files."],
    ["verified_user", "Asks first", "Deleting, messaging and inviting need your OK."]
];

function AssistantMark({ size = "h-8 w-8", icon = "text-[18px]" }) {
    return (
        <span className={`flex shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-accent to-[#2a9d7c] text-primary-ink shadow-[inset_0_1px_0_rgb(255_255_255/0.3)] ${size}`}>
            <Icon name="auto_awesome" fill className={icon} />
        </span>
    );
}

function CopyButton({ text }) {
    const [copied, setCopied] = useState(false);
    const copy = () => navigator.clipboard?.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {});
    return (
        <button onClick={copy} className="mt-2 flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[13px] text-faint opacity-0 transition-opacity group-hover/msg:opacity-100 hover:bg-white/[0.05] hover:text-zinc-200 focus-visible:opacity-100" aria-label="Copy response">
            <Icon name={copied ? "check" : "content_copy"} className="text-[14.5px]" />{copied ? "Copied" : "Copy"}
        </button>
    );
}

const dayOf = (date) => {
    const d = new Date(date);
    const diff = Math.floor((new Date().setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 864e5);
    return diff <= 0 ? "Today" : diff === 1 ? "Yesterday" : diff < 7 ? "This week" : "Earlier";
};

// The workspace assistant. One panel, opened three ways: the top-bar button, the floating bubble,
// or Ctrl + J. Answers stream in from /api/ai/chat; risky actions wait for the Confirm button.
export default function AssistantPanel() {
    const navigate = useNavigate();
    const location = useLocation();
    const [open, setOpen] = useState(false);
    const [wide, setWide] = useState(false);
    const [status, setStatus] = useState(null);
    const [conversations, setConversations] = useState([]);
    const [conversationId, setConversationId] = useState(null);
    const [messages, setMessages] = useState([]);
    const [pending, setPending] = useState(null);       // { id, summary } waiting for Confirm
    const [text, setText] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [showHistory, setShowHistory] = useState(false);
    const feed = useRef(null);
    const input = useRef(null);
    const abort = useRef(null);
    const idRef = useRef(null);
    idRef.current = conversationId;

    useEffect(() => {
        const onKey = (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "j") { e.preventDefault(); setOpen((o) => !o); }
        };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, []);

    const loadStatus = () => api("/ai/status").then(setStatus).catch(() => {});
    const loadConversations = () => api("/ai/conversations").then((d) => setConversations(d.conversations)).catch(() => {});
    useEffect(() => {
        if (!open) return;
        loadStatus();
        loadConversations();
        setTimeout(() => input.current?.focus(), 50);
    }, [open]);

    useEffect(() => { feed.current?.scrollTo({ top: feed.current.scrollHeight }); }, [messages, pending]);
    useEffect(() => () => abort.current?.abort(), []);

    // The message box grows with what you type, up to a limit.
    useEffect(() => {
        const el = input.current;
        if (!el) return;
        el.style.height = "auto";
        el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
    }, [text, open]);

    const openConversation = async (id) => {
        setShowHistory(false);
        setError("");
        try {
            const { conversation } = await api(`/ai/conversations/${id}`);
            setConversationId(id);
            setMessages(conversation.messages);
            setPending(conversation.pending);
        } catch (e) {
            setError(e.message);
        }
    };

    const newChat = () => { abort.current?.abort(); setConversationId(null); setMessages([]); setPending(null); setError(""); setShowHistory(false); setTimeout(() => input.current?.focus(), 0); };

    const remove = async (id) => {
        await api(`/ai/conversations/${id}`, { method: "DELETE" }).catch(() => {});
        setConversations((list) => list.filter((c) => c._id !== id));
        if (id === conversationId) newChat();
    };

    // Sends a request that streams a reply, and shows it as it arrives.
    const stream = async (path, body) => {
        setError("");
        setBusy(true);
        setPending(null);
        setMessages((prev) => [...prev, { role: "assistant", content: "", actions: [], streaming: true }]);
        const patch = (change) => setMessages((prev) => [...prev.slice(0, -1), change(prev.at(-1))]);
        const controller = new AbortController();
        abort.current = controller;
        try {
            await streamApi(path, body, (event) => {
                if (event.conversationId) setConversationId(event.conversationId);
                if (event.delta) patch((m) => ({ ...m, content: m.content + event.delta }));
                if (event.action) {
                    // "running" adds a chip; the result replaces it.
                    patch((m) => {
                        const actions = [...m.actions];
                        const at = actions.findLastIndex((a) => a.label === event.action.label && a.status === "running");
                        if (at >= 0 && event.action.status !== "running") actions[at] = event.action; else actions.push(event.action);
                        return { ...m, actions };
                    });
                }
                if (event.confirm) setPending(event.confirm);
                if (event.error) setError(event.error);
            }, { signal: controller.signal });
        } catch (e) {
            if (e.name !== "AbortError") setError(e.message);
        } finally {
            setMessages((prev) => prev
                .map((m) => (m.streaming ? { ...m, streaming: false, actions: m.actions.map((a) => (a.status === "running" ? { ...a, status: "error", detail: "Stopped" } : a)) } : m))
                .filter((m) => m.role !== "assistant" || m.content || m.actions?.length));
            setBusy(false);
            loadStatus();
            loadConversations();
        }
    };

    const ask = (question) => {
        const message = question.trim();
        if (!message || busy) return;
        setText("");
        setShowHistory(false);
        setMessages((prev) => [...prev, { role: "user", content: message }]);
        stream("/ai/chat", { conversationId: idRef.current, message, page: location.pathname + location.search });
    };
    const askRef = useRef(ask);
    askRef.current = ask;

    const decide = (approve) => {
        if (!pending || busy) return;
        stream("/ai/confirm", { conversationId, id: pending.id, approve, page: location.pathname + location.search });
    };

    // Questions sent from other pages ("Explain this code", "Summarize this project"...).
    useEffect(() => {
        const onAsk = (event) => {
            setOpen(true);
            setShowHistory(false);
            if (event.detail?.prompt) setTimeout(() => askRef.current(event.detail.prompt), 0);
        };
        window.addEventListener("collabos:ask-ai", onAsk);
        return () => window.removeEventListener("collabos:ask-ai", onAsk);
    }, []);

    const follow = (href) => { navigate(href); if (window.innerWidth < 1024) setOpen(false); };
    const usage = status && status.limit !== null ? `${status.usedToday} of ${status.limit} messages today` : status ? "Unlimited messages" : "";
    const disabled = status && !status.configured;
    const context = CONTEXTS.find((c) => c.match.test(location.pathname));
    const title = conversations.find((c) => c._id === conversationId)?.title;
    const suggestions = [...(context?.prompts || []), ...GENERAL_PROMPTS.filter(([, p]) => !context?.prompts.some(([, q]) => q === p))].slice(0, 6);
    // Keep the bubble clear of the message box, the code status bar and meeting controls.
    const lifted = /^\/(messages|code|meet)/.test(location.pathname);

    let lastGroup = null;

    return (
        <>
            {/* Floating bubble: on every page, opens the same panel as the top-bar button. */}
            {!open && (
                <Tooltip label="Ask CollabOS · Ctrl J" side="left">
                    <button onClick={() => setOpen(true)} aria-label="Ask CollabOS"
                        className={`group fixed right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-accent to-[#2a9d7c] text-primary-ink shadow-[0_10px_28px_-8px_rgb(54_198_181/0.6),inset_0_1px_0_rgb(255_255_255/0.35)] transition-[transform,box-shadow,bottom] duration-200 hover:-translate-y-0.5 hover:scale-105 hover:shadow-[0_14px_34px_-8px_rgb(54_198_181/0.75),inset_0_1px_0_rgb(255_255_255/0.35)] active:scale-95 sm:right-6 ${lifted ? "bottom-24" : "bottom-5 sm:bottom-6"}`}>
                        <Icon name="auto_awesome" fill className="text-[24px] transition-transform duration-300 group-hover:rotate-12" />
                    </button>
                </Tooltip>
            )}

            {open && (
                <>
                    <div className="fixed inset-0 z-40 animate-fade-in bg-[#03070866] lg:hidden" onClick={() => setOpen(false)} aria-hidden="true" />
                    <aside className={`fixed inset-y-0 right-0 z-50 flex w-full animate-slide-in flex-col border-l border-line-strong bg-[#0c1214] shadow-2xl shadow-black/70 transition-[max-width] duration-200 ${wide ? "max-w-[760px]" : "max-w-[460px]"}`} aria-label="CollabOS assistant">
                        <header className="flex items-center gap-3 border-b border-line-soft px-4 py-3">
                            <AssistantMark />
                            <div className="min-w-0 flex-1">
                                <p className="text-[15px] leading-tight font-semibold text-ink">CollabOS Assistant</p>
                                <p className="mt-0.5 flex items-center gap-1.5 truncate text-[13px] leading-tight text-faint">
                                    <span className={`h-1.5 w-1.5 rounded-full ${!status ? "bg-zinc-600" : disabled ? "bg-warning" : "bg-success"}`} />
                                    {!status ? "Connecting…" : disabled ? "Not connected" : usage}
                                </p>
                            </div>
                            <Tooltip label="Conversation history"><button onClick={() => setShowHistory((s) => !s)} className={`btn-icon ${showHistory ? "bg-white/[0.07] text-white" : ""}`} aria-label="Conversation history" aria-pressed={showHistory}><Icon name="history" /></button></Tooltip>
                            <Tooltip label="New conversation"><button onClick={newChat} className="btn-icon" aria-label="New conversation"><Icon name="edit_square" /></button></Tooltip>
                            <Tooltip label={wide ? "Narrow panel" : "Widen panel"}><button onClick={() => setWide((w) => !w)} className="btn-icon hidden lg:inline-flex" aria-label={wide ? "Narrow panel" : "Widen panel"}><Icon name={wide ? "close_fullscreen" : "open_in_full"} className="text-[18px]" /></button></Tooltip>
                            <Tooltip label="Close · Ctrl J"><button onClick={() => setOpen(false)} className="btn-icon" aria-label="Close assistant"><Icon name="close" /></button></Tooltip>
                        </header>

                        {showHistory ? (
                            <div className="flex-1 overflow-y-auto p-2">
                                <div className="flex items-center justify-between px-2.5 pt-2 pb-1">
                                    <p className="text-[14.5px] font-semibold text-zinc-100">Conversations</p>
                                    <button onClick={newChat} className="btn-ghost btn-sm"><Icon name="add" className="text-[16px]" />New</button>
                                </div>
                                {conversations.length ? conversations.map((c) => {
                                    const group = dayOf(c.updatedAt);
                                    const header = group !== lastGroup ? group : null;
                                    lastGroup = group;
                                    return (
                                        <div key={c._id}>
                                            {header && <p className="eyebrow px-2.5 pt-3 pb-1">{header}</p>}
                                            <div className={`group flex items-center gap-1 rounded-lg pr-1 transition-colors ${c._id === conversationId ? "bg-accent/[0.08]" : "hover:bg-white/[0.04]"}`}>
                                                <button onClick={() => openConversation(c._id)} className="flex min-w-0 flex-1 items-center gap-2.5 px-2.5 py-2 text-left">
                                                    <Icon name="chat_bubble" className={`text-[16px] ${c._id === conversationId ? "text-accent" : "text-faint"}`} />
                                                    <span className="min-w-0 flex-1">
                                                        <span className="block truncate text-[14.5px] text-zinc-200">{c.title}</span>
                                                        <span className="block text-[12.5px] text-faint">{new Date(c.updatedAt).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</span>
                                                    </span>
                                                </button>
                                                <button onClick={() => remove(c._id)} className="btn-icon h-7 w-7 opacity-0 group-hover:opacity-100 hover:bg-danger/10 hover:text-danger focus-visible:opacity-100" aria-label={`Delete ${c.title}`}><Icon name="delete" className="text-[17px]" /></button>
                                            </div>
                                        </div>
                                    );
                                }) : (
                                    <div className="px-6 py-14 text-center">
                                        <Icon name="forum" className="text-[26px] text-faint" />
                                        <p className="mt-3 text-[15px] font-medium text-zinc-200">No conversations yet</p>
                                        <p className="mt-1 text-[14px] text-muted">Everything you ask is kept here so you can pick it up later.</p>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div ref={feed} className="flex-1 overflow-y-auto scroll-smooth px-4 py-5 text-[15px] leading-relaxed">
                                <div className={`mx-auto space-y-5 ${wide ? "max-w-[640px]" : ""}`}>
                                    {disabled && (
                                        <p className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-[14.5px] text-warning">
                                            <Icon name="info" className="text-[20px]" />The assistant isn't connected to an AI service yet. The admin needs to add the Azure OpenAI keys.
                                        </p>
                                    )}

                                    {!messages.length ? (
                                        <div className="animate-slide-up">
                                            <AssistantMark size="h-11 w-11 rounded-xl" icon="text-[24px]" />
                                            <h2 className="mt-4 text-[21px] leading-tight font-semibold text-ink">How can I help?</h2>
                                            <p className="mt-1.5 text-[15px] text-muted">I work inside your workspace: I can look things up, and do things for you with the same permissions you have.</p>

                                            <div className="mt-5 grid gap-px overflow-hidden rounded-xl border border-line bg-line-soft sm:grid-cols-3">
                                                {CAPABILITIES.map(([icon, name, detail]) => (
                                                    <div key={name} className="bg-panel p-3">
                                                        <Icon name={icon} className="text-[18px] text-accent" />
                                                        <p className="mt-2 text-[14px] font-medium text-zinc-100">{name}</p>
                                                        <p className="mt-0.5 text-[13px] leading-snug text-faint">{detail}</p>
                                                    </div>
                                                ))}
                                            </div>

                                            <p className="eyebrow mt-6 mb-2">{context ? `Suggested for ${context.label}` : "Try asking"}</p>
                                            <div className="grid gap-2 sm:grid-cols-2">
                                                {suggestions.map(([icon, prompt], i) => (
                                                    <button key={prompt} onClick={() => ask(prompt)} disabled={disabled}
                                                        className={`group flex items-start gap-2.5 rounded-lg border p-2.5 text-left text-[14.5px] leading-snug transition-colors disabled:opacity-50 ${context && i < context.prompts.length ? "border-accent/25 bg-accent/[0.05] text-zinc-100 hover:border-accent/50 hover:bg-accent/[0.09]" : "border-line bg-white/[0.02] text-zinc-300 hover:border-line-strong hover:bg-white/[0.05] hover:text-white"}`}>
                                                        <Icon name={icon} className={`mt-px text-[17px] ${context && i < context.prompts.length ? "text-accent" : "text-faint group-hover:text-zinc-300"}`} />
                                                        <span className="flex-1">{prompt}</span>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    ) : (
                                        <>
                                            {title && <p className="truncate border-b border-line-soft pb-3 text-[14px] font-medium text-muted"><Icon name="chat_bubble" className="mr-1.5 align-[-2px] text-[15px] text-faint" />{title}</p>}
                                            {messages.map((m, i) => m.role === "user" ? (
                                                <div key={i} className="flex justify-end">
                                                    <div className="max-w-[86%] rounded-2xl rounded-br-md border border-line bg-raised px-3.5 py-2 text-zinc-100">
                                                        {m.content.includes("```") ? <Markdown text={m.content} onLink={follow} /> : <p className="whitespace-pre-wrap">{m.content}</p>}
                                                    </div>
                                                </div>
                                            ) : (
                                                <div key={i} className="group/msg flex gap-3">
                                                    <AssistantMark size="h-6 w-6 rounded-md mt-0.5" icon="text-[14.5px]" />
                                                    <div className="min-w-0 flex-1 text-zinc-300">
                                                        <Actions actions={m.actions} />
                                                        {m.content ? <Markdown text={m.content} onLink={follow} />
                                                            : m.streaming && (
                                                                <span className="inline-flex items-center gap-2 pt-1 text-[14px] text-faint">
                                                                    <span className="inline-flex gap-1">{[0, 150, 300].map((d) => <span key={d} className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent/70" style={{ animationDelay: `${d}ms` }} />)}</span>
                                                                    {m.actions?.length ? "Working…" : "Thinking…"}
                                                                </span>
                                                            )}
                                                        {m.content && !m.streaming && <CopyButton text={m.content} />}
                                                    </div>
                                                </div>
                                            ))}
                                        </>
                                    )}

                                    {pending && !busy && (
                                        <div className="animate-slide-up rounded-xl border border-warning/30 bg-warning/[0.06] p-3.5">
                                            <p className="flex items-center gap-1.5 text-[13.5px] font-semibold text-warning"><Icon name="verified_user" className="text-[16px]" />Needs your confirmation</p>
                                            <p className="mt-1.5 text-[14.5px] whitespace-pre-wrap text-zinc-200">{pending.summary}</p>
                                            <div className="mt-3 flex gap-2">
                                                <button onClick={() => decide(true)} className="btn-primary btn-sm"><Icon name="check" className="text-[17px]" />Confirm</button>
                                                <button onClick={() => decide(false)} className="btn-secondary btn-sm">Cancel</button>
                                            </div>
                                        </div>
                                    )}
                                    {error && (
                                        <p className="flex items-start gap-2 rounded-lg border border-danger/25 bg-danger/[0.07] p-3 text-[14.5px] text-danger" role="alert">
                                            <Icon name="error" className="mt-px text-[17px]" />{error}
                                        </p>
                                    )}
                                </div>
                            </div>
                        )}

                        <form onSubmit={(e) => { e.preventDefault(); ask(text); }} className="border-t border-line-soft p-3">
                            <div className={`mx-auto ${wide ? "max-w-[640px]" : ""}`}>
                                <div className="rounded-xl border border-line bg-inset transition-[border-color,box-shadow] focus-within:border-accent/55 focus-within:ring-[3px] focus-within:ring-accent/12">
                                    <textarea ref={input} value={text} onChange={(e) => setText(e.target.value)} rows={1} maxLength={12000} disabled={disabled}
                                        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(text); } }}
                                        className="block max-h-40 min-h-10 w-full resize-none bg-transparent px-3.5 pt-3 pb-1 text-[15px] text-white outline-none placeholder:text-faint" placeholder="Ask anything, or tell me what to do…" aria-label="Message the assistant" />
                                    <div className="flex items-center gap-2 px-2 pb-2">
                                        {context && (
                                            <span className="badge badge-teal" title={`The assistant knows you're on ${context.label} and uses it to understand "this" and "here".`}>
                                                <Icon name={context.icon} className="text-[14.5px]" />Using context: {context.label}
                                            </span>
                                        )}
                                        <span className="ml-auto hidden text-[12.5px] text-faint sm:inline"><Kbd>↵</Kbd> send · <Kbd>Shift ↵</Kbd> new line</span>
                                        {busy
                                            ? <button type="button" onClick={() => abort.current?.abort()} className="btn-secondary h-8 w-8 rounded-lg px-0" aria-label="Stop"><Icon name="stop" fill className="text-[20px]" /></button>
                                            : <button disabled={!text.trim() || disabled} className="btn-primary h-8 w-8 rounded-lg px-0" aria-label="Send"><Icon name="arrow_upward" className="text-[20px]" /></button>}
                                    </div>
                                </div>
                                <p className="mt-2 text-center text-[12.5px] text-faint">Acts with your permissions. Deleting, messaging and inviting always ask first.</p>
                            </div>
                        </form>
                    </aside>
                </>
            )}
        </>
    );
}
