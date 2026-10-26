import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// In development, requests to /api and /uploads are forwarded to the Express server,
// so the React app and the API behave as if they were on the same origin.
// API_PORT lets a second copy run against a different backend (default 5000).
const api = `http://localhost:${process.env.API_PORT || 5000}`;

export default defineConfig({
    plugins: [react(), tailwindcss()],
    server: {
        port: 5173,
        strictPort: true,
        proxy: {
            "/api": api,
            "/uploads": api
        }
    }
});
