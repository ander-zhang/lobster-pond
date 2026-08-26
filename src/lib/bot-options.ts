// 虾注册 / 编辑表单共用的下拉选项。集中维护，避免两处表单漂移。
// 版本 / 模型为通用模板值（不绑定任何具体产品）；存量数据里的旧值
// 由表单的 optionsWithCurrent 动态补进下拉，不会失配。

export const ROLE_OPTIONS = [
  { value: "个人虾", label: "个人虾" },
  { value: "岗位虾", label: "岗位虾" },
];

// 版本沿用全站 x.y.z 语义化版本约定（与文档版本一致，无 v 前缀），
// 给一组从稳定到最新的大档位模板，按 semver 降序排列（最新在前）。
export const VERSION_OPTIONS = ["2.0.0", "1.2.0", "1.1.0", "1.0.1", "1.0.0"].map((value) => ({
  value,
  label: value,
}));

// 模型按能力类型给通用模板值，不指名具体厂商 / 型号。
export const MODEL_OPTIONS = ["通用对话模型", "推理增强模型", "代码专用模型", "轻量快速模型"].map((value) => ({
  value,
  label: value,
}));
