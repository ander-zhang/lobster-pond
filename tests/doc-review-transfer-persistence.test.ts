// tests/doc-review-transfer-persistence.test.ts
// 转审持久化契约（迁移 054：转审挂在文档上，被驳回→虾修订回到待审核后审批权
// 仍归被转审人）。修订走 replaceDoc —— 实现是「删 docs 行 + insertDocQuery 重建」，
// 曾有两个静默丢转审关系的缺口：
//   1) insertDocQuery 不写 review_transferred_* 三列 → 重建后转审关系清空，
//      审批权错误地回到岗位虾 owner（服务层 doc 对象明明保留了这三字段）；
//   2) doc_review_transfer_notifications.doc_id 外键 on delete cascade，
//      删 docs 行会连带清掉被转审人的铃铛通知，而 replaceDoc 对评论 /
//      评论通知等依赖表都做了暂存重建，唯独漏了这张表。
// 本测试读源码断言（仿 content-version-sql-contract.test.ts，无 DB）：
//   1) insertDocQuery 的 insert 列 / values / on conflict update set 均含三列，
//      且 values 绑定 doc 对象字段（而非硬编码 null）；
//   2) replaceDoc 函数体暂存并重建 doc_review_transfer_notifications 行。
import assert from "node:assert/strict";
import fs from "node:fs";
import { describe, it } from "node:test";

const root = new URL("../", import.meta.url);
const mutations = fs.readFileSync(new URL("src/lib/content-mutations.ts", root), "utf8");

// 抽取函数源码：自 export 声明起，懒惰匹配到首个顶格 `}`（函数结束）。
function functionBody(name: string): string {
  const match = mutations.match(new RegExp(`export (?:async )?function ${name}[\\s\\S]*?\\n\\}`));
  assert.ok(match, `src/lib/content-mutations.ts 应定义 ${name}`);
  return match[0];
}

// 固定的预期集合（勿从 SQL 反推——契约的意义在于独立锚定，与迁移 054 对齐）。
const TRANSFER_COLUMNS = [
  "review_transferred_to_user_id",
  "review_transferred_at",
  "review_transferred_by_user_id",
];
const TRANSFER_DOC_FIELDS = [
  "reviewTransferredToUserId",
  "reviewTransferredAt",
  "reviewTransferredByUserId",
];

describe("转审持久化契约（content-mutations.ts × 迁移 054）", () => {
  const insertBody = functionBody("insertDocQuery");

  it("insertDocQuery 的 insert 列清单包含 review_transferred_* 三列", () => {
    const columnList = insertBody.match(/insert into docs \(([\s\S]*?)\)\s*values/)?.[1] ?? "";
    assert.ok(columnList.length > 0, "insertDocQuery 应有 insert into docs (...) values 结构");
    for (const column of TRANSFER_COLUMNS) {
      assert.match(columnList, new RegExp(`\\b${column}\\b`), `insert 列清单应包含 ${column}`);
    }
  });

  it("insertDocQuery 的 values 绑定 doc 对象的转审字段（非硬编码 null）", () => {
    for (const field of TRANSFER_DOC_FIELDS) {
      assert.match(insertBody, new RegExp(`doc\\.${field}`), `values 应绑定 doc.${field}`);
    }
  });

  it("insertDocQuery 的 on conflict update set 同步三列（upsert 与 doc 对象一致）", () => {
    const updateSet = insertBody.split("on conflict")[1] ?? "";
    for (const column of TRANSFER_COLUMNS) {
      assert.match(
        updateSet,
        new RegExp(`${column}\\s*=\\s*excluded\\.${column}`),
        `on conflict update set 应包含 ${column} = excluded.${column}`,
      );
    }
  });

  it("replaceDoc 暂存并重建 doc_review_transfer_notifications（删 docs 行会级联清空该表）", () => {
    const body = functionBody("replaceDoc");
    assert.match(
      body,
      /from doc_review_transfer_notifications where doc_id = \$\{currentId\}/,
      "replaceDoc 删除前应暂存 doc_review_transfer_notifications 行",
    );
    assert.match(
      body,
      /insert into doc_review_transfer_notifications[\s\S]*\$\{doc\.id\}/,
      "replaceDoc 应以新 id 重建 doc_review_transfer_notifications 行",
    );
  });
});
