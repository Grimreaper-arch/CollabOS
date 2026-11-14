import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Editor from "@monaco-editor/react";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { useLiveReload, useRealtime, useSocketEvent } from "../context/RealtimeContext";
import useApi from "../utils/useApi";
import CodeRunPanel from "../components/CodeRunPanel";
import { Empty, ErrorText, Field, Icon, Input, Kbd, Modal, PageSkeleton, Select, Tooltip } from "../components/ui";
import { formatSize, timeAgo } from "../utils/format";
import { RUN_LANGUAGE_NAMES, buildTree, fileType, runLanguageOf } from "../utils/codeFiles";
import { STARTER_FILES, TEMPLATES, sampleInput } from "../utils/codeTemplates";
import { BROWSER_LANGUAGES, runInBrowser } from "../utils/runners";
import { CollabDoc, colorFor } from "../utils/collab";
import { PLAN_LIMIT_EVENT } from "../utils/plans";

const POLL_MS = 15000;

// Editor colours matched to the CollabOS palette.
function defineTheme(monaco) {
    monaco.editor.defineTheme("collabos", {
        base: "vs-dark",
        inherit: true,
        rules: [
            { token: "comment", foreground: "5d7073", fontStyle: "italic" },
            { token: "keyword", foreground: "4fd6c6" },
            { token: "string", foreground: "8fdcae" },
            { token: "number", foreground: "e2b565" },
            { token: "type", foreground: "8fbbd8" },
            { token: "delimiter", foreground: "9db0b2" },
            { token: "identifier", foreground: "dbe4e3" }
        ],
        colors: {
            "editor.background": "#0a1012",
            "editor.foreground": "#dbe4e3",
            "editor.lineHighlightBackground": "#36c6b50d",
            "editor.lineHighlightBorder": "#00000000",
            "editorLineNumber.foreground": "#3a4b4e",
            "editorLineNumber.activeForeground": "#36c6b5",
            "editorCursor.foreground": "#36c6b5",
            "editor.selectionBackground": "#36c6b533",
            "editor.inactiveSelectionBackground": "#36c6b51f",
            "editorIndentGuide.background1": "#172124",
            "editorIndentGuide.activeBackground1": "#2b393d",
            "editorBracketMatch.background": "#36c6b522",
            "editorBracketMatch.border": "#36c6b566",
            "editorWidget.background": "#131c1f",
            "editorWidget.border": "#2b393d",
            "editorSuggestWidget.background": "#131c1f",
            "editorSuggestWidget.selectedBackground": "#36c6b522",
            "editorGutter.background": "#0a1012",
            "minimap.background": "#0a1012",
            "scrollbarSlider.background": "#ffffff12",
            "scrollbarSlider.hoverBackground": "#ffffff20"
        }
    });
}

function FileIcon({ path, className = "" }) {
    const { badge, color } = fileType(path);
    return <span className={`flex h-4 w-6 shrink-0 items-center justify-center rounded-[3px] bg-white/[0.05] font-mono text-[10px] font-bold ${color} ${className}`}>{badge}</span>;
}

// ---------- Explorer ----------

function TreeNode({ node, depth, activeId, dirtyIds, presence, onOpen, onNewIn, onRename, onDelete, canEdit, collapsed, toggle }) {
    const folders = Object.values(node.folders).sort((a, b) => a.name.localeCompare(b.name));
    const files = [...node.files].sort((a, b) => a.path.localeCompare(b.path));
    const pad = { paddingLeft: 8 + depth * 14 };

    return (
        <>
            {folders.map((folder) => {
                const closed = collapsed.has(folder.path);
                return (
                    <div key={folder.path}>
                        <div className="group flex items-center rounded-md transition-colors hover:bg-white/[0.045]" style={pad}>
                            <button onClick={() => toggle(folder.path)} className="flex min-w-0 flex-1 items-center gap-1 py-1 text-left text-[14.5px] text-zinc-300">
                                <Icon name={closed ? "chevron_right" : "expand_more"} className="text-[17px] text-faint" />
                                <Icon name={closed ? "folder" : "folder_open"} className="text-[17px] text-steel" fill />
                                <span className="truncate">{folder.name}</span>
                            </button>
                            {canEdit && (
                                <button onClick={() => onNewIn(folder.path)} className="mr-1 hidden h-6 w-6 items-center justify-center rounded text-faint group-hover:flex hover:bg-white/[0.08] hover:text-white" aria-label={`New file in ${folder.name}`}>
                                    <Icon name="add" className="text-[17px]" />
                                </button>
                            )}
                        </div>
                        {!closed && <TreeNode node={folder} depth={depth + 1} {...{ activeId, dirtyIds, presence, onOpen, onNewIn, onRename, onDelete, canEdit, collapsed, toggle }} />}
                    </div>
                );
            })}
            {files.map((file) => {
                const name = file.path.split("/").pop();
                const active = file._id === activeId;
                return (
                    <div key={file._id} className={`group relative flex items-center rounded-md transition-colors ${active ? "bg-accent/[0.11]" : "hover:bg-white/[0.045]"}`} style={{ paddingLeft: 8 + depth * 14 + 18 }}>
                        <button onClick={() => onOpen(file)} className={`flex min-w-0 flex-1 items-center gap-1.5 py-[5px] text-left text-[14.5px] ${active ? "font-medium text-white" : "text-zinc-400 group-hover:text-zinc-200"}`}>
                            <FileIcon path={file.path} />
                            <span className="truncate">{name}</span>
                            {dirtyIds.has(file._id) && <span className="ml-1 h-1.5 w-1.5 shrink-0 rounded-full bg-warning" title="Unsaved changes" />}
                            {/* Coloured dots: teammates who have this file open right now */}
                            <span className="ml-auto flex shrink-0 gap-0.5 pr-1 group-hover:hidden">
                                {(presence[file._id] || []).slice(0, 3).map((u) => <span key={u.userId} title={`${u.name} is in this file`} className="h-2 w-2 rounded-full" style={{ background: colorFor(u.userId) }} />)}
                            </span>
                        </button>
                        {canEdit && (
                            <div className="mr-1 hidden gap-0.5 group-hover:flex">
                                <button onClick={() => onRename(file)} className="flex h-6 w-6 items-center justify-center rounded text-faint hover:bg-white/[0.08] hover:text-white" aria-label={`Rename ${name}`}><Icon name="edit" className="text-[16px]" /></button>
                                <button onClick={() => onDelete(file)} className="flex h-6 w-6 items-center justify-center rounded text-faint hover:bg-danger/15 hover:text-danger" aria-label={`Delete ${name}`}><Icon name="delete" className="text-[16px]" /></button>
                            </div>
                        )}
                    </div>
                );
            })}
        </>
    );
}

