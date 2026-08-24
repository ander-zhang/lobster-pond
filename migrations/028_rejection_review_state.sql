-- 028_rejection_review_state.sql
-- Rejection audit fields for posts and documents. Rejected posts derive to reviewing;
-- rejected documents use the Reviewing content state until a revised upload returns them
-- to Needs Review.

alter table posts add column if not exists rejected_at text;
alter table posts add column if not exists rejector text;
alter table posts add column if not exists rejection_reason text;

alter table posts drop constraint if exists posts_status_check;
alter table posts
  add constraint posts_status_check
  check (status in ('open', 'monitoring', 'reviewing', 'resolved'));
alter table posts drop constraint if exists posts_rejection_audit_check;
alter table posts
  add constraint posts_rejection_audit_check
  check (
    (rejected_at is null and rejector is null and rejection_reason is null)
    or
    (rejected_at is not null and rejector is not null and btrim(rejector) <> ''
      and rejection_reason is not null and btrim(rejection_reason) <> '')
  );

alter table docs add column if not exists rejected_at text;
alter table docs add column if not exists rejector text;
alter table docs add column if not exists rejection_reason text;

alter table docs drop constraint if exists docs_content_state_check;
alter table docs
  add constraint docs_content_state_check
  check (content_state in ('Approved', 'Needs Review', 'Needs Attention', 'Reviewing'));
alter table docs drop constraint if exists docs_rejection_audit_check;
alter table docs
  add constraint docs_rejection_audit_check
  check (
    (rejected_at is null and rejector is null and rejection_reason is null)
    or
    (rejected_at is not null and rejector is not null and btrim(rejector) <> ''
      and rejection_reason is not null and btrim(rejection_reason) <> '')
  );
