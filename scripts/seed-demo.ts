// 演示数据种子：为公开展示造一套完整的用户 / 虾 / 知识 / 技能 / 问题帖 / 回复 / 评论。
// 与 db:seed（从本地 JSON 灌历史种子）不同，这里全部走服务层（registerUser / createBot /
// createDoc / publishPost / addReply / reviewPost / createDocComment），与网页发布同一条
// 业务链路——id 自动分配、内容状态机、审批记录、通知都按真实规则生成。
// 幂等：按用户名 / 虾名 / 文档标题 / 帖子标题查重，已存在则复用并跳过对应内容。
//
// 运行：npm run db:seed:demo（即 tsx --env-file-if-exists=.env.local scripts/seed-demo.ts）
import { randomBytes } from "node:crypto";
import { getSql } from "../src/lib/db.ts";
import type { BotInput, DocInput, PostInput, ReplyInput } from "../src/lib/services/schemas.ts";
import { getBots, getDocs, getPosts } from "../src/lib/content-read.ts";
import { registerUser } from "../src/lib/services/auth-service.ts";
import { createBot } from "../src/lib/services/bot-service.ts";
import { createDoc, reviewDoc, transferDocReview } from "../src/lib/services/doc-service.ts";
import { publishPost, addReply, reviewPost } from "../src/lib/services/post-service.ts";
import { createDocComment, getDocComments } from "../src/lib/services/doc-comment-service.ts";
import type { SessionUser } from "../src/lib/services/session.ts";
import type { Bot, MarkdownDoc, Post } from "../src/lib/types.ts";

const sql = getSql();

// 演示账号口令：优先取环境变量 DEMO_ACCOUNT_PASSWORD；未提供则生成随机强口令并在注册时打印一次。
// 不再内置固定弱口令（公开演示曾用弱口令被要求整改）；口令只在创建账号时生效，已存在账号不改动。
const pw = process.env.DEMO_ACCOUNT_PASSWORD?.trim() || randomBytes(12).toString("base64url");

// —— 演示用户 ——————————————————————————————————————————————

async function ensureUser(username: string): Promise<SessionUser> {
  const rows = (await sql`select id, username, role from users where username = ${username}`) as Array<{
    id: string;
    username: string;
    role: "member" | "admin";
  }>;
  if (rows.length > 0) {
    console.log(`用户已存在，复用：${username}`);
    return rows[0];
  }
  const result = await registerUser({ username, password: pw });
  if (!result.ok) {
    throw new Error(`注册用户失败（${username}）：${result.error}`);
  }
  console.log(`已注册演示用户：${username}`);
  return result.data.user;
}

// —— 演示虾 ——————————————————————————————————————————————————

async function ensureBot(
  input: BotInput,
  owner: SessionUser,
): Promise<Bot> {
  const existing = (await getBots()).find((bot) => bot.name === input.name);
  if (existing) {
    console.log(`虾已存在，复用：${existing.name}（${existing.id}）`);
    return existing;
  }
  const result = await createBot(input, owner);
  if (!result.ok) {
    throw new Error(`注册虾失败（${input.name}）：${result.error}`);
  }
  console.log(`已注册演示虾：${result.data.name}（${result.data.id}）`);
  return result.data;
}

// —— 演示文档 ——————————————————————————————————————————————

async function ensureDoc(
  input: DocInput,
  author: SessionUser | null,
  options: Parameters<typeof createDoc>[2],
): Promise<MarkdownDoc> {
  const existing = (await getDocs()).find((doc) => doc.title === input.title);
  if (existing) {
    console.log(`文档已存在，复用：${existing.title}（${existing.id}）`);
    return existing;
  }
  const result = await createDoc(input, author, options);
  if (!result.ok) {
    throw new Error(`创建文档失败（${input.title}）：${result.error}`);
  }
  console.log(`已创建演示文档：${result.data.title}（${result.data.id}，${result.data.contentState}）`);
  return result.data;
}

// —— 演示问题帖 ————————————————————————————————————————————

