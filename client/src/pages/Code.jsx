import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import Editor from "@monaco-editor/react";
import { api } from "../api/client";
import { useToast } from "../context/ToastContext";
import useApi from "../utils/useApi";
import { Empty, ErrorText, Field, Icon, Input, Modal, PageSkeleton, Popover, Select } from "../components/ui";
import { formatSize, timeAgo } from "../utils/format";
import { STARTER_FILES, buildTree, fileType, vscodeUrl } from "../utils/codeFiles";

const POLL_MS = 15000;

// Editor colours matched to the CollabOS palette.
function defineTheme(monaco) {
    monaco.editor.defineTheme("collabos", {
        base: "vs-dark",
        inherit: true,
        rules: [
            { token: "comment", foreground: "6b6b76", fontStyle: "italic" },
            { token: "keyword", foreground: "c4b5fd" },
            { token: "string", foreground: "86efac" },
            { token: "number", foreground: "fbbf24" },
            { token: "type", foreground: "5ee0ff" }
        ],
        colors: {
            "editor.background": "#0d0d10",
            "editor.lineHighlightBackground": "#ffffff08",
            "editorLineNumber.foreground": "#3f3f48",
            "editorLineNumber.activeForeground": "#a8a4ff",
            "editorCursor.foreground": "#a8a4ff",
            "editor.selectionBackground": "#a8a4ff33",
            "editorIndentGuide.background1": "#1f1f25",
            "editorWidget.background": "#141418",
            "editorSuggestWidget.background": "#141418",
            "scrollbarSlider.background": "#ffffff14"
        }
    });
}

function FileIcon({ path, className = "" }) {
    const { badge, color } = fileType(path);
    return <span className={`w-6 shrink-0 text-center font-mono text-[9px] font-bold ${color} ${className}`}>{badge}</span>;
}

// ---------- Explorer ----------

