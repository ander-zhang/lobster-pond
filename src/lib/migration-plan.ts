// 迁移执行计划纯函数。供 scripts/migrate.ts 与单测共用，避开 DB 与顶层 await。
// 背景：迁移此前无跟踪记录、按「幂等」假设每次全量重跑，但 019（清种子数据）与
// 046（虾文档 author_user_id 置空）跨迁移相互作用，使 019 在后续每次部署重跑时
// 误删虾文档。改为仅执行未记录迁移，并让旧库首次接入时「采纳」存量迁移而不重跑。

// 决定本轮「采纳（记为已应用但不执行）」与「执行」的迁移文件。
// schemaExists 表示 docs 表已存在（即 001 起的迁移早已在旧库跑过、只是无记录表）。
export function planMigrations(
  files: string[],
  applied: ReadonlySet<string>,
  schemaExists: boolean,
): { adopt: string[]; apply: string[] } {
  // 旧库无跟踪记录但 schema 已在 → 全部采纳为已应用，避免重跑（尤其 019 的删除语句）。
  if (applied.size === 0 && schemaExists) {
    return { adopt: files, apply: [] };
  }
  return { adopt: [], apply: files.filter((file) => !applied.has(file)) };
}
