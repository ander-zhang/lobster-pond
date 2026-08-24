-- 文档附件表（让知识/技能可被上传真实文件并下载/安装）。
-- 一个文档最多一个附件（doc_id 作主键），覆盖式上传。
-- 文件以 base64 存储，避免依赖外部对象存储；单文件大小由应用层限制（5MB）。

create table if not exists doc_assets (
  doc_id text primary key references docs(id) on delete cascade,
  doc_type text not null check (doc_type in ('knowledge', 'skills')),
  filename text not null,
  content_type text not null,
  content_base64 text not null,
  size_bytes integer not null,
  uploaded_at timestamptz not null default now()
);
