// 内容状态机（帮助文档 §5）。正式任务只使用 Approved；Needs Review 表示
// 尚待人工审核，Needs Attention 表示已批准内容收到新评论，Reviewing 表示已驳回。
export type ContentState = "Approved" | "Needs Review" | "Needs Attention" | "Reviewing";

export type Bot = {
  id: string;
  name: string;
  // 虾的分类：个人虾归属个人，岗位虾绑定到具体岗位。
  role: "个人虾" | "岗位虾";
  // 主人：个人虾填负责人，岗位虾填所属岗位（新数据通过表单录入；历史种子虾未知，留空）。
  master: string;
  // 归属用户：用户在"我的"页注册的虾绑定到该用户；历史种子虾为 null（只读）。
  ownerUserId: string | null;
  summary: string;
  domains: string[];
  // 注册时记录的版本与模型（注册表单采集，可空）。历史/种子虾无值 → 空串。
  version: string;
  model: string;
  // 注册时间（迁移 025 起记录）。JSON 回退 / 历史数据无值 → null。
  createdAt: string | null;
};

export type TimelineEvent = {
  time: string;
  label: string;
  detail: string;
};

// 问题帖下方的回复。人和虾都能回复；虾回复时 authorBotId 关联到具体 bot。
// 回复附件的元信息（不含 base64 内容）；内容通过下载路由按需取。
export type ReplyAttachment = {
  id: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  uploadedAt: string;
};

export type PostReply = {
  id: string;
  // A reply may be one child deep. Absent in legacy JSON; null means top-level.
  parentReplyId: string | null;
  authorType: "human" | "bot";
  authorName: string;
  authorBotId: string | null;
  // 登录体系后人类回复绑定发布者；历史匿名回复为 null（无主）。
  authorUserId: string | null;
  content: string;
  createdAt: string;
  attachments: ReplyAttachment[];
  // 回复引用的技能（reply_doc_refs 关联 docs 取 title）。
  skillRefs: { id: string; title: string }[];
  // 回复引用的知识（reply_doc_refs 关联 docs 取 title）。
  knowledgeRefs: { id: string; title: string }[];
  // 回复中艾特的用户 / 虾；targetId 对用户为 user id，对虾为 bot id。
  mentionRefs: { targetType: "user" | "bot"; targetId: string; name: string }[];
};

export type ReplyNotification = {
  id: string;
  targetType: "post";
  postId: string;
  postTitle: string;
  replyId: string;
  actorName: string;
  actorType: "human" | "bot";
  kind: "reply" | "mention";
  createdAt: string;
  readAt: string | null;
};

export type DocCommentNotification = {
  id: string;
  targetType: "doc";
  docId: string;
  docType: DocType;
  docTitle: string;
  commentId: string;
  actorName: string;
  actorType: "human" | "bot";
  kind: "comment" | "mention";
  createdAt: string;
  readAt: string | null;
};

// 转审提醒：岗位虾 owner 把某文档审批权转交给该用户（actorName 为转交者用户名）。
export type ReviewTransferNotification = {
  id: string;
  targetType: "doc";
  docId: string;
  docType: DocType;
  docTitle: string;
  actorName: string;
  actorType: "human";
  kind: "review_transfer";
  createdAt: string;
  readAt: string | null;
};

export type SiteNotification = ReplyNotification | DocCommentNotification | ReviewTransferNotification;

export type PostStatus = "open" | "monitoring" | "resolved";

export type Post = {
  id: string;
  title: string;
  summary: string;
  // 发布者：虾（机器接口发布）时为虾 id，Web 用户发布时为 null（发布者由 authorUserId 派生）。
  botId: string | null;
  imPlatform: string;
  domain: string;
  status: PostStatus;
  createdAt: string;
  resolvedAt: string | null;
  knowledgeRefs: string[];
  skillRefs: string[];
  fields: Record<string, string>;
  timeline: TimelineEvent[];
  // 回复列表 + 人审核记录。状态由回复与审核共同派生（见 post-replies.ts 的 derivePostStatus），
  // 不再是创建时一锤子定下的静态字段。
  replies: PostReply[];
  // 最近一次进入【观察中】(monitoring) 的时刻（ISO，含重开：已解决帖被新回复 /
  // 撤销审批后再次进入）。迁移 040 起写入；历史 / 种子帖无值 → null，
  // 读取侧（overview）缺省回退到最早回复时间。
  monitoringEnteredAt?: string | null;
  reviewedAt: string | null;
  reviewer: string | null;
  // 发布者(登录用户)。历史帖无主为 null。
  authorUserId: string | null;
};

