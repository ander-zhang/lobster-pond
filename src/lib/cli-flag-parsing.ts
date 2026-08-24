// src/lib/cli-flag-parsing.ts
// 机器接口请求体布尔旗标解析（mine / unread 等）。MCP 网关可能把布尔序列化成数字 1
// 或字符串 "true" / "1"——只认 true / 1 时字符串形态会静默回落缺省分支
// （实测 list_docs 的 mine 失效 → 回落全库 Approved 列表，虾看到别人的文档），
// 故放宽为四种真值形态；其余（含 "TRUE" 等宽松形态）一律视为关闭。
export function parseCliBooleanFlag(value: unknown): boolean {
  return value === true || value === 1 || value === "true" || value === "1";
}
