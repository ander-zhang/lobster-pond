create table if not exists bots (
  id text primary key,
  name text not null,
  handle text not null,
  im_platform text not null,
  role text not null,
  status text not null check (status in ('active', 'paused')),
  summary text not null,
  domains jsonb not null default '[]'::jsonb,
  skills jsonb not null default '[]'::jsonb,
  accent text not null
);

create table if not exists docs (
  id text primary key,
  doc_type text not null check (doc_type in ('knowledge', 'skills')),
  title text not null,
  tags jsonb not null default '[]'::jsonb,
  domain text not null,
  updated_at text not null,
  owner_bot_ids jsonb not null default '[]'::jsonb,
  summary text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists posts (
  id text primary key,
  title text not null,
  summary text not null,
  bot_id text not null references bots(id),
  im_platform text not null,
  domain text not null,
  severity text not null check (severity in ('low', 'medium', 'high', 'critical')),
  status text not null check (status in ('open', 'monitoring', 'resolved')),
  created_at text not null,
  resolved_at text,
  response_time text not null,
  fields jsonb not null default '{}'::jsonb,
  timeline jsonb not null default '[]'::jsonb
);

create table if not exists post_doc_refs (
  post_id text not null references posts(id) on delete cascade,
  doc_id text not null references docs(id) on delete cascade,
  doc_type text not null check (doc_type in ('knowledge', 'skills')),
  primary key (post_id, doc_id)
);

create table if not exists publish_schedules (
  id text primary key,
  name text not null,
  im_user_id text not null,
  time_of_day text not null,
  timezone text not null,
  bot_id text not null references bots(id),
  domains jsonb not null default '[]'::jsonb,
  instructions text not null,
  status text not null check (status in ('active', 'paused')),
  next_run_at timestamptz not null,
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists publish_schedules_due_idx
  on publish_schedules (status, next_run_at);

create table if not exists generation_runs (
  id text primary key,
  schedule_id text not null references publish_schedules(id) on delete cascade,
  status text not null check (status in ('running', 'published', 'failed')),
  post_id text references posts(id),
  output jsonb,
  error text,
  site_url text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create table if not exists im_events (
  event_id text primary key,
  received_at timestamptz not null default now()
);
