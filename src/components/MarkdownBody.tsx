import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type MarkdownBodyProps = {
  body: string;
};

// 真正解析 markdown 渲染（react-markdown + remark-gfm：表格/删除线/任务列表/自动链接）。
// 仅将标准的双波浪线 `~~文本~~` 识别为删除线，避免转速、频率等参数范围中的
// 单波浪线（如 `500~16000r/min，频率20~20kHz`）被 GFM 错误配对成删除线。
// react-markdown 默认不渲染原始 HTML，对用户上传的 .md 内容是 XSS 安全的。
// 元素样式由 globals.css 的 .markdown-body 块统一管理（匹配项目设计 token）。
export function MarkdownBody({ body }: MarkdownBodyProps) {
  return (
    <div className="markdown-body">
      <ReactMarkdown remarkPlugins={[[remarkGfm, { singleTilde: false }]]}>{body}</ReactMarkdown>
    </div>
  );
}
