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

// Starter files for an empty project, so the demo has something to show.
export const STARTER_FILES = [
    { path: "README.md", content: "# Project\n\nNotes, setup steps and decisions for this project.\n\n## Getting started\n\n1. Open `index.html` in a browser\n2. Edit `src/app.js`\n" },
    { path: "index.html", content: "<!doctype html>\n<html lang=\"en\">\n  <head>\n    <meta charset=\"UTF-8\" />\n    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\" />\n    <title>Hello CollabOS</title>\n    <link rel=\"stylesheet\" href=\"src/style.css\" />\n  </head>\n  <body>\n    <main>\n      <h1>Hello, team!</h1>\n      <button id=\"cta\">Click me</button>\n    </main>\n    <script src=\"src/app.js\"></script>\n  </body>\n</html>\n" },
    { path: "src/style.css", content: "body {\n  margin: 0;\n  font-family: system-ui, sans-serif;\n  background: #0b0b0f;\n  color: #f4f4f5;\n}\n\nmain {\n  min-height: 100vh;\n  display: grid;\n  place-content: center;\n  gap: 1rem;\n}\n" },
    { path: "src/app.js", content: "// Entry point\nconst button = document.getElementById(\"cta\");\nlet clicks = 0;\n\nbutton.addEventListener(\"click\", () => {\n  clicks += 1;\n  button.textContent = `Clicked ${clicks} time${clicks === 1 ? \"\" : \"s\"}`;\n});\n" }
];

// "https://github.com/owner/repo" → "https://vscode.dev/github/owner/repo"
export function vscodeUrl(repoUrl) {
    const match = repoUrl?.match(/github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/);
    return match ? `https://vscode.dev/github/${match[1]}/${match[2]}` : "https://vscode.dev";
}
