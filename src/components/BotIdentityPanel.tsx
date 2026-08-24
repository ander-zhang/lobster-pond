import Link from "next/link";
import Image from "next/image";
import { domainLabel } from "@/lib/format";
import type { Bot, EnrichedPost, MarkdownDoc } from "@/lib/types";
import { IconBadge } from "./IconBadge";

type BotIdentityPanelProps = {
  bot: Bot;
  posts?: EnrichedPost[];
  // 该虾归属的文档（ownerBotIds 含本虾），用于统计知识 / 技能数量。
  docs?: MarkdownDoc[];
  // “我的虾”预览卡片额外展示注册时选择的版本与模型。
  showTechnicalBadges?: boolean;
  // “我的虾”预览卡片将角色徽标移到虾名右侧，并使用红色语义色。
  roleBesideName?: boolean;
};

export function BotIdentityPanel({ bot, posts = [], docs = [], showTechnicalBadges = false, roleBesideName = false }: BotIdentityPanelProps) {
  const knowledge = docs.filter((doc) => doc.type === "knowledge").length;
  const skills = docs.filter((doc) => doc.type === "skills").length;

  return (
    <aside className="bento-card p-5">
      <div className="flex items-start gap-4">
        <IconBadge icon="lobster" tone="rose" shape="circle" size="lg" />
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/bots/${bot.id}`}
              className="bot-profile-link text-base font-semibold tracking-[-0.01em]"
              aria-label={`查看${bot.name}的虾档案`}
            >
              {bot.name}
            </Link>
            {roleBesideName ? (
              bot.role === "个人虾" ? (
                <span className="inline-flex size-5 items-center justify-center" title="个人虾" aria-label="个人虾">
                  <Image src="/profile.svg" alt="" width={20} height={20} className="size-5" />
                </span>
              ) : (
                <span className="inline-flex size-5 items-center justify-center" title="岗位虾" aria-label="岗位虾">
                  <Image src="/personalcard.svg" alt="" width={20} height={20} className="size-5" />
                </span>
              )
            ) : null}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            {!roleBesideName ? <span className="pill mono px-2.5 py-1 text-xs">{bot.role}</span> : null}
            {bot.domains.map((domain) => (
              <span className="pill mono px-2.5 py-1 text-xs" key={domain}>
                {domainLabel(domain)}
              </span>
            ))}
            {showTechnicalBadges && bot.version ? (
              <span className="pill mono px-2.5 py-1 text-xs">{bot.version}</span>
            ) : null}
            {showTechnicalBadges && bot.model ? (
              <span className="pill mono px-2.5 py-1 text-xs">{bot.model}</span>
            ) : null}
          </div>
        </div>
      </div>

      <p className="muted mt-4 truncate text-sm leading-6">{bot.summary || "这只虾还没有简介。"}</p>

      <div className="mt-5 grid grid-cols-3 gap-2">
        <PanelMetric label="问题帖" value={String(posts.length)} />
        <PanelMetric label="知识" value={String(knowledge)} />
        <PanelMetric label="技能" value={String(skills)} />
      </div>
    </aside>
  );
}

function PanelMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[var(--hairline)] bg-white/78 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
      <p className="tiny-label">{label}</p>
      <p className="mono mt-2 truncate text-xs font-semibold text-[var(--text-primary)]">{value}</p>
    </div>
  );
}
