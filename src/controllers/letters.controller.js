import * as lettersService from '../services/letters.service.js';

const ok = (res, data, status = 200) => res.status(status).json({ success: true, data });

export const create = async (req, res) => ok(res, { letter: await lettersService.createLetter(req.user, req.body) }, 201);
export const listReceived = async (req, res) => ok(res, await lettersService.listReceived(req.user, req.query));
export const listSent = async (req, res) => ok(res, await lettersService.listSent(req.user, req.query));
export const getOne = async (req, res) => ok(res, { letter: await lettersService.getLetter(req.user, req.params.id) });
export const update = async (req, res) => ok(res, { letter: await lettersService.updateLetter(req.user, req.params.id, req.body) });
export const remove = async (req, res) => ok(res, await lettersService.deleteLetter(req.user, req.params.id));
export const reply = async (req, res) => ok(res, { letter: await lettersService.replyToLetter(req.user, req.params.id, req.body) }, 201);
export const archive = async (req, res) => ok(res, await lettersService.setArchived(req.user, req.params.id, req.body));
export const removeReceived = async (req, res) => ok(res, await lettersService.deleteReceived(req.user, req.params.id));
