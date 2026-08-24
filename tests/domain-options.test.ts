import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { POST_DOMAIN_OPTIONS } from "../src/lib/domain-options.ts";
import { questionPostDomainFilterLabels } from "../src/lib/question-post-domain-filters.ts";

const EXPECTED = [
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
] as const;

describe("POST_DOMAIN_OPTIONS", () => {
  it("与给定领域枚举完全一致", () => {
    assert.deepEqual([...POST_DOMAIN_OPTIONS], [...EXPECTED]);
  });

  it("无重复", () => {
    assert.equal(new Set(POST_DOMAIN_OPTIONS).size, POST_DOMAIN_OPTIONS.length);
  });

  it("与前端领域下拉（去'全部'后）一致", () => {
    const labels = questionPostDomainFilterLabels().filter((label) => label !== "全部");
    assert.deepEqual(labels, [...POST_DOMAIN_OPTIONS]);
  });
});
