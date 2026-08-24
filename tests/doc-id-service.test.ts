// tests/doc-id-service.test.ts
// 知识 id 自动分配：领域/种别/类型 → slug、4 段格式、经验省略类型段。
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { domainToSlug, DOMAIN_SLUGS } from "../src/lib/domain-slug.ts";
import { knowledgeIdPrefix, fallbackKnowledgeId } from "../src/lib/services/doc-id-service.ts";

describe("领域 → 英文 slug 映射", () => {
  it("覆盖全部 11 个枚举领域，slug 为小写英文连字符", () => {
    const domains = [
      "前端开发", "后端开发", "架构设计", "运维与部署", "安全",
      "测试与质量", "工具链", "项目与流程", "数据与算法", "平台运营", "其他",
    ];
    for (const domain of domains) {
      const slug = domainToSlug(domain);
      assert.match(slug, /^[a-z0-9-]+$/);
    }
  });

  it("已知领域映射确定", () => {
    assert.equal(domainToSlug("数据与算法"), "data-algorithms");
    assert.equal(domainToSlug("运维与部署"), "ops-deployment");
  });
});

describe("knowledgeIdPrefix（无 k- 前缀，4 段/3 段）", () => {
  it("非经验：<领域>-<种别>-<类型>", () => {
    assert.equal(knowledgeIdPrefix("运维与部署", "标准", "编码标准"), "ops-deployment-standard-coding-standard");
    assert.equal(knowledgeIdPrefix("数据与算法", "方法", "竞品调研报告"), "data-algorithms-method-research-report");
  });

  it("经验：省略类型段 → <领域>-experience", () => {
    assert.equal(knowledgeIdPrefix("运维与部署", "经验", null), "ops-deployment-experience");
    assert.equal(knowledgeIdPrefix("运维与部署", "经验", ""), "ops-deployment-experience");
  });
});

describe("fallbackKnowledgeId（无数据库回退）", () => {
  it("非经验带 4 段前缀 + 随机后缀，无 k- 前缀", () => {
    const id = fallbackKnowledgeId("运维与部署", "标准", "编码标准");
    assert.match(id, /^ops-deployment-standard-coding-standard-[a-z0-9]+$/);
    assert.ok(!id.startsWith("k-"));
  });

  it("经验省略类型段", () => {
    const id = fallbackKnowledgeId("运维与部署", "经验", null);
    assert.match(id, /^ops-deployment-experience-[a-z0-9]+$/);
  });
});

describe("DOMAIN_SLUGS 单数据源", () => {
  it("每个领域都有唯一 slug", () => {
    const slugs = Object.values(DOMAIN_SLUGS);
    assert.equal(new Set(slugs).size, slugs.length);
  });
});
