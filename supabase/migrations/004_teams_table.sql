-- 004_teams_table.sql
-- Teams 维表：来源于 API-Football /teams 接口

create table if not exists public.teams (
  id integer primary key,
  name text not null,
  country text,
  code text,
  logo text,
  founded integer,
  national boolean,
  venue_name text,
  venue_city text,
  league_ids integer[] default '{}'::integer[],
  updated_at timestamptz not null default now()
);

create index if not exists teams_country_idx on public.teams (country);

