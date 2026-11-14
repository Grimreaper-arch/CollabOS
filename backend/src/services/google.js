// Google sign-in and Google Calendar, using Google's OAuth 2.0 and Calendar REST APIs directly.
//
// Setup (Google Cloud Console → APIs & Services):
//   1. Enable the "Google Calendar API".
//   2. OAuth consent screen: External, add yourself and teammates as test users,
//      scopes: openid, email, profile, .../auth/calendar.events
//   3. Credentials → OAuth client ID → Web application, with the redirect URI
//      http://localhost:5173/api/google/callback
//   4. Put GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in backend/.env.
// Without them, everything else works and the Google buttons explain that it isn't set up.
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import ApiError from "../utils/ApiError.js";
import { open, seal } from "../utils/secretBox.js";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const CALENDAR = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

const LOGIN_SCOPES = ["openid", "email", "profile"];
const CALENDAR_SCOPES = [...LOGIN_SCOPES, "https://www.googleapis.com/auth/calendar.events"];

export const googleConfigured = () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
const clientUrl = () => process.env.CLIENT_URL || "http://localhost:5173";
export const redirectUri = () => process.env.GOOGLE_REDIRECT_URI || `${clientUrl()}/api/google/callback`;

function assertConfigured() {
    if (!googleConfigured()) {
        throw new ApiError(503, "Google isn't set up on this server yet. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to backend/.env.", "GOOGLE_NOT_CONFIGURED");
    }
}

// `state` travels through Google and back. It's a short-lived signed token saying what the
// sign-in is for ("login" or "calendar") and, for "calendar", which logged-in user asked.
export function authUrl(purpose, userId = null) {
    assertConfigured();
    const state = jwt.sign({ purpose, userId: userId ? String(userId) : null }, process.env.JWT_SECRET, { expiresIn: "10m" });
    const params = new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID,
        redirect_uri: redirectUri(),
        response_type: "code",
        scope: (purpose === "calendar" ? CALENDAR_SCOPES : LOGIN_SCOPES).join(" "),
        state,
        include_granted_scopes: "true",
        // "offline" + "consent" makes Google return a refresh token for calendar access.
        ...(purpose === "calendar" ? { access_type: "offline", prompt: "consent" } : { prompt: "select_account" })
    });
    return `${AUTH_URL}?${params}`;
}

export function readState(state) {
    try {
        return jwt.verify(state, process.env.JWT_SECRET);
    } catch {
        throw new ApiError(400, "This Google sign-in link expired. Please try again.");
    }
}

async function tokenRequest(body) {
    const response = await fetch(TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, ...body })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new ApiError(502, `Google: ${data.error_description || data.error || "request failed"}`), { googleError: data.error });
    return data;
}

// Exchanges the code from the callback for tokens, and reads the Google account from the ID token.
// The ID token comes straight from Google's token endpoint over HTTPS, so its contents can be trusted.
export async function exchangeCode(code) {
    const tokens = await tokenRequest({ code, grant_type: "authorization_code", redirect_uri: redirectUri() });
    const profile = JSON.parse(Buffer.from(tokens.id_token.split(".")[1], "base64url").toString("utf8"));
    return { tokens, profile };
}

// Saves calendar access on the user. The refresh token is stored encrypted.
export async function saveCalendarTokens(user, { tokens, profile }) {
    user.google = {
        connected: true,
        email: profile.email,
        refreshToken: tokens.refresh_token ? seal(tokens.refresh_token) : user.google?.refreshToken || "",
        accessToken: seal(tokens.access_token),
        expiresAt: new Date(Date.now() + (tokens.expires_in - 60) * 1000),
        connectedAt: new Date()
    };
    await user.save();
}

// A valid access token for the user's calendar, refreshing it if needed. null if not connected.
async function accessTokenFor(userId) {
    const user = await User.findById(userId).select("+google.refreshToken +google.accessToken");
    if (!user?.google?.connected || !googleConfigured()) return null;
    if (user.google.expiresAt > new Date()) return open(user.google.accessToken);
    try {
        const tokens = await tokenRequest({ grant_type: "refresh_token", refresh_token: open(user.google.refreshToken) });
        user.google.accessToken = seal(tokens.access_token);
        user.google.expiresAt = new Date(Date.now() + (tokens.expires_in - 60) * 1000);
        await user.save();
        return tokens.access_token;
    } catch (error) {
        // The user removed CollabOS from their Google account: stop trying.
        if (error.googleError === "invalid_grant") {
            user.google = { connected: false };
            await user.save();
        }
        return null;
    }
}

