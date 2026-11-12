// 컨트롤러 계층 예시. 요청을 읽고, 서비스를 부르고, 성공 응답 형식으로 감싼다.
// 오류는 잡지 않는다. Express 5 가 errorHandler 로 넘겨준다.
import * as healthService from '../services/health.service.js';

export async function getHealth(req, res) {
  const data = await healthService.getHealth();
  res.json({ success: true, data });
}
