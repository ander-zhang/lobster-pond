// 直接从 content-stats.ts 导入而非 content.ts 门面：门面只含 export * 转发，
// tsx 转 CJS 后 cjs-module-lexer 无法静态解析具名导出，会报
// "does not provide an export named 'getReferenceHealth'"。
import { getReferenceHealth, getStats } from "../src/lib/content-stats.ts";

const missing = await getReferenceHealth();
const stats = await getStats();

if (missing.length > 0) {
  console.error("Content reference check failed:");
  for (const item of missing) {
    console.error(`- ${item}`);
  }
  process.exit(1);
}

console.log(
  `Content references OK: ${stats.bots} bots, ${stats.posts} posts, ${stats.knowledge} knowledge docs, ${stats.skills} skills.`,
);
