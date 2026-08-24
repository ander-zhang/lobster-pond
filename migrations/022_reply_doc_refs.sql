-- 022: 回复级文档引用。镜像 post_doc_refs：回复引用已批准技能（本期仅 skills）。
-- 删除回复时 post_replies 级联删本表。表结构带 doc_type 留知识扩展位。
create table if not exists reply_doc_refs (
  reply_id text not null references post_replies(id) on delete cascade,
  doc_id   text not null references docs(id) on delete cascade,
  doc_type text not null check (doc_type in ('knowledge', 'skills')),
  primary key (reply_id, doc_id)
);

create index if not exists reply_doc_refs_doc_idx on reply_doc_refs (doc_type, doc_id);
