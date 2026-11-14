// Runs C, C++ and Java programs inside throwaway Docker containers.
// (JavaScript and Python run in the user's own browser instead; see client/src/utils/runners.js.)
//
// Every run gets a fresh container that is deleted afterwards, with:
//   --network none      no internet
//   --memory / --cpus   256 MB of RAM and one CPU core
//   --pids-limit        can't fork-bomb
//   --read-only         can't change the image; only a small in-memory /tmp is writable
//   a time limit        the container is killed after RUN_SECONDS
// The program never touches the laptop's own files: nothing is mounted. The source code and the
// input are sent through the container's stdin (two base64 lines), so it also works when Docker
// runs on another machine.
import { spawn } from "node:child_process";
import crypto from "node:crypto";

// DOCKER_BIN can replace the docker command (used by the tests).
const [DOCKER, ...DOCKER_PREFIX] = (process.env.DOCKER_BIN || "docker").split(" ");

export const MAX_SOURCE_BYTES = 200 * 1024;
export const MAX_STDIN_BYTES = 64 * 1024;
const MAX_OUTPUT_BYTES = 64 * 1024;
const COMPILE_SECONDS = 20;
const RUN_SECONDS = 5;
const MAX_PARALLEL = 2;

// `build` and `run` are shell commands executed inside the container, in /tmp/job.
export const DOCKER_LANGUAGES = {
    c: { name: "C", image: "gcc:14", file: "main.c", build: "gcc -O1 -o main main.c -lm", run: "./main" },
    cpp: { name: "C++", image: "gcc:14", file: "main.cpp", build: "g++ -O1 -std=c++17 -o main main.cpp", run: "./main" },
    java: { name: "Java", image: "eclipse-temurin:21-jdk", file: "Main.java", build: "", run: "java -Xmx128m Main.java" }
};

function docker(args, { input, timeoutMs = 15000 } = {}) {
    return new Promise((resolve) => {
        let stdout = "", stderr = "", done = false;
        let child;
        try {
            child = spawn(DOCKER, [...DOCKER_PREFIX, ...args], { windowsHide: true });
        } catch (error) {
            return resolve({ code: -1, stdout, stderr: error.message, failed: true });
        }
        const finish = (result) => { if (!done) { done = true; clearTimeout(timer); resolve({ stdout, stderr, ...result }); } };
        const timer = setTimeout(() => { child.kill(); finish({ code: -1, timedOut: true }); }, timeoutMs);
        const collect = (key) => (chunk) => {
            const text = chunk.toString("utf8");
            if (key === "stdout") { if (stdout.length < MAX_OUTPUT_BYTES * 2) stdout += text; } else if (stderr.length < MAX_OUTPUT_BYTES * 2) stderr += text;
        };
        child.stdout.on("data", collect("stdout"));
        child.stderr.on("data", collect("stderr"));
        child.on("error", (error) => finish({ code: -1, stderr: error.message, failed: true }));
        child.on("close", (code) => finish({ code }));
        if (input !== undefined) child.stdin.end(input); else child.stdin.end();
    });
}

// Is Docker running, and which compiler images are downloaded? Cached for 20 seconds.
let statusCache = { at: 0, value: null };
const pulling = new Set();

export async function runnerStatus() {
    if (Date.now() - statusCache.at < 20000 && statusCache.value) return statusCache.value;
    const version = await docker(["version", "--format", "{{.Server.Version}}"], { timeoutMs: 6000 });
    const available = version.code === 0 && Boolean(version.stdout.trim());
    const languages = {};
    for (const [id, lang] of Object.entries(DOCKER_LANGUAGES)) {
        const ready = available && (await docker(["image", "inspect", lang.image, "--format", "ok"], { timeoutMs: 6000 })).code === 0;
        languages[id] = { name: lang.name, ready, downloading: pulling.has(lang.image) };
    }
    statusCache = { at: Date.now(), value: { available, languages } };
    return statusCache.value;
}

// Downloads a compiler image in the background (hundreds of MB, first use only).
function pullImage(image) {
    if (pulling.has(image)) return;
    pulling.add(image);
    statusCache.at = 0;
    docker(["pull", image], { timeoutMs: 15 * 60 * 1000 }).then(() => { pulling.delete(image); statusCache.at = 0; });
}

let running = 0;

const clip = (text) => (text.length > MAX_OUTPUT_BYTES ? `${text.slice(0, MAX_OUTPUT_BYTES)}\n… output cut off after ${MAX_OUTPUT_BYTES / 1024} KB` : text);

