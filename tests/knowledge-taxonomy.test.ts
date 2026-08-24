import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  KNOWLEDGE_CATEGORY_OPTIONS,
  KNOWLEDGE_SUBTYPE_MAP,
  DOMAIN_CATEGORY_OVERRIDES,
  DOMAIN_SUBTYPE_OVERRIDES,
  CATEGORY_SLUGS,
  SUBTYPE_SLUGS,
  categoryToSlug,
  subtypeToSlug,
  isKnowledgeCategory,
  isKnowledgeSubtype,
  EXPERIENCE_CATEGORY,
  categoriesForDomain,
  subtypesForDomainCategory,
} from "../src/lib/knowledge-taxonomy.ts";

describe("默认种别与类型表（全局 6）", () => {
  it("默认种别恰为 6 值且顺序固定", () => {
    assert.deepEqual(
      [...KNOWLEDGE_CATEGORY_OPTIONS],
      ["标准", "方法", "工具", "案例", "体系", "经验"],
    );
  });

  it("每个默认种别都有类型列表；经验为空", () => {
    for (const category of KNOWLEDGE_CATEGORY_OPTIONS) {
      assert.ok(Array.isArray(KNOWLEDGE_SUBTYPE_MAP[category]));
    }
    assert.deepEqual([...KNOWLEDGE_SUBTYPE_MAP["经验"]], []);
    assert.ok(KNOWLEDGE_SUBTYPE_MAP["标准"].includes("编码标准"));
    assert.ok(KNOWLEDGE_SUBTYPE_MAP["体系"].includes("应急预案"));
  });

  it("EXPERIENCE_CATEGORY 常量为经验", () => {
    assert.equal(EXPERIENCE_CATEGORY, "经验");
  });
});

describe("平台运营领域覆盖", () => {
  it("categoriesForDomain 返回平台运营 10 种别", () => {
    assert.deepEqual(
      [...categoriesForDomain("平台运营")],
      ["体系", "白皮书", "功能介绍", "接入申请", "新人上手", "平台手册", "治理规范", "便捷指南", "迭代规划", "经验"],
    );
  });

  it("未覆盖领域回落默认 6 种别", () => {
    assert.deepEqual([...categoriesForDomain("数据与算法")], [...KNOWLEDGE_CATEGORY_OPTIONS]);
    assert.deepEqual([...categoriesForDomain("不存在领域")], [...KNOWLEDGE_CATEGORY_OPTIONS]);
  });

  it("subtypesForDomainCategory：平台运营·体系 用 4 类型", () => {
    assert.deepEqual(
      [...subtypesForDomainCategory("平台运营", "体系")],
      ["使用手册", "管理流程", "管理办法", "审核条款"],
    );
  });

  it("subtypesForDomainCategory：平台运营其余种别为空", () => {
    assert.deepEqual([...subtypesForDomainCategory("平台运营", "白皮书")], []);
    assert.deepEqual([...subtypesForDomainCategory("平台运营", "经验")], []);
    assert.deepEqual([...subtypesForDomainCategory("平台运营", "平台手册")], []);
  });

  it("subtypesForDomainCategory：默认领域·体系 用全局 3 类型", () => {
    assert.deepEqual(
      [...subtypesForDomainCategory("数据与算法", "体系")],
      ["应急预案", "风险评估", "岗位操作规程"],
    );
  });

  it("DOMAIN_CATEGORY_OVERRIDES / DOMAIN_SUBTYPE_OVERRIDES 结构", () => {
    assert.ok(DOMAIN_CATEGORY_OVERRIDES["平台运营"]);
    assert.deepEqual([...DOMAIN_SUBTYPE_OVERRIDES["平台运营"]["体系"]], ["使用手册", "管理流程", "管理办法", "审核条款"]);
  });
});


