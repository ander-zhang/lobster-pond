// tests/problem-card-summary.test.ts
// 问题帖预览卡片（ProblemPacketCard）摘要超过一行时截断为一行（truncate，溢出省略号）。
// 紧凑模式（审核队列）与非紧凑模式一致，均截断为一行。
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

const root = new URL("../", import.meta.url);

describe("问题帖预览卡片摘要截断", () => {
  it("非紧凑模式摘要截断为一行（truncate）", async () => {
    const source = await readFile(new URL("src/components/ProblemPacketCard.tsx", root), "utf8");
    assert.match(source, /truncate/);
  });

  it("紧凑模式（审核队列）摘要同样为 truncate", async () => {
    const source = await readFile(new URL("src/components/ProblemPacketCard.tsx", root), "utf8");
    assert.match(source, /compact \? "mt-1\.5 truncate/);
  });
});
