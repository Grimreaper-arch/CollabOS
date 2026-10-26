// Used by the .bat launchers. Makes sure backend/.env exists and has a working MONGO_URI.
// If it doesn't, asks the user to paste their MongoDB Atlas connection string, tests it, and saves it.
// Run with --change to replace an existing connection string.
import fs from "node:fs";
import crypto from "node:crypto";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import mongoose from "mongoose";

const ENV_PATH = fileURLToPath(new URL("../.env", import.meta.url));
const EXAMPLE_PATH = fileURLToPath(new URL("../.env.example", import.meta.url));
const forceChange = process.argv.includes("--change");

// Create .env from the example with a fresh random JWT secret.
if (!fs.existsSync(ENV_PATH)) {
    const secret = crypto.randomBytes(48).toString("hex");
    fs.writeFileSync(ENV_PATH, fs.readFileSync(EXAMPLE_PATH, "utf8").replace(/^JWT_SECRET=.*$/m, `JWT_SECRET=${secret}`));
}

const env = dotenv.parse(fs.readFileSync(ENV_PATH));
const isPlaceholder = (uri) => !uri || uri.includes("<user>") || uri.includes("<password>") || uri.includes("<cluster>");

// Passwords with symbols like @ # % / must be URL-encoded. Do it for the user.
// The password sits between the first ":" after the scheme and the LAST "@".
function encodePassword(uri) {
    const match = uri.match(/^(mongodb(?:\+srv)?:\/\/)([^:/@]+):(.*)@([^@]+)$/);
    if (!match) return uri;
    const [, scheme, user, password, rest] = match;
    let plain = password;
    try { plain = decodeURIComponent(password); } catch { /* has a stray %, treat as plain text */ }
    return `${scheme}${user}:${encodeURIComponent(plain)}@${rest}`;
}

// Atlas strings usually have no database name ("...mongodb.net/?retry...") — add "collabos".
function withDatabaseName(uri) {
    const match = uri.match(/^(mongodb(?:\+srv)?:\/\/[^/]+)\/?([^?]*)(\?.*)?$/);
    if (!match) return uri;
    const [, host, db, query = ""] = match;
    return `${host}/${db || "collabos"}${query}`;
}

async function testConnection(uri) {
    try {
        await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
        await mongoose.connection.db.admin().ping();
        await mongoose.disconnect();
        return null;
    } catch (error) {
        await mongoose.disconnect().catch(() => {});
        return error.message;
    }
}

function explain(message) {
    console.log(`\n  Could not connect: ${message}\n`);
    if (/auth|password|credentials/i.test(message)) {
        console.log("  -> The username or password is wrong. Check Atlas > Database Access.");
        console.log("     If your password has symbols like @ # % /, change it to letters and numbers only.");
    } else if (/whitelist|IP|timed out|ENOTFOUND|ECONNREFUSED|querySrv|Server selection/i.test(message)) {
        console.log("  -> Atlas is blocking this computer or the address is wrong.");
        console.log("     In Atlas > Network Access, click 'Add IP Address' > 'Allow access from anywhere'.");
        console.log("     Also check you copied the whole connection string.");
    }
}

if (!forceChange && !isPlaceholder(env.MONGO_URI)) process.exit(0);

console.log("");
console.log("  ============================================================");
console.log("   CollabOS needs a MongoDB database (one-time setup)");
console.log("  ============================================================");
console.log("   1. Open https://cloud.mongodb.com and log in");
console.log("   2. Click 'Connect' on your cluster > 'Drivers'");
console.log("   3. Copy the string that starts with mongodb+srv://");
console.log("   4. Paste it below (right-click to paste) and press Enter");
console.log("      Replace <db_password> with your real database password!");
console.log("");

const rl = readline.createInterface({ input: process.stdin });
const lines = rl[Symbol.asyncIterator]();

async function ask(prompt) {
    process.stdout.write(prompt);
    const { value, done } = await lines.next();
    if (done) return null;
    return value;
}

for (let attempt = 1; attempt <= 3; attempt++) {
    const answer = await ask("  Connection string: ");
    if (answer === null) break;
    let uri = answer.trim().replace(/^["']|["']$/g, "");

    if (!/^mongodb(\+srv)?:\/\//.test(uri)) {
        console.log("  That doesn't look right. It must start with mongodb+srv:// or mongodb://\n");
        continue;
    }
    if (/<.*password.*>/i.test(uri)) {
        console.log("  You still have <db_password> in it. Replace it with your actual password.\n");
        continue;
    }

    uri = withDatabaseName(encodePassword(uri));
    console.log("  Testing connection...");
    const error = await testConnection(uri);
    if (error) {
        explain(error);
        console.log("");
        continue;
    }

    const content = fs.readFileSync(ENV_PATH, "utf8");
    fs.writeFileSync(ENV_PATH, /^MONGO_URI=.*$/m.test(content)
        ? content.replace(/^MONGO_URI=.*$/m, () => `MONGO_URI=${uri}`)
        : `${content}\nMONGO_URI=${uri}\n`);
    console.log("  Connected! Saved to backend/.env\n");
    rl.close();
    process.exit(0);
}

rl.close();
console.log("  Setup was not completed. Run the launcher again when ready.");
process.exit(1);
