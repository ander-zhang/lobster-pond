import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createZip, readZipEntries } from "../src/lib/zip.ts";
import { parseKnowledgeUpload, parseSkillUpload } from "../src/lib/doc-upload.ts";

const KNOWLEDGE_MD = `---
id: upload-routing-matrix
category: 调研笔记
title: 上传路由矩阵
tags: [incident, routing]
domain: 安全
updatedAt: 2026-07-15
ownerBotIds: [relay-ops]
summary: 把重复告警映射到单一故障负责人的矩阵。
contentState: Approved
version: v1.0
---
# 上传路由矩阵

正文内容，至少十个字符。
`;

// 不含 ownerBotIds 的知识 .md：人类上传，owner 由发布者派生。
const KNOWLEDGE_MD_NO_OWNER = `---
category: 操作规范
title: 人工上传须知
tags: [docs]
domain: 数据与算法
updatedAt: 2026-07-19
summary: 人类用户上传知识时的注意事项，至少十个字。
---
# 人工上传须知

正文内容，至少十个字符。
`;

// 技能包 SKILL.md：用 agent skill 约定的 name/description。
const SKILL_MD = `---
name: upload-triage
description: 故障分诊技能，把告警按严重度分流。
title: 上传分诊
tags: [incident]
scenario: 编程开发
updatedAt: 2026-07-15
ownerBotIds: [relay-ops]
---
# 上传分诊

正文内容，至少十个字符。
`;

describe("zip readZipEntries", () => {
  it("store 模式往返：写什么读什么", () => {
    const zip = createZip([
      { path: "a/SKILL.md", content: "hello" },
      { path: "a/README.md", content: "world" },
    ]);
    const entries = readZipEntries(zip);
    assert.equal(entries.length, 2);
    const skill = entries.find((e) => e.path === "a/SKILL.md");
    assert.ok(skill);
    assert.equal(new TextDecoder().decode(skill!.data), "hello");
  });

  it("非 zip 字节抛错", () => {
    assert.throws(() => readZipEntries(new Uint8Array([1, 2, 3])), /EOCD/);
  });
});

describe("parseKnowledgeUpload", () => {
  it("从 frontmatter 还原 DocInput（id 不再解析，改为 category）", () => {
    const input = parseKnowledgeUpload(KNOWLEDGE_MD);
    assert.equal(input.category, "调研笔记");
    assert.equal(input.type, "knowledge");
    assert.equal(input.title, "上传路由矩阵");
    assert.deepEqual(input.tags, ["incident", "routing"]);
    assert.equal(input.domain, "安全");
    assert.deepEqual(input.ownerBotIds, ["relay-ops"]);
    assert.equal(input.version, "v1.0");
    assert.equal(input.contentState, "Approved");
    assert.ok(input.body.startsWith("# 上传路由矩阵"));
  });

  it("缺 frontmatter 抛错", () => {
    assert.throws(() => parseKnowledgeUpload("没有 frontmatter 的纯正文"), /frontmatter/);
  });

  it("不含 ownerBotIds 的知识 .md 解析为空数组", () => {
    const input = parseKnowledgeUpload(KNOWLEDGE_MD_NO_OWNER);
    assert.equal(input.category, "操作规范");
    assert.equal(input.type, "knowledge");
    assert.deepEqual(input.ownerBotIds, []);
    assert.ok(input.body.startsWith("# 人工上传须知"));
  });

  it("缺必填字段抛错并列出", () => {
    const bad = `---
title: 缺 category 的知识
tags: [x]
domain: 数据与算法
ownerBotIds: [relay-ops]
summary: 这是一个够长的摘要用于通过校验。
---
正文内容。`;
    assert.throws(() => parseKnowledgeUpload(bad), /category/);
  });

  it("缺 domain 不抛错，缺省空串（领域由上传弹窗提供）", () => {
    const noDomain = `---
category: 调研笔记
title: 没有领域的知识
tags: [x]
ownerBotIds: [relay-ops]
summary: 这是一个够长的摘要用于通过校验。
---
正文内容，至少十个字符。`;
    const input = parseKnowledgeUpload(noDomain);
    assert.equal(input.domain, "");
  });

  it("自定义 domain（非枚举成员）抛明确错误", () => {
    const customDomain = `---
category: 调研笔记
title: 自定义领域的知识
tags: [x]
ownerBotIds: [relay-ops]
summary: 这是一个够长的摘要用于通过校验。
domain: 自定义领域
---
正文内容，至少十个字符。`;
    assert.throws(() => parseKnowledgeUpload(customDomain), /领域字段 domain 必须从枚举选择一个/);
  });
});