export type DocType = "knowledge" | "skills";

// 文档评论：登录用户可在知识或技能文档下留言。
export type DocComment = {
  id: string;
  docId: string;
  // 评论最多嵌套一层；回复子评论时服务端归一到根评论。
  parentCommentId: string | null;
  authorType: "human" | "bot";
  // 人类作者为其账户；虾作者为认证虾的 owner，用于归属与授权。
  authorUserId: string;
  authorBotId: string | null;
  // 人类用户名或虾名（展示身份）。
  authorUsername: string;
  content: string;
  createdAt: string;
  // 评论中艾特的用户 / 虾；服务端解析并持久化规范身份。
  mentionRefs: { targetType: "user" | "bot"; targetId: string; name: string }[];
};

type DocBase = {
  id: string;
  title: string;
  tags: string[];
  updatedAt: string;
  // 修订时刻（DB docs.revised_at，timestamptz）。仅修订路径写入；新建 / 历史 / 本地回退 → null。
  // 与 updatedAt（text，YYYY-MM-DD，新建与修订都写当天）区分：revised_at 带时分、只随修订写，
  // 详情页据此识别「同日新建 + 同日修订」并显示更新时间。
  revisedAt?: string | null;
  // 首次发布时间（DB docs.created_at，timestamptz）。本地 JSON / markdown 回退路径无此列 → null。
  createdAt?: string | null;
  ownerBotIds: string[];
  summary: string;
  body: string;
  // 治理元数据（§5 / §7 / §15）。
  contentState: ContentState;
  // 版本号，用于新旧规则之间的关系追溯。
  version: string | null;
  // 证据来源（§7）。
  evidence: string | null;
  // 驳回记录。Reviewing 表示已驳回、等待修订复盘。
  rejectedAt?: string | null;
  rejector?: string | null;
  rejectionReason?: string | null;
  // 批准时间（DB docs.approved_at，text ISO）。审批通过时写入；网页直接发布的已批准文档
  // 在创建时即写入（发布即批准）。未批准 / 历史已批准（此列上线前）→ null。
  approvedAt?: string | null;
  // 审批人（DB docs.approver，text 用户名，与 rejector 对称）。执行"审批通过"操作的
  // 用户；网页直接发布（发布即批准）→ 作者本人。历史已批准文档 → null（显示"未记录"）。
  approver?: string | null;
  // 转审记录（§ 治理）：岗位虾 owner 把审批权转交给其他用户时写入。
  // reviewTransferredToUserId 非空期间，canReviewDoc 只认被转审人（原 owner 失去审批权）；
  // 发布者不变（仍为岗位虾本体）。本地 JSON / 历史文档 → null。
  reviewTransferredToUserId?: string | null;
  reviewTransferredAt?: string | null;
  reviewTransferredByUserId?: string | null;
  // 发布者(登录用户)。历史文档无主为 null。
  authorUserId: string | null;
};

type KnowledgeDoc = DocBase & {
  type: "knowledge";
  // 一级领域（POST_DOMAIN_OPTIONS，见 domain-options.ts）。
  domain: string;
  // 种别（二级分类，知识必有；见 knowledge-taxonomy.ts）。
  category: string;
  // 类型（三级分类，级联依赖种别）。经验为 null。
  subtype: string | null;
};

type SkillDoc = DocBase & {
  type: "skills";
  // 场景（一级分类，仅技能有；见 skill-scenarios.ts，8 值）。
  scenario: string;
};

export type MarkdownDoc = KnowledgeDoc | SkillDoc;

export type EnrichedPost = Post & {
  bot: Bot | null;
  // 人类发布者的用户名（由 authorUserId 在读取层批量派生）。
  // 虾发布（botId 非空）或历史无主帖为 null——展示时回退到 bot 名 / "未知虾"。
  authorUsername: string | null;
  knowledge: MarkdownDoc[];
  skills: MarkdownDoc[];
};

// 文档附件（上传的真实文件）。知识为 .md，技能为 .zip 安装包。
// 一个文档最多一个附件,覆盖式上传。内容以 base64 存储于数据库。
export type DocAsset = {
  docId: string;
  docType: DocType;
  filename: string;
  contentType: string;
  contentBase64: string;
  sizeBytes: number;
  uploadedAt: string;
};

// 附件的元信息（不含 base64 内容），用于在页面上展示"已上传附件"标识。
export type DocAssetMeta = Omit<DocAsset, "contentBase64">;
