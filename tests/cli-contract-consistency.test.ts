import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

// 虾塘 CLI / MCP 契约的关键字段一致性（防漂移）。
// 契约散落在三份文档，曾出现 status 枚举、version 约束、create_reply 参数等各自漂移，
// 这里把最易漂移的字段锁进测试，改动文档时测试会提醒同步其余两份。
//
// 三份文档：
//   - .claude/skills/lobster-mcp/SKILL.md  项目级 skill（单一来源，入库，必存在）
//   - docs/cli/bot-integration.md          虾 CLI 接口契约（入库，必存在）
//   - tools.md                             只读工具参数表（已入库；本地缺失时相关断言跳过）

const IN_REPO_FILES = [
  "../.claude/skills/lobster-mcp/SKILL.md",
  "../docs/cli/bot-integration.md",
];

const LOCAL_ONLY_FILES = ["../tools.md"];

// 问题帖 / 知识 / 技能共用的领域枚举（与 src/lib/domain-options.ts POST_DOMAIN_OPTIONS 单一数据源一致）。
const DOMAIN_OPTIONS = [
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
];

// 技能场景枚举（8 项，与 src/lib/skill-scenarios.ts SKILL_SCENARIO_OPTIONS 单一数据源一致）。
const SKILL_SCENARIOS = [
  "办公协同",
  "内容创作",
  "数据分析",
  "知识管理",
  "研究洞察",
  "编程开发",
  "兴趣生活",
  "其他",
];

// 知识二级种别：默认 6 项 + 平台运营 10 项（领域级，与 src/lib/knowledge-taxonomy 一致）。
// 有类型的种别必须带三级类型 subtype（无类型种别如经验留空）。
const KNOWLEDGE_CATEGORIES = ["标准", "方法", "工具", "案例", "体系", "经验"];
const PLATFORM_OPS_CATEGORIES = ["体系", "白皮书", "功能介绍", "接入申请", "新人上手", "平台手册", "治理规范", "便捷指南", "迭代规划", "经验"];

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function readDoc(file: string): Promise<string> {
  return readFile(new URL(file, import.meta.url), "utf8");
}

function skipIfMissing(t: { skip: (reason: string) => void }, file: string): boolean {
  if (!existsSync(new URL(file, import.meta.url))) {
    t.skip(`本地留存文件缺失：${file}`);
    return true;
  }
  return false;
}

