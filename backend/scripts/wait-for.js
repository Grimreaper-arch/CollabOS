// Used by the .bat launcher: waits until a URL responds, or exits with code 1 after a timeout.
// Usage: node scripts/wait-for.js http://localhost:5000/api/health 60
const [url, seconds = "60"] = process.argv.slice(2);
const deadline = Date.now() + Number(seconds) * 1000;

while (Date.now() < deadline) {
    try {
        const response = await fetch(url);
        if (response.status < 500) process.exit(0);
    } catch {
        // Not up yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
}
process.exit(1);
