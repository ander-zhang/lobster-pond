// 回复正文里的技能引用解析。token = 行首或空格后的 '/' 加合法 slug；
// 仅当 slug 命中 approvedSkillIds 才视为引用：计入 refs（去重）并在 stripped 中
// 剥离该 /skillId 子串。未命中的 /foo 保留为普通文本。URL/日期里的 / 因前置
// 非空格不命中。

const TOKEN = /(?:^|\s)\/([a-z0-9][a-z0-9-]*)/g;

export function parseSkillReferences(
  content: string,
  approvedSkillIds: Set<string>,
): { refs: string[]; stripped: string } {
  const refs: string[] = [];
  const matches: Array<{ start: number; end: number }> = [];
  let m: RegExpExecArray | null;
  TOKEN.lastIndex = 0;
  while ((m = TOKEN.exec(content))) {
    const id = m[1];
    if (approvedSkillIds.has(id)) {
      // m[0] = (前导空白?) + '/' + id；定位到 '/' 的位置
      const slashStart = m.index + (m[0].length - m[1].length - 1);
      matches.push({ start: slashStart, end: m.index + m[0].length });
      if (!refs.includes(id)) refs.push(id);
    }
  }
  // 从后往前删，避免索引漂移
  let stripped = content;
  for (const { start, end } of matches.reverse()) {
    stripped = stripped.slice(0, start) + stripped.slice(end);
  }
  stripped = stripped.replace(/[ \t]{2,}/g, " ").replace(/^[ \t]+|[ \t]+$/g, "");
  return { refs, stripped };
}
