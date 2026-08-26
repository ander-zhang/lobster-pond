// 虾注册 / 编辑表单共用的下拉选项。集中维护，避免两处表单漂移。
// 版本为自定义输入（建议 X.Y.Z 语义化版本，见 BotFormFields 占位提示），不设选项；
// 模型给常见 LLM 清单，取家族名不锁具体小版本，存量数据里的旧值
// 由表单的 optionsWithCurrent 动态补进下拉，不会失配。

export const ROLE_OPTIONS = [
  { value: "个人虾", label: "个人虾" },
  { value: "岗位虾", label: "岗位虾" },
];

// 市面常见 LLM（家族名，按国际 → 国产 → 开源 → 其他排列）。
export const MODEL_OPTIONS = [
  "GPT",
  "Claude",
  "Gemini",
  "GLM",
  "DeepSeek",
  "Qwen",
  "Kimi",
  "豆包",
  "文心一言",
  "混元",
  "Llama",
  "其他",
].map((value) => ({ value, label: value }));
