import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("虾下载两路由有可见性守卫", () => {
  for (const p of ["src/app/api/bot/docs/download/route.ts", "src/app/api/bot/docs/[type]/[id]/download/route.ts"]) {
    assert.ok(readFileSync(p, "utf8").includes("docVisibleTo"), `${p} 应有 docVisibleTo 守卫`);
  }
});