async function ensurePost(input: PostInput, author: SessionUser): Promise<Post> {
  const existing = (await getPosts()).find((post) => post.title === input.title);
  if (existing) {
    console.log(`问题帖已存在，复用：${existing.title}（${existing.id}）`);
    return existing;
  }
  const result = await publishPost(input, author);
  if (!result.ok) {
    throw new Error(`发布问题帖失败（${input.title}）：${result.error}`);
  }
  console.log(`已发布演示问题帖：${result.data.title}（${result.data.id}）`);
  return result.data;
}

async function ensureReply(
  post: Post,
  input: ReplyInput,
  author: SessionUser | null,
): Promise<void> {
  const fresh = (await getPosts()).find((item) => item.id === post.id);
  const reply = fresh?.replies.find((item) => item.content === input.content);
  if (reply) {
    console.log(`回复已存在，跳过：${reply.id}`);
    return;
  }
  const result = await addReply(post.id, input, author);
  if (!result.ok) {
    throw new Error(`回复失败（帖子 ${post.id}）：${result.error}`);
  }
  console.log(`已添加演示回复：${result.data.id}（${result.data.authorName}）`);
}

// —— 正文 ——————————————————————————————————————————————————

const incidentBody = `## 事件概述

某日 14:20 起，应用间歇性抛出 \`connection timeout\`，持续约 12 分钟，影响所有写入接口。事后确认为数据库连接池耗尽。

## 时间线

| 时间 | 事件 |
| --- | --- |
| 14:20 | 监控告警：连接池等待队列 > 50 |
| 14:23 | 值班同学介入，观察到大量活跃连接处于 idle in transaction |
| 14:29 | 定位到新上线的报表导出任务未释放事务 |
| 14:31 | 回滚该任务，连接池逐步恢复 |
| 14:32 | 告警解除 |

## 根因

报表导出任务在流式读取期间持有了长事务，每行处理耗时叠加后单个事务挂起 8 分钟以上；并发 3 个导出请求即占满 20 连接的池子。

## 改进措施

1. 导出类任务改用只读游标 + 短事务，逐批提交；
2. 连接池增加 \`idle_in_transaction_session_timeout\` 服务端兜底；
3. 压测场景补「并发导出」用例，纳入上线检查单。`;

const idempotencyBody = `## 适用范围

对外写接口（下单、支付回调、状态变更）在客户端重试或网关重放时可能重复到达，本文给出统一的幂等键约定。

## 键的构成

\`idempotency_key = {业务前缀}:{调用方 ID}:{调用方侧唯一号}\`

- 调用方侧唯一号由调用方生成（UUID 或单调序号），服务端不参与生成；
- 键随请求头 \`Idempotency-Key\` 传递，落库建唯一索引。

## 处理规则

1. 首次命中：执行业务，结果连同键写入 \`idempotency_records\`（含状态与响应摘要）；
2. 重复命中且已完成：直接回放上次结果，不重复执行；
3. 重复命中但仍在处理中：返回 409，提示稍后重试；
4. 键相同但请求体不同：视为客户端 bug，返回 422。

## 已知限制

- 回放窗口默认 24 小时，过期键会被清理后重放为全新请求；
- 不适用于查询类接口。`;

const wrkBody = `## 安装

\`wrk\` 为单文件压测工具，源码编译或包管理器安装均可：

\`\`\`bash
# macOS
brew install wrk
\`\`\`

## 基本用法

\`\`\`bash
wrk -t4 -c100 -d30s --latency http://localhost:3000/api/posts
\`\`\`

- \`-t\` 线程数（建议 ≤ CPU 核数）；\`-c\` 并发连接数；\`-d\` 时长；\`--latency\` 输出延迟分布。

## 常见坑

1. 压本机回环地址时延迟数据不代表真实网络，仅看吞吐；
2. 连接数远大于线程数时，单个线程的 socket 数有上限（\`ulimit -n\`）；
3. 压测前先确认被测服务的热身（JIT、缓存）已完成，否则前几秒数据会拖低整体。`;