// ---------- Page ----------

const EMPTY_RUN = { running: false, status: "", chunks: [], result: null, viewing: null };

export default function Code() {
    const toast = useToast();
    const { user } = useAuth();
    const { socket } = useRealtime();
    const [params, setParams] = useSearchParams();
    const projectsApi = useApi("/projects");
    const projects = useMemo(() => projectsApi.data?.projects || [], [projectsApi.data]);
    const projectId = params.get("project") || (projects.find((p) => p.isMember) || projects[0])?._id || "";
    const project = projects.find((p) => p._id === projectId);

    const [listing, setListing] = useState(null);       // { files, canEdit, usage }
    const [buffers, setBuffers] = useState({});          // fileId → { saved, draft, version, updatedBy, path }
    const [tabs, setTabs] = useState([]);                // open file ids
    const [activeId, setActiveId] = useState(null);
    const [cursor, setCursor] = useState({ line: 1, col: 1 });
    const [collapsed, setCollapsed] = useState(new Set());
    const [dialog, setDialog] = useState(null);          // { kind: "new"|"rename", ... }
    const [conflict, setConflict] = useState(null);      // { file, mine }
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    // Live editing: one shared document per open file (see utils/collab.js).
    const collabs = useRef({});                           // fileId → CollabDoc
    const editorRef = useRef(null);
    const [peers, setPeers] = useState({});               // fileId → people typing in it with me
    const [presence, setPresence] = useState({});         // fileId → people who have it open (explorer dots)

    // Running code.
    const [runner, setRunner] = useState(null);           // { docker, limit, usedToday }
    const [panel, setPanel] = useState(false);
    const [panelTab, setPanelTab] = useState("output");
    const [run, setRun] = useState(EMPTY_RUN);
    const [stdins, setStdins] = useState({});             // file path → text for the Input tab
    const [history, setHistory] = useState(null);
    const stopRun = useRef(null);

    const files = useMemo(() => listing?.files || [], [listing]);
    const canEdit = listing?.canEdit;
    const active = activeId ? buffers[activeId] : null;
    const dirtyIds = useMemo(() => new Set(Object.entries(buffers).filter(([, b]) => b.draft !== b.saved).map(([id]) => id)), [buffers]);

    const loadListing = useCallback(async () => {
        if (!projectId) return;
        try {
            const data = await api(`/projects/${projectId}/code`);
            setListing(data);
            setPresence(data.presence || {});
        } catch (e) {
            setError(e.message);
        }
    }, [projectId]);

    const leaveAll = () => {
        Object.values(collabs.current).forEach((c) => c.destroy());
        collabs.current = {};
        stopRun.current?.abort();
    };
    useEffect(() => leaveAll, []);

    // Switching project: reset the workspace.
    useEffect(() => {
        setListing(null);
        setBuffers({});
        setTabs([]);
        setActiveId(null);
        setError("");
        setPeers({});
        setRun(EMPTY_RUN);
        setRunner(null);
        leaveAll();
        loadListing();
        if (projectId) api(`/projects/${projectId}/code/runner`).then(setRunner).catch(() => {});
    }, [loadListing]); // eslint-disable-line react-hooks/exhaustive-deps

    // Files created, renamed or deleted by teammates show up straight away.
    useLiveReload(loadListing, projectId);
    useSocketEvent("code:presence", ({ fileId, users }) => setPresence((prev) => ({ ...prev, [fileId]: users })));
    // Someone saved a file we're editing together: it's no longer "unsaved" for anyone.
    useSocketEvent("code:saved", ({ fileId, version, updatedBy, content }) => {
        setBuffers((prev) => (prev[fileId] ? { ...prev, [fileId]: { ...prev[fileId], saved: content, version, updatedBy } } : prev));
    });

    // Fallback check for teammates' changes every 15 seconds.
    useEffect(() => {
        const timer = setInterval(loadListing, POLL_MS);
        return () => clearInterval(timer);
    }, [loadListing]);

    // A teammate saved an open file I haven't touched: quietly pull their version.
    useEffect(() => {
        files.forEach((f) => {
            const b = buffers[f._id];
            if (b && !b.live && b.version !== f.updatedAt && b.draft === b.saved && !b.loading) {
                api(`/projects/${projectId}/code/${f._id}`).then(({ file }) => {
                    setBuffers((prev) => ({ ...prev, [f._id]: { ...prev[f._id], saved: file.content, draft: file.content, version: file.updatedAt, updatedBy: file.updatedBy, path: file.path } }));
                    toast.info(`${file.updatedBy?.fullName} updated ${file.path}`);
                }).catch(() => {});
            }
        });
        // Close tabs of files that no longer exist.
        const ids = new Set(files.map((f) => f._id));
        if (listing) {
            Object.keys(collabs.current).filter((id) => !ids.has(id)).forEach((id) => { collabs.current[id].destroy(); delete collabs.current[id]; });
            setTabs((t) => t.filter((id) => ids.has(id)));
            if (activeId && !ids.has(activeId)) setActiveId(null);
        }
    }, [files]); // eslint-disable-line react-hooks/exhaustive-deps

    // Switching tabs: disconnect the shared document from the old editor.
    useEffect(() => () => { try { collabs.current[activeId]?.unbind?.(); } catch { /* editor already gone */ } }, [activeId]);

    // Warn before leaving with unsaved changes.
    useEffect(() => {
        if (!dirtyIds.size) return;
        const warn = (e) => { e.preventDefault(); e.returnValue = ""; };
        window.addEventListener("beforeunload", warn);
        return () => window.removeEventListener("beforeunload", warn);
    }, [dirtyIds]);

    const openFile = async (file) => {
        setTabs((t) => (t.includes(file._id) ? t : [...t, file._id]));
        setActiveId(file._id);
        if (buffers[file._id]) return;
        setBuffers((prev) => ({ ...prev, [file._id]: { loading: true, path: file.path } }));
        try {
            const id = file._id;
            const { file: full } = await api(`/projects/${projectId}/code/${id}`);
            const content = full.content.replace(/\r\n?/g, "\n");
            // Join the file's live session. If that isn't possible (connection down), the file
            // still opens, just without live editing.
            let collab = null;
            if (socket?.connected) {
                collab = new CollabDoc({
                    socket, projectId, fileId: id, user,
                    onText: (text) => setBuffers((prev) => (prev[id] ? { ...prev, [id]: { ...prev[id], draft: text } } : prev)),
                    onPeers: (list) => setPeers((prev) => ({ ...prev, [id]: list }))
                });
                try {
                    await collab.join();
                    collabs.current[id]?.destroy();
                    collabs.current[id] = collab;
                } catch {
                    collab.destroy();
                    collab = null;
                }
            }
            setBuffers((prev) => ({ ...prev, [id]: { saved: content, draft: collab ? collab.text.toString() : content, version: full.updatedAt, updatedBy: full.updatedBy, path: full.path, live: Boolean(collab), liveEdit: collab?.canEdit } }));
        } catch (e) {
            toast.error("Couldn't open file", e.message);
        }
    };

    const closeTab = (id) => {
        if (dirtyIds.has(id) && !confirm("This file has unsaved changes. Close it anyway?")) return;
        const next = tabs.filter((t) => t !== id);
        collabs.current[id]?.destroy();
        delete collabs.current[id];
        setTabs(next);
        setBuffers((prev) => { const copy = { ...prev }; delete copy[id]; return copy; });
        if (activeId === id) setActiveId(next[next.length - 1] || null);
    };

    const save = useCallback(async (force = false) => {
        const id = activeId;
        const b = buffers[id];
        if (!id || !b || b.loading || (!force && b.draft === b.saved)) return;
        setSaving(true);
        try {
            // In a live session everyone already shares the same text, so there is nothing to conflict with.
            const { file } = await api(`/projects/${projectId}/code/${id}`, { method: "PUT", body: { content: b.draft, baseVersion: b.version, force: force || b.live, live: b.live } });
            setBuffers((prev) => ({ ...prev, [id]: { ...prev[id], saved: b.draft, version: file.updatedAt, updatedBy: file.updatedBy } }));
            setConflict(null);
            loadListing();
        } catch (e) {
            if (e.message.includes("newer version")) {
                const { file } = await api(`/projects/${projectId}/code/${id}`);
                setConflict({ file, mine: b.draft });
            } else {
                toast.error("Couldn't save", e.message);
            }
        } finally {
            setSaving(false);
        }
    }, [activeId, buffers, projectId, loadListing, toast]);

    // Monaco's Ctrl+S binding is registered once, so it calls the latest save through a ref.
    const saveRef = useRef(save);
    useEffect(() => { saveRef.current = save; }, [save]);

    // ---------- Running ----------

    const runLanguage = runLanguageOf(active?.path);
    const stdin = active?.path ? stdins[active.path] ?? sampleInput(active.path.split("/").pop()) : "";

    const loadHistory = useCallback((path) => {
        if (!path) return;
        setHistory(null);
        api(`/projects/${projectId}/code/runs?path=${encodeURIComponent(path)}`).then((d) => setHistory(d.runs)).catch(() => setHistory([]));
    }, [projectId]);

    useEffect(() => { if (panel && panelTab === "history") loadHistory(active?.path); }, [panel, panelTab, active?.path, loadHistory]);
    // A different file: its own output.
    useEffect(() => { setRun((r) => (r.running ? r : EMPTY_RUN)); }, [activeId]);

    const runCode = useCallback(async () => {
        const b = buffers[activeId];
        const language = runLanguageOf(b?.path);
        if (!b || b.loading || run.running) return;
        setPanel(true);
        setPanelTab("output");
        if (!language) return setRun({ ...EMPTY_RUN, chunks: [{ stream: "info", text: "This file type can't be run. Runnable: .js, .py, .c, .cpp, .java\n" }] });
        if (runner && runner.limit !== null && runner.usedToday >= runner.limit) {
            window.dispatchEvent(new CustomEvent(PLAN_LIMIT_EVENT, { detail: `Your plan allows ${runner.limit} code runs a day, and they've been used. Upgrade for more.` }));
            return;
        }
        const source = b.draft;
        const input = stdins[b.path] ?? sampleInput(b.path.split("/").pop());
        const append = (stream, text) => setRun((r) => ({ ...r, chunks: [...r.chunks, { stream, text }] }));
        setRun({ ...EMPTY_RUN, running: true });

        let result;
        try {
            if (BROWSER_LANGUAGES.includes(language)) {
                const controller = new AbortController();
                stopRun.current = controller;
                result = await runInBrowser({ language, source, stdin: input, signal: controller.signal, onOutput: append, onStatus: (status) => setRun((r) => ({ ...r, status })) });
                // Kept in the run history (and counted against the plan), like server runs.
                api(`/projects/${projectId}/code/runs`, { method: "POST", body: { ...result, path: b.path, language, stdin: input } }).catch(() => {});
            } else {
                setRun((r) => ({ ...r, status: `Compiling and running ${RUN_LANGUAGE_NAMES[language]}…` }));
                result = (await api(`/projects/${projectId}/code/run`, { method: "POST", body: { path: b.path, language, source, stdin: input } })).run;
                if (result.stdout) append("stdout", result.stdout);
                if (result.stderr) append(["unavailable", "preparing", "busy"].includes(result.status) ? "info" : "stderr", `${result.stderr}\n`);
            }
        } catch (e) {
            result = { status: "runtime_error", exitCode: null, timeMs: 0, stderr: e.message };
            append("stderr", `${e.message}\n`);
        }
        stopRun.current = null;
        setRun((r) => ({ ...r, running: false, status: "", result }));
        setRunner((prev) => (prev && !["unavailable", "preparing", "busy"].includes(result.status) ? { ...prev, usedToday: prev.usedToday + 1 } : prev));
    }, [activeId, buffers, run.running, runner, stdins, projectId]);

    const runRef = useRef(runCode);
    useEffect(() => { runRef.current = runCode; }, [runCode]);

    const showPastRun = (item) => {
        setRun({ ...EMPTY_RUN, viewing: item, result: item, chunks: [item.stdout && { stream: "stdout", text: item.stdout }, item.stderr && { stream: "stderr", text: item.stderr }].filter(Boolean) });
        setPanelTab("output");
    };

    // Hands the code (and the error, if the last run failed) to the AI assistant panel.
    const askAi = (kind) => {
        if (!active?.path) return;
        const code = active.draft.slice(0, 6000);
        const fence = "```";
        const errors = run.chunks.filter((c) => c.stream === "stderr").map((c) => c.text).join("").slice(0, 2000);
        const prompt = kind === "fix"
            ? `My ${RUN_LANGUAGE_NAMES[runLanguage] || ""} program \`${active.path}\` failed. Explain what went wrong in simple terms and show the corrected code.\n\nError:\n${fence}\n${errors}\n${fence}\n\nCode:\n${fence}\n${code}\n${fence}`
            : `Explain what \`${active.path}\` does, step by step, and point out any bugs or improvements.\n\n${fence}\n${code}\n${fence}`;
        window.dispatchEvent(new CustomEvent("collabos:ask-ai", { detail: { prompt } }));
    };

    const takeTheirs = () => {
        const { file } = conflict;
        setBuffers((prev) => ({ ...prev, [file._id]: { ...prev[file._id], saved: file.content, draft: file.content, version: file.updatedAt, updatedBy: file.updatedBy } }));
        setConflict(null);
    };

    const createFiles = async (list) => {
        try {
            let last = null;
            for (const f of list) last = (await api(`/projects/${projectId}/code`, { method: "POST", body: f })).file;
            await loadListing();
            if (last) openFile(last);
            toast.success(list.length === 1 ? `Created ${list[0].path}` : `Created ${list.length} files`);
        } catch (e) {
            toast.error("Couldn't create file", e.message);
        }
    };

    const submitDialog = async (event) => {
        event.preventDefault();
        const path = dialog.value.trim();
        if (dialog.kind === "new") {
            setDialog(null);
            if (dialog.template?.stdin) setStdins((prev) => ({ ...prev, [path]: dialog.template.stdin }));
            return createFiles([{ path, content: dialog.template?.content || "" }]);
        }
        try {
            const { file } = await api(`/projects/${projectId}/code/${dialog.file._id}`, { method: "PUT", body: { path } });
            setBuffers((prev) => (prev[file._id] ? { ...prev, [file._id]: { ...prev[file._id], path: file.path, version: file.updatedAt } } : prev));
            setDialog(null);
            loadListing();
            toast.success("Renamed", file.path);
        } catch (e) {
            setDialog({ ...dialog, error: e.message });
        }
    };

    const removeFile = async (file) => {
        if (!confirm(`Delete ${file.path}? Your teammates will lose it too.`)) return;
        try {
            await api(`/projects/${projectId}/code/${file._id}`, { method: "DELETE" });
            collabs.current[file._id]?.destroy();
            delete collabs.current[file._id];
            setTabs((t) => t.filter((id) => id !== file._id));
            if (activeId === file._id) setActiveId(null);
            loadListing();
            toast.success("Deleted", file.path);
        } catch (e) {
            toast.error("Couldn't delete", e.message);
        }
    };

    const download = () => {
        const url = URL.createObjectURL(new Blob([active.draft], { type: "text/plain" }));
        Object.assign(document.createElement("a"), { href: url, download: active.path.split("/").pop() }).click();
        URL.revokeObjectURL(url);
    };

    const toggleFolder = (path) => setCollapsed((prev) => {
        const next = new Set(prev);
        if (next.has(path)) next.delete(path); else next.add(path);
        return next;
    });

    if (projectsApi.loading) return <PageSkeleton />;
    if (!projects.length) {
        return <div className="card"><Empty icon="code" title="No projects yet">Each project has its own code workspace. Join or create a project to start writing code with your team.</Empty></div>;
    }

    const tree = buildTree(files);
    const usage = listing?.usage;
    const usagePct = usage ? Math.min(100, (usage.used / usage.limit) * 100) : 0;
    const lang = active?.path ? fileType(active.path).language : null;
    const editable = active?.live ? active.liveEdit : canEdit;
    const together = (activeId && peers[activeId]) || [];
    const dockerOff = runner && !runner.docker.available;

    return (
        <div className="flex h-[calc(100dvh-6.5rem)] min-h-[560px] flex-col -mb-[4.5rem] lg:h-[calc(100dvh-7rem)]">
            {/* Toolbar */}
            <div className="mb-3 flex flex-wrap items-center gap-2">
                <h1 className="mr-1 text-[22px] font-semibold text-ink">Code</h1>
                <div className="w-64">
                    <Select value={projectId} onChange={(id) => setParams({ project: id })} ariaLabel="Project workspace"
                        options={projects.map((p) => ({ value: p._id, label: p.name, icon: "folder", hint: p.isMember ? undefined : "view only" }))} />
                </div>
                {together.length > 0 && (
                    <span className="hidden items-center gap-1.5 text-[13.5px] text-muted md:inline-flex">
                        <span className="flex -space-x-1.5">{together.slice(0, 4).map((p) => <span key={p.id} className="flex h-6 w-6 items-center justify-center rounded-full text-[11.5px] font-bold text-[#06100f] ring-2 ring-page" style={{ background: p.color }} title={`${p.name} is editing this file with you`}>{p.name[0]}</span>)}</span>
                        editing with you
                    </span>
                )}
                <div className="ml-auto flex items-center gap-1.5">
                    {active && !active.loading && <Tooltip label="Download this file"><button onClick={download} className="btn-icon" aria-label="Download this file"><Icon name="download" /></button></Tooltip>}
                    {active && !active.loading && <button onClick={() => askAi("explain")} className="btn-ghost btn-sm" title="Ask the assistant to explain this file"><Icon name="auto_awesome" fill className="text-[16px] text-accent" />Explain</button>}
                    <span className="mx-0.5 hidden h-5 w-px bg-line sm:block" aria-hidden="true" />
                    {canEdit && (
                        <button onClick={() => save()} disabled={!active || saving || !dirtyIds.has(activeId)} className="btn-secondary btn-sm" title="Save (Ctrl+S)">
                            <Icon name={saving ? "progress_activity" : "save"} className={`text-[17px] ${saving ? "animate-spin" : ""}`} />Save
                            <span className="hidden sm:inline"><Kbd>Ctrl S</Kbd></span>
                        </button>
                    )}
                    {run.running ? (
                        <button onClick={() => stopRun.current?.abort()} disabled={!stopRun.current} className="btn-danger btn-sm"><Icon name="stop" fill className="text-[17px]" />Stop</button>
                    ) : (
                        <button onClick={runCode} disabled={!active || active.loading || !runLanguage || !canEdit} className="btn-primary btn-sm"
                            title={!active ? "Open a file to run it" : !runLanguage ? "Runnable: .js, .py, .c, .cpp, .java" : !canEdit ? "Only people in this project can run code" : `Run ${RUN_LANGUAGE_NAMES[runLanguage]} (Ctrl+Enter)`}>
                            <Icon name="play_arrow" fill className="text-[18px]" />Run
                            <span className="hidden rounded bg-black/15 px-1 text-[12px] font-medium sm:inline">Ctrl ↵</span>
                        </button>
                    )}
                </div>
            </div>
            <ErrorText>{error}</ErrorText>

            {/* Workspace */}
            <div className="card flex min-h-0 flex-1 overflow-hidden shadow-[0_20px_50px_-30px_rgb(0_0_0/0.8)]">
                {/* Explorer */}
                <aside className="flex w-44 shrink-0 flex-col border-r border-line-soft bg-sidebar/70 md:w-60" aria-label="File explorer">
                    <div className="flex h-10 shrink-0 items-center justify-between border-b border-line-soft pr-1.5 pl-3">
                        <span className="eyebrow truncate">Explorer</span>
                        {canEdit && (
                            <span className="flex">
                                <Tooltip label="New file"><button onClick={() => setDialog({ kind: "new", value: "" })} className="btn-icon h-7 w-7" aria-label="New file"><Icon name="note_add" className="text-[18px]" /></button></Tooltip>
                                <Tooltip label="New folder"><button onClick={() => setDialog({ kind: "new", value: "", folder: true })} className="btn-icon h-7 w-7" aria-label="New folder"><Icon name="create_new_folder" className="text-[18px]" /></button></Tooltip>
                            </span>
                        )}
                    </div>
                    <p className="flex items-center gap-1.5 truncate px-3 pt-2.5 pb-1.5 text-[13.5px] font-semibold text-zinc-200"><Icon name="expand_more" className="text-[16px] text-faint" /><span className="truncate uppercase">{project?.name}</span></p>
                    <div className="flex-1 overflow-y-auto px-1.5 pb-3">
                        {!listing ? <div className="space-y-2 p-2">{[0, 1, 2, 3].map((i) => <div key={i} className="h-5 animate-pulse rounded bg-white/[0.05]" />)}</div>
                            : files.length ? (
                                <TreeNode node={tree} depth={0} activeId={activeId} dirtyIds={dirtyIds} presence={Object.fromEntries(Object.entries(presence).map(([id, users]) => [id, users.filter((u) => u.userId !== user._id)]))} onOpen={openFile} canEdit={canEdit}
                                    onNewIn={(folder) => setDialog({ kind: "new", value: `${folder}/` })}
                                    onRename={(file) => setDialog({ kind: "rename", file, value: file.path })}
                                    onDelete={removeFile} collapsed={collapsed} toggle={toggleFolder} />
                            ) : (
                                <div className="px-3 py-6 text-center">
                                    <Icon name="folder_off" className="text-[24px] text-faint" />
                                    <p className="mt-2 text-[14.5px] font-medium text-zinc-200">No files yet</p>
                                    <p className="mt-0.5 text-[13.5px] text-faint">{canEdit ? "Start with a sample or a blank file." : "Nothing has been added to this workspace."}</p>
                                    {canEdit && (
                                        <>
                                            <button onClick={() => createFiles(STARTER_FILES)} className="btn-secondary btn-sm mt-3 w-full"><Icon name="bolt" className="text-[17px] text-accent" />Add starter files</button>
                                            <button onClick={() => setDialog({ kind: "new", value: "" })} className="btn-ghost btn-sm mt-1 w-full">New file</button>
                                        </>
                                    )}
                                </div>
                            )}
                    </div>
                    {usage && (
                        <div className="border-t border-line-soft px-3 py-2.5" title="Code storage used by this project">
                            <div className="flex items-center justify-between text-[12.5px] text-faint"><span className="flex items-center gap-1"><Icon name="database" className="text-[14.5px]" />Storage</span><span className="tabular-nums">{formatSize(usage.used)} / {formatSize(usage.limit)}</span></div>
                            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/[0.06]"><div className={`h-full rounded-full ${usagePct > 85 ? "bg-danger" : "bg-gradient-to-r from-accent to-success"}`} style={{ width: `${Math.max(usagePct, 1)}%` }} /></div>
                        </div>
                    )}
                </aside>

                {/* Editor */}
                <section className="flex min-w-0 flex-1 flex-col">
                    {tabs.length > 0 && (
                        <div className="flex h-10 shrink-0 overflow-x-auto overflow-y-hidden border-b border-line-soft bg-sidebar/50" role="tablist">
                            {tabs.map((id) => {
                                const b = buffers[id];
                                const path = b?.path || files.find((f) => f._id === id)?.path || "";
                                const isActive = id === activeId;
                                return (
                                    <div key={id} className={`group relative flex shrink-0 items-center gap-1.5 border-r border-line-soft pr-2 pl-3 text-[14.5px] transition-colors ${isActive ? "bg-[#0a1012] text-white" : "text-muted hover:bg-white/[0.03] hover:text-zinc-200"}`}>
                                        {isActive && <span className="absolute inset-x-0 top-0 h-0.5 bg-accent" />}
                                        <button onClick={() => setActiveId(id)} role="tab" aria-selected={isActive} className="flex h-full items-center gap-1.5"><FileIcon path={path} />{path.split("/").pop()}</button>
                                        <button onClick={() => closeTab(id)} className="flex h-5 w-5 items-center justify-center rounded hover:bg-white/[0.08]" aria-label={`Close ${path}`}>
                                            {dirtyIds.has(id) ? <span className="h-2 w-2 rounded-full bg-warning group-hover:hidden" /> : null}
                                            <Icon name="close" className={`text-[15px] ${dirtyIds.has(id) ? "hidden group-hover:block" : ""}`} />
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {active?.path && tabs.length > 0 && (
                        <div className="flex h-8 shrink-0 items-center gap-1 border-b border-line-soft bg-[#0a1012] px-4 font-mono text-[12.5px] text-faint">
                            {active.path.split("/").map((part, i, all) => (
                                <span key={i} className="flex items-center gap-1">{part}{i < all.length - 1 && <Icon name="chevron_right" className="text-[13.5px]" />}</span>
                            ))}
                            <span className="ml-auto flex items-center gap-2 font-sans">
                                {active.live
                                    ? <span className="badge badge-green py-0 text-[12px]" title="Edits appear for everyone as you type"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" />Live</span>
                                    : !active.loading && <span className="text-[11.5px] text-faint" title="Reconnecting; your edits are saved with Ctrl+S">Offline editing</span>}
                                {!editable && <span className="badge py-0 text-[12px]"><Icon name="lock" className="text-[12.5px]" />Read only</span>}
                            </span>
                        </div>
                    )}

                    <div className="relative min-h-0 flex-1 bg-[#0a1012]">
                        {active && !active.loading ? (
                            <Editor
                                key={activeId}
                                theme="collabos"
                                beforeMount={defineTheme}
                                path={`${projectId}/${active.path}`}
                                language={lang}
                                // Live files get their text from the shared document (bound in onMount);
                                // otherwise the editor is driven by React state as usual.
                                {...(active.live ? {} : {
                                    value: active.draft,
                                    onChange: (value) => setBuffers((prev) => ({ ...prev, [activeId]: { ...prev[activeId], draft: value ?? "" } }))
                                })}
                                onMount={(editor, monaco) => {
                                    editorRef.current = editor;
                                    if (active.live) collabs.current[activeId]?.bind(editor, monaco);
                                    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => saveRef.current());
                                    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => runRef.current());
                                    editor.onDidChangeCursorPosition((e) => setCursor({ line: e.position.lineNumber, col: e.position.column }));
                                    editor.focus();
                                }}
                                loading={<div className="flex h-full items-center justify-center text-[15px] text-faint">Loading editor…</div>}
                                options={{
                                    readOnly: !editable,
                                    fontFamily: "'Geist Mono', ui-monospace, monospace",
                                    fontSize: 14.5,
                                    lineHeight: 23,
                                    fontLigatures: true,
                                    minimap: { enabled: true, scale: 1, renderCharacters: false },
                                    guides: { indentation: true, bracketPairs: true },
                                    lineNumbersMinChars: 4,
                                    roundedSelection: true,
                                    smoothScrolling: true,
                                    cursorBlinking: "smooth",
                                    cursorSmoothCaretAnimation: "on",
                                    bracketPairColorization: { enabled: true },
                                    renderLineHighlight: "all",
                                    padding: { top: 14, bottom: 14 },
                                    scrollBeyondLastLine: false,
                                    tabSize: 2,
                                    automaticLayout: true
                                }}
                            />
                        ) : (
                            <div className="flex h-full flex-col items-center justify-center px-6 text-center">
                                <span className="tile tile-teal h-14 w-14 rounded-2xl"><Icon name="terminal" className="text-[30px]" /></span>
                                <p className="mt-4 text-[17px] font-semibold text-ink">{active?.loading ? "Opening…" : `${project?.name || "Code"} workspace`}</p>
                                <p className="mt-1 max-w-sm text-[14.5px] text-muted">Pick a file in the explorer to start. Everyone in the project edits the same files, live, and can run them here.</p>
                                <dl className="mt-5 grid w-full max-w-xs grid-cols-[1fr_auto] gap-x-6 gap-y-2 rounded-xl border border-line bg-white/[0.02] p-4 text-left text-[14px]">
                                    <dt className="text-muted">Save the file</dt><dd><Kbd>Ctrl S</Kbd></dd>
                                    <dt className="text-muted">Run the file</dt><dd><Kbd>Ctrl Enter</Kbd></dd>
                                    <dt className="text-muted">Ask the assistant</dt><dd><Kbd>Ctrl J</Kbd></dd>
                                </dl>
                                {canEdit && !active?.loading && <button onClick={() => setDialog({ kind: "new", value: "" })} className="btn-secondary btn-sm mt-4"><Icon name="note_add" className="text-[17px]" />New file</button>}
                            </div>
                        )}
                    </div>

                    {panel && (
                        <CodeRunPanel tab={panelTab} setTab={setPanelTab} run={run} canRun={Boolean(runLanguage)}
                            stdin={stdin} setStdin={(text) => active?.path && setStdins((prev) => ({ ...prev, [active.path]: text }))}
                            history={history} onShowRun={showPastRun}
                            onReuseInput={(text) => { setStdins((prev) => ({ ...prev, [active.path]: text })); setPanelTab("input"); }}
                            onAskAi={() => askAi("fix")} onClose={() => setPanel(false)} usage={runner} />
                    )}

                    {/* Status bar */}
                    <div className="flex h-8 shrink-0 items-center gap-4 overflow-hidden border-t border-line-soft bg-sidebar/80 px-3 whitespace-nowrap text-[13px] text-faint">
                        {active && !active.loading ? (
                            <>
                                <span className={`flex items-center gap-1.5 ${dirtyIds.has(activeId) ? "text-warning" : "text-success"}`}>
                                    <Icon name={dirtyIds.has(activeId) ? "edit" : "check_circle"} className="text-[14.5px]" />{dirtyIds.has(activeId) ? "Unsaved changes" : "Saved"}
                                </span>
                                {active.updatedBy && <span className="hidden truncate lg:inline">Last saved by {active.updatedBy.fullName} · {timeAgo(active.version)}</span>}
                                <button onClick={() => setPanel((o) => !o)} className="ml-auto flex items-center gap-1 transition-colors hover:text-white" aria-pressed={panel}><Icon name="terminal" className="text-[14.5px]" />{panel ? "Hide" : "Show"} output</button>
                                {runLanguage && <span className={`hidden items-center gap-1 sm:flex ${BROWSER_LANGUAGES.includes(runLanguage) ? "" : dockerOff ? "text-warning" : "text-success"}`} title={BROWSER_LANGUAGES.includes(runLanguage) ? "Runs in your browser" : dockerOff ? "Needs Docker Desktop running on the host computer" : "Runs in a sandbox on the server"}>
                                    <span className={`h-1.5 w-1.5 rounded-full ${BROWSER_LANGUAGES.includes(runLanguage) ? "bg-steel" : dockerOff ? "bg-warning" : "bg-success"}`} />
                                    {BROWSER_LANGUAGES.includes(runLanguage) ? "Runs in browser" : dockerOff ? "Sandbox offline" : "Sandbox ready"}
                                </span>}
                                <span className="hidden tabular-nums lg:inline">Ln {cursor.line}, Col {cursor.col}</span>
                                <span className="hidden tabular-nums xl:inline">{formatSize(new Blob([active.draft]).size)}</span>
                                <span className="font-medium text-zinc-300 capitalize">{lang}</span>
                            </>
                        ) : <span>{files.length} file{files.length === 1 ? "" : "s"} · {project?.name}</span>}
                    </div>
                </section>
            </div>

            {/* New file / rename */}
            <Modal open={Boolean(dialog)} onClose={() => setDialog(null)} title={dialog?.kind === "rename" ? "Rename file" : dialog?.folder ? "New folder" : "New file"}
                description="Use slashes for folders, e.g. src/components/Navbar.jsx. A folder is created with its first file.">
                {dialog && (
                    <form onSubmit={submitDialog} className="space-y-4">
                        <Field label={dialog.folder ? "Folder and its first file" : "Path"} error={dialog.error} hint={dialog.folder ? "Folders exist as long as they hold a file, so name the first file too." : undefined}>
                            <Input icon="description" value={dialog.value} onChange={(e) => setDialog({ ...dialog, value: e.target.value, error: "" })} placeholder={dialog.folder ? "folder-name/first-file.py" : "src/main.py"} pattern={dialog.folder ? ".+/.+" : undefined} title={dialog.folder ? "Type the folder name, a slash, then its first file" : undefined} required autoFocus aria-label="File path" />
                        </Field>
                        {dialog.kind === "new" && (
                            <div>
                                <p className="label">Start from a template</p>
                                <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
                                    {TEMPLATES.map((t) => {
                                        const on = dialog.template?.id === t.id;
                                        const folder = dialog.value.includes("/") ? dialog.value.slice(0, dialog.value.lastIndexOf("/") + 1) : "";
                                        return (
                                            <button key={t.id} type="button" aria-pressed={on}
                                                onClick={() => setDialog({ ...dialog, template: on ? null : t, value: on ? dialog.value : `${folder}${t.path}`, error: "" })}
                                                className={`rounded-full border px-2.5 py-1 text-[13.5px] transition-colors ${on ? "border-accent/50 bg-accent/12 text-white" : "border-line text-muted hover:border-line-strong hover:text-zinc-200"}`}>
                                                <span className="text-faint">{t.language}</span> · {t.name}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                        <div className="flex justify-end gap-2">
                            <button type="button" onClick={() => setDialog(null)} className="btn-ghost">Cancel</button>
                            <button className="btn-primary">{dialog.kind === "rename" ? "Rename" : "Create file"}</button>
                        </div>
                    </form>
                )}
            </Modal>

            {/* Someone else saved first */}
            <Modal open={Boolean(conflict)} onClose={() => setConflict(null)} title="This file changed while you were editing"
                description={conflict ? `${conflict.file.updatedBy?.fullName || "A teammate"} saved ${conflict.file.path} ${timeAgo(conflict.file.updatedAt)}.` : ""}>
                <div className="space-y-4">
                    <p className="text-[14.5px] text-muted">Keep your version (theirs will be replaced), or load theirs and lose your unsaved edits.</p>
                    <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                        <button onClick={takeTheirs} className="btn-secondary"><Icon name="download" className="text-[17px]" />Load their version</button>
                        <button onClick={() => save(true)} className="btn-primary"><Icon name="save" className="text-[17px]" />Keep mine & overwrite</button>
                    </div>
                </div>
            </Modal>
        </div>
    );
}
