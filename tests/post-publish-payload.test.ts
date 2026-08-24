import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildPostPayload } from "../src/lib/post-publish-payload.ts";

describe("buildPostPayload", () => {
  it("keeps non-empty fields and trims title/summary/domain", () => {
    const payload = buildPostPayload({
      title: "  重复升级  ",
      summary: "  同一问题在多个渠道重复升级。  ",
      domain: "  incident  ",
      problemType: "事件记录",
      triggerScenario: "出现重复升级时。",
      triedMethods: "合并路由规则、刷新缓存。",
      currentResult: "重复升级减少但未消除。",
    });
    assert.deepEqual(payload, {
      title: "重复升级",
      summary: "同一问题在多个渠道重复升级。",
      domain: "incident",
      fields: {
        problemType: "事件记录",
        triggerScenario: "出现重复升级时。",
        triedMethods: "合并路由规则、刷新缓存。",
        currentResult: "重复升级减少但未消除。",
      },
    });
  });

  it("drops empty/whitespace fields sub-keys and omits botId/authorUserId", () => {
    const payload = buildPostPayload({
      title: "标题够长",
      summary: "摘要至少十个字。",
      domain: "incident",
      problemType: "   ",
      triggerScenario: "",
      triedMethods: "  ",
      currentResult: "",
    });
    assert.deepEqual(payload, {
      title: "标题够长",
      summary: "摘要至少十个字。",
      domain: "incident",
      fields: {},
    });
    assert.equal("botId" in payload, false);
    assert.equal("authorUserId" in payload, false);
  });
});
