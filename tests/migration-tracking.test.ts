// tests/migration-tracking.test.ts
// 迁移跟踪：根治「每次部署全量重跑迁移」导致的跨迁移误删。
// 019 清种子（delete from docs where author_user_id is null）与 046（虾文档
// author_user_id 置空）跨迁移相互作用，使 019 在后续每次部署重跑时误删虾文档。
// 此处单测 planMigrations 纯函数 + 断言 migrate.ts 源码含跟踪表与 schema 探测。
import assert from "node:assert/strict";
import fs from "node:fs";
import { describe, it } from "node:test";
import { planMigrations } from "../src/lib/migration-plan.ts";

const root = new URL("../", import.meta.url);
function source(path: string): string {
  return fs.readFileSync(new URL(path, root), "utf8");
}

const FILES = ["001_initial.sql", "019_purge_seed_data.sql", "046_bot_content_author_null.sql", "047_remove_supersedes.sql"];

describe("planMigrations（迁移执行计划）", () => {
  it("旧库无跟踪记录但 schema 已在 → 全部采纳为已应用，不重跑", () => {
    const plan = planMigrations(FILES, new Set(), true);
    assert.deepEqual(plan.adopt, FILES);
    assert.deepEqual(plan.apply, []);
  });

  it("全新空库（无记录且无 schema）→ 全部执行", () => {
    const plan = planMigrations(FILES, new Set(), false);
    assert.deepEqual(plan.adopt, []);
    assert.deepEqual(plan.apply, FILES);
  });

  it("已有跟踪记录 → 仅执行未记录的迁移", () => {
    const applied = new Set(["001_initial.sql", "019_purge_seed_data.sql"]);
    const plan = planMigrations(FILES, applied, true);
    assert.deepEqual(plan.adopt, []);
    assert.deepEqual(plan.apply, ["046_bot_content_author_null.sql", "047_remove_supersedes.sql"]);
  });

  it("全部已记录 → 本轮无执行也无采纳", () => {
    const applied = new Set(FILES);
    const plan = planMigrations(FILES, applied, true);
    assert.deepEqual(plan.adopt, []);
    assert.deepEqual(plan.apply, []);
  });
});

describe("migrate.ts 源码契约", () => {
  const code = source("scripts/migrate.ts");

  it("创建 migrations 跟踪表（name 主键 + applied_at）", () => {
    assert.match(code, /create table if not exists migrations/);
    assert.match(code, /name text primary key/);
    assert.match(code, /applied_at timestamptz/);
  });

  it("以 docs 表存在性探测旧库 schema", () => {
    assert.match(code, /to_regclass\('public\.docs'\)/);
  });

  it("migrate.ts 接线 planMigrations 纯函数", () => {
    assert.match(code, /import \{ planMigrations \} from "\.\.\/src\/lib\/migration-plan\.ts"/);
  });

  it("仅执行未记录迁移：migration-plan.ts 跳过 applied 集合中的文件", () => {
    assert.match(source("src/lib/migration-plan.ts"), /!applied\.has\(file\)/);
  });
});
