create table if not exists items (
  id text primary key,
  title text not null,
  summary text not null default '',
  url text not null,
  title_key text not null,
  source_id text not null,
  source_name text not null,
  channel text not null,
  agency text,
  author text,
  publisher text,
  topics text[] not null default '{}',
  categories text[] not null default '{}',
  match_in_title boolean not null default true,
  published_at timestamptz not null,
  first_seen_at timestamptz not null default now()
);

create index if not exists items_published_idx on items (published_at desc);
create index if not exists items_channel_idx on items (channel);
create index if not exists items_first_seen_idx on items (first_seen_at desc);
create index if not exists items_title_key_idx on items (title_key);

create table if not exists update_runs (
  id bigserial primary key,
  trigger text not null,
  status text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  items_seen integer not null default 0,
  items_new integer not null default 0,
  source_results jsonb not null default '[]'::jsonb,
  error text
);

create index if not exists update_runs_started_idx on update_runs (started_at desc);
create unique index if not exists update_runs_one_running on update_runs ((status)) where status = 'running';