// Runs one program. Returns { status, stdout, stderr, exitCode, timeMs }, where status is one of:
//   ok, runtime_error, compile_error, timeout, unavailable (Docker not running), preparing (image downloading), busy
export async function runInDocker({ language, source, stdin = "" }) {
    const lang = DOCKER_LANGUAGES[language];
    if (!lang) throw new Error(`Unsupported language: ${language}`);

    const status = await runnerStatus();
    if (!status.available) {
        return { status: "unavailable", stdout: "", stderr: `The ${lang.name} runner is offline. It needs Docker Desktop running on the computer that hosts CollabOS.`, exitCode: null, timeMs: 0 };
    }
    if (!status.languages[language].ready) {
        pullImage(lang.image);
        return { status: "preparing", stdout: "", stderr: `Downloading the ${lang.name} compiler for the first time. This takes a few minutes; try again shortly.`, exitCode: null, timeMs: 0 };
    }
    if (running >= MAX_PARALLEL) {
        return { status: "busy", stdout: "", stderr: "The runner is busy with other programs. Try again in a few seconds.", exitCode: null, timeMs: 0 };
    }

    const name = `collabos-run-${crypto.randomBytes(6).toString("hex")}`;
    // Inside the container: read the two base64 lines, write the files, compile, then run with a
    // time limit. Markers on stderr tell us which phase failed and how long the program took.
    const script = [
        "mkdir -p /tmp/job && cd /tmp/job",
        "IFS= read -r SRC; IFS= read -r INP",
        `printf '%s' "$SRC" | base64 -d > ${lang.file}`,
        "printf '%s' \"$INP\" | base64 -d > input.txt",
        "unset SRC INP",
        lang.build ? `if ! timeout ${COMPILE_SECONDS} ${lang.build} 2> build.log; then cat build.log >&2; echo __COLLABOS_COMPILE_ERROR__ >&2; exit 0; fi` : "true",
        "START=$(date +%s%N)",
        `timeout -s KILL ${RUN_SECONDS} ${lang.run} < input.txt; CODE=$?`,
        "END=$(date +%s%N)",
        "echo \"__COLLABOS_EXIT__ $CODE $(( (END - START) / 1000000 ))\" >&2"
    ].join("\n");

    const input = `${Buffer.from(source, "utf8").toString("base64")}\n${Buffer.from(stdin, "utf8").toString("base64")}\n`;
    const args = [
        "run", "--rm", "-i", "--name", name,
        "--network", "none", "--memory", "256m", "--memory-swap", "256m", "--cpus", "1", "--pids-limit", "128",
        "--read-only", "--tmpfs", "/tmp:rw,exec,size=64m", "--cap-drop", "ALL", "--security-opt", "no-new-privileges",
        "--user", "65534:65534", "-e", "HOME=/tmp",
        lang.image, "sh", "-c", script
    ];

    running += 1;
    const started = Date.now();
    let result;
    try {
        result = await docker(args, { input, timeoutMs: (COMPILE_SECONDS + RUN_SECONDS + 10) * 1000 });
        if (result.timedOut) await docker(["kill", name], { timeoutMs: 8000 });
    } finally {
        running -= 1;
    }

    let stderr = result.stderr;
    if (stderr.includes("__COLLABOS_COMPILE_ERROR__")) {
        return { status: "compile_error", stdout: "", stderr: clip(stderr.replace(/__COLLABOS_COMPILE_ERROR__\s*/, "").trim()), exitCode: null, timeMs: Date.now() - started };
    }
    const marker = stderr.match(/__COLLABOS_EXIT__ (\d+) (-?\d+)\s*$/);
    if (!marker) {
        const reason = result.timedOut ? "The run took too long and was stopped." : stderr.trim() || "The runner stopped unexpectedly.";
        return { status: result.timedOut ? "timeout" : "runtime_error", stdout: clip(result.stdout), stderr: clip(reason), exitCode: null, timeMs: Date.now() - started };
    }
    stderr = stderr.slice(0, marker.index).trim();
    const exitCode = Number(marker[1]);
    const timeMs = Number(marker[2]);
    // 137 = killed (128 + SIGKILL): our time limit, or the memory limit.
    if (exitCode === 137) {
        const timedOut = timeMs >= RUN_SECONDS * 1000 - 200;
        return { status: timedOut ? "timeout" : "runtime_error", stdout: clip(result.stdout), stderr: clip(timedOut ? `Time limit exceeded (${RUN_SECONDS} seconds).` : `${stderr}\nKilled: the program used more than 256 MB of memory.`.trim()), exitCode, timeMs };
    }
    return { status: exitCode === 0 ? "ok" : "runtime_error", stdout: clip(result.stdout), stderr: clip(stderr), exitCode, timeMs };
}