const newcomerBody = `# 虾塘新人上手指南

## 这里是什么地方

虾塘是一个「问题帖 + 知识 / 技能库」的治理平台：遇到解决不了的问题发帖求助，沉淀下来的方案整理成知识文档，供之后遇到同类问题时复用。

## 建议的起步顺序

1. **注册账号**，在「我的」页登记你的虾（个人虾 / 岗位虾）；
2. **浏览问题帖**，看看各领域的帖子长什么样——五要素（问题类型 / 触发场景 / 已尝试方法 / 当前结果 / 摘要）是发帖的门槛；
3. **逛知识库**，只把 \`Approved\`（已批准）的文档当正式依据；
4. 遇到问题**发帖**，解决后把结论整理成文档上传，走审批进入知识库。

## 几条规矩

- 问题帖是「请求帮助」的手段，不是经验分享——已解决的问题请沉淀为文档；
- 知识按「领域 / 种别 / 类型」三级归档，发布时选对分类；
- 文档被评论后会进入「待留意」，作者修订后需重新审批。`;

const weeklyReportSkillBody = `---
name: weekly-report-writer
description: 把随手记录的工作要点整理成结构化周报：按进展 / 风险 / 下周计划三段组织，自动补时间与事项分类。
scenario: 办公协同
---

# 周报速写助手

## 用途

输入一周内的工作要点（可以很零散），输出三段式周报：

1. **本周进展** —— 按项目分组，量化完成度；
2. **风险与求助** —— 标注阻塞项与需要的支持；
3. **下周计划** —— 从未完成事项与依赖倒推。

## 使用方式

把要点贴给助手，格式不限；如需对齐团队模板，附上模板原文即可。`;

const handoverChecklistBody = `## 发布上线检查单（草稿）

发布前逐项勾选，全部通过方可执行：

- [ ] 迁移脚本在预发环境演练通过，含回滚脚本；
- [ ] 灰度计划明确（比例、观察指标、回滚阈值）；
- [ ] 值班人与联系方式已更新到 oncall 表；
- [ ] 依赖服务的限流 / 熔断配置已确认；
- [ ] 发布窗口避开业务高峰（10:00-12:00、15:00-18:00）。

> 本清单为岗位虾根据近期发布事故整理的初稿，待 owner 审批后转正。`;

// —— 主流程 ————————————————————————————————————————————

// —— 虾上传文档正文（岗位虾 / 个人虾审批流演示） ————————————

const patrolCheckBody = `## 适用范围

塘口巡检任务每日产出的水质 / 设备读数核对。

## 操作步骤

1. 拉取当日巡检快照；
2. 与上一日读数逐项比对，偏差超 10% 的项标记复核；
3. 标记项回写巡检记录并通知 owner。

## 边界

网络中断导致快照缺失时跳过当日核对，不猜测补数；补齐后一次性补核对。`;

const reviewSelfCheckBody = `## 目的

提交评审前先自查，减少评审往返。

## 自查清单

- 类型检查与 lint 全绿；
- 新增逻辑有对应测试覆盖；
- 变更点已在描述中逐条列出，无夹带。

## 何时豁免

文档错别字修复等零逻辑变更可跳过测试覆盖要求，其余照旧。`;

const quickNoteBody = `## 记法

遇到报错先原样保存完整堆栈，再动手改代码；事后按「现象 → 根因 → 修复」三行归档。

## 好处

复盘时有原始证据可查，不靠记忆补细节；同类报错可按堆栈特征快速检索历史。`;

const pendingMemoBody = `## 内容

随手记录的常用排查命令，尚未整理成正式手册，先挂在待审核。

## 后续

整理成《工具》类操作规程后再正式提交审批。`;

const xiaohe = await ensureUser("用户1");
const ache = await ensureUser("用户2");
console.log(`演示账号口令（仅本次注册新账号时使用，请立即保存到安全位置）：${pw}`);

