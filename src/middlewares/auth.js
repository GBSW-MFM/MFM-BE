// 인증 미들웨어. Authorization: Bearer <JWT> 를 확인한다.
//   requireAuth()          → 액세스 토큰만. req.user = { id, handle, name }
//   requireAuth('signup')  → 가입 토큰만. req.signup = { kakaoId, email }
//   requireAuth('any')     → 둘 다 허용 (아이디 중복확인처럼 가입 전후 모두 쓰는 API)
import { AppError } from '../utils/appError.js';
import { verifyToken } from '../utils/jwt.js';
import * as usersRepository from '../repositories/users.repository.js';

const ALLOWED = { access: ['access'], signup: ['signup'], any: ['access', 'signup'] };

export function requireAuth(kind = 'access') {
  return async function authMiddleware(req, res, next) {
    const header = req.get('authorization') || '';
    const match = /^Bearer\s+(\S+)$/i.exec(header);
    if (!match) throw new AppError('UNAUTHORIZED');

    const { typ, sub, email } = await verifyToken(match[1], ALLOWED[kind]);
    if (typ === 'signup') {
      req.signup = { kakaoId: sub, email };
    } else {
      // 탈퇴 등으로 사라진 사용자의 토큰은 받지 않는다. 토큰 안의 id 만 믿고 요청 본문의 id 는 쓰지 않는다.
      const user = await usersRepository.findById(sub);
      if (!user) throw new AppError('UNAUTHORIZED');
      req.user = { id: user.id, handle: user.handle, name: user.name };
    }
    next();
  };
}
