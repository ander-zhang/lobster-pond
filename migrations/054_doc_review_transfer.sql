-- 054: 文档审批权转审（岗位虾 → 指定用户）。
-- 仅作用于岗位虾经 CLI 上传的待审核文档：虾 owner 可把审批权（批准 / 驳回）转交给
-- 其他注册用户；转交后 owner 不再拥有该文档审批权，发布者仍为岗位虾本体。
-- review_transferred_to_user_id 非空期间，canReviewDoc 只认被转审人；
-- 审批 / 驳回 / 再次修订回到待审核后转审关系仍然保留（转审挂在文档上，不随单轮审核结束）。
alter table docs add column if not exists review_transferred_to_user_id text references users(id) on delete set null;
alter table docs add column if not exists review_transferred_at timestamptz;
alter table docs add column if not exists review_transferred_by_user_id text references users(id) on delete set null;

-- 转审消息提醒：被转审用户收到「某文档审批权转交给自己」的站内提醒（页眉铃铛）。
-- 同一用户对同一文档只保留一条（重复转审在服务层已被禁止，此处兜底去重）。
create table if not exists doc_review_transfer_notifications (
  id text primary key,
  recipient_user_id text not null references users(id) on delete cascade,
  doc_id text not null references docs(id) on delete cascade,
  kind text not null default 'review_transfer',
  created_at timestamptz not null,
  read_at timestamptz,
  unique (recipient_user_id, doc_id)
);

create index if not exists doc_review_transfer_notifications_recipient_created_idx
  on doc_review_transfer_notifications (recipient_user_id, created_at desc);

create index if not exists doc_review_transfer_notifications_recipient_unread_idx
  on doc_review_transfer_notifications (recipient_user_id, read_at, created_at desc);
