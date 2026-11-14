import AiConversation from "../models/AiConversation.js";
import ApiError from "../utils/ApiError.js";
import { aiConfigured, aiProviderName, assertAiConfigured, runAgent } from "../services/ai.js";
import { runConfirmed } from "../services/aiTools.js";
import { limitsOf, planError } from "../services/plans.js";

const HISTORY = 20; // messages sent to the model with each question
const MAX_MESSAGE = 12000;
const startOfDay = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };

// AI messages the organization sent today (the plan limit is per organization per day).
async function usedToday(orgId) {
    const [result] = await AiConversation.aggregate([
        { $match: { org: orgId } },
        { $unwind: "$messages" },
        { $match: { "messages.role": "user", "messages.createdAt": { $gte: startOfDay() } } },
        { $count: "count" }
    ]);
    return result?.count || 0;
}

// GET /api/ai/status
export async function status(req, res) {
    res.json({ configured: aiConfigured(), provider: aiProviderName(), limit: limitsOf(req.org).aiMessagesPerDay, usedToday: await usedToday(req.org._id) });
}

// GET /api/ai/conversations — your chats in this organization, newest first.
export async function listConversations(req, res) {
    const conversations = await AiConversation.find({ org: req.org._id, user: req.user._id }).select("title updatedAt").sort({ updatedAt: -1 }).limit(30);
    res.json({ conversations });
}

async function getOwn(req, id) {
    const conversation = await AiConversation.findOne({ _id: id, org: req.org._id, user: req.user._id });
    if (!conversation) throw new ApiError(404, "Conversation not found.");
    return conversation;
}

// What the page needs to show a conversation (the model's private notes are left out).
const publicView = (conversation) => ({
    _id: conversation._id,
    title: conversation.title,
    messages: conversation.messages.map((m) => ({ role: m.role, content: m.content, actions: m.actions, createdAt: m.createdAt })),
    pending: conversation.pending ? { id: conversation.pending.id, summary: conversation.pending.summary } : null
});

// GET /api/ai/conversations/:id
export async function getConversation(req, res) {
    res.json({ conversation: publicView(await getOwn(req, req.params.id)) });
}

// DELETE /api/ai/conversations/:id
export async function deleteConversation(req, res) {
    await (await getOwn(req, req.params.id)).deleteOne();
    res.json({ message: "Conversation deleted." });
}

// Runs the agent and streams what happens to the browser as Server-Sent Events:
//   data: {"conversationId": "..."}                        first, so the page knows which chat this is
//   data: {"delta": "some text"}                           the reply, piece by piece
//   data: {"action": {"label": "...", "status": "..."}}    a tool being used: running → ok / error / confirm
//   data: {"confirm": {"id": "...", "summary": "..."}}     an action is waiting for the Confirm button
//   data: {"done": true}                                   the end (or {"error": "..."})
async function streamAgent(req, res, conversation, { note, actions: earlier = [] } = {}) {
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" });
    const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);
    send({ conversationId: conversation._id });
    // An action the user just confirmed shows up as a chip, like the ones the agent runs itself.
    earlier.forEach((action) => send({ action: { label: action.label, status: action.ok ? "ok" : "error" } }));

    // Stop asking the model if the user closes the panel mid-answer.
    const controller = new AbortController();
    res.on("close", () => controller.abort());

    try {
        const result = await runAgent({
            req,
            history: conversation.messages.slice(-HISTORY),
            page: req.body.page,
            note,
            signal: controller.signal,
            onEvent: send
        });
        const actions = [...earlier, ...result.actions];
        conversation.messages.push({ role: "assistant", content: result.content.slice(0, 20000), actions: actions.length ? actions : undefined, toolLog: [note, result.toolLog].filter(Boolean).join("\n") || undefined });
        conversation.pending = result.pending;
        conversation.markModified("pending");
        await conversation.save();
        if (result.pending) send({ confirm: { id: result.pending.id, summary: result.pending.summary } });
        send({ done: true });
    } catch (error) {
        if (!controller.signal.aborted) {
            console.error("AI error:", error.message);
            const message = error.status === 401 ? "The AI service rejected the API key. Check the Azure OpenAI settings."
                : error.status === 429 ? "The AI service is busy or out of quota. Try again in a minute."
                : error.message || "The AI service failed.";
            send({ error: message });
        }
    }
    res.end();
}

// POST /api/ai/chat  body: { conversationId?, message, page? }
// `page` is where the user is in the app (e.g. "/projects/<id>"), so "this project" works.
export async function chat(req, res) {
    const text = String(req.body.message || "").trim();
    if (!text) throw new ApiError(400, "Type a message.");
    if (text.length > MAX_MESSAGE) throw new ApiError(400, `That message is too long (${MAX_MESSAGE} characters max).`);
    assertAiConfigured();

    const limit = limitsOf(req.org).aiMessagesPerDay;
    if (limit !== null && (await usedToday(req.org._id)) >= limit) throw planError(req.org, "aiMessagesPerDay", limit);

    const conversation = req.body.conversationId
        ? await getOwn(req, req.body.conversationId)
        : new AiConversation({ org: req.org._id, user: req.user._id, title: text.replace(/\s+/g, " ").slice(0, 60) });
    // Typing a new message instead of pressing Confirm drops the waiting action.
    let note;
    if (conversation.pending) {
        note = `The action that was waiting for confirmation ("${conversation.pending.summary.slice(0, 200)}") was NOT carried out: the user sent a new message instead.`;
        conversation.pending = null;
    }
    conversation.messages.push({ role: "user", content: text });
    await conversation.save();
    await streamAgent(req, res, conversation, { note });
}

// POST /api/ai/confirm  body: { conversationId, id, approve }
// The user pressed Confirm or Cancel on a waiting action. Runs it (or not) and lets the
// assistant report what happened.
export async function confirm(req, res) {
    assertAiConfigured();
    const conversation = await getOwn(req, req.body.conversationId);
    const pending = conversation.pending;
    if (!pending || pending.id !== req.body.id) throw new ApiError(409, "That action is no longer waiting. Ask again if you still want it.");

    // Clear it first, so a double click can't run it twice.
    const cleared = await AiConversation.updateOne({ _id: conversation._id, "pending.id": pending.id }, { pending: null });
    if (!cleared.modifiedCount) throw new ApiError(409, "That action was already handled.");
    conversation.pending = null;

    let note;
    let actions = [];
    if (req.body.approve) {
        const outcome = await runConfirmed(req, pending.tool, pending.args);
        actions = [{ label: pending.summary.split("\n")[0].slice(0, 140), ok: outcome.ok }];
        note = outcome.ok
            ? `The user CONFIRMED this action and it has now been carried out: "${pending.summary.slice(0, 300)}". Result: ${JSON.stringify(outcome.result ?? {}).slice(0, 600)}. Tell the user it's done, briefly.`
            : `The user confirmed this action but it FAILED: "${pending.summary.slice(0, 300)}". Reason: ${outcome.error}. Explain this to the user.`;
    } else {
        note = `The user CANCELLED this action, so it was not carried out: "${pending.summary.slice(0, 300)}". Acknowledge briefly.`;
    }
    await streamAgent(req, res, conversation, { note, actions });
}