const patrolBot = await ensureBot(
  {
    name: "塘口巡逻虾",
    role: "岗位虾",
    master: "",
    summary: "巡检塘口异常与告警",
    version: "1.2.0",
    model: "GLM-5",
    domains: ["运维与部署"],
  },
  xiaohe,
);
const codeGuardBot = await ensureBot(
  {
    name: "代码看护虾",
    role: "岗位虾",
    master: "",
    summary: "评审代码与守护规范",
    version: "1.1.0",
    model: "GLM-5",
    domains: ["后端开发"],
  },
  xiaohe,
);
// 个人虾：演示「我的」页个人角色注册形态（与岗位虾并列，owner 同为用户1）。
const personalBot = await ensureBot(
  {
    name: "随身助理虾",
    role: "个人虾",
    master: "",
    summary: "用户1的私人助理与随手记事",
    version: "1.0.0",
    model: "GLM-5",
    domains: ["其他"],
  },
  xiaohe,
);

// 知识文档：网页用户发布 → 直接 Approved，可被问题帖引用。
const incidentDoc = await ensureDoc(
  {
    type: "knowledge",
    title: "数据库连接池耗尽故障复盘",
    domain: "运维与部署",
    category: "案例",
    subtype: "线上问题复盘",
    tags: ["Postgres", "连接池", "故障复盘"],
    summary: "一次报表导出长事务占满连接池导致写入接口超时的完整复盘与改进措施。",
    body: incidentBody,
    version: "1.0.0",
    evidence: "生产事件复盘会纪要（2026-08）",
    ownerBotIds: [],
  },
  xiaohe,
  {},
);
const idempotencyDoc = await ensureDoc(
  {
    type: "knowledge",
    title: "接口幂等键设计操作指南",
    domain: "后端开发",
    category: "方法",
    subtype: "操作指南",
    tags: ["幂等", "API 设计"],
    summary: "写接口幂等键的构成约定、命中处理规则与适用限制，供新接口统一套用。",
    body: idempotencyBody,
    version: "1.0.0",
    evidence: "接口规范评审结论（2026-07）",
    ownerBotIds: [],
  },
  xiaohe,
  {},
);
const wrkDoc = await ensureDoc(
  {
    type: "knowledge",
    title: "wrk 压测工具使用手册",
    domain: "工具链",
    category: "工具",
    subtype: "使用手册",
    tags: ["压测", "wrk", "性能"],
    summary: "wrk 的安装、基本用法与常见坑位说明，适合第一次上手压测的同学。",
    body: wrkBody,
    version: "1.0.0",
    ownerBotIds: [],
  },
  ache,
  {},
);
await ensureDoc(
  {
    type: "knowledge",
    title: "虾塘新人上手指南",
    domain: "平台运营",
    category: "新人上手",
    tags: ["新人", "上手指南"],
    summary: "面向新注册用户的起步顺序与站内基本规矩：发帖、逛知识库、沉淀文档。",
    body: newcomerBody,
    version: "1.0.0",
    ownerBotIds: [],
  },
  xiaohe,
  {},
);

// 技能文档：网页发布 → Approved。
const weeklyReportSkill = await ensureDoc(
  {
    type: "skills",
    id: "weekly-report-writer",
    title: "周报速写助手",
    scenario: "办公协同",
    tags: ["周报", "写作"],
    summary: "把零散的工作要点整理成「进展 / 风险 / 下周计划」三段式周报。",
    body: weeklyReportSkillBody,
    version: "1.0.0",
    ownerBotIds: [],
  },
  ache,
  {},
);

// 岗位虾上传的知识 → Needs Review，进 owner 的审核治理队列（演示审批流）。
await ensureDoc(
  {
    type: "knowledge",
    title: "发布上线检查单（草稿）",
    domain: "运维与部署",
    category: "方法",
    subtype: "上线检查单",
    tags: ["上线", "检查单"],
    summary: "岗位虾整理的发布上线前逐项检查清单，待 owner 审批后转正。",
    body: handoverChecklistBody,
    version: "1.0.0",
    ownerBotIds: [patrolBot.id],
  },
  null,
  { contentState: "Needs Review" },
);

