// Runs JavaScript and Python inside the browser, in a Web Worker (a separate thread that can't
// touch the page, the login token or the network of CollabOS). Nothing is sent to the server, so
// it is free, works for everyone and can't harm the computer that hosts CollabOS.
//   JavaScript: the browser's own engine.
//   Python:     Pyodide, the real CPython interpreter compiled to WebAssembly (downloaded once
//               from a CDN, then cached by the browser).
// C, C++ and Java go to the server's Docker runner instead (see Code.jsx).

const PYODIDE = "https://cdn.jsdelivr.net/pyodide/v0.27.7/full/";
const TIME_LIMIT_MS = 10000;
const MAX_OUTPUT = 64 * 1024;

export const BROWSER_LANGUAGES = ["javascript", "python"];
export const SERVER_LANGUAGES = ["c", "cpp", "java"];
export const RUNNABLE = [...BROWSER_LANGUAGES, ...SERVER_LANGUAGES];

// ---- JavaScript worker ----
// console.log → output. prompt(), readline() and input() read the next line of the Input box.
const JS_WORKER = `
const lines = [];
let next = 0, pending = 0, finished = false;
const show = (v) => {
    if (typeof v === "string") return v;
    if (v instanceof Error) return v.stack || String(v);
    if (typeof v === "function") return v.toString();
    try { return JSON.stringify(v, (k, x) => (typeof x === "bigint" ? x + "n" : x), 2) ?? String(v); } catch { return String(v); }
};
const out = (stream) => (...args) => postMessage({ stream, text: args.map(show).join(" ") + "\\n" });
self.console = { log: out("stdout"), info: out("stdout"), debug: out("stdout"), table: out("stdout"), warn: out("stderr"), error: out("stderr") };
self.prompt = self.readline = self.input = () => (next < lines.length ? lines[next++] : null);
// The program is over when the main code and every timer it started have finished.
const check = () => { if (finished && pending === 0) postMessage({ done: true, ok: true }); };
const nativeTimeout = self.setTimeout, nativeClear = self.clearTimeout;
const live = new Set();
self.setTimeout = (fn, ms, ...a) => { pending++; const id = nativeTimeout(() => { live.delete(id); try { fn(...a); } catch (e) { fail(e); } pending--; check(); }, ms); live.add(id); return id; };
self.clearTimeout = (id) => { if (live.delete(id)) { pending--; nativeClear(id); check(); } };
const fail = (e) => { postMessage({ stream: "stderr", text: (e && e.stack ? e.stack : String(e)) + "\\n" }); postMessage({ done: true, ok: false }); };
self.onunhandledrejection = (e) => fail(e.reason);
self.onmessage = async ({ data }) => {
    lines.push(...data.stdin.split("\\n"));
    try {
        const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
        await new AsyncFunction(data.source)();
        finished = true;
        check();
    } catch (e) { fail(e); }
};
`;

// ---- Python worker ----
// Loaded once and reused, so only the first run waits for the download. Each run gets fresh variables.
const PY_WORKER = `
importScripts("${PYODIDE}pyodide.js");
let pyodide = null, lines = [], next = 0;
const decoder = new TextDecoder();
const writer = (stream) => ({ write: (buffer) => { postMessage({ stream, text: decoder.decode(buffer, { stream: true }) }); return buffer.length; } });
const ready = (async () => {
    pyodide = await loadPyodide({ indexURL: "${PYODIDE}" });
    pyodide.setStdout(writer("stdout"));
    pyodide.setStderr(writer("stderr"));
    pyodide.setStdin({ stdin: () => (next < lines.length ? lines[next++] : null) });
})();
self.onmessage = async ({ data }) => {
    try {
        await ready;
        lines = data.stdin.split("\\n"); next = 0;
        // Downloads numpy, pandas... if the program imports them.
        await pyodide.loadPackagesFromImports(data.source, { messageCallback: () => {} });
        postMessage({ started: true });
        const globals = pyodide.toPy({ __name__: "__main__" });
        try { await pyodide.runPythonAsync(data.source, { globals, filename: "main.py" }); } finally { globals.destroy(); }
        postMessage({ done: true, ok: true });
    } catch (e) {
        // Hide Pyodide's own frames; show the traceback from the user's file down.
        const text = String(e && e.message ? e.message : e);
        const at = text.indexOf('  File "main.py"');
        postMessage({ stream: "stderr", text: (at > 0 ? "Traceback (most recent call last):\\n" + text.slice(at) : text) + "\\n" });
        postMessage({ done: true, ok: false });
    }
};
`;

const makeWorker = (code) => new Worker(URL.createObjectURL(new Blob([code], { type: "text/javascript" })));

let pythonWorker = null; // kept warm between runs

// Runs `source` and resolves with { status, stdout, stderr, exitCode, timeMs }.
// onOutput(stream, text) is called as output appears; onStatus(text) for "Loading Python…".
// `signal` (an AbortSignal) stops the program.
export function runInBrowser({ language, source, stdin = "", onOutput = () => {}, onStatus = () => {}, signal }) {
    return new Promise((resolve) => {
        const python = language === "python";
        let worker;
        try {
            worker = python ? (pythonWorker ??= makeWorker(PY_WORKER)) : makeWorker(JS_WORKER);
        } catch (e) {
            return resolve({ status: "runtime_error", stdout: "", stderr: `Couldn't start the runner: ${e.message}`, exitCode: 1, timeMs: 0 });
        }
        let stdout = "", stderr = "", size = 0, started = python ? null : performance.now(), timer = null, settled = false;

        const finish = (status, extra = "") => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            signal?.removeEventListener("abort", stop);
            // A stopped or crashed worker can't be reused; a healthy Python one is kept for the next run.
            if (!python || status === "timeout" || status === "stopped") {
                worker.terminate();
                if (python) pythonWorker = null;
            } else {
                worker.onmessage = worker.onerror = null;
            }
            if (extra) { stderr += extra; onOutput("stderr", extra); }
            resolve({
                status: status === "stopped" ? "runtime_error" : status,
                stdout, stderr,
                exitCode: status === "ok" ? 0 : 1,
                timeMs: started === null ? 0 : Math.round(performance.now() - started)
            });
        };
        const stop = () => finish("stopped", "\nStopped.\n");
        const startTimer = () => { timer = setTimeout(() => finish("timeout", `\nTime limit exceeded (${TIME_LIMIT_MS / 1000} seconds).\n`), TIME_LIMIT_MS); };

        worker.onmessage = ({ data }) => {
            if (data.started) { started = performance.now(); onStatus(""); startTimer(); }
            if (data.stream) {
                size += data.text.length;
                if (size > MAX_OUTPUT) return finish("runtime_error", `\nOutput limit reached (${MAX_OUTPUT / 1024} KB). Stopped.\n`);
                if (data.stream === "stdout") stdout += data.text; else stderr += data.text;
                onOutput(data.stream, data.text);
            }
            if (data.done) finish(data.ok ? "ok" : "runtime_error");
        };
        worker.onerror = (e) => {
            if (python) pythonWorker = null;
            finish("runtime_error", python && !started ? "Couldn't load Python. Check your internet connection and try again.\n" : `${e.message}\n`);
        };
        signal?.addEventListener("abort", stop);

        if (python) onStatus("Starting Python (the first run downloads it, about 10 MB)…");
        else startTimer();
        worker.postMessage({ source, stdin });
    });
}
