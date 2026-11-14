import { useEffect, useRef } from "react";
import { Avatar, Icon } from "./ui";
import { timeAgo } from "../utils/format";

const STATUS = {
    ok: { label: "Finished", tone: "text-success", icon: "check_circle" },
    runtime_error: { label: "Error", tone: "text-danger", icon: "error" },
    compile_error: { label: "Compile error", tone: "text-danger", icon: "build_circle" },
    timeout: { label: "Time limit", tone: "text-warning", icon: "timer_off" },
    unavailable: { label: "Runner offline", tone: "text-warning", icon: "cloud_off" },
    preparing: { label: "Getting ready", tone: "text-accent", icon: "downloading" },
    busy: { label: "Runner busy", tone: "text-warning", icon: "hourglass_top" }
};

const TABS = [["output", "Output", "terminal"], ["input", "Input", "keyboard"], ["history", "History", "history"]];

// The panel under the editor: program output, the input it reads, and earlier runs.
// `run` is { running, status, chunks: [{ stream, text }], result, viewing } from Code.jsx.
export default function CodeRunPanel({ tab, setTab, run, stdin, setStdin, history, onShowRun, onReuseInput, onAskAi, onClose, usage, canRun }) {
    const feed = useRef(null);
    useEffect(() => { feed.current?.scrollTo({ top: feed.current.scrollHeight }); }, [run.chunks]);

    const result = run.result;
    const status = result ? STATUS[result.status] : null;
    const failed = result && ["runtime_error", "compile_error", "timeout"].includes(result.status);

    return (
        <div className="flex h-60 shrink-0 flex-col border-t border-line bg-[#080d0f]">
            <div className="flex h-9 shrink-0 items-center gap-1 border-b border-line-soft bg-sidebar/60 px-2" role="tablist">
                {TABS.map(([id, label, icon]) => (
                    <button key={id} onClick={() => setTab(id)} role="tab" aria-selected={tab === id}
                        className={`relative flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[13.5px] font-medium transition-colors ${tab === id ? "text-white" : "text-faint hover:bg-white/[0.04] hover:text-zinc-300"}`}>
                        <Icon name={icon} className="text-[16px]" />{label}
                        {id === "input" && stdin && <span className="h-1.5 w-1.5 rounded-full bg-accent" />}
                        {tab === id && <span className="absolute inset-x-2 -bottom-[5px] h-0.5 rounded-full bg-accent" />}
                    </button>
                ))}
                <div className="ml-auto flex min-w-0 items-center gap-3 overflow-hidden pr-1 whitespace-nowrap text-[13px] text-faint">
                    {run.running && <span className="flex items-center gap-1.5 text-accent"><Icon name="progress_activity" className="animate-spin text-[15px]" />{run.status || "Running…"}</span>}
                    {status && !run.running && (
                        <span className={`flex items-center gap-1 ${status.tone}`}>
                            <Icon name={status.icon} className="text-[15px]" />{status.label}
                            {result.exitCode !== null && result.exitCode !== undefined && ` · exit ${result.exitCode}`}
                            {result.timeMs > 0 && ` · ${result.timeMs} ms`}
                        </span>
                    )}
                    {usage && usage.limit !== null && <span className="hidden lg:inline" title="Code runs today (plan limit)">{usage.usedToday}/{usage.limit} runs</span>}
                    <button onClick={onClose} className="flex h-6 w-6 items-center justify-center rounded hover:bg-white/[0.08] hover:text-white" aria-label="Close panel"><Icon name="close" className="text-[16px]" /></button>
                </div>
            </div>

            {tab === "output" && (
                <div ref={feed} className="min-h-0 flex-1 overflow-auto px-4 py-3 font-mono text-[14px] leading-relaxed">
                    {run.viewing && (
                        <p className="mb-2 flex items-center gap-2 text-[12.5px] text-faint">
                            <Icon name="history" className="text-[15px]" />Run from {timeAgo(run.viewing.createdAt)} by {run.viewing.user?.fullName}
                            {run.viewing.stdin && <button onClick={() => onReuseInput(run.viewing.stdin)} className="text-accent hover:underline">Use its input</button>}
                        </p>
                    )}
                    {run.chunks.length ? run.chunks.map((chunk, i) => (
                        <span key={i} className={`whitespace-pre-wrap break-words ${chunk.stream === "stderr" ? "text-[#f5a29d]" : chunk.stream === "info" ? "text-faint" : "text-zinc-200"}`}>{chunk.text}</span>
                    )) : !run.running && (
                        <p className="text-faint"><span className="text-accent">$</span> {canRun ? "Press Run (Ctrl + Enter) to run this file. Programs read from the Input tab." : "This file type can't be run. Runnable: .js, .py, .c, .cpp, .java"}</p>
                    )}
                    {failed && !run.running && (
                        <button onClick={onAskAi} className="mt-3 flex items-center gap-1.5 rounded-lg border border-accent/30 bg-accent/10 px-2.5 py-1.5 font-sans text-[13.5px] font-medium text-accent transition-colors hover:bg-accent/15">
                            <Icon name="auto_awesome" className="text-[16px]" fill />Ask AI to explain and fix this
                        </button>
                    )}
                </div>
            )}

            {tab === "input" && (
                <div className="flex min-h-0 flex-1 flex-col p-3">
                    <textarea value={stdin} onChange={(e) => setStdin(e.target.value)} spellCheck={false}
                        className="min-h-0 flex-1 resize-none rounded-lg border border-line bg-inset p-3 font-mono text-[14px] text-zinc-200 outline-none placeholder:text-faint focus:border-accent/50"
                        placeholder={"What the program reads (standard input), one value per line.\nExample:\n5\n10 20 30 40 50"} aria-label="Program input" />
                    <p className="mt-1.5 text-[12.5px] text-faint">Used by input() in Python, cin / scanf in C and C++, Scanner in Java, and readline() in JavaScript.</p>
                </div>
            )}

            {tab === "history" && (
                <div className="min-h-0 flex-1 overflow-auto p-2">
                    {history === null ? <p className="p-3 text-[13.5px] text-faint">Loading…</p> : history.length ? history.map((item) => {
                        const s = STATUS[item.status] || STATUS.ok;
                        return (
                            <button key={item._id} onClick={() => onShowRun(item)} className="flex w-full items-center gap-3 rounded-lg px-2.5 py-1.5 text-left hover:bg-white/[0.04]">
                                <Icon name={s.icon} className={`text-[17px] ${s.tone}`} />
                                <Avatar user={item.user} size="h-5 w-5 text-[9.5px]" />
                                <span className="min-w-0 flex-1 truncate text-[13.5px] text-zinc-300">{item.user?.fullName} · <span className={s.tone}>{s.label}</span></span>
                                <span className="font-mono text-[12.5px] text-faint">{item.timeMs} ms · {item.runner === "docker" ? "sandbox" : "browser"} · {timeAgo(item.createdAt)}</span>
                            </button>
                        );
                    }) : <p className="p-3 text-[13.5px] text-faint">No runs of this file yet.</p>}
                </div>
            )}
        </div>
    );
}