describe("种别 / 类型 → slug", () => {
  it("默认种别有唯一 slug，小写英文连字符", () => {
    const slugs = KNOWLEDGE_CATEGORY_OPTIONS.map((c) => CATEGORY_SLUGS[c]);
    for (const slug of slugs) assert.match(slug, /^[a-z0-9-]+$/);
    assert.equal(new Set(slugs).size, slugs.length);
    assert.equal(CATEGORY_SLUGS["经验"], "experience");
  });

  it("平台运营新种别有 slug", () => {
    const entries: Record<string, string> = {
      白皮书: "whitepaper",
      功能介绍: "feature-intro",
      接入申请: "access-request",
      新人上手: "onboarding",
      平台手册: "platform-manual",
      "治理规范": "governance-spec",
      便捷指南: "quick-guide",
      迭代规划: "roadmap",
    };
    for (const [c, slug] of Object.entries(entries)) {
      assert.equal(CATEGORY_SLUGS[c], slug, `${c} slug`);
      assert.match(slug, /^[a-z0-9-]+$/);
    }
    assert.equal(CATEGORY_SLUGS["体系"], "system");
  });

  it("平台运营体系新类型有 slug", () => {
    const entries: Record<string, string> = {
      使用手册: "user-manual",
      管理流程: "management-process",
      管理办法: "management-rule",
      审核条款: "audit-clause",
    };
    for (const [s, slug] of Object.entries(entries)) {
      assert.equal(SUBTYPE_SLUGS[s], slug, `${s} slug`);
      assert.match(slug, /^[a-z0-9-]+$/);
    }
  });

  it("categoryToSlug / subtypeToSlug 查表，未知回退", () => {
    assert.equal(categoryToSlug("标准"), CATEGORY_SLUGS["标准"]);
    assert.equal(categoryToSlug("白皮书"), "whitepaper");
    assert.equal(categoryToSlug("不存在"), "experience");
    assert.equal(subtypeToSlug("使用手册"), "user-manual");
    assert.equal(subtypeToSlug("不存在"), "general");
  });
});

describe("类型守卫", () => {
  it("isKnowledgeCategory 只认默认 6 值", () => {
    assert.equal(isKnowledgeCategory("方法"), true);
    assert.equal(isKnowledgeCategory("白皮书"), false);
    assert.equal(isKnowledgeCategory("调研笔记"), false);
  });

  it("isKnowledgeSubtype 3 参：默认领域级联", () => {
    assert.equal(isKnowledgeSubtype("数据与算法", "标准", "编码标准"), true);
    assert.equal(isKnowledgeSubtype("数据与算法", "标准", "竞品调研报告"), false);
    assert.equal(isKnowledgeSubtype("数据与算法", "经验", null), true);
    assert.equal(isKnowledgeSubtype("数据与算法", "经验", "编码标准"), false);
    assert.equal(isKnowledgeSubtype("数据与算法", "标准", null), false);
  });

  it("isKnowledgeSubtype 3 参：平台运营级联", () => {
    // 体系用专属 4 类型
    assert.equal(isKnowledgeSubtype("平台运营", "体系", "使用手册"), true);
    assert.equal(isKnowledgeSubtype("平台运营", "体系", "应急预案"), false); // 默认领域类型在平台运营被拒
    // 无类型种别：subtype 须空
    assert.equal(isKnowledgeSubtype("平台运营", "白皮书", null), true);
    assert.equal(isKnowledgeSubtype("平台运营", "白皮书", ""), true);
    assert.equal(isKnowledgeSubtype("平台运营", "白皮书", "使用手册"), false);
    assert.equal(isKnowledgeSubtype("平台运营", "经验", null), true);
    // 体系须非空
    assert.equal(isKnowledgeSubtype("平台运营", "体系", null), false);
  });

  it("isKnowledgeSubtype 3 参：种别不属于该领域 → false", () => {
    assert.equal(isKnowledgeSubtype("平台运营", "标准", "编码标准"), false); // 标准不在平台运营种别集
    assert.equal(isKnowledgeSubtype("数据与算法", "白皮书", null), false); // 白皮书不在默认种别集
  });
});
