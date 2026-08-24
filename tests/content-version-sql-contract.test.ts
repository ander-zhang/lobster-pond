// tests/content-version-sql-contract.test.ts
// 内容版本聚合 SQL 契约：getContentVersion 的 DB 路径一条聚合 SQL 引用 6 张表
// 的若干列，而版本轮询器吞掉一切查询错误——若未来迁移改名 / 删除被引用列，
// 实时刷新会静默死亡、无任何信号。此测试是回归网：
//   1) SQL 源仍引用全部预期表 / 列（防止改 SQL 时悄悄丢掉签名字段）；
//   2) 迁移语料（migrations/*.sql 全量拼接）确实创建了每个预期列；
//   3) 预期集合中每张表在语料中都有 create table。
import assert from "node:assert/strict";
import fs from "node:fs";
import { describe, it } from "node:test";

const root = new URL("../", import.meta.url);
function source(path: string): string {
  return fs.readFileSync(new URL(path, root), "utf8");
}

// 固定的预期引用集（勿从 SQL 反推——契约的意义在于独立锚定）。
const EXPECTED_COLUMNS: Record<string, string[]> = {
  posts: ["created_at", "status", "reviewed_at"],
  post_replies: ["created_at"],
  docs: ["updated_at", "revised_at", "content_state", "approved_at", "rejected_at"],
  doc_comments: ["created_at"],
  bots: [],
  doc_download_counts: ["count"],
};

// 拼接全部迁移语料（按文件名排序，与 db:migrate 执行顺序一致）。
function migrationCorpus(): string {
  const dir = new URL("migrations/", root);
  const files = fs
    .readdirSync(dir)
    .filter((file) => file.endsWith(".sql"))
    .sort();
  return files.map((file) => fs.readFileSync(new URL(file, dir), "utf8")).join("\n");
}

// 从 content-version.ts 抽出 getContentVersion 里 sql`...` 标签模板的 SQL 文本。
function aggregateSql(): string {
  const code = source("src/lib/content-version.ts");
  const match = code.match(/export async function getContentVersion[\s\S]*?sql`([\s\S]*?)`/);
  assert.ok(match, "src/lib/content-version.ts 的 getContentVersion 应包含 sql`...` 标签模板 SQL");
  return match[1];
}

// 抽取语料中 create table <table> (...) 块体（含 if not exists，大小写不敏感）。
function createTableBlock(corpus: string, table: string): string | null {
  const re = new RegExp(`create\\s+table\\s+(?:if\\s+not\\s+exists\\s+)?${table}\\s*\\(([\\s\\S]*?)\\);`, "i");
  const match = corpus.match(re);
  return match ? match[1] : null;
}

// 语料中 <table>.<column> 的加法定义二选一：
//   alter table <table> add column [if not exists] <column>
//   create table <table> (...) 块内出现 <column>
function corpusDefinesColumn(corpus: string, table: string, column: string): boolean {
  const alter = new RegExp(
    `alter\\s+table\\s+${table}\\s+add\\s+column\\s+(?:if\\s+not\\s+exists\\s+)?${column}\\b`,
    "i",
  );
  if (alter.test(corpus)) return true;
  const block = createTableBlock(corpus, table);
  return block !== null && new RegExp(`\\b${column}\\b`, "i").test(block);
}

describe("内容版本聚合 SQL 契约（content-version.ts × migrations/*.sql）", () => {
  const sqlText = aggregateSql();
  const corpus = migrationCorpus();

  it("聚合 SQL 引用全部 6 张预期表（from <table>）", () => {
    for (const table of Object.keys(EXPECTED_COLUMNS)) {
      assert.match(sqlText, new RegExp(`from\\s+${table}\\b`, "i"), `聚合 SQL 应引用表 ${table}`);
    }
  });

  it("聚合 SQL 引用全部预期列（按表限定作用域，签名字段一个不能少）", () => {
    for (const [table, columns] of Object.entries(EXPECTED_COLUMNS)) {
      for (const column of columns) {
        if (table === "doc_download_counts" && column === "count") {
          // 全 SQL 有约 20 处 count(*)，裸 \bcount\b 断言形同虚设；
          // 实际列引用是 coalesce(sum(count), 0) 里的 sum(count)。
          assert.match(
            sqlText,
            /sum\s*\(\s*count\s*\)/,
            `SQL 缺少 ${table}.${column} 的引用（应为 sum(count)）`,
          );
          continue;
        }
        // 列与表必须落在同一子查询内（[^)]* 不跨出子查询右括号）：
        //   - where 过滤列（status / content_state / reviewed_at …）出现在 from <table> 之后；
        //   - 聚合列（max(created_at) …）出现在 from <table> 之前，且中间隔着 max( ) 的
        //     右括号，故列侧允许一个可选 \)?。
        const afterFrom = new RegExp(`from\\s+${table}\\b[^)]*\\b${column}\\b`);
        const beforeFrom = new RegExp(`\\b${column}\\b\\)?[^)]*from\\s+${table}\\b`);
        assert.ok(
          afterFrom.test(sqlText) || beforeFrom.test(sqlText),
          `SQL 缺少 ${table}.${column} 的引用`,
        );
      }
    }
  });

  // 已知局限：迁移语料是全量拼接的，若某列先加后删（后置迁移 drop column），
  // 语料仍会读到“已定义”。当前预期集合中没有列被后续迁移删除（已核对——
  // 被删的是 bots.{handle,im_platform,status,skills,accent}、posts.{severity,
  // content_state,response_time}、docs.{supersedes,superseded_by,valid_until}，
  // 均不在预期集合内）。
  it("迁移语料为每个预期列提供加法定义（alter add column 或 create table 块内）", () => {
    for (const [table, columns] of Object.entries(EXPECTED_COLUMNS)) {
      for (const column of columns) {
        assert.ok(
          corpusDefinesColumn(corpus, table, column),
          `migrations/*.sql 语料应定义 ${table}.${column}（alter table ${table} add column 或 create table ${table} 块内）`,
        );
      }
    }
  });

  it("预期集合中每张表在迁移语料中都有 create table", () => {
    for (const table of Object.keys(EXPECTED_COLUMNS)) {
      assert.ok(createTableBlock(corpus, table) !== null, `迁移语料应包含 create table ${table}`);
    }
  });
});
