import * as notificationsService from '../services/notifications.service.js';

const ok = (res, data) => res.json({ success: true, data });

export const list = async (req, res) => ok(res, await notificationsService.list(req.user, req.query));
export const markRead = async (req, res) => ok(res, await notificationsService.markRead(req.user, req.params.id));
export const markAllRead = async (req, res) => ok(res, await notificationsService.markAllRead(req.user));
