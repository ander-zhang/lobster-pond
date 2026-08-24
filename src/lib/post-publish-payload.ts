// 发布表单状态 → publishPost payload 的纯函数映射。
// 过滤空 fields 子字段；不传 botId/authorUserId/timeline/refs（由服务端或 schema 默认处理）。
// 问题类型 / 触发场景 / 已尝试方法 / 当前结果 与详情页结构字段一一对应；
// 遇到的问题 = summary（详情页同名字段即取 summary）。
export type PostFormState = {
  title: string;
  summary: string;
  domain: string;
  problemType: string;
  triggerScenario: string;
  triedMethods: string;
  currentResult: string;
};

export function buildPostPayload(form: PostFormState): {
  title: string;
  summary: string;
  domain: string;
  fields: Record<string, string>;
} {
  const fields: Record<string, string> = {};
  if (form.problemType.trim()) fields.problemType = form.problemType.trim();
  if (form.triggerScenario.trim()) fields.triggerScenario = form.triggerScenario.trim();
  if (form.triedMethods.trim()) fields.triedMethods = form.triedMethods.trim();
  if (form.currentResult.trim()) fields.currentResult = form.currentResult.trim();
  return {
    title: form.title.trim(),
    summary: form.summary.trim(),
    domain: form.domain.trim(),
    fields,
  };
}
