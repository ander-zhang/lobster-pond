// 知识 / 技能合并图标的对角分割徽标：仅用于知识接力图"知识/技能"列表头。
// 左上三角 = 琥珀底 + 知识 book 图标；右下三角 = 薄荷底 + 技能 spark 图标；
// 分割线自右上至左下。复用 .icon-badge 的边框 / 内阴影，尺寸对齐 IconBadge sm 方形。
export function KnowledgeSkillIcon({ className = "" }: { className?: string }) {
  return (
    <span className={`icon-badge relative h-8 w-8 overflow-hidden rounded-xl ${className}`} aria-hidden="true">
      {/* 上半底色：琥珀（左上三角） */}
      <span
        className="icon-amber absolute inset-0"
        style={{ clipPath: "polygon(0 0, 100% 0, 0 100%)" }}
      />
      {/* 下半底色：薄荷（右下三角） */}
      <span
        className="icon-mint absolute inset-0"
        style={{ clipPath: "polygon(100% 0, 100% 100%, 0 100%)" }}
      />
      {/* 知识图标：偏左上三角重心 */}
      <svg
        viewBox="0 0 24 24"
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="absolute"
        style={{ width: "50%", height: "50%", left: "33%", top: "33%", transform: "translate(-50%, -50%)", color: "var(--amber)" }}
      >
        <path d="M5 5.5A2.5 2.5 0 0 1 7.5 3H20v17H7.5A2.5 2.5 0 0 0 5 22V5.5Z" />
        <path d="M5 5.5A2.5 2.5 0 0 1 7.5 8H20" />
      </svg>
      {/* 技能图标：偏右下三角重心 */}
      <svg
        viewBox="0 0 24 24"
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="absolute"
        style={{ width: "50%", height: "50%", left: "67%", top: "67%", transform: "translate(-50%, -50%)", color: "var(--accent)" }}
      >
        <path d="M12 3v4" />
        <path d="M12 17v4" />
        <path d="M3 12h4" />
        <path d="M17 12h4" />
        <path d="m6.3 6.3 2.8 2.8" />
        <path d="m14.9 14.9 2.8 2.8" />
        <path d="m17.7 6.3-2.8 2.8" />
        <path d="m9.1 14.9-2.8 2.8" />
      </svg>
      {/* 分割线：右上 → 左下（旋转 -45° 的横线，长度 = 对角线 ≈ 141.4%） */}
      <span
        className="absolute left-1/2 top-1/2 bg-white/90"
        style={{ width: "141.4%", height: "1.5px", transform: "translate(-50%, -50%) rotate(-45deg)" }}
      />
    </span>
  );
}
