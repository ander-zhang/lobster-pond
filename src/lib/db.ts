import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";

// Neon 兼容适配器：用 pg.Pool 提供 sql`...` 标签模板 / sql.query / sql.transaction，
// 让原 @neondatabase/serverless 的调用点签名不变，只是底层走 TCP 连本地（或任意）
// Postgres。rows 直接返回数组（与 neon() 一致），调用点 rows[0]/rows.length/as Type[] 兼容。

export type Sql = {
  (strings: TemplateStringsArray, ...values: unknown[]): Promise<QueryResultRow[]>;
  query: (text: string, params?: unknown[]) => Promise<QueryResult>;
  transaction: <T>(cb: (txn: Sql) => Promise<T>) => Promise<T>;
};

// 纯函数：把标签模板转成 pg 的 $1,$2,... 占位 + params 数组。
// `${x}::jsonb` 这类写法：占位符前的文本片段直接拼，cast 自然贴在 $N 后，
// pg 按 $N::jsonb 解析为"对参数 N 做 jsonb 转换"。
export function buildTaggedQuery(
  strings: TemplateStringsArray,
  ...values: unknown[]
): { text: string; params: unknown[] } {
  let text = "";
  for (let i = 0; i < strings.length; i += 1) {
    text += strings[i];
    if (i < values.length) {
      text += `$${i + 1}`;
    }
  }
  return { text, params: values };
}

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
  }
  return pool;
}

// pg.Pool 没有 .release()，PoolClient（借自 pool.connect()）才有；用它做运行时判别，
// 因为 @types/pg 的 PoolClient 只是接口，没有可 instanceof 的运行时类可导入。
function isPoolClient(target: Pool | PoolClient): target is PoolClient {
  return typeof (target as PoolClient).release === "function";
}

// 把 query/transaction 绑定到指定的 pool 或 client（事务内用 client）。
function bindSql(clientOrPool: Pool | PoolClient): Sql {
  const run = async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const { text, params } = buildTaggedQuery(strings, ...values);
    const res = await clientOrPool.query(text, params);
    return res.rows;
  };
  const query = (text: string, params?: unknown[]) => clientOrPool.query(text, params);
  const transaction = async <T>(cb: (txn: Sql) => Promise<T>): Promise<T> => {
    // 已在事务 client 内：嵌套直接复用，不开新 BEGIN/COMMIT。
    if (isPoolClient(clientOrPool)) {
      return cb(bindSql(clientOrPool));
    }
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      const result = await cb(bindSql(client));
      await client.query("COMMIT");
      return result;
    } catch (err) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // 回滚本身失败时丢弃其错误，保留触发事务失败的原始错误。
      }
      throw err;
    } finally {
      client.release();
    }
  };
  return Object.assign(run, { query, transaction }) as Sql;
}

export function hasDatabase() {
  return Boolean(process.env.DATABASE_URL);
}

export function getSql(): Sql {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required for this operation");
  }
  return bindSql(getPool());
}

export function getOptionalSql(): Sql | null {
  return process.env.DATABASE_URL ? getSql() : null;
}
