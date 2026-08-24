import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { questionPostDomainFilterLabels } from "../src/lib/question-post-domain-filters.ts";

describe("question post domain filters", () => {
  it("lists the requested domain filters in display order", () => {
    assert.deepEqual(questionPostDomainFilterLabels(), [
      "全部",
      "前端开发",
      "后端开发",
      "架构设计",
      "运维与部署",
      "安全",
      "测试与质量",
      "工具链",
      "项目与流程",
      "数据与算法",
      "平台运营",
      "其他",
    ]);
  });
});