const KNOWLEDGE_MD_WITH_SUBTYPE = `---
title: 三级分类知识
tags: [gb]
domain: 运维与部署
category: 标准
subtype: 编码标准
summary: 校验三级分类解析的知识文档，至少十个字。
---
# 三级分类知识

正文内容，至少十个字符。
`;

describe("知识 .md 解析 category / subtype", () => {
  it("解析种别与类型", () => {
    const input = parseKnowledgeUpload(KNOWLEDGE_MD_WITH_SUBTYPE);
    assert.equal(input.category, "标准");
    assert.equal(input.subtype, "编码标准");
  });

  it("经验无 subtype 时 subtype 为 undefined", () => {
    const md = KNOWLEDGE_MD_WITH_SUBTYPE.replace("category: 标准", "category: 经验").replace("subtype: 编码标准\n", "");
    const input = parseKnowledgeUpload(md);
    assert.equal(input.category, "经验");
    assert.equal(input.subtype, undefined);
  });
});

describe("parseSkillUpload", () => {
  it("从 zip 内 SKILL.md 还原 DocInput，name→id / description→summary", () => {
    const zip = createZip([{ path: "upload-triage/SKILL.md", content: SKILL_MD }]);
    const { docInput, zipBase64 } = parseSkillUpload(zip);

    assert.equal(docInput.id, "upload-triage");
    assert.equal(docInput.type, "skills");
    assert.equal(docInput.summary, "故障分诊技能，把告警按严重度分流。");
    assert.equal(docInput.title, "上传分诊");
    assert.deepEqual(docInput.ownerBotIds, ["relay-ops"]);
    assert.ok(docInput.body.startsWith("# 上传分诊"));

    // zip 原样转 base64（可还原回原字节）。
    const restored = Buffer.from(zipBase64, "base64");
    assert.deepEqual(Array.from(restored), Array.from(zip));
  });

  it("压缩包无 SKILL.md 抛错", () => {
    const zip = createZip([{ path: "foo/README.md", content: "no skill here" }]);
    assert.throws(() => parseSkillUpload(zip), /SKILL\.md/);
  });

  it("只需 name + description + scenario + 正文即可上传（用户上传技能，不要求虾/标签）", () => {
    const minimal = `---
name: rag-pipeline
name_zh: RAG知识库全链路助手
description: 把文档构建为可检索的知识库并基于其回答问题。
scenario: 编程开发
version: 1.0.2
---
# RAG Pipeline

技能正文，至少一个字符。
`;
    const zip = createZip([{ path: "rag-pipeline/SKILL.md", content: minimal }]);
    const { docInput } = parseSkillUpload(zip);

    assert.equal(docInput.id, "rag-pipeline");
    assert.equal(docInput.type, "skills");
    // 展示名取 name_zh（无显式 title 时）。
    assert.equal(docInput.title, "RAG知识库全链路助手");
    assert.equal(docInput.summary, "把文档构建为可检索的知识库并基于其回答问题。");
    assert.equal(docInput.version, "1.0.2");
    assert.equal(docInput.scenario, "编程开发");
    // 未提供的字段留空，不再抛错。
    assert.deepEqual(docInput.tags, []);
    assert.deepEqual(docInput.ownerBotIds, []);
    assert.ok(docInput.body.startsWith("# RAG Pipeline"));
  });

  it("技能缺 name 与 description 抛错", () => {
    const noName = `---
title: 没有名字的技能
---
正文内容。`;
    const zip = createZip([{ path: "x/SKILL.md", content: noName }]);
    assert.throws(() => parseSkillUpload(zip), /id|description/);
  });

  it("name 含下划线时规整为连字符以满足 slugId 规则", () => {
    const underscored = `---
name: oa_canteen
description: 食堂查询与账户管理技能。
scenario: 办公协同
---
# 食堂查询

正文内容。`;
    const zip = createZip([{ path: "oa_canteen/SKILL.md", content: underscored }]);
    const { docInput } = parseSkillUpload(zip);

    assert.equal(docInput.id, "oa-canteen");
    // title 取 name 原文（仅 id 规整化，展示名保留）。
    assert.equal(docInput.title, "oa_canteen");
    assert.equal(docInput.scenario, "办公协同");
  });

  it("技能自定义 scenario（非枚举成员）抛明确错误", () => {
    const customScenario = `---
name: custom-scenario-skill
description: 使用自定义场景的技能包。
scenario: 自定义场景
---
# 自定义场景

正文内容。`;
    const zip = createZip([{ path: "custom-scenario-skill/SKILL.md", content: customScenario }]);
    assert.throws(() => parseSkillUpload(zip), /场景字段 scenario 必须从枚举选择一个/);
  });
});
