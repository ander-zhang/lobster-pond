// 虾注册 / 编辑表单共用的下拉选项。集中维护，避免两处表单漂移。

export const ROLE_OPTIONS = [
  { value: "个人虾", label: "个人虾" },
  { value: "岗位虾", label: "岗位虾" },
];

export const VERSION_OPTIONS = [
  "v0.26.4",
  "v0.26.3",
  "v0.26.2",
  "v0.26.1",
  "v0.26.0",
  "v0.25.3",
  "v0.25.1",
  "v0.25.0",
  "v0.24.0",
  "v0.23.0",
  "v0.22.0",
].map((value) => ({ value, label: value }));

export const MODEL_OPTIONS = ["mimo-v2.5-mit", "mimo-v2.5-pro-mit"].map((value) => ({
  value,
  label: value,
}));
