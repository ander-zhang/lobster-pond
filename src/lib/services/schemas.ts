import { z } from "zod";
import { POST_DOMAIN_OPTIONS } from "../domain-options";
import { SKILL_SCENARIO_OPTIONS } from "../skill-scenarios";
import { DOC_VERSION_RE } from "../versioning.ts";
import { categoriesForDomain, subtypesForDomainCategory, isKnowledgeSubtype } from "../knowledge-taxonomy.ts";

// Shared input schemas for write operations. Both the human GUI and HTTP entry
// points validate against these, so the two surfaces can never drift apart in
// what they accept.

const slugId = z
  .string()
  .trim()
  .min(2)
  .regex(/^[a-z0-9-]+$/, "id must use lowercase letters, numbers, and hyphens");

const nonEmpty = z.string().trim().min(1);

// 密码规则：≥ 8 字符。register 与 change-password 共用，避免漂移。
const passwordSchema = z.string().trim().min(8, "密码至少 8 个字符");

// 用户名规则：至少 1 个字符、最多 32 个字符，支持中文 / 字母 / 数字 / 下划线 / 连字符。
// register 与 change-username 共用；使用 Unicode 属性转义，避免中文被误判为非法字符。
const usernameSchema = z
  .string()
  .trim()
  .min(1, "用户名至少 1 个字符")
  .max(32, "用户名最多 32 个字符")
  .regex(/^[\p{Script=Han}a-zA-Z0-9_-]+$/u, "用户名只能包含中文、字母、数字、下划线和连字符");

// 内容状态机（§5）。
export const contentStateSchema = z.enum(["Approved", "Needs Review", "Needs Attention", "Reviewing"]);

// 可选的自由文本治理字段：空字符串规整为 undefined，避免写入空白。
const optionalText = z
  .string()
  .trim()
  .transform((value) => (value.length > 0 ? value : undefined))
  .optional();

// 文档版本：可选；提供了必须为 x.y.z 三段数字（无 v 前缀）。空串规整为 undefined。
const docVersion = z
  .string()
  .trim()
  .transform((value) => (value.length > 0 ? value : undefined))
  .optional()
  .refine((value) => value === undefined || DOC_VERSION_RE.test(value), "版本号格式必须为 x.y.z（如 1.0.0）");

export const botInputSchema = z.object({
  // id 可选：用户注册虾时不传，服务端自动生成（bot-<randomUUID>）。
  id: slugId.optional(),
  name: nonEmpty,
  role: z.enum(["个人虾", "岗位虾"]),
  // master 保留作历史字段；注册表单不采集，缺省空串。历史种子数据仍带值。
  master: z.string().trim().default(""),
  // 简介选填：可为空，最多 20 个字。
  summary: z.string().trim().max(20, "简介最多 20 个字").default(""),
  // 版本 / 模型：注册表单采集，必填。
  version: nonEmpty,
  model: nonEmpty,
  // 注册时领域只能选择一个，且必须从枚举选择。
  domains: z.array(z.enum(POST_DOMAIN_OPTIONS)).min(1, "domains must include at least one item").max(1, "domains must include no more than one item"),
});

// 虾编辑：仅 owner 可改 name/role/summary/version/model/domains（id/ownerUserId/master 不动）。
export const botUpdateSchema = z.object({
  name: nonEmpty,
  role: z.enum(["个人虾", "岗位虾"]),
  // 简介选填：可为空，最多 20 个字。
  summary: z.string().trim().max(20, "简介最多 20 个字").default(""),
  version: nonEmpty,
  model: nonEmpty,
  // 编辑时领域只能选择一个，且必须从枚举选择。
  domains: z.array(z.enum(POST_DOMAIN_OPTIONS)).min(1, "domains must include at least one item").max(1, "domains must include no more than one item"),
});
export type BotUpdate = z.infer<typeof botUpdateSchema>;

