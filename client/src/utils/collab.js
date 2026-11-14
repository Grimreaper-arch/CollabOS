// Live collaborative editing for one code file.
//
// The file's text lives in a Yjs document: a data structure (a "CRDT") built so that several
// people can type at the same time and everyone ends up with exactly the same text, whatever
// order the edits arrive in. Each edit is sent to the others through Socket.io as a small binary
// "update"; cursor positions travel separately as "awareness".
//
//   CollabDoc.join()            asks the server for the shared document
//   CollabDoc.bind(editor)      connects it to a Monaco editor (text both ways + coloured cursors)
//   CollabDoc.destroy()         leaves the file
import * as Y from "yjs";
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate, removeAwarenessStates } from "y-protocols/awareness";

const COLORS = ["#f472b6", "#38bdf8", "#34d399", "#fbbf24", "#fb7185", "#a78bfa", "#2dd4bf", "#f97316"];
export function colorFor(id) {
    let hash = 0;
    for (const ch of String(id)) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
    return COLORS[hash % COLORS.length];
}

const bytes = (data) => new Uint8Array(data);

export class CollabDoc {
    constructor({ socket, projectId, fileId, user, onText, onPeers }) {
        Object.assign(this, { socket, projectId, fileId, user, onText, onPeers });
        this.doc = new Y.Doc();
        this.text = this.doc.getText("content");
        this.awareness = new Awareness(this.doc);
        this.awareness.setLocalStateField("user", { id: user._id, name: user.fullName, color: colorFor(user._id) });
        this.canEdit = false;
        this.joined = false;
        this.unbind = null;

        // My edits go to the server; every change (mine or theirs) updates the page's copy of the text.
        this.doc.on("update", (update, origin) => {
            if (origin !== "remote") this.socket.emit("code:update", { fileId, update });
            this.onText?.(this.text.toString());
        });
        this.awareness.on("update", ({ added, updated, removed }, origin) => {
            if (origin === "local") this.socket.emit("code:awareness", { fileId, update: encodeAwarenessUpdate(this.awareness, [this.doc.clientID]) });
            if (added.length || removed.length || updated.length) this.emitPeers();
        });

        this.handlers = {
            "code:update": ({ fileId: id, update }) => id === fileId && Y.applyUpdate(this.doc, bytes(update), "remote"),
            "code:awareness": ({ fileId: id, update }) => id === fileId && applyAwarenessUpdate(this.awareness, bytes(update), "remote"),
            // Someone opened the file: tell them where my cursor is.
            "code:peer-joined": ({ fileId: id }) => id === fileId && this.socket.emit("code:awareness", { fileId, update: encodeAwarenessUpdate(this.awareness, [this.doc.clientID]) }),
            "code:peer-left": ({ fileId: id, clientId }) => id === fileId && removeAwarenessStates(this.awareness, [clientId], "remote"),
            // After the connection drops and comes back, rejoin and merge what each side has.
            connect: () => this.joined && this.join().catch(() => {})
        };
        Object.entries(this.handlers).forEach(([event, handler]) => socket.on(event, handler));
    }

    // Other people in the file: [{ id, name, color }]
    emitPeers() {
        const seen = new Map();
        this.awareness.getStates().forEach((state, clientId) => {
            if (clientId !== this.doc.clientID && state.user) seen.set(state.user.id, state.user);
        });
        this.onPeers?.([...seen.values()].filter((u) => u.id !== this.user._id));
    }