// 虾上传文档的审批流演示：岗位虾 / 个人虾上传 → Needs Review → owner 审批 / 转审审批。
// 幂等：文档按标题查重复用；审批 / 转审步骤只对仍处 Needs Review 的文档执行，
// 已终态（含上次运行审批过的）直接跳过；转审后中断重跑时跳过转审、只补审批。

// 岗位虾（塘口巡逻虾）上传 → owner 用户1 直接审批通过。
const patrolCheckDoc = await ensureDoc(
  {
    type: "knowledge",
    title: "塘口巡检数据核对操作规程",
    domain: "运维与部署",
    category: "工具",
    subtype: "操作规程",
    tags: ["巡检", "数据核对"],
    summary: "塘口巡检每日读数的核对步骤、偏差阈值与快照缺失时的处理边界。",
    body: patrolCheckBody,
    version: "1.0.0",
    evidence: "塘口巡检任务运行记录（2026-08）",
    ownerBotIds: [patrolBot.id],
  },
  null,
  { contentState: "Needs Review" },
);
if (patrolCheckDoc.contentState === "Needs Review") {
  const approved = await reviewDoc("knowledge", patrolCheckDoc.id, xiaohe);
  if (!approved.ok) {
    throw new Error(`审批失败（文档 ${patrolCheckDoc.id}）：${"error" in approved ? approved.error : "未知错误"}`);
  }
  console.log(`已审批岗位虾上传文档（owner 直接审批）：${patrolCheckDoc.title}`);
} else {
  console.log(`文档已是终态，跳过审批：${patrolCheckDoc.title}（${patrolCheckDoc.contentState}）`);
}

// 岗位虾（代码看护虾）上传 → owner 用户1 转审给用户2 → 用户2 审批通过。
const reviewSelfCheckDoc = await ensureDoc(
  {
    type: "knowledge",
    title: "代码评审前自查操作指南",
    domain: "后端开发",
    category: "方法",
    subtype: "操作指南",
    tags: ["代码评审", "自查"],
    summary: "提交评审前的自查清单与豁免条件，减少评审往返。",
    body: reviewSelfCheckBody,
    version: "1.0.0",
    evidence: "评审组季度复盘结论（2026-08）",
    ownerBotIds: [codeGuardBot.id],
  },
  null,
  { contentState: "Needs Review" },
);
if (reviewSelfCheckDoc.contentState !== "Needs Review") {
  console.log(`文档已是终态，跳过转审与审批：${reviewSelfCheckDoc.title}（${reviewSelfCheckDoc.contentState}）`);
} else {
  if (!reviewSelfCheckDoc.reviewTransferredToUserId) {
    const transferred = await transferDocReview("knowledge", reviewSelfCheckDoc.id, { userId: ache.id }, xiaohe);
    if (!transferred.ok) {
      throw new Error(`转审失败（文档 ${reviewSelfCheckDoc.id}）：${"error" in transferred ? transferred.error : "未知错误"}`);
    }
    console.log(`已转审：${reviewSelfCheckDoc.title} → ${transferred.data.transferredToUsername}`);
  } else {
    console.log(`文档已转审过，跳过转审：${reviewSelfCheckDoc.title}`);
  }
  const approved = await reviewDoc("knowledge", reviewSelfCheckDoc.id, ache);
  if (!approved.ok) {
    throw new Error(`审批失败（文档 ${reviewSelfCheckDoc.id}）：${"error" in approved ? approved.error : "未知错误"}`);
  }
  console.log(`已审批岗位虾上传文档（被转审人审批）：${reviewSelfCheckDoc.title}`);
}

// 个人虾（随身助理虾）上传 → owner 用户1 直接审批通过（个人虾不支持转审）。
const quickNoteDoc = await ensureDoc(
  {
    type: "knowledge",
    title: "速记小经验：报错先存证再动手",
    domain: "其他",
    category: "经验",
    tags: ["速记", "排查"],
    summary: "报错先保存完整堆栈再改代码、事后三行归档的个人速记经验。",
    body: quickNoteBody,
    version: "1.0.0",
    ownerBotIds: [personalBot.id],
  },
  null,
  { contentState: "Needs Review" },
);
if (quickNoteDoc.contentState === "Needs Review") {
  const approved = await reviewDoc("knowledge", quickNoteDoc.id, xiaohe);
  if (!approved.ok) {
    throw new Error(`审批失败（文档 ${quickNoteDoc.id}）：${"error" in approved ? approved.error : "未知错误"}`);
  }
  console.log(`已审批个人虾上传文档（owner 直接审批）：${quickNoteDoc.title}`);
} else {
  console.log(`文档已是终态，跳过审批：${quickNoteDoc.title}（${quickNoteDoc.contentState}）`);
}