function TreeNode({ node, depth, activeId, dirtyIds, onOpen, onNewIn, onRename, onDelete, canEdit, collapsed, toggle }) {
    const folders = Object.values(node.folders).sort((a, b) => a.name.localeCompare(b.name));
    const files = [...node.files].sort((a, b) => a.path.localeCompare(b.path));
    const pad = { paddingLeft: 8 + depth * 14 };

    return (
        <>
            {folders.map((folder) => {
                const closed = collapsed.has(folder.path);
                return (
                    <div key={folder.path}>
                        <div className="group flex items-center rounded-md hover:bg-white/[0.04]" style={pad}>
                            <button onClick={() => toggle(folder.path)} className="flex min-w-0 flex-1 items-center gap-1 py-1 text-left text-[13px] text-zinc-300">
                                <Icon name={closed ? "chevron_right" : "expand_more"} className="text-base text-faint" />
                                <Icon name={closed ? "folder" : "folder_open"} className="text-base text-primary/80" fill />
                                <span className="truncate">{folder.name}</span>
                            </button>
                            {canEdit && (
                                <button onClick={() => onNewIn(folder.path)} className="mr-1 hidden h-6 w-6 items-center justify-center rounded text-faint group-hover:flex hover:bg-white/[0.08] hover:text-white" aria-label={`New file in ${folder.name}`}>
                                    <Icon name="add" className="text-base" />
                                </button>
                            )}
                        </div>
                        {!closed && <TreeNode node={folder} depth={depth + 1} {...{ activeId, dirtyIds, onOpen, onNewIn, onRename, onDelete, canEdit, collapsed, toggle }} />}
                    </div>
                );
            })}
            {files.map((file) => {
                const name = file.path.split("/").pop();
                const active = file._id === activeId;
                return (
                    <div key={file._id} className={`group flex items-center rounded-md ${active ? "bg-primary/12" : "hover:bg-white/[0.04]"}`} style={{ paddingLeft: 8 + depth * 14 + 18 }}>
                        <button onClick={() => onOpen(file)} className={`flex min-w-0 flex-1 items-center gap-1 py-1 text-left text-[13px] ${active ? "text-white" : "text-zinc-400 group-hover:text-zinc-200"}`}>
                            <FileIcon path={file.path} />
                            <span className="truncate">{name}</span>
                            {dirtyIds.has(file._id) && <span className="ml-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
                        </button>
                        {canEdit && (
                            <div className="mr-1 hidden gap-0.5 group-hover:flex">
                                <button onClick={() => onRename(file)} className="flex h-6 w-6 items-center justify-center rounded text-faint hover:bg-white/[0.08] hover:text-white" aria-label={`Rename ${name}`}><Icon name="edit" className="text-[15px]" /></button>
                                <button onClick={() => onDelete(file)} className="flex h-6 w-6 items-center justify-center rounded text-faint hover:bg-danger/15 hover:text-danger" aria-label={`Delete ${name}`}><Icon name="delete" className="text-[15px]" /></button>
                            </div>
                        )}
                    </div>
                );
            })}
        </>
    );
}

// ---------- Page ----------

export default function Code() {
    const toast = useToast();
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
    const launcher = useRef(null);
    const [launcherOpen, setLauncherOpen] = useState(false);

    const files = useMemo(() => listing?.files || [], [listing]);
    const canEdit = listing?.canEdit;
    const active = activeId ? buffers[activeId] : null;
    const dirtyIds = useMemo(() => new Set(Object.entries(buffers).filter(([, b]) => b.draft !== b.saved).map(([id]) => id)), [buffers]);

    const loadListing = useCallback(async () => {
        if (!projectId) return;
        try {
            setListing(await api(`/projects/${projectId}/code`));
        } catch (e) {
            setError(e.message);
        }
    }, [projectId]);

    // Switching project: reset the workspace.
    useEffect(() => {
        setListing(null);
        setBuffers({});
        setTabs([]);
        setActiveId(null);
        setError("");
        loadListing();
    }, [loadListing]);

    // Check for teammates' changes every 15 seconds.
    useEffect(() => {
        const timer = setInterval(loadListing, POLL_MS);
        return () => clearInterval(timer);
    }, [loadListing]);

    // A teammate saved an open file I haven't touched: quietly pull their version.
    useEffect(() => {
        files.forEach((f) => {
            const b = buffers[f._id];
            if (b && b.version !== f.updatedAt && b.draft === b.saved && !b.loading) {
                api(`/projects/${projectId}/code/${f._id}`).then(({ file }) => {
                    setBuffers((prev) => ({ ...prev, [f._id]: { ...prev[f._id], saved: file.content, draft: file.content, version: file.updatedAt, updatedBy: file.updatedBy, path: file.path } }));
                    toast.info(`${file.updatedBy?.fullName} updated ${file.path}`);
                }).catch(() => {});
            }
        });
        // Close tabs of files that no longer exist.
        const ids = new Set(files.map((f) => f._id));
        setTabs((t) => (listing ? t.filter((id) => ids.has(id)) : t));
    }, [files]);

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
            const { file: full } = await api(`/projects/${projectId}/code/${file._id}`);
            setBuffers((prev) => ({ ...prev, [file._id]: { saved: full.content, draft: full.content, version: full.updatedAt, updatedBy: full.updatedBy, path: full.path } }));
        } catch (e) {
            toast.error("Couldn't open file", e.message);
        }
    };

    const closeTab = (id) => {
        if (dirtyIds.has(id) && !confirm("This file has unsaved changes. Close it anyway?")) return;
        const next = tabs.filter((t) => t !== id);
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
            const { file } = await api(`/projects/${projectId}/code/${id}`, { method: "PUT", body: { content: b.draft, baseVersion: b.version, force } });
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
            return createFiles([{ path, content: "" }]);
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
        return <Empty icon="code" title="No projects yet">Join or create a project to start writing code with your team.</Empty>;
    }

    const tree = buildTree(files);
    const usage = listing?.usage;
    const usagePct = usage ? Math.min(100, (usage.used / usage.limit) * 100) : 0;
    const lang = active?.path ? fileType(active.path).language : null;

    return (
        <div className="flex h-[calc(100vh-7.5rem)] min-h-[560px] flex-col">
            {/* Toolbar */}
            <div className="mb-3 flex flex-wrap items-center gap-2">
                <div className="mr-1 flex items-center gap-2">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/12 text-primary"><Icon name="code" /></span>
                    <h1 className="text-lg font-semibold tracking-tight text-white">Code</h1>
                </div>
                <div className="w-64">
                    <Select value={projectId} onChange={(id) => setParams({ project: id })} ariaLabel="Project"
                        options={projects.map((p) => ({ value: p._id, label: p.name, icon: "folder", hint: p.isMember ? undefined : "view only" }))} className="h-9" />
                </div>
                <div className="ml-auto flex items-center gap-2">
                    {active && !active.loading && <button onClick={download} className="btn-ghost btn-sm" title="Download this file"><Icon name="download" className="text-[18px]" /></button>}
                    <button ref={launcher} onClick={() => setLauncherOpen((o) => !o)} className="btn-secondary btn-sm">
                        <Icon name="open_in_new" className="text-[18px]" />Open in VS Code<Icon name="expand_more" className="text-base" />
                    </button>
                    <Popover anchorRef={launcher} open={launcherOpen} onClose={() => setLauncherOpen(false)} align="end" width={300}>
                        <a href="https://vscode.dev" target="_blank" rel="noreferrer" onClick={() => setLauncherOpen(false)} className="flex items-start gap-3 rounded-lg p-2.5 hover:bg-white/[0.05]">
                            <Icon name="terminal" className="mt-0.5 text-accent" />
                            <span><span className="block text-sm text-white">VS Code for the Web</span><span className="block text-xs text-faint">Open vscode.dev in a new tab</span></span>
                        </a>
                        {project?.repoUrl ? (
                            <a href={vscodeUrl(project.repoUrl)} target="_blank" rel="noreferrer" onClick={() => setLauncherOpen(false)} className="flex items-start gap-3 rounded-lg p-2.5 hover:bg-white/[0.05]">
                                <Icon name="hub" className="mt-0.5 text-primary" />
                                <span className="min-w-0"><span className="block text-sm text-white">Open project repository</span><span className="block truncate text-xs text-faint">{project.repoUrl.replace("https://", "")}</span></span>
                            </a>
                        ) : (
                            <Link to={`/projects/${projectId}`} onClick={() => setLauncherOpen(false)} className="flex items-start gap-3 rounded-lg p-2.5 hover:bg-white/[0.05]">
                                <Icon name="link" className="mt-0.5 text-faint" />
                                <span><span className="block text-sm text-zinc-300">Link a GitHub repository</span><span className="block text-xs text-faint">Add it in the project's Edit dialog to open it in VS Code</span></span>
                            </Link>
                        )}
                        <p className="border-t border-line-soft px-2.5 pt-2 pb-1 text-[11px] text-faint">VS Code online opens in its own tab; Microsoft doesn't allow it to be embedded in other sites.</p>
                    </Popover>
                    {canEdit && (
                        <button onClick={() => save()} disabled={!active || saving || !dirtyIds.has(activeId)} className="btn-primary btn-sm">
                            <Icon name={saving ? "progress_activity" : "save"} className={`text-[18px] ${saving ? "animate-spin" : ""}`} />Save
                            <kbd className="ml-1 rounded bg-black/15 px-1 font-mono text-[10px]">Ctrl S</kbd>
                        </button>
                    )}
                </div>
            </div>
            <ErrorText>{error}</ErrorText>

            {/* Workspace */}
            <div className="card flex min-h-0 flex-1 overflow-hidden">
                {/* Explorer */}
                <aside className="flex w-44 shrink-0 flex-col border-r border-line-soft bg-sidebar/70 md:w-60">
                    <div className="flex items-center justify-between px-3 pt-3 pb-2">
                        <span className="font-mono text-[10px] uppercase tracking-[.2em] text-faint">Explorer</span>
                        {canEdit && (
                            <button onClick={() => setDialog({ kind: "new", value: "" })} className="flex h-7 w-7 items-center justify-center rounded-md text-faint hover:bg-white/[0.06] hover:text-white" aria-label="New file">
                                <Icon name="note_add" className="text-[18px]" />
                            </button>
                        )}
                    </div>
                    <div className="flex-1 overflow-y-auto px-1.5 pb-3">
                        {!listing ? <div className="space-y-2 p-2">{[0, 1, 2, 3].map((i) => <div key={i} className="h-5 animate-pulse rounded bg-white/[0.05]" />)}</div>
                            : files.length ? (
                                <TreeNode node={tree} depth={0} activeId={activeId} dirtyIds={dirtyIds} onOpen={openFile} canEdit={canEdit}
                                    onNewIn={(folder) => setDialog({ kind: "new", value: `${folder}/` })}
                                    onRename={(file) => setDialog({ kind: "rename", file, value: file.path })}
                                    onDelete={removeFile} collapsed={collapsed} toggle={toggleFolder} />
                            ) : (
                                <div className="px-3 py-6 text-center">
                                    <p className="text-[13px] text-muted">No files yet.</p>
                                    {canEdit && (
                                        <>
                                            <button onClick={() => createFiles(STARTER_FILES)} className="btn-secondary btn-sm mt-3 w-full"><Icon name="auto_awesome" className="text-base" />Starter files</button>
                                            <button onClick={() => setDialog({ kind: "new", value: "" })} className="btn-ghost btn-sm mt-1 w-full">New file</button>
                                        </>
                                    )}
                                </div>
                            )}
                    </div>
                    {usage && (
                        <div className="border-t border-line-soft px-3 py-2.5">
                            <div className="flex justify-between font-mono text-[10px] text-faint"><span>Storage</span><span>{formatSize(usage.used)} / {formatSize(usage.limit)}</span></div>
                            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/[0.06]"><div className={`h-full rounded-full ${usagePct > 85 ? "bg-danger" : "bg-primary"}`} style={{ width: `${Math.max(usagePct, 1)}%` }} /></div>
                        </div>
                    )}
                </aside>

                {/* Editor */}
                <section className="flex min-w-0 flex-1 flex-col">
                    {tabs.length > 0 && (
                        <div className="flex overflow-x-auto border-b border-line-soft bg-sidebar/40">
                            {tabs.map((id) => {
                                const b = buffers[id];
                                const path = b?.path || files.find((f) => f._id === id)?.path || "";
                                const isActive = id === activeId;
                                return (
                                    <div key={id} className={`group relative flex shrink-0 items-center gap-1.5 border-r border-line-soft py-2 pr-2 pl-3 text-[13px] ${isActive ? "bg-[#0d0d10] text-white" : "text-muted hover:text-zinc-200"}`}>
                                        {isActive && <span className="absolute inset-x-0 top-0 h-0.5 bg-primary" />}
                                        <button onClick={() => setActiveId(id)} className="flex items-center gap-1"><FileIcon path={path} />{path.split("/").pop()}</button>
                                        <button onClick={() => closeTab(id)} className="flex h-5 w-5 items-center justify-center rounded hover:bg-white/[0.08]" aria-label={`Close ${path}`}>
                                            {dirtyIds.has(id) ? <span className="h-2 w-2 rounded-full bg-primary group-hover:hidden" /> : null}
                                            <Icon name="close" className={`text-[14px] ${dirtyIds.has(id) ? "hidden group-hover:block" : ""}`} />
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {active?.path && tabs.length > 0 && (
                        <div className="flex items-center gap-1 border-b border-line-soft px-4 py-1.5 font-mono text-[11px] text-faint">
                            {active.path.split("/").map((part, i, all) => (
                                <span key={i} className="flex items-center gap-1">{part}{i < all.length - 1 && <Icon name="chevron_right" className="text-[12px]" />}</span>
                            ))}
                            {!canEdit && <span className="chip ml-auto py-0 text-[10px]">Read only</span>}
                        </div>
                    )}

                    <div className="relative min-h-0 flex-1 bg-[#0d0d10]">
                        {active && !active.loading ? (
                            <Editor
                                key={activeId}
                                theme="collabos"
                                beforeMount={defineTheme}
                                path={`${projectId}/${active.path}`}
                                language={lang}
                                value={active.draft}
                                onChange={(value) => setBuffers((prev) => ({ ...prev, [activeId]: { ...prev[activeId], draft: value ?? "" } }))}
                                onMount={(editor, monaco) => {
                                    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => saveRef.current());
                                    editor.onDidChangeCursorPosition((e) => setCursor({ line: e.position.lineNumber, col: e.position.column }));
                                    editor.focus();
                                }}
                                loading={<div className="flex h-full items-center justify-center text-sm text-faint">Loading editor…</div>}
                                options={{
                                    readOnly: !canEdit,
                                    fontFamily: "'Geist Mono', ui-monospace, monospace",
                                    fontSize: 13.5,
                                    lineHeight: 22,
                                    fontLigatures: true,
                                    minimap: { enabled: true, scale: 1 },
                                    smoothScrolling: true,
                                    cursorBlinking: "smooth",
                                    cursorSmoothCaretAnimation: "on",
                                    bracketPairColorization: { enabled: true },
                                    renderLineHighlight: "all",
                                    padding: { top: 14 },
                                    scrollBeyondLastLine: false,
                                    tabSize: 2,
                                    automaticLayout: true
                                }}
                            />
                        ) : (
                            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                                <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/25 to-accent/10 text-primary"><Icon name="code_blocks" className="text-3xl" /></span>
                                <p className="text-sm font-medium text-zinc-200">{active?.loading ? "Opening…" : "Open a file from the explorer"}</p>
                                <p className="max-w-xs text-xs text-faint">Files are shared with everyone in <span className="text-zinc-300">{project?.name}</span>. Save with <kbd className="kbd">Ctrl S</kbd>.</p>
                            </div>
                        )}
                    </div>

                    {/* Status bar */}
                    <div className="flex items-center gap-4 border-t border-line-soft bg-sidebar/70 px-3 py-1.5 font-mono text-[11px] text-faint">
                        {active && !active.loading ? (
                            <>
                                <span className={dirtyIds.has(activeId) ? "text-primary" : "text-success"}>
                                    {dirtyIds.has(activeId) ? "● Unsaved changes" : "✓ Saved"}
                                </span>
                                {active.updatedBy && <span className="hidden sm:inline">Last saved by {active.updatedBy.fullName} · {timeAgo(active.version)}</span>}
                                <span className="ml-auto">Ln {cursor.line}, Col {cursor.col}</span>
                                <span>{formatSize(new Blob([active.draft]).size)}</span>
                                <span className="capitalize">{lang}</span>
                            </>
                        ) : <span>{files.length} file{files.length === 1 ? "" : "s"} · {project?.name}</span>}
                    </div>
                </section>
            </div>

            {/* New file / rename */}
            <Modal open={Boolean(dialog)} onClose={() => setDialog(null)} title={dialog?.kind === "rename" ? "Rename file" : "New file"}
                description="Use slashes for folders, e.g. src/components/Navbar.jsx">
                {dialog && (
                    <form onSubmit={submitDialog} className="space-y-4">
                        <Field label="Path" error={dialog.error}>
                            <Input icon="description" value={dialog.value} onChange={(e) => setDialog({ ...dialog, value: e.target.value, error: "" })} placeholder="src/app.js" required autoFocus aria-label="File path" />
                        </Field>
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
                    <p className="text-[13px] text-muted">Keep your version (theirs will be replaced), or load theirs and lose your unsaved edits.</p>
                    <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                        <button onClick={takeTheirs} className="btn-secondary"><Icon name="download" className="text-[18px]" />Load their version</button>
                        <button onClick={() => save(true)} className="btn-primary"><Icon name="save" className="text-[18px]" />Keep mine & overwrite</button>
                    </div>
                </div>
            </Modal>
        </div>
    );
}