// 知识文档：title/category/tags/ownerBotIds/summary 必填；domain 必填，须为 POST_DOMAIN_OPTIONS 枚举成员。
// id 可选：创建时由系统自动分配 <领域slug>-<种别slug>-<类型slug>-<编号>（无 k- 前缀，见 doc-id-service），
// 文件中填写的 id 被忽略。category 必填，合法种别随领域而变（平台运营 10 种别，其余 6 种别），
// 级联校验在 superRefine 按领域执行。解析器允许 frontmatter 缺省 domain（返回 ""），但正式写入前
// 必须由上传弹窗或修订预填补齐。
const knowledgeDocInputSchema = z
  .object({
    id: z.string().trim().optional(),
    // 合法种别随领域而变（平台运营 10 种别，其余 6 种别），在 superRefine 按领域校验。
    category: z.string().trim().min(1),
    // 类型（三级）：可选字段，级联校验在 superRefine（经验须空、其余须属该种别）。
    subtype: z.string().trim().optional(),
    type: z.literal("knowledge"),
    title: z.string().trim().min(3),
    tags: z.array(nonEmpty).min(1),
    domain: z.enum(POST_DOMAIN_OPTIONS),
    ownerBotIds: z.array(nonEmpty).default([]),
    summary: z.string().trim().min(10),
    body: z.string().trim().min(10),
    contentState: contentStateSchema.optional(),
    version: docVersion,
    evidence: optionalText,
  })
  .superRefine((value, ctx) => {
    if (!categoriesForDomain(value.domain).includes(value.category)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["category"], message: `种别「${value.category}」不属于领域「${value.domain}」的种别列表` });
      return;
    }
    const subtypes = subtypesForDomainCategory(value.domain, value.category);
    const subtype = (value.subtype ?? "").trim();
    // 复用 Task 1 的领域级级联纯函数（已单测覆盖）。
    if (!isKnowledgeSubtype(value.domain, value.category, subtype)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["subtype"],
        message: subtypes.length === 0
          ? `种别「${value.category}」无类型，subtype 必须为空`
          : subtype.length === 0
            ? `种别「${value.category}」必须选择一个类型`
            : `类型「${subtype}」不属于种别「${value.category}」`,
      });
    }
  });

// 技能文档：用户上传 zip，只需 SKILL.md 里的 name（→id）与 description（→summary）。
// title/scenario 必填（scenario 须为 SKILL_SCENARIO_OPTIONS 枚举成员）；tags/ownerBotIds 可空——
// 技能不归虾所有，标签/归属可留空。缺省值由 schema 给出，保证下游 MarkdownDoc 形状一致。
const skillDocInputSchema = z.object({
  id: slugId,
  type: z.literal("skills"),
  title: z.string().trim().min(1),
  tags: z.array(nonEmpty).default([]),
  scenario: z.enum(SKILL_SCENARIO_OPTIONS),
  ownerBotIds: z.array(nonEmpty).default([]),
  summary: z.string().trim().min(1),
  body: z.string().trim().min(1),
  contentState: contentStateSchema.optional(),
  version: docVersion,
  evidence: optionalText,
});

// 按 type 判别：知识走严格校验，技能走宽松校验。
export const docInputSchema = z.discriminatedUnion("type", [
  knowledgeDocInputSchema,
  skillDocInputSchema,
]);

export const postInputSchema = z.object({
  id: slugId.optional(),
  title: z.string().trim().min(3),
  summary: z.string().trim().min(10),
  // 发布者虾：Web 用户发布时不提供（服务端写 null）；虾经机器接口发布时提供。
  botId: z.string().trim().min(1).optional(),
  domain: z.enum(POST_DOMAIN_OPTIONS),
  status: z.enum(["open", "monitoring", "resolved"]).default("open"),
  // 问题要素四键（问题类型 / 触发场景 / 已尝试方法 / 当前结果），必填且须全部包含。
  // 与前端 buildPostPayload 组装的 fields 键一一对应；缺任一键或不传 fields 被 422 拒绝。
  fields: z.object({
    problemType: z.string().trim().min(1),
    triggerScenario: z.string().trim().min(1),
    triedMethods: z.string().trim().min(1),
    currentResult: z.string().trim().min(1),
  }),
  timeline: z
    .array(
      z.object({
        time: nonEmpty,
        label: nonEmpty,
        detail: nonEmpty,
      }),
    )
    .default([]),
  knowledgeRefs: z.array(nonEmpty).default([]),
  skillRefs: z.array(nonEmpty).default([]),
});

export type BotInput = z.infer<typeof botInputSchema>;
export type DocInput = z.infer<typeof docInputSchema>;
export type PostInput = z.infer<typeof postInputSchema>;

