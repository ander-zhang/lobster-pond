import { parse as parseYaml } from "yaml";
import { readZipEntries } from "./zip.ts";
import { readTarGzEntries } from "./tar.ts";
import type { DocInput } from "./services/schemas.ts";
import { POST_DOMAIN_OPTIONS, isPostDomain, type PostDomain } from "./domain-options.ts";
import { SKILL_SCENARIO_OPTIONS, isSkillScenario, type SkillScenario } from "./skill-scenarios.ts";

// 上传解析：把用户上传的知识 .md / 技能 .zip 还原成 createDoc 所需的 DocInput。
//
// 知识 .md：frontmatter 直接是虾塘字段（id/title/tags/domain/ownerBotIds/summary…），
// 与仓库内种子 .md 同构。
// 技能 .zip：包内 SKILL.md 用 agent skill 约定（name=id、description=summary），
// 同时兼容直接写 id/summary 的情况。zip 本体原样存为该文档附件，下载时返回原包。

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;

type ParsedDoc = {
  meta: Record<string, unknown>;
  body: string;
};

function parseFrontmatter(raw: string): ParsedDoc {
  const match = raw.match(FRONTMATTER_RE);
  if (!match) {
    throw new Error("缺少 YAML frontmatter（文件应以 --- 开头的元数据块开始）");
  }
  const parsed = parseYaml(match[1], { schema: "failsafe" });
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("frontmatter 不是合法的键值映射");
  }
  return { meta: parsed as Record<string, unknown>, body: match[2].trim() };
}

function asString(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  const text = String(value).trim();
  return text.length > 0 ? text : undefined;
}

function asStringArray(value: unknown): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (Array.isArray(value)) {
    const arr = value.map((item) => String(item).trim()).filter((text) => text.length > 0);
    return arr.length > 0 ? arr : undefined;
  }
  const text = String(value).trim();
  return text.length > 0 ? [text] : undefined;
}

// 解析器输出是"草稿 DocInput"：分类字段允许缺省（"" = 未设置，由上传弹窗覆盖，
// 或由机器接口路由检查后拒绝）。知识用 domain、技能用 scenario；正式 DocInput 的分类
// 字段是枚举，缺省态只在解析后、写入前存在。Omit 对 union 非分布，故显式补回可选字段。
export type ParsedDocInput = Omit<DocInput, "domain" | "scenario"> & {
  domain?: PostDomain | "";
  scenario?: SkillScenario | "";
  category?: string;
  subtype?: string;
};

// 领域解析：缺省 → ""（弹窗可填 / 机器接口检查）；非法自定义 → 明确报错；合法枚举 → 原样通过。
// 解析器对"缺省"保持宽松（web 弹窗会覆盖 domain），但对"自定义"严格——自定义领域直接拒绝。
function parsePostDomain(raw: string | undefined, label = "domain"): PostDomain | "" {
  if (!raw) return "";
  if (!isPostDomain(raw)) {
    throw new Error(
      `领域字段 ${label} 必须从枚举选择一个：${POST_DOMAIN_OPTIONS.join("、")}（当前为「${raw}」）`,
    );
  }
  return raw;
}

// 场景解析：缺省 → ""（弹窗可填 / 机器接口检查）；非法自定义 → 明确报错；合法枚举 → 原样通过。
function parseSkillScenario(raw: string | undefined, label = "scenario"): SkillScenario | "" {
  if (!raw) return "";
  if (!isSkillScenario(raw)) {
    throw new Error(
      `场景字段 ${label} 必须从枚举选择一个：${SKILL_SCENARIO_OPTIONS.join("、")}（当前为「${raw}」）`,
    );
  }
  return raw;
}

function applyOptionalFields(input: ParsedDocInput, meta: Record<string, unknown>) {
  const contentState = asString(meta.contentState);
  if (contentState) input.contentState = contentState as DocInput["contentState"];
  const version = asString(meta.version);
  if (version) input.version = version;
  const evidence = asString(meta.evidence);
  if (evidence) input.evidence = evidence;
}

