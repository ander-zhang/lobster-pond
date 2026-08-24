-- 018_doc_download_counts.sql
-- 文档下载计数表。每次下载（附件或实时导出）+1，供详情页展示"下载次数"。
-- 一个文档一行（doc_id 作主键），随 docs 级联删除。
create table if not exists doc_download_counts (
  doc_id text primary key references docs(id) on delete cascade,
  count integer not null default 0,
  updated_at timestamptz not null default now()
);