// 回复附件：前端读文件为 base64 传上来（filename + contentBase64，contentType 可选）。
// 大小/合法性校验在服务层做（需解码字节数）。
export const replyAttachmentInputSchema = z.object({
  filename: z.string().trim().min(1, "附件缺少文件名"),
  contentType: z.string().trim().optional(),
  contentBase64: z.string().min(1, "附件内容为空"),
});
export type ReplyAttachmentInput = z.infer<typeof replyAttachmentInputSchema>;

// 问题帖回复：人或虾都能发。虾回复时 authorBotId 必填（服务层校验存在性），
// authorName 可省略（默认取虾名）；人回复时 authorName 必填。
// 回复正文必须至少包含 1 个非空白字符，附件与知识 / 技能引用均为可选。
export const replyInputSchema = z
  .object({
    authorType: z.enum(["human", "bot"]),
    authorName: z.string().trim().optional(),
    authorBotId: z.string().trim().optional(),
    // A parent id is only a routing hint; the service verifies it belongs to this
    // post and is top-level before persisting it.
    parentReplyId: z.string().trim().min(1).optional(),
    content: z.string().trim().min(1, "回复内容不能为空"),
    attachments: z.array(replyAttachmentInputSchema).max(10, "附件不能超过 10 个").default([]),
    // 回复引用的已批准技能 ID（由正文 /skillId 解析而来；服务端再校验合法性）。
    skillRefs: z.array(nonEmpty).default([]),
    // 回复引用的已批准知识 ID（由回复框知识按钮多选而来；服务端再校验合法性）。
    knowledgeRefs: z.array(nonEmpty).default([]),
    // 艾特对象由前端提供展示身份，服务端会按名称重新解析，不能信任 ID。
    mentionRefs: z.array(z.object({
      targetType: z.enum(["user", "bot"]),
      targetId: nonEmpty,
      name: nonEmpty,
    })).max(20, "艾特对象不能超过 20 个").default([]),
  });
export type ReplyInput = z.infer<typeof replyInputSchema>;

// 文档评论：登录用户可留言，内容去除首尾空白后必须非空。
export const docCommentInputSchema = z.object({
  content: z.string().trim().min(1, "评论内容不能为空").max(2000, "评论不能超过 2000 个字符"),
  // 父评论仅是路由提示；服务端会校验所属文档，并归一到根评论。
  parentCommentId: z.string().trim().min(1).optional(),
  // 前端身份仅用于表达选择；服务端会重新解析名称和当前归属。
  mentionRefs: z.array(z.object({
    targetType: z.enum(["user", "bot"]),
    targetId: nonEmpty,
    name: nonEmpty,
  })).max(20, "艾特对象不能超过 20 个").default([]),
});
export type DocCommentInput = z.infer<typeof docCommentInputSchema>;

// 驳回理由由审核者提交，必须是非空文本。
export const rejectionInputSchema = z.object({
  reason: nonEmpty,
});
export type RejectionInput = z.infer<typeof rejectionInputSchema>;

// 转审输入：目标用户 id（被转审人）。转交者由服务端从当前登录用户取，
// 不信任请求体里的转交者身份。
export const docTransferInputSchema = z.object({
  userId: nonEmpty,
});
export type DocTransferInput = z.infer<typeof docTransferInputSchema>;

// 人工审核：审核人由服务端从当前登录用户取（见 post-service.reviewPost），
// 不再接受前端传入的 reviewer，故无对应输入 schema。

// 登录体系输入。用户名 3–32 字符、仅字母数字下划线连字符；密码 ≥ 8 字符。
export const registerInputSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
});
export type RegisterInput = z.infer<typeof registerInputSchema>;

export const loginInputSchema = z.object({
  username: z.string().trim().min(1, "请输入用户名"),
  password: z.string().min(1, "请输入密码"),
});
export type LoginInput = z.infer<typeof loginInputSchema>;

export const recoveryKeyInputSchema = z.object({
  recoveryKey: z.string().min(1, "请输入恢复密钥"),
});

export const recoveryPasswordResetInputSchema = z
  .object({
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    message: "两次输入的新密码不一致",
    path: ["confirmPassword"],
  });

export { passwordSchema, usernameSchema };