export async function disconnect(user) {
    const withTokens = await User.findById(user._id).select("+google.refreshToken");
    const token = withTokens?.google?.refreshToken ? open(withTokens.google.refreshToken) : null;
    if (token) await fetch(`${REVOKE_URL}?token=${encodeURIComponent(token)}`, { method: "POST" }).catch(() => {});
    await User.updateOne({ _id: user._id }, { $set: { google: { connected: false } } });
}

async function calendarRequest(userId, method, path = "", { query, body } = {}) {
    const token = await accessTokenFor(userId);
    if (!token) return null;
    const url = `${CALENDAR}${path}${query ? `?${new URLSearchParams(query)}` : ""}`;
    const response = await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
        body: body ? JSON.stringify(body) : undefined
    });
    if (response.status === 204 || response.status === 410) return {};
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new ApiError(502, `Google Calendar: ${data.error?.message || response.status}`);
    return data;
}

// ---- Events ----

// The user's events between two dates (for My Calendar).
export async function listEvents(userId, from, to) {
    const data = await calendarRequest(userId, "GET", "", {
        query: { timeMin: from.toISOString(), timeMax: to.toISOString(), singleEvents: "true", orderBy: "startTime", maxResults: "250" }
    });
    return (data?.items || []).map((e) => ({
        id: e.id,
        title: e.summary || "(No title)",
        start: e.start?.dateTime || e.start?.date,
        end: e.end?.dateTime || e.end?.date,
        allDay: Boolean(e.start?.date),
        link: e.htmlLink,
        meetLink: e.hangoutLink || "",
        collabos: Boolean(e.extendedProperties?.private?.collabosTaskId || e.extendedProperties?.private?.collabosMeetingId)
    }));
}

const ymd = (date) => new Date(date).toISOString().slice(0, 10);

// Puts a task's due date in the assignee's Google Calendar as an all-day event (create or update).
// Returns the Google event id, or null when the assignee hasn't connected Google.
export async function upsertTaskEvent(task, { projectName }) {
    if (!task.dueDate) return task.googleEventId ? (await deleteEvent(task.assignee, task.googleEventId), null) : null;
    const end = new Date(task.dueDate);
    end.setUTCDate(end.getUTCDate() + 1);
    const event = {
        summary: `${task.status === "completed" ? "✅" : "📌"} ${task.title}`,
        description: `CollabOS task in ${projectName}.\n${clientUrl()}/projects/${task.project}`,
        start: { date: ymd(task.dueDate) },
        end: { date: ymd(end) },
        transparency: "transparent",
        extendedProperties: { private: { collabosTaskId: String(task._id) } },
        reminders: { useDefault: false, overrides: [{ method: "popup", minutes: 9 * 60 }] }
    };
    const assigneeId = task.assignee?._id ?? task.assignee;
    const result = task.googleEventId
        ? await calendarRequest(assigneeId, "PATCH", `/${task.googleEventId}`, { body: event })
        : await calendarRequest(assigneeId, "POST", "", { body: event });
    return result?.id || task.googleEventId || null;
}

export function deleteEvent(userId, eventId) {
    return eventId ? calendarRequest(userId, "DELETE", `/${eventId}`) : null;
}

// A meeting in the host's calendar, with the attendees invited by Google and (optionally)
// a Google Meet link. Returns { id, meetLink } or null if the host hasn't connected Google.
export async function createMeetingEvent(hostId, meeting, attendeeEmails, { withMeet }) {
    const end = new Date(meeting.startsAt.getTime() + meeting.durationMinutes * 60000);
    const result = await calendarRequest(hostId, "POST", "", {
        query: { conferenceDataVersion: withMeet ? "1" : "0", sendUpdates: "all" },
        body: {
            summary: meeting.title,
            description: `${meeting.description ? `${meeting.description}\n\n` : ""}Join in CollabOS: ${clientUrl()}/meet/${meeting.roomId}`,
            start: { dateTime: meeting.startsAt.toISOString() },
            end: { dateTime: end.toISOString() },
            attendees: attendeeEmails.map((email) => ({ email })),
            extendedProperties: { private: { collabosMeetingId: String(meeting._id) } },
            ...(withMeet ? { conferenceData: { createRequest: { requestId: String(meeting._id), conferenceSolutionKey: { type: "hangoutsMeet" } } } } : {})
        }
    });
    return result ? { id: result.id, meetLink: result.hangoutLink || "" } : null;
}
