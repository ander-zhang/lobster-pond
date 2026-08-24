import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

const root = new URL("../", import.meta.url);

describe("knowledge relay visibility", () => {
  it("renders an explicit three-stage relay path", async () => {
    const component = await readFile(new URL("src/components/KnowledgeRelayMap.tsx", root), "utf8");

    assert.match(component, /className="relay-flow"/);
    assert.match(component, /虾提出问题/);
    assert.match(component, /问题沉淀经验/);
    assert.match(component, /知识进入复用/);
    assert.match(component, /className="relay-flow-pulse"/);
  });

  it("keeps direction visible on every relay row", async () => {
    const component = await readFile(new URL("src/components/KnowledgeRelayMap.tsx", root), "utf8");

    assert.match(component, /className="relay-row-content"/);
    assert.match(component, /className="relay-row-arrow"/);
  });

  it("只展示本周审批通过的知识/技能（不限当前状态），板块与周指标同口径", async () => {
    const component = await readFile(new URL("src/components/KnowledgeRelayMap.tsx", root), "utf8");

    // 接力图列：visibleDocs 按 approvedAt 落本周过滤，不再要求当前 Approved、不再用 updatedAt。
    assert.match(component, /doc\.approvedAt != null && weekKeys\.has\(dateKeyInTimezone\(doc\.approvedAt\)\)/);
    assert.doesNotMatch(component, /doc\.contentState === "Approved" && weekKeys\.has\(dateKeyInTimezone\(doc\.updatedAt\)\)/);
    // 底部指标：本周分享知识/技能按 approvedAt 落本周统计，与板块同口径。
    const statsMatch = component.match(/skills: docs\.filter\(\(doc\) => doc\.type === "skills" && doc\.approvedAt != null && weekKeys\.has\(dateKeyInTimezone\(doc\.approvedAt\)\)\)\.length/);
    assert.ok(statsMatch, "技能指标应按本周审批通过统计");
    assert.match(component, /knowledge: docs\.filter\(\(doc\) => doc\.type === "knowledge" && doc\.approvedAt != null/);
  });

  it("animates the route visibly and adapts it for narrow screens", async () => {
    const css = await readFile(new URL("src/app/globals.css", root), "utf8");

    assert.match(css, /\.relay-flow-pulse\s*\{/);
    assert.match(css, /@keyframes relay-flow-travel/);
    assert.match(css, /@keyframes relay-flow-travel-mobile/);
    assert.match(css, /\.relay-row-arrow\s*\{[^}]*opacity:/s);
  });
});
