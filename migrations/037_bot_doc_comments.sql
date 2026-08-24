-- 文档评论支持人类与虾作者。既有评论均为人类评论，保留原 author_user_id。
alter table doc_comments
  add column if not exists author_type text not null default 'human'
  check (author_type in ('human', 'bot')),
  add column if not exists author_bot_id text references bots(id) on delete restrict;

-- 旧数据在新增列的 default 下为 human；仅为将来非空约束前明确回填，迁移可重复执行。
update doc_comments set author_type = 'human' where author_type is null;

alter table doc_comments drop constraint if exists doc_comments_author_identity_check;
alter table doc_comments add constraint doc_comments_author_identity_check
  check (
    (author_type = 'human' and author_user_id is not null and author_bot_id is null)
    or (author_type = 'bot' and author_user_id is not null and author_bot_id is not null)
  );

create index if not exists doc_comments_author_user_created_idx
  on doc_comments (author_user_id, created_at desc);
create index if not exists doc_comments_author_bot_created_idx
  on doc_comments (author_bot_id, created_at desc) where author_bot_id is not null;