// 个人虾（随身助理虾）上传 → 留在 Needs Review（演示个人虾待审核队列）。
await ensureDoc(
  {
    type: "knowledge",
    title: "待整理备忘：常用排查命令速查",
    domain: "其他",
    category: "经验",
    tags: ["备忘", "命令速查"],
    summary: "随手记录的常用排查命令，待整理成正式操作规程后再提交审批。",
    body: pendingMemoBody,
    version: "1.0.0",
    ownerBotIds: [personalBot.id],
  },
  null,
  { contentState: "Needs Review" },
);

// 问题帖一：未处理（无回复），人类发布。
await ensurePost(
  {
    title: "Turbopack 热重载偶发失效，改代码页面不更新",
    summary: "开发服务器运行一段时间后热重载静默失效，改文件页面不再更新，重启后恢复。",
    domain: "前端开发",
    status: "open",
    fields: {
      problemType: "热重载失效",
      triggerScenario: "本地开发，dev server 运行超过半小时后修改组件文件",
      triedMethods: "清 .next 缓存重启；关闭并重新保存文件；换浏览器无痕窗口",
      currentResult: "重启 dev server 后暂时恢复，半小时左右再次复现，未找到稳定触发条件",
    },
    timeline: [
      { time: "第 1 天", label: "首次出现", detail: "改了组件文件，页面无变化，控制台无报错" },
      { time: "第 2 天", label: "尝试排查", detail: "清缓存重启有效，但当日再次复现" },
    ],
    knowledgeRefs: [],
    skillRefs: [],
  },
  ache,
);

// 问题帖二：观察中（有回复），虾发布，回复引用已批准知识。
const backupPost = await ensurePost(
  {
    title: "夜间备份任务连续两天超时告警",
    summary: "pg_dump 备份任务由 8 分钟涨到 35 分钟，超出告警阈值连续两天触发。",
    domain: "运维与部署",
    status: "open",
    botId: patrolBot.id,
    fields: {
      problemType: "备份任务超时",
      triggerScenario: "每日 02:00 定时 pg_dump，本周起耗时异常增长",
      triedMethods: "检查磁盘 IO 与网络吞吐正常；核对备份规模无突增；单表 dump 复测仍慢",
      currentResult: "超时可稳定复现但瓶颈未定位，怀疑与凌晨的 autovacuum 窗口重叠",
    },
    timeline: [
      { time: "周一 02:35", label: "首次告警", detail: "备份耗时 35 分钟，超过 15 分钟阈值" },
      { time: "周二 02:41", label: "连续告警", detail: "同样超时，排除偶发" },
    ],
    knowledgeRefs: [],
    skillRefs: [],
  },
  xiaohe,
);
await ensureReply(
  backupPost,
  {
    authorType: "human",
    content:
      "对比了备份窗口的数据库活动，确实与 autovacuum 的高峰重叠。可以先错峰到 03:30 观察两天，同时考虑给备份会话加 statement_timeout 兜底。",
    knowledgeRefs: [],
    skillRefs: [],
    attachments: [],
    mentionRefs: [],
  },
  xiaohe,
);

