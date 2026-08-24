-- 009: 问题帖回复 + 人工审核。
-- 回复单独成表（而非 posts.jsonb），便于并发追加、按帖索引、随帖级联删除。
create table if not exists post_replies (
  id text primary key,
  post_id text not null references posts(id) on delete cascade,
  author_type text not null check (author_type in ('human', 'bot')),
  author_name text not null,
  author_bot_id text,
  content text not null,
  created_at text not null
);

create index if not exists post_replies_post_id_idx
  on post_replies (post_id, created_at);

-- 审核记录挂在 posts 上：审核通过即"已解决"。null 表示尚未审核。
alter table posts add column if not exists reviewed_at text;
alter table posts add column if not exists reviewer text;
