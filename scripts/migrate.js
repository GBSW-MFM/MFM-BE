// migrations/*.sql 을 파일 이름 순서대로 한 번씩 실행한다 (MySQL).
// 주의: MySQL 은 CREATE/ALTER 같은 DDL 이 자동 커밋되어 트랜잭션으로 되돌릴 수 없다.
//       그래서 파일이 중간에 실패하면 어디까지 적용됐는지 로그를 보고 직접 정리해야 한다.
//   npm run migrate
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';

const MIGRATIONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../migrations');

export async function migrate(connectionUri, { log = console.log } = {}) {
  if (!connectionUri) throw new Error('DATABASE_URL 이 설정되지 않았습니다.');
  const conn = await mysql.createConnection({ uri: connectionUri, multipleStatements: true, timezone: 'Z', charset: 'utf8mb4' });
  try {
    await conn.query("SET time_zone = '+00:00'");
    await conn.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(100) NOT NULL PRIMARY KEY,
      applied_at DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3))
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    const [rows] = await conn.query('SELECT version FROM schema_migrations');
    const applied = new Set(rows.map((row) => row.version));

    const files = (await readdir(MIGRATIONS_DIR)).filter((name) => name.endsWith('.sql')).sort();
    const done = [];
    for (const file of files) {
      const version = file.replace(/\.sql$/, '');
      if (applied.has(version)) continue;
      const sql = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
      try {
        await conn.query(sql);
      } catch (err) {
        err.message = `${file} 실행 실패 (이미 실행된 DDL 은 되돌려지지 않음): ${err.message}`;
        throw err;
      }
      await conn.query('INSERT INTO schema_migrations (version) VALUES (?)', [version]);
      log(`적용: ${file}`);
      done.push(version);
    }
    if (done.length === 0) log('적용할 마이그레이션이 없습니다.');
    return done;
  } finally {
    await conn.end();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  migrate(process.env.DATABASE_URL).catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
