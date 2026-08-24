import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SKILL_SCENARIO_OPTIONS, isSkillScenario } from "../src/lib/skill-scenarios.ts";

describe("技能场景枚举", () => {
  it("8 个场景值固定有序", () => {
    assert.deepEqual([...SKILL_SCENARIO_OPTIONS], [
      "办公协同", "内容创作", "数据分析", "知识管理",
      "研究洞察", "编程开发", "兴趣生活", "其他",
    ]);
  });

  it("isSkillScenario：枚举成员为 true，其余 false（类型收窄）", () => {
    assert.equal(isSkillScenario("编程开发"), true);
    assert.equal(typeof isSkillScenario("其他"), "boolean");
    assert.equal(isSkillScenario("数据与算法"), false);
    assert.equal(isSkillScenario(""), false);
  });
});
