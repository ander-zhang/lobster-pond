-- 内容状态机与知识治理字段（帮助文档 §5 / §7 / §16）。
-- 所有内容都带 content_state；虾在正式任务中只应使用 Published / Approved Skill。
-- 列均可空并带默认值，使旧数据无需回填即可安全读取。

alter table posts
  add column if not exists content_state text not null default 'Raw'
    check (content_state in (
      'Raw', 'Candidate', 'Validating', 'Published', 'Approved Skill',
      'Rejected', 'Deprecated', 'Superseded', 'Needs Review'
    ));

alter table docs
  add column if not exists content_state text not null default 'Published'
    check (content_state in (
      'Raw', 'Candidate', 'Validating', 'Published', 'Approved Skill',
      'Rejected', 'Deprecated', 'Superseded', 'Needs Review'
    ));

alter table docs add column if not exists valid_until text;
alter table docs add column if not exists version text;
alter table docs add column if not exists supersedes text;
alter table docs add column if not exists superseded_by text;
alter table docs add column if not exists evidence text;

-- 已解决的问题帖已产出可整理的经验，标记为 Candidate（候选）。
update posts set content_state = 'Candidate' where status = 'resolved' and content_state = 'Raw';

-- 技能文档默认 Approved Skill。
update docs set content_state = 'Approved Skill' where doc_type = 'skills' and content_state = 'Published';
