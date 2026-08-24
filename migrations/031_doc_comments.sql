-- 登录用户对知识 / 技能文档的评论。
create table if not exists doc_comments (
  id text primary key,
  doc_id text not null references docs(id) on delete cascade,
  author_user_id text not null references users(id) on delete cascade,
  content text not null check (char_length(btrim(content)) > 0),
  created_at timestamptz not null default now()
);

create index if not exists doc_comments_doc_created_idx
  on doc_comments (doc_id, created_at asc);
