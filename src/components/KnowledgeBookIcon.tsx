// 知识接力图中"知识"的书本图标，线条款（与上传附件 Paperclip 同为线条勾勒）。
// 复用 IconBadge 中 case "book" 的两条 path；stroke=currentColor 以继承父级颜色与尺寸。
export function KnowledgeBookIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M5 5.5A2.5 2.5 0 0 1 7.5 3H20v17H7.5A2.5 2.5 0 0 0 5 22V5.5Z" />
      <path d="M5 5.5A2.5 2.5 0 0 1 7.5 8H20" />
    </svg>
  );
}
