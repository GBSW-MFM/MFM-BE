// MySQL 연결 풀과 쿼리·트랜잭션 도우미 (mysql2/promise).
// 데이터 접근은 repositories 에서만 이 모듈을 사용한다.
import mysql from 'mysql2/promise';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

export const pool = mysql.createPool({
  uri: env.databaseUrl,
  connectionLimit: env.dbPoolMax,
  waitForConnections: true,
  queueLimit: 0,
  connectTimeout: env.dbConnectTimeoutMs,
  timezone: 'Z', // DATETIME 을 UTC 로 읽고 쓴다
  supportBigNumbers: true,
  bigNumberStrings: true, // BIGINT id 를 문자열로 받아 정밀도 손실을 막는다
  charset: 'utf8mb4',
});

// 새 연결마다 세션 시간대를 UTC 로 맞추고, SELECT 최대 실행 시간을 건다.
pool.pool.on('connection', (conn) => {
  conn.query("SET time_zone = '+00:00'", (err) => err && logger.error('db.session_setup_failed', { err }));
  conn.query(`SET SESSION max_execution_time = ${Number(env.dbStatementTimeoutMs)}`, (err) => err && logger.error('db.session_setup_failed', { err }));
});

/**
 * 쿼리 실행기. repositories 는 이 모양({ run })의 객체만 받는다.
 * execute() 는 서버 측 prepared statement 라 값이 SQL 문자열에 섞이지 않는다(파라미터 바인딩).
 */
export const db = {
  async run(sql, params = []) {
    const [result] = await pool.execute(sql, params);
    return result;
  },
};

/**
 * 여러 쿼리를 하나의 트랜잭션으로 실행한다. fn 은 { run } 실행기를 받는다.
 *   await withTransaction(async (tx) => { await tx.run('INSERT …', [...]); });
 */
export async function withTransaction(fn) {
  const conn = await pool.getConnection();
  const tx = {
    async run(sql, params = []) {
      const [result] = await conn.execute(sql, params);
      return result;
    },
  };
  try {
    await conn.beginTransaction();
    const result = await fn(tx);
    await conn.commit();
    conn.release();
    return result;
  } catch (err) {
    try {
      await conn.rollback();
      conn.release();
    } catch (rollbackErr) {
      // 롤백조차 실패한 연결은 상태를 믿을 수 없으므로 풀에 돌려주지 않고 버린다.
      logger.error('db.transaction.rollback_failed', { err: rollbackErr });
      conn.destroy();
    }
    throw err;
  }
}

export async function ping() {
  await pool.query('SELECT 1');
}

export async function closePool() {
  await pool.end();
}