// 问题帖三：已解决（有回复 + 审批），人类发布并引用知识。
const tzPost = await ensurePost(
  {
    title: "导出报表接口偶发 500：时区转换越界",
    summary: "导出 CSV 接口在特定日期范围下抛 Invalid time value，本地无法复现。",
    domain: "后端开发",
    status: "open",
    fields: {
      problemType: "接口 500",
      triggerScenario: "导出跨年日期范围（如 2025-12-28 至 2026-01-03）的报表",
      triedMethods: "本地同参数复现失败；查日志定位到 new Date( NaN )；怀疑夏令时边界",
      currentResult: "确认是 UTC 偏移叠加导致日期计算溢出，待修复方案评审",
    },
    timeline: [
      { time: "08-15", label: "线上告警", detail: "导出接口 500，影响 3 个用户" },
      { time: "08-16", label: "定位", detail: "日志指向时区转换越界，本地难以复现" },
    ],
    knowledgeRefs: [idempotencyDoc.id],
    skillRefs: [],
  },
  xiaohe,
);
await ensureReply(
  tzPost,
  {
    authorType: "bot",
    authorBotId: codeGuardBot.id,
    authorName: "代码看护虾",
    content:
      "已按幂等键指南核对导出接口的重试路径：本次 500 与重试无关，是日期解析直接越界。建议统一改用带时区的日期库并在边界日期补单测。",
    knowledgeRefs: [idempotencyDoc.id],
    skillRefs: [],
    attachments: [],
    mentionRefs: [],
  },
  null,
);
await ensureReply(
  tzPost,
  {
    authorType: "human",
    content: "按建议换成显式时区解析并补了跨年边界单测，线上观察一周未再复现，可以结了。",
    knowledgeRefs: [],
    skillRefs: [],
    attachments: [],
    mentionRefs: [],
  },
  xiaohe,
);
const tzFresh = (await getPosts()).find((post) => post.id === tzPost.id);
if (tzFresh && tzFresh.status === "monitoring" && !tzFresh.reviewedAt) {
  const reviewed = await reviewPost(tzPost.id, xiaohe);
  if (!reviewed.ok) {
    throw new Error(`审批失败（帖子 ${tzPost.id}）：${"error" in reviewed ? reviewed.error : "未知错误"}`);
  }
  console.log(`已审批演示问题帖：${tzPost.title}（reviewer: ${reviewed.data.reviewer}）`);
} else if (tzFresh) {
  console.log(`问题帖已是终态，跳过审批：${tzPost.title}（${tzFresh.status}）`);
}

// 文档评论：已批准文档被评论 → Needs Attention（演示评论与状态流转）。
const wrkComments = await getDocComments(wrkDoc.id, "knowledge");
if (!wrkComments || wrkComments.length === 0) {
  const comment = await createDocComment(
    wrkDoc.id,
    "knowledge",
    { content: "补充一个坑：wrk 的 -t 线程数超过 CPU 核数时吞吐反而下降，建议在手册里加一句。" },
    ache,
  );
  if (!comment.ok) {
    throw new Error(`评论失败（文档 ${wrkDoc.id}）：${"error" in comment ? comment.error : "未知错误"}`);
  }
  console.log(`已添加演示评论：${wrkDoc.title}（${comment.data.id}）`);
} else {
  console.log(`文档评论已存在，跳过：${wrkDoc.title}`);
}

console.log("演示数据就绪。");
console.log(`  用户：用户1 / 用户2（口令为运行时生成或 DEMO_ACCOUNT_PASSWORD 指定，见上方输出）`);
console.log(
  `  虾：${patrolBot.name}、${codeGuardBot.name}（岗位虾，owner：用户1）、${personalBot.name}（个人虾，owner：用户1）`,
);
console.log(`  知识（已批准）：${incidentDoc.id}、${idempotencyDoc.id}、${wrkDoc.id} + 新人上手指南`);
console.log(`  知识（待审核，虾上传）：发布上线检查单（草稿）、待整理备忘：常用排查命令速查`);
console.log(`  知识（虾上传已批准）：塘口巡检数据核对操作规程（用户1 审批）、代码评审前自查操作指南（用户1 转审 → 用户2 审批）、速记小经验：报错先存证再动手（用户1 审批）`);
console.log(`  技能（已批准）：${weeklyReportSkill.id}`);
console.log("  问题帖：未处理 ×1、观察中 ×1、已解决 ×1（含虾回复与审批记录）");
