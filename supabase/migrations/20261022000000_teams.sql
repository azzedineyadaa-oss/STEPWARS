-- StepWars : guerre d'équipes.
--
-- Un joueur appartient à une équipe au plus. Chaque semaine (lundi-dimanche),
-- les équipes s'affrontent sur la somme des pas de leurs membres, comptés à
-- partir de leur jour d'arrivée. Les coéquipiers se voient entre eux comme des
-- amis ; le classement global n'expose que des totaux par équipe.

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 24),
  emoji text not null default '⚔️' check (char_length(emoji) between 1 and 8),
  code text not null unique,
  -- Masquée du classement global après signalements (ou à la main).
  hidden boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.profiles
  add column team_id uuid references public.teams (id) on delete set null,
  add column team_joined_on date;

create index profiles_team_idx on public.profiles (team_id);

create table public.team_reports (
  team_id uuid not null references public.teams (id) on delete cascade,
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (team_id, reporter_id)
);

-- Nombre de signalements distincts qui masquent une équipe du classement.
create function public.report_threshold() returns integer language sql immutable as $$ select 3 $$;

-- Taille maximale d'une équipe.
create function public.team_max_members() returns integer language sql immutable as $$ select 30 $$;

-- ---------------------------------------------------------------------------
-- Visibilité
-- ---------------------------------------------------------------------------

create function public.my_team_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select team_id from public.profiles where id = auth.uid();
$$;

create function public.is_teammate(other uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles me
    join public.profiles them on them.team_id = me.team_id
    where me.id = auth.uid() and them.id = other and me.team_id is not null
  );
$$;

alter policy "profil : soi-même et ses amis" on public.profiles
  using (id = (select auth.uid()) or public.is_friend(id) or public.is_teammate(id));
alter policy "profil : soi-même et ses amis" on public.profiles
  rename to "profil : soi-même, ses amis et coéquipiers";

alter policy "pas : les siens et ceux de ses amis" on public.daily_steps
  using (user_id = (select auth.uid()) or public.is_friend(user_id) or public.is_teammate(user_id));
alter policy "pas : les siens et ceux de ses amis" on public.daily_steps
  rename to "pas : les siens, ceux de ses amis et coéquipiers";

alter table public.teams enable row level security;
alter table public.team_reports enable row level security;

create policy "équipe : la sienne" on public.teams
  for select to authenticated
  using (id = public.my_team_id());

revoke all on public.teams, public.team_reports from anon, authenticated;
grant select (id, name, emoji, code, created_at) on public.teams to authenticated;

-- ---------------------------------------------------------------------------
-- Fonctions appelées par l'app
-- ---------------------------------------------------------------------------

create function public.create_team(team_name text, team_emoji text)
returns table (id uuid, name text, emoji text, code text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  new_team public.teams%rowtype;
  new_code text;
begin
  if me is null then
    raise exception 'not_authenticated';
  end if;
  if (select team_id from public.profiles where profiles.id = me) is not null then
    raise exception 'already_in_team';
  end if;

  loop
    new_code := public.generate_friend_code();
    exit when not exists (select 1 from public.teams t where t.code = new_code);
  end loop;

  insert into public.teams (name, emoji, code, created_by)
  values (trim(team_name), team_emoji, new_code, me)
  returning * into new_team;

  update public.profiles set team_id = new_team.id, team_joined_on = current_date where profiles.id = me;

  return query select new_team.id, new_team.name, new_team.emoji, new_team.code;
end;
$$;

create function public.join_team(team_code text)
returns table (id uuid, name text, emoji text, code text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  target public.teams%rowtype;
begin
  if me is null then
    raise exception 'not_authenticated';
  end if;

  select * into target from public.teams t where t.code = upper(trim(team_code));
  if not found then
    raise exception 'team_code_not_found';
  end if;
  if (select team_id from public.profiles where profiles.id = me) is not null then
    raise exception 'already_in_team';
  end if;
  -- Verrou sur l'équipe : deux arrivées simultanées ne dépassent pas la limite.
  perform 1 from public.teams t where t.id = target.id for update;
  if (select count(*) from public.profiles p where p.team_id = target.id) >= public.team_max_members() then
    raise exception 'team_full';
  end if;

  update public.profiles set team_id = target.id, team_joined_on = current_date where profiles.id = me;

  return query select target.id, target.name, target.emoji, target.code;
end;
$$;

-- Quitter son équipe ; une équipe vide est supprimée.
create function public.leave_team()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  old_team uuid;
begin
  if me is null then
    raise exception 'not_authenticated';
  end if;

  select team_id into old_team from public.profiles where id = me for update;
  update public.profiles set team_id = null, team_joined_on = null where id = me;

  if old_team is not null and not exists (select 1 from public.profiles where team_id = old_team) then
    delete from public.teams where id = old_team;
  end if;
end;
$$;

-- Classement des équipes sur une période (jours locaux envoyés par l'app).
-- Seuls des totaux sont exposés. L'équipe du joueur est toujours incluse,
-- même masquée ou hors des `max_rows` premières.
create function public.team_leaderboard(from_day date, to_day date, max_rows integer default 50)
returns table (id uuid, name text, emoji text, members integer, steps bigint)
language sql
stable
security definer
set search_path = ''
as $$
  with totals as (
    select
      t.id,
      t.name,
      t.emoji,
      t.hidden,
      count(distinct p.id)::integer as members,
      coalesce(sum(s.steps) filter (where s.day >= p.team_joined_on), 0)::bigint as steps
    from public.teams t
    join public.profiles p on p.team_id = t.id
    left join public.daily_steps s
      on s.user_id = p.id and s.day between from_day and to_day
    group by t.id
  )
  (
    select id, name, emoji, members, steps from totals
    where not hidden
    order by steps desc, name
    limit least(greatest(max_rows, 1), 100)
  )
  union
  select id, name, emoji, members, steps from totals where id = public.my_team_id();
$$;

create function public.report_team(team uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'not_authenticated';
  end if;
  if team = public.my_team_id() then
    raise exception 'cannot_report_own_team';
  end if;

  insert into public.team_reports (team_id, reporter_id) values (team, me) on conflict do nothing;

  update public.teams set hidden = true
  where id = team and (select count(*) from public.team_reports where team_id = team) >= public.report_threshold();
end;
$$;

revoke execute on function
  public.report_threshold(),
  public.team_max_members(),
  public.my_team_id(),
  public.is_teammate(uuid),
  public.create_team(text, text),
  public.join_team(text),
  public.leave_team(),
  public.team_leaderboard(date, date, integer),
  public.report_team(uuid)
from public, anon, authenticated;

grant execute on function
  public.my_team_id(),
  public.is_teammate(uuid),
  public.create_team(text, text),
  public.join_team(text),
  public.leave_team(),
  public.team_leaderboard(date, date, integer),
  public.report_team(uuid)
to authenticated;
