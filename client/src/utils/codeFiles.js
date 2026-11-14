// File-type helpers for the Code page: which Monaco language to use and how to colour the icon.
const TYPES = {
    js: ["javascript", "JS", "text-yellow-300"],
    jsx: ["javascript", "JSX", "text-sky-300"],
    mjs: ["javascript", "JS", "text-yellow-300"],
    ts: ["typescript", "TS", "text-blue-400"],
    tsx: ["typescript", "TSX", "text-blue-300"],
    json: ["json", "{}", "text-amber-300"],
    html: ["html", "<>", "text-orange-400"],
    css: ["css", "#", "text-sky-400"],
    scss: ["scss", "#", "text-pink-400"],
    md: ["markdown", "M↓", "text-zinc-300"],
    py: ["python", "PY", "text-emerald-300"],
    java: ["java", "J", "text-red-400"],
    c: ["c", "C", "text-blue-300"],
    h: ["c", "H", "text-blue-300"],
    cpp: ["cpp", "C++", "text-blue-400"],
    cc: ["cpp", "C++", "text-blue-400"],
    cxx: ["cpp", "C++", "text-blue-400"],
    cs: ["csharp", "C#", "text-violet-400"],
    go: ["go", "GO", "text-cyan-300"],
    rs: ["rust", "RS", "text-orange-300"],
    php: ["php", "PHP", "text-indigo-300"],
    rb: ["ruby", "RB", "text-red-400"],
    kt: ["kotlin", "KT", "text-violet-300"],
    sql: ["sql", "SQL", "text-amber-200"],
    sh: ["shell", "$", "text-emerald-400"],
    yml: ["yaml", "YML", "text-rose-300"],
    yaml: ["yaml", "YML", "text-rose-300"],
    xml: ["xml", "XML", "text-orange-300"],
    env: ["plaintext", "ENV", "text-yellow-200"],
    txt: ["plaintext", "TXT", "text-zinc-400"]
};

export function fileType(path) {
    const name = path.split("/").pop().toLowerCase();
    const ext = name.includes(".") ? name.split(".").pop() : "";
    const [language, badge, color] = TYPES[ext] || ["plaintext", "•", "text-zinc-400"];
    return { language, badge, color };
}

// Turns ["src/App.jsx", "README.md"] into a nested tree, folders first.
export function buildTree(files) {
    const root = { folders: {}, files: [] };
    files.forEach((file) => {
        const parts = file.path.split("/");
        let node = root;
        parts.slice(0, -1).forEach((part, i) => {
            node.folders[part] ||= { name: part, path: parts.slice(0, i + 1).join("/"), folders: {}, files: [] };
            node = node.folders[part];
        });
        node.files.push(file);
    });
    return root;
}

// Which runner language a file uses, or null if it can't be run.
const RUN_LANGUAGES = { js: "javascript", mjs: "javascript", py: "python", c: "c", cpp: "cpp", cc: "cpp", cxx: "cpp", java: "java" };
export const RUN_LANGUAGE_NAMES = { javascript: "JavaScript", python: "Python", c: "C", cpp: "C++", java: "Java" };
export function runLanguageOf(path) {
    const name = (path || "").split("/").pop().toLowerCase();
    return RUN_LANGUAGES[name.includes(".") ? name.split(".").pop() : ""] || null;
}
