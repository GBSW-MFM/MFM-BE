import * as authService from '../services/auth.service.js';

const ok = (res, data, status = 200) => res.status(status).json({ success: true, data });

export const kakaoLogin = async (req, res) => ok(res, await authService.loginWithKakao(req.body));
export const devLogin = async (req, res) => ok(res, await authService.devLogin(req.body));
export const handleAvailability = async (req, res) => ok(res, await authService.checkHandle(req.query.handle));
export const signup = async (req, res) => ok(res, await authService.signup(req.signup, req.body), 201);