// 知识 .md：frontmatter 直接是虾塘字段，id/title/tags/summary/body 均必填。
// domain 可缺省（由上传弹窗提供并覆盖）；ownerBotIds 可选（人类上传留空 []）。
function buildKnowledgeDocInput({ meta, body }: ParsedDoc): ParsedDocInput {
  // id 由系统自动分配（<领域slug>-<种别slug>-<类型slug>-<编号>，无 k- 前缀），frontmatter 不强制填 id。
  const category = asString(meta.category);
  const subtype = asString(meta.subtype);
  const summary = asString(meta.summary);
  const title = asString(meta.title);
  const tags = asStringArray(meta.tags);
  const domain = asString(meta.domain);
  const ownerBotIds = asStringArray(meta.ownerBotIds);

  const missing: string[] = [];
  if (!category) missing.push("category");
  if (!title) missing.push("title");
  if (!tags) missing.push("tags");
  if (!summary) missing.push("summary");
  if (!body) missing.push("正文");
  if (missing.length > 0) {
    throw new Error(`frontmatter 缺少字段：${missing.join("、")}`);
  }

  const input: ParsedDocInput = {
    // id 不填：系统自动分配。schema 中知识 id 可选，此处省略。
    category: category!,
    subtype,
    type: "knowledge",
    title: title!,
    tags: tags!,
    domain: parsePostDomain(domain),
    ownerBotIds: ownerBotIds ?? [],
    summary: summary!,
    body: body!,
  };
  applyOptionalFields(input, meta);
  return input;
}

// 技能 zip 内 SKILL.md：用 agent skill 约定，只需 name（→id）与 description（→summary）。
// title 依次取 title / name_zh / name；scenario 可缺省（由上传弹窗提供并覆盖），
// tags/ownerBotIds 不强制，缺省空数组。
function buildSkillDocInput({ meta, body }: ParsedDoc): ParsedDocInput {
  // agent skill 约定常用下划线命名（如 oa_canteen），但虾塘 slugId 只允许
  // [a-z0-9-]。这里把下划线规整为连字符，让外部 skill 包无需手改即可上传；
  // 仅规整 id（slug 用），title/summary 保留原文。
  const rawId = asString(meta.id) ?? asString(meta.name);
  const id = rawId?.replace(/_/g, "-");
  const summary = asString(meta.summary) ?? asString(meta.description);
  // 展示名优先级：显式 title > 中文名 name_zh > slug name。
  const title = asString(meta.title) ?? asString(meta.name_zh) ?? asString(meta.name);

  const missing: string[] = [];
  if (!id) missing.push("id（技能包可用 name）");
  if (!title) missing.push("title（技能包可用 name）");
  if (!summary) missing.push("summary（技能包可用 description）");
  if (!body) missing.push("正文");
  if (missing.length > 0) {
    throw new Error(`frontmatter 缺少字段：${missing.join("、")}`);
  }

  const input: ParsedDocInput = {
    id: id!,
    type: "skills",
    title: title!,
    tags: asStringArray(meta.tags) ?? [],
    scenario: parseSkillScenario(asString(meta.scenario)),
    ownerBotIds: asStringArray(meta.ownerBotIds) ?? [],
    summary: summary!,
    body: body!,
  };
  applyOptionalFields(input, meta);
  return input;
}

// 解析知识 .md 文本 → DocInput。
export function parseKnowledgeUpload(rawMd: string): ParsedDocInput {
  return buildKnowledgeDocInput(parseFrontmatter(rawMd));
}

export type SkillUploadResult = {
  docInput: ParsedDocInput;
  // 原始技能包的 base64，用于存为文档附件（下载时返回原包）。
  packageBase64: string;
  // 兼容现有调用方的旧字段名；内容同 packageBase64。
  zipBase64: string;
  contentType: string;
};

// 解析技能 .zip / .tar.gz → DocInput + 原包 base64。包内需含 SKILL.md（任意层级）。
export function parseSkillUpload(packageBytes: Uint8Array, packageName = "skill.zip"): SkillUploadResult {
  const isTarGz = packageName.toLowerCase().endsWith(".tar.gz") || packageName.toLowerCase().endsWith(".tgz");
  const entries = isTarGz ? readTarGzEntries(packageBytes) : readZipEntries(packageBytes);
  // 优先匹配 {id}/SKILL.md，退而求其次取任意 SKILL.md；忽略 __MACOSX 等。
  const skillEntry =
    entries.find((entry) => /^[^/]+\/SKILL\.md$/.test(entry.path)) ??
    entries.find((entry) => entry.path.endsWith("SKILL.md"));
  if (!skillEntry) {
    throw new Error("压缩包内未找到 SKILL.md");
  }

  const raw = new TextDecoder().decode(skillEntry.data);
  const docInput = buildSkillDocInput(parseFrontmatter(raw));
  return {
    docInput,
    packageBase64: Buffer.from(packageBytes).toString("base64"),
    zipBase64: Buffer.from(packageBytes).toString("base64"),
    contentType: isTarGz ? "application/gzip" : "application/zip",
  };
}