describe("虾塘 CLI 关键契约字段一致性（防漂移）", () => {
  // 1. 帖子状态枚举：open / monitoring / resolved，无 reviewing 态。
  //    （问题帖已废弃驳回，不复盘中；reviewing 只属于文档状态，且文档状态为大写 Reviewing。）
  describe("帖子状态枚举不含 reviewing", () => {
    for (const file of IN_REPO_FILES) {
      it(`${file}`, async () => {
        const text = await readDoc(file);
        assert.doesNotMatch(text, /reviewing/);
      });
    }
    it("tools.md（本地留存，缺失跳过）", async (t) => {
      const file = LOCAL_ONLY_FILES[0];
      if (skipIfMissing(t, file)) return;
      const text = await readDoc(file);
      assert.doesNotMatch(text, /reviewing/);
    });
  });

  // 2. 修订文档版本约束：必填且严格大于当前版本（否则 422）。
  describe("修订文档版本必须大于当前版本", () => {
    for (const file of IN_REPO_FILES) {
      it(`${file}`, async () => {
        const text = await readDoc(file);
        assert.match(text, /大于当前版本/);
      });
    }
  });

  // 3. create_reply 参数完整性：parentReplyId（嵌套回复）+ mentionRefs（艾特）。
  describe("create_reply 含 parentReplyId 与 mentionRefs", () => {
    for (const file of IN_REPO_FILES) {
      it(`${file}`, async () => {
        const text = await readDoc(file);
        assert.match(text, /parentReplyId/);
        assert.match(text, /mentionRefs/);
      });
    }
  });

  // 4. 领域枚举：11 项完整 + 不得自定义。
  describe("领域枚举含全部 11 项且不得自定义", () => {
    for (const file of IN_REPO_FILES) {
      it(`${file}`, async () => {
        const text = await readDoc(file);
        for (const domain of DOMAIN_OPTIONS) {
          assert.match(text, new RegExp(escapeRegex(domain)));
        }
        assert.match(text, /不得自定义/);
      });
    }
  });

  // 4b. 知识种别：默认 6 项齐全 + 平台运营 10 项齐全 + 有类型种别 subtype 必填（两份文档同步）。
  describe("知识种别含全部默认 6 项与平台运营 10 项且提及 subtype", () => {
    for (const file of IN_REPO_FILES) {
      it(`${file}`, async () => {
        const text = await readDoc(file);
        for (const category of KNOWLEDGE_CATEGORIES) {
          assert.match(text, new RegExp(escapeRegex(category)));
        }
        // 平台运营覆盖的 10 种别也须见于文档（防漂移：平台运营专属种别被误删）。
        for (const category of PLATFORM_OPS_CATEGORIES) {
          assert.match(text, new RegExp(escapeRegex(category)), `${category} 应见于 ${file}`);
        }
        assert.match(text, /subtype/);
      });
    }
  });

  // 4c. 技能场景枚举：8 项完整 + 不得自定义（两份文档同步）。
  describe("技能场景枚举含全部 8 项且不得自定义", () => {
    for (const file of IN_REPO_FILES) {
      it(`${file}`, async () => {
        const text = await readDoc(file);
        for (const scenario of SKILL_SCENARIOS) {
          assert.match(text, new RegExp(escapeRegex(scenario)));
        }
        // scenario 字段名出现在文档中（技能用 scenario，非 domain）。
        assert.match(text, /scenario/);
      });
    }
  });

  // 5. MCP 工具数：19 个（工具清单漂移时锁住）。
  it("SKILL.md 标注 19 个 MCP 工具", async () => {
    const text = await readDoc(IN_REPO_FILES[0]);
    assert.match(text, /19 个/);
  });

  // 6. 公告读取工具：list_announcements 映射 POST /api/bot/announcements，三处文档同步。
  describe("list_announcements 工具在契约文档中登记", () => {
    for (const file of IN_REPO_FILES) {
      it(`${file}`, async () => {
        const text = await readDoc(file);
        assert.match(text, /list_announcements/);
      });
    }
    it("bot-integration.md 标注 HTTP 路由", async () => {
      const text = await readDoc("../docs/cli/bot-integration.md");
      assert.match(text, /POST \/api\/bot\/announcements/);
    });
    it("tools.md（本地留存，缺失跳过）", async (t) => {
      const file = LOCAL_ONLY_FILES[0];
      if (skipIfMissing(t, file)) return;
      const text = await readDoc(file);
      assert.match(text, /list_announcements/);
      assert.match(text, /\/api\/bot\/announcements/);
    });
  });

  // 7. 前置规则：每日读取一遍公告确认更新详情与通知（不随技能调用次数重复）；
  //    Claw Token 配置一遍即可，仅认证失败 / 公告宣布轮换时重配（SKILL.md 单一来源，锁住防删）。
  it("SKILL.md 含「每日读取一遍公告」强制前置规则，Claw Token 无需每次核对", async () => {
    const text = await readDoc(IN_REPO_FILES[0]);
    assert.match(text, /前置规则：每日读取一遍公告（强制）/);
    // 每天只做一遍：不随技能调用次数 / 会话次数重复读取。
    assert.match(text, /每天只做一遍/);
    assert.match(text, /不是每次调用本技能都要读取/);
    assert.match(text, /list_announcements[^。\n]*读取全部网站公告/);
    // Claw Token 配置一遍即可：不再要求每次任务前核对。
    assert.match(text, /配置一遍即可/);
    assert.doesNotMatch(text, /每次任务前先读公告核对/);
    // 兜底：认证失败时读公告取最新 Token 重配。
    assert.match(text, /重新配置一遍 MCP 服务/);
    // 公告 Token 是敏感凭据：只用于本地 MCP 配置，不得输出。
    assert.match(text, /不得输出到日志、对话、问题帖、回复或文档正文/);
  });

  // 8. download_doc 响应收敛（2026-08-25）：顶层仅 ok / doc / contentBase64，
  //    filename / contentType / sizeBytes 只在 doc 对象内，顶层不再冗余（三处文档同步）。
  describe("download_doc 文件元信息只在 doc 对象内（顶层不冗余）", () => {
    for (const file of IN_REPO_FILES) {
      it(`${file}`, async () => {
        const text = await readDoc(file);
        assert.match(text, /均在 `doc` 对象内/);
        // 旧契约的顶层冗余表述已移除。
        assert.doesNotMatch(text, /顶层冗余/);
      });
    }
    it("tools.md（本地留存，缺失跳过）", async (t) => {
      const file = LOCAL_ONLY_FILES[0];
      if (skipIfMissing(t, file)) return;
      const text = await readDoc(file);
      // 输出参数表不再有顶层冗余行；contentBase64 行须指明文件名与 MIME 从 doc 取。
      assert.doesNotMatch(text, /顶层冗余/);
      assert.match(text, /doc\.filename/);
      assert.match(text, /doc\.contentType/);
    });
  });
});
