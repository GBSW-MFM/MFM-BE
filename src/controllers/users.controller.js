import * as usersService from '../services/users.service.js';

export const getMe = async (req, res) => res.json({ success: true, data: await usersService.getMe(req.user.id) });
export const lookup = async (req, res) => res.json({ success: true, data: await usersService.lookupByHandle(req.user, req.query.handle) });
