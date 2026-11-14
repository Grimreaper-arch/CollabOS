// Imported first in server.js so .env is loaded before any other module reads process.env.
import dotenv from "dotenv";

dotenv.config({ quiet: true });

// On Render the site's public address is provided for us, so CLIENT_URL (used for email links,
// Google sign-in redirects and allowed origins) doesn't need to be typed in by hand.
if (!process.env.CLIENT_URL && process.env.RENDER_EXTERNAL_URL) process.env.CLIENT_URL = process.env.RENDER_EXTERNAL_URL;
