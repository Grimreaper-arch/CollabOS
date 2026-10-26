import Notification from "../models/Notification.js";

// GET /api/notifications
export async function listNotifications(req, res) {
    const notifications = await Notification.find({ recipient: req.user._id }).sort({ createdAt: -1 }).limit(50);
    const unread = await Notification.countDocuments({ recipient: req.user._id, read: false });
    res.json({ notifications, unread });
}

// PATCH /api/notifications/read-all
export async function markAllRead(req, res) {
    await Notification.updateMany({ recipient: req.user._id, read: false }, { read: true });
    res.json({ message: "All notifications marked as read." });
}