    join() {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error("Live editing didn't respond.")), 4000);
            this.socket.emit("code:join", {
                projectId: this.projectId, fileId: this.fileId, clientId: this.doc.clientID,
                // On a reconnect, send what I have so nothing typed while offline is lost.
                state: this.joined ? Y.encodeStateAsUpdate(this.doc) : undefined
            }, (reply) => {
                clearTimeout(timer);
                if (reply?.error) return reject(new Error(reply.error));
                Y.applyUpdate(this.doc, bytes(reply.state), "remote");
                this.canEdit = reply.canEdit;
                this.joined = true;
                resolve(this);
            });
        });
    }

    // Connects the shared text to a Monaco editor. Returns a function that disconnects it.
    bind(editor, monaco) {
        this.unbind?.();
        const model = editor.getModel();
        const { text, awareness, doc } = this;
        const origin = { binding: true };
        let applying = false;

        model.setEOL(monaco.editor.EndOfLineSequence.LF);
        applying = true;
        if (model.getValue() !== text.toString()) model.setValue(text.toString());
        applying = false;

        // Their edits → my editor.
        const fromShared = (event, transaction) => {
            if (transaction.origin === origin) return;
            applying = true;
            let index = 0;
            event.delta.forEach((op) => {
                if (op.retain !== undefined) {
                    index += op.retain;
                } else if (op.insert !== undefined) {
                    const at = model.getPositionAt(index);
                    model.applyEdits([{ range: new monaco.Range(at.lineNumber, at.column, at.lineNumber, at.column), text: op.insert }]);
                    index += op.insert.length;
                } else if (op.delete !== undefined) {
                    const from = model.getPositionAt(index);
                    const to = model.getPositionAt(index + op.delete);
                    model.applyEdits([{ range: new monaco.Range(from.lineNumber, from.column, to.lineNumber, to.column), text: "" }]);
                }
            });
            applying = false;
            drawCursors();
        };
        text.observe(fromShared);

        // My typing → the shared text.
        const typing = model.onDidChangeContent((event) => {
            if (applying) return;
            doc.transact(() => {
                [...event.changes].sort((a, b) => b.rangeOffset - a.rangeOffset).forEach((change) => {
                    if (change.rangeLength) text.delete(change.rangeOffset, change.rangeLength);
                    if (change.text) text.insert(change.rangeOffset, change.text.replace(/\r\n?/g, "\n"));
                });
                // Safety net: if the two ever disagree, make the shared text match the editor.
                const mine = model.getValue();
                const shared = text.toString();
                if (mine !== shared) {
                    let start = 0;
                    while (start < mine.length && start < shared.length && mine[start] === shared[start]) start++;
                    let end = 0;
                    while (end < mine.length - start && end < shared.length - start && mine[mine.length - 1 - end] === shared[shared.length - 1 - end]) end++;
                    text.delete(start, shared.length - start - end);
                    text.insert(start, mine.slice(start, mine.length - end));
                }
            }, origin);
        });

        // My cursor → everyone else. Positions are stored relative to the text, so they stay in
        // the right place when other people insert or delete above them.
        const sendCursor = () => {
            const selection = editor.getSelection();
            if (!selection) return;
            const offset = (line, column) => model.getOffsetAt({ lineNumber: line, column });
            const backwards = selection.getDirection() === monaco.SelectionDirection.RTL;
            let anchor = offset(selection.startLineNumber, selection.startColumn);
            let head = offset(selection.endLineNumber, selection.endColumn);
            if (backwards) [anchor, head] = [head, anchor];
            awareness.setLocalStateField("selection", {
                anchor: Y.relativePositionToJSON(Y.createRelativePositionFromTypeIndex(text, anchor)),
                head: Y.relativePositionToJSON(Y.createRelativePositionFromTypeIndex(text, head))
            });
        };
        const cursorMoved = editor.onDidChangeCursorSelection(sendCursor);
        const blurred = editor.onDidBlurEditorWidget(() => awareness.setLocalStateField("selection", null));

        // Everyone else's cursors → coloured carets, selections and name tags in my editor.
        const decorations = editor.createDecorationsCollection();
        const style = document.head.appendChild(document.createElement("style"));
        const drawCursors = () => {
            const css = [];
            const list = [];
            awareness.getStates().forEach((state, clientId) => {
                if (clientId === doc.clientID || !state.selection || !state.user) return;
                const anchor = Y.createAbsolutePositionFromRelativePosition(Y.createRelativePositionFromJSON(state.selection.anchor), doc);
                const head = Y.createAbsolutePositionFromRelativePosition(Y.createRelativePositionFromJSON(state.selection.head), doc);
                if (!anchor || !head || anchor.type !== text || head.type !== text) return;
                const from = model.getPositionAt(Math.min(anchor.index, head.index));
                const to = model.getPositionAt(Math.max(anchor.index, head.index));
                const caret = model.getPositionAt(head.index);
                const { color, name } = state.user;
                css.push(
                    `.collab-sel-${clientId}{background:${color}40}`,
                    `.collab-caret-${clientId}{border-left:2px solid ${color}}`,
                    `.collab-caret-${clientId}::after{content:${JSON.stringify(String(name).split(" ")[0])};background:${color}}`
                );
                if (anchor.index !== head.index) {
                    list.push({ range: new monaco.Range(from.lineNumber, from.column, to.lineNumber, to.column), options: { className: `collab-sel-${clientId}` } });
                }
                list.push({
                    range: new monaco.Range(caret.lineNumber, caret.column, caret.lineNumber, caret.column),
                    options: { beforeContentClassName: `collab-caret collab-caret-${clientId}`, stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges }
                });
            });
            style.textContent = css.join("\n");
            decorations.set(list);
        };
        awareness.on("change", drawCursors);
        drawCursors();
        if (editor.hasTextFocus()) sendCursor();

        this.unbind = () => {
            text.unobserve(fromShared);
            typing.dispose();
            cursorMoved.dispose();
            blurred.dispose();
            awareness.off("change", drawCursors);
            awareness.setLocalStateField("selection", null);
            decorations.clear();
            style.remove();
            this.unbind = null;
        };
        return this.unbind;
    }

    destroy() {
        this.unbind?.();
        Object.entries(this.handlers).forEach(([event, handler]) => this.socket.off(event, handler));
        if (this.joined) this.socket.emit("code:leave", { fileId: this.fileId });
        this.joined = false;
        this.awareness.destroy();
        this.doc.destroy();
    }
}
