import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getSql } from "../src/lib/db.ts";
import { planMigrations } from "../src/lib/migration-plan.ts";

type SqlClient = ReturnType<typeof getSql>;

// 迁移跟踪表：记录已应用迁移文件名。此前迁移无记录、按「幂等」假设每次全量重跑，
// 但该假设被 019（清种子数据）+ 046（虾文档 author_user_id 置空）的跨迁移相互作用
// 打破——019 的 delete from docs where author_user_id is null 会在后续每次部署重跑时，
// 把被 046 置空的虾文档误删。改为仅执行未记录的迁移，根治重复执行。
const TRACKING_TABLE = `
  create table if not exists migrations (
    name text primary key,
    applied_at timestamptz not null default now()
  )
`;

// 按文件名顺序执行 migrations/ 下尚未记录的 .sql，执行后写入跟踪表。
// 首次在已建库（无记录表）上运行时，将现存全部迁移采纳为已应用、不重跑。
// 返回 { applied, adopted }：applied 为本轮实际执行的迁移，adopted 为采纳的旧迁移。
export async function runMigrations(
  sql: SqlClient = getSql(),
): Promise<{ applied: string[]; adopted: string[] }> {
  const dir = path.join(process.cwd(), "migrations");
  const files = fs.readdirSync(dir).filter((file) => file.endsWith(".sql")).sort();

  await sql.query(TRACKING_TABLE);

  const appliedRows = (await sql`select name from migrations order by name asc`) as Array<{ name: string }>;
  const applied = new Set(appliedRows.map((row) => row.name));

  // 以 docs 表（迁移 001 创建）是否存在，判断是否已有 schema 但缺迁移记录。
  const schemaRows = (await sql`select to_regclass('public.docs') as reg`) as Array<{ reg: string | null }>;
  const schemaExists = Boolean(schemaRows[0]?.reg);

  const { adopt, apply } = planMigrations(files, applied, schemaExists);
  for (const file of adopt) {
    await sql`insert into migrations (name) values (${file}) on conflict (name) do nothing`;
  }
  for (const file of apply) {
    const raw = fs.readFileSync(path.join(dir, file), "utf8");
    for (const statement of splitSql(raw)) {
      await unsafe(sql, statement);
    }
    await sql`insert into migrations (name) values (${file}) on conflict (name) do nothing`;
  }
  return { applied: apply, adopted: adopt };
}

export function splitSql(raw: string) {
  return raw
    .split(/;\s*(?:\r?\n|$)/)
    .map((statement) => statement.trim())
    .filter(Boolean);
}

async function unsafe(sql: SqlClient, statement: string) {
  const client = sql as unknown as { query: (query: string) => Promise<unknown> };
  await client.query(statement);
}

// 直接运行（node scripts/migrate.ts）时执行迁移；被 import 时只导出函数。
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { applied, adopted } = await runMigrations();
  if (adopted.length > 0) {
    console.log(`Migration tracking bootstrapped: adopted ${adopted.length} existing migration(s) as applied.`);
  }
  console.log(`Applied ${applied.length} new migration file(s): ${applied.join(", ") || "(none)"}`);
}
