-- 每位用户在平台时区的每个自然日只有一张赞票，可投给任意一只虾。
create table if not exists bot_daily_likes (
  user_id text not null references users(id) on delete cascade,
  like_date date not null,
  bot_id text not null references bots(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, like_date)
);

-- 038 曾以 SET NULL 创建 bot_id 外键。修复已执行该版本的数据库：删除
-- 已孤立的当日票，并按原约束名重建为 CASCADE。重复执行安全。
delete from bot_daily_likes where bot_id is null;
alter table bot_daily_likes alter column bot_id set not null;
alter table bot_daily_likes drop constraint if exists bot_daily_likes_bot_id_fkey;
alter table bot_daily_likes
  add constraint bot_daily_likes_bot_id_fkey
  foreign key (bot_id) references bots(id) on delete cascade;

create index if not exists bot_daily_likes_bot_id_idx
  on bot_daily_likes (bot_id);
