-- Fichier généré par scripts/bundle-sql.sh : ne pas modifier à la main.
-- À coller en une fois dans le SQL Editor d'un projet Supabase neuf.

-- ===== 20261021000000_init.sql =====
-- StepWars : schéma initial.
--
-- Principe de sécurité : chaque joueur ne voit que son profil, ses amis,
-- les pas de ses amis et les défis auxquels il participe (Row Level Security).
-- Les opérations qui touchent deux joueurs à la fois (ajout d'ami, etc.)
-- passent par des fonctions `security definer` qui contrôlent auth.uid().

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null default 'Joueur' check (char_length(name) between 1 and 20),
  avatar text not null default '🏃' check (char_length(avatar) between 1 and 8),
  daily_goal integer not null default 8000 check (daily_goal between 1000 and 100000),
  friend_code text not null unique,
  created_at timestamptz not null default now()
);

create table public.friendships (
  -- Une amitié est stockée dans les deux sens : (a, b) et (b, a).
  user_id uuid not null references public.profiles (id) on delete cascade,
  friend_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id),
  check (user_id <> friend_id)
);

create table public.daily_steps (
  user_id uuid not null references public.profiles (id) on delete cascade,
  day date not null,
  steps integer not null check (steps between 0 and 200000),
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

create table public.challenges (
  id uuid primary key default gen_random_uuid(),
  challenger_id uuid not null references public.profiles (id) on delete cascade,
  opponent_id uuid not null references public.profiles (id) on delete cascade,
  start_day date not null,
  days integer not null check (days in (1, 3, 7)),
  created_at timestamptz not null default now(),
  check (challenger_id <> opponent_id)
);

create index challenges_challenger_idx on public.challenges (challenger_id);
create index challenges_opponent_idx on public.challenges (opponent_id);

-- ---------------------------------------------------------------------------
-- Création automatique du profil à l'inscription
-- ---------------------------------------------------------------------------

create function public.generate_friend_code()
returns text
language plpgsql
set search_path = ''
as $$
declare
  -- Sans 0/O/1/I, faciles à confondre.
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text;
begin
  loop
    code := '';
    for i in 1..6 loop
      code := code || substr(alphabet, 1 + floor(random() * 32)::int, 1);
    end loop;
    exit when not exists (select 1 from public.profiles where friend_code = code);
  end loop;
  return code;
end;
$$;

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, friend_code) values (new.id, public.generate_friend_code());
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

-- Utilisée dans les règles ci-dessous ; `security definer` évite que la règle
-- de `friendships` ne s'applique récursivement.
-- Ne répond que pour le joueur connecté, pour ne rien révéler des autres.
create function public.is_friend(other uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.friendships where user_id = auth.uid() and friend_id = other);
$$;

alter table public.profiles enable row level security;
alter table public.friendships enable row level security;
alter table public.daily_steps enable row level security;
alter table public.challenges enable row level security;

create policy "profil : soi-même et ses amis" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or public.is_friend(id));

create policy "profil : modifier le sien" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy "amitiés : les siennes" on public.friendships
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "pas : les siens et ceux de ses amis" on public.daily_steps
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_friend(user_id));

create policy "défis : ceux où l'on joue" on public.challenges
  for select to authenticated
  using ((select auth.uid()) in (challenger_id, opponent_id));

create policy "défis : lancer contre un ami" on public.challenges
  for insert to authenticated
  with check (
    challenger_id = (select auth.uid())
    and public.is_friend(opponent_id)
    -- Tolérance d'un jour : le jour local du téléphone peut différer du jour UTC.
    and start_day between current_date - 1 and current_date + 1
  );

create policy "défis : supprimer ceux où l'on joue" on public.challenges
  for delete to authenticated
  using ((select auth.uid()) in (challenger_id, opponent_id));

-- Droits : rien pour les visiteurs non connectés ; les connectés ne modifient
-- que les colonnes prévues, le reste passe par les fonctions ci-dessous.
revoke all on public.profiles, public.friendships, public.daily_steps, public.challenges from anon;
revoke insert, update, delete on public.profiles, public.friendships, public.daily_steps from authenticated;
grant select on public.profiles, public.friendships, public.daily_steps, public.challenges to authenticated;
grant update (name, avatar, daily_goal) on public.profiles to authenticated;
grant insert (challenger_id, opponent_id, start_day, days), delete on public.challenges to authenticated;

-- ---------------------------------------------------------------------------
-- Fonctions appelées par l'app (supabase.rpc)
-- ---------------------------------------------------------------------------

create function public.add_friend(code text)
returns table (id uuid, name text, avatar text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  target public.profiles%rowtype;
begin
  if me is null then
    raise exception 'not_authenticated';
  end if;

  select * into target from public.profiles p where p.friend_code = upper(trim(code));
  if not found then
    raise exception 'friend_code_not_found';
  end if;
  if target.id = me then
    raise exception 'cannot_add_self';
  end if;

  insert into public.friendships (user_id, friend_id)
  values (me, target.id), (target.id, me)
  on conflict do nothing;

  return query select target.id, target.name, target.avatar;
end;
$$;

create function public.remove_friend(friend uuid)
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

  delete from public.friendships
  where (user_id = me and friend_id = friend) or (user_id = friend and friend_id = me);

  delete from public.challenges
  where (challenger_id = me and opponent_id = friend) or (challenger_id = friend and opponent_id = me);
end;
$$;

-- entries : [{"day": "2026-10-21", "steps": 4200}, ...]
-- Un total ne peut qu'augmenter, et seuls les 8 derniers jours sont acceptés.
create function public.record_steps(entries jsonb)
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

  insert into public.daily_steps (user_id, day, steps)
  select me, (e ->> 'day')::date, (e ->> 'steps')::int
  from jsonb_array_elements(entries) as e
  where (e ->> 'day')::date between current_date - 8 and current_date + 1
  on conflict (user_id, day) do update
    set steps = greatest(public.daily_steps.steps, excluded.steps),
        updated_at = now();
end;
$$;

-- Exigé par Apple dès qu'une app crée des comptes : suppression complète.
-- La suppression en cascade efface profil, amitiés, pas et défis.
create function public.delete_account()
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
  delete from auth.users where id = me;
end;
$$;

revoke execute on function
  public.generate_friend_code(),
  public.handle_new_user(),
  public.is_friend(uuid),
  public.add_friend(text),
  public.remove_friend(uuid),
  public.record_steps(jsonb),
  public.delete_account()
from public, anon, authenticated;

grant execute on function
  public.is_friend(uuid),
  public.add_friend(text),
  public.remove_friend(uuid),
  public.record_steps(jsonb),
  public.delete_account()
to authenticated;

-- ===== 20261022000000_teams.sql =====
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

-- ===== 20261023000000_map.sql =====
-- StepWars : carte (conquête de territoire et amis sur la carte).
--
-- Confidentialité :
-- - Le téléphone n'envoie que des zones (hexagones d'environ 200 m), jamais
--   de coordonnées GPS.
-- - Le territoire des autres équipes n'est visible qu'avec au moins une heure
--   de retard, et seulement par équipe : on ne peut pas suivre quelqu'un.
-- - La position (zone) d'un joueur n'est visible que de ses amis, s'il l'a
--   choisi (désactivé par défaut), et disparaît après 30 minutes.

-- Pas par joueur, zone et heure.
create table public.cell_steps (
  user_id uuid not null references public.profiles (id) on delete cascade,
  cell_q integer not null check (cell_q between -200000 and 200000),
  cell_r integer not null check (cell_r between -200000 and 200000),
  hour timestamptz not null check (hour = date_trunc('hour', hour)),
  steps integer not null check (steps between 0 and 20000),
  primary key (user_id, cell_q, cell_r, hour)
);

create index cell_steps_area_idx on public.cell_steps (hour, cell_q, cell_r);

alter table public.profiles add column share_location boolean not null default false;

create table public.player_locations (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  cell_q integer not null,
  cell_r integer not null,
  updated_at timestamptz not null default now()
);

alter table public.cell_steps enable row level security;
alter table public.player_locations enable row level security;

-- Tout passe par les fonctions ci-dessous : aucun accès direct aux tables.
revoke all on public.cell_steps, public.player_locations from anon, authenticated;
grant select (share_location) on public.profiles to authenticated;

-- Délai avant que les zones parcourues apparaissent aux autres équipes.
create function public.territory_delay() returns interval language sql immutable as $$ select interval '1 hour' $$;
-- Durée de vie d'une position partagée.
create function public.location_ttl() returns interval language sql immutable as $$ select interval '30 minutes' $$;

-- entries : [{"q": 12, "r": -4, "hour": "2026-10-21T18:00:00Z", "steps": 830}, ...]
-- Totaux cumulés par heure : ils ne peuvent qu'augmenter. Heures des dernières 48 h seulement.
create function public.record_cell_steps(entries jsonb)
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

  insert into public.cell_steps (user_id, cell_q, cell_r, hour, steps)
  select me, (e ->> 'q')::int, (e ->> 'r')::int, date_trunc('hour', (e ->> 'hour')::timestamptz), (e ->> 'steps')::int
  from jsonb_array_elements(entries) as e
  where (e ->> 'hour')::timestamptz between now() - interval '48 hours' and now() + interval '1 hour'
  on conflict (user_id, cell_q, cell_r, hour) do update
    set steps = greatest(public.cell_steps.steps, excluded.steps);
end;
$$;

-- Territoire d'une zone de carte pendant une période (la guerre de la semaine).
-- Pour chaque zone : l'équipe en tête d'après les données d'il y a plus d'une
-- heure, et les pas de l'équipe du joueur (à jour : ce sont ses coéquipiers).
-- Les pas d'un membre ne comptent que depuis son arrivée dans l'équipe.
create function public.territory_map(
  from_ts timestamptz,
  to_ts timestamptz,
  min_q integer,
  max_q integer,
  min_r integer,
  max_r integer
)
returns table (
  cell_q integer,
  cell_r integer,
  leader_id uuid,
  leader_name text,
  leader_emoji text,
  leader_steps bigint,
  my_team_steps bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  my_team uuid;
begin
  if me is null then
    raise exception 'not_authenticated';
  end if;
  -- Une carte de quartier, pas de toute la ville : limite la quantité de données exposée.
  if max_q - min_q > 80 or max_r - min_r > 80 then
    raise exception 'area_too_large';
  end if;
  select p.team_id into my_team from public.profiles p where p.id = me;

  return query
  with team_steps as (
    select
      s.cell_q,
      s.cell_r,
      p.team_id,
      sum(s.steps) filter (where s.hour < now() - public.territory_delay()) as delayed,
      sum(s.steps) as current
    from public.cell_steps s
    join public.profiles p on p.id = s.user_id
    where p.team_id is not null
      and s.hour >= from_ts and s.hour < to_ts
      and s.hour >= p.team_joined_on
      and s.cell_q between min_q and max_q
      and s.cell_r between min_r and max_r
    group by s.cell_q, s.cell_r, p.team_id
  ),
  leaders as (
    select distinct on (ts.cell_q, ts.cell_r) ts.cell_q, ts.cell_r, ts.team_id, ts.delayed
    from team_steps ts
    join public.teams t on t.id = ts.team_id
    where ts.delayed > 0 and (not t.hidden or t.id = my_team)
    order by ts.cell_q, ts.cell_r, ts.delayed desc, ts.team_id
  ),
  mine as (
    select ts.cell_q, ts.cell_r, ts.current from team_steps ts where ts.team_id = my_team
  )
  select
    coalesce(l.cell_q, m.cell_q),
    coalesce(l.cell_r, m.cell_r),
    l.team_id,
    t.name,
    t.emoji,
    l.delayed::bigint,
    coalesce(m.current, 0)::bigint
  from leaders l
  full join mine m on m.cell_q = l.cell_q and m.cell_r = l.cell_r
  left join public.teams t on t.id = l.team_id;
end;
$$;

create function public.set_location_sharing(enabled boolean)
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
  update public.profiles set share_location = enabled where id = me;
  if not enabled then
    delete from public.player_locations where user_id = me;
  end if;
end;
$$;

-- Sans effet si le joueur ne partage pas sa position.
create function public.update_my_location(q integer, r integer)
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
  if not (select share_location from public.profiles where id = me) then
    return;
  end if;
  insert into public.player_locations (user_id, cell_q, cell_r, updated_at)
  values (me, q, r, now())
  on conflict (user_id) do update set cell_q = excluded.cell_q, cell_r = excluded.cell_r, updated_at = now();
end;
$$;

-- Amis qui partagent leur position, vue il y a moins de 30 minutes.
-- Les coéquipiers qui ne sont pas des amis n'y figurent pas.
create function public.friends_on_map()
returns table (id uuid, name text, avatar text, cell_q integer, cell_r integer, updated_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.name, p.avatar, l.cell_q, l.cell_r, l.updated_at
  from public.friendships f
  join public.profiles p on p.id = f.friend_id and p.share_location
  join public.player_locations l on l.user_id = p.id
  where f.user_id = auth.uid() and l.updated_at > now() - public.location_ttl();
$$;

revoke execute on function
  public.territory_delay(),
  public.location_ttl(),
  public.record_cell_steps(jsonb),
  public.territory_map(timestamptz, timestamptz, integer, integer, integer, integer),
  public.set_location_sharing(boolean),
  public.update_my_location(integer, integer),
  public.friends_on_map()
from public, anon, authenticated;

grant execute on function
  public.record_cell_steps(jsonb),
  public.territory_map(timestamptz, timestamptz, integer, integer, integer, integer),
  public.set_location_sharing(boolean),
  public.update_my_location(integer, integer),
  public.friends_on_map()
to authenticated;

-- ===== 20261024000000_players_map.sql =====
-- StepWars : la carte montre les joueurs au lieu des territoires.
--
-- Chaque joueur choisit sa visibilité : 'ghost' (personne, par défaut),
-- 'friends' (ses amis) ou 'public' (aussi les joueurs proches).
-- Protections pour la carte publique :
-- - seuls les pseudos apparaissent, et la position d'un inconnu est arrondie
--   à un bloc d'environ 600 m (3 × 3 zones) ;
-- - réciprocité : on ne voit les inconnus que si l'on est soi-même public,
--   et seulement autour de sa propre position (pas dans une autre ville) ;
-- - une position disparaît 30 minutes après sa dernière mise à jour ;
-- - blocage dans les deux sens, et retrait de la carte publique après
--   3 signalements distincts.

-- --- Fin de la conquête de territoire -----------------------------------------
drop function public.territory_map(timestamptz, timestamptz, integer, integer, integer, integer);
drop function public.record_cell_steps(jsonb);
drop function public.territory_delay();
drop table public.cell_steps;

-- --- Visibilité ---------------------------------------------------------------
drop function public.friends_on_map();
drop function public.update_my_location(integer, integer);
drop function public.set_location_sharing(boolean);

alter table public.profiles
  add column map_visibility text not null default 'ghost' check (map_visibility in ('ghost', 'friends', 'public')),
  add column public_map_banned boolean not null default false;
update public.profiles set map_visibility = 'friends' where share_location;
alter table public.profiles drop column share_location;
grant select (map_visibility) on public.profiles to authenticated;

create table public.player_blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create table public.player_reports (
  reported_id uuid not null references public.profiles (id) on delete cascade,
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (reported_id, reporter_id)
);

alter table public.player_blocks enable row level security;
alter table public.player_reports enable row level security;
revoke all on public.player_blocks, public.player_reports from anon, authenticated;

-- Rayon de la carte publique, en zones (≈ 2 km).
create function public.public_map_radius() returns integer language sql immutable as $$ select 10 $$;

create function public.is_blocked_between(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.player_blocks
    where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a)
  );
$$;

create function public.set_map_visibility(mode text)
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
  update public.profiles set map_visibility = mode where id = me;
  if mode = 'ghost' then
    delete from public.player_locations where user_id = me;
  end if;
end;
$$;

-- Sans effet en mode fantôme.
create function public.update_my_location(q integer, r integer)
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
  if (select map_visibility from public.profiles where id = me) = 'ghost' then
    return;
  end if;
  insert into public.player_locations (user_id, cell_q, cell_r, updated_at)
  values (me, q, r, now())
  on conflict (user_id) do update set cell_q = excluded.cell_q, cell_r = excluded.cell_r, updated_at = now();
end;
$$;

-- Jour local de l'app, borné autour du jour du serveur.
create function public.clamp_day(day date)
returns date
language sql
stable
as $$
  select case when day between current_date - 1 and current_date + 1 then day else current_date end;
$$;

-- Joueurs visibles sur ma carte : mes amis (où qu'ils soient) et, si je suis
-- moi-même public, les joueurs publics à moins de `public_map_radius` zones.
create function public.players_on_map(day date)
returns table (
  id uuid,
  name text,
  avatar text,
  team_name text,
  team_emoji text,
  steps_today integer,
  goal_reached boolean,
  is_friend boolean,
  cell_q integer,
  cell_r integer,
  minutes_ago integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  my_mode text;
  my_banned boolean;
  my_q integer;
  my_r integer;
  my_fresh boolean;
  d date := public.clamp_day(day);
begin
  if me is null then
    raise exception 'not_authenticated';
  end if;
  select p.map_visibility, p.public_map_banned into my_mode, my_banned from public.profiles p where p.id = me;
  select l.cell_q, l.cell_r, l.updated_at > now() - public.location_ttl()
    into my_q, my_r, my_fresh
    from public.player_locations l where l.user_id = me;

  return query
  select
    o.id,
    o.name,
    o.avatar,
    t.name,
    t.emoji,
    coalesce(s.steps, 0),
    coalesce(s.steps, 0) >= o.daily_goal,
    f.friend,
    -- Inconnus : centre d'un bloc de 3 × 3 zones (≈ 600 m).
    case when f.friend then l.cell_q else floor(l.cell_q / 3.0)::int * 3 + 1 end,
    case when f.friend then l.cell_r else floor(l.cell_r / 3.0)::int * 3 + 1 end,
    floor(extract(epoch from now() - l.updated_at) / 60)::int
  from public.player_locations l
  join public.profiles o on o.id = l.user_id
  cross join lateral (select public.is_friend(o.id) as friend) f
  left join public.teams t on t.id = o.team_id
  left join public.daily_steps s on s.user_id = o.id and s.day = d
  where o.id <> me
    and l.updated_at > now() - public.location_ttl()
    and not public.is_blocked_between(me, o.id)
    and (
      (f.friend and o.map_visibility in ('friends', 'public'))
      or (
        o.map_visibility = 'public' and not o.public_map_banned
        and my_mode = 'public' and not my_banned and my_fresh
        and (abs(l.cell_q - my_q) + abs(l.cell_r - my_r) + abs(l.cell_q + l.cell_r - my_q - my_r)) / 2
            <= public.public_map_radius()
      )
    );
end;
$$;

-- Fiche d'un joueur : moi, un ami, un coéquipier, ou un joueur public quand je
-- suis public. Seulement des totaux.
create function public.player_card(player uuid, day date)
returns table (
  id uuid,
  name text,
  avatar text,
  team_name text,
  team_emoji text,
  is_friend boolean,
  steps_today integer,
  steps_week integer,
  best_day integer,
  streak integer,
  week_rank integer,
  week_players integer,
  duels_won integer,
  duels_lost integer,
  duels_tied integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  d date := public.clamp_day(day);
  target public.profiles%rowtype;
  allowed boolean;
  s integer := 0;
  cursor_day date;
  goal integer;
  week_total integer;
begin
  if me is null then
    raise exception 'not_authenticated';
  end if;
  select * into target from public.profiles p where p.id = player;
  if not found then
    raise exception 'player_not_found';
  end if;
  allowed := player = me
    or public.is_friend(player)
    or public.is_teammate(player)
    or (
      target.map_visibility = 'public' and not target.public_map_banned
      and (select p.map_visibility = 'public' and not p.public_map_banned from public.profiles p where p.id = me)
    );
  if not allowed or public.is_blocked_between(me, player) then
    raise exception 'player_not_visible';
  end if;

  -- Série : jours consécutifs avec l'objectif atteint (aujourd'hui compte s'il est atteint).
  goal := target.daily_goal;
  cursor_day := d;
  if coalesce((select ds.steps from public.daily_steps ds where ds.user_id = player and ds.day = d), 0) < goal then
    cursor_day := d - 1;
  end if;
  while s < 366 and coalesce((select ds.steps from public.daily_steps ds where ds.user_id = player and ds.day = cursor_day), 0) >= goal loop
    s := s + 1;
    cursor_day := cursor_day - 1;
  end loop;

  select coalesce(sum(ds.steps), 0) into week_total
  from public.daily_steps ds where ds.user_id = player and ds.day between d - 6 and d;

  return query
  with weekly as (
    select ds.user_id, sum(ds.steps) as total
    from public.daily_steps ds
    where ds.day between d - 6 and d
    group by ds.user_id
  ),
  duels as (
    select
      (select coalesce(sum(x.steps), 0) from public.daily_steps x
        where x.user_id = player and x.day between c.start_day and c.start_day + c.days - 1) as mine,
      (select coalesce(sum(x.steps), 0) from public.daily_steps x
        where x.user_id = case when c.challenger_id = player then c.opponent_id else c.challenger_id end
          and x.day between c.start_day and c.start_day + c.days - 1) as theirs
    from public.challenges c
    where player in (c.challenger_id, c.opponent_id) and c.start_day + c.days - 1 < d
  )
  select
    target.id,
    target.name,
    target.avatar,
    t.name,
    t.emoji,
    public.is_friend(player),
    coalesce((select ds.steps from public.daily_steps ds where ds.user_id = player and ds.day = d), 0),
    week_total,
    coalesce((select max(ds.steps) from public.daily_steps ds where ds.user_id = player), 0),
    s,
    (select count(*)::int + 1 from weekly w where w.total > week_total),
    -- Le joueur compte toujours, même sans pas cette semaine.
    (select count(*)::int from weekly w where w.user_id <> player) + 1,
    (select count(*)::int from duels where mine > theirs),
    (select count(*)::int from duels where mine < theirs),
    (select count(*)::int from duels where mine = theirs)
  from (select 1) one
  left join public.teams t on t.id = target.team_id;
end;
$$;

create function public.block_player(player uuid)
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
  if player = me then
    raise exception 'cannot_block_self';
  end if;
  insert into public.player_blocks (blocker_id, blocked_id) values (me, player) on conflict do nothing;
  -- Bloquer met fin à l'amitié et aux duels communs.
  perform public.remove_friend(player);
end;
$$;

create function public.report_player(player uuid)
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
  if player = me then
    raise exception 'cannot_report_self';
  end if;
  insert into public.player_reports (reported_id, reporter_id) values (player, me) on conflict do nothing;
  update public.profiles set public_map_banned = true
  where id = player and (select count(*) from public.player_reports where reported_id = player) >= public.report_threshold();
end;
$$;

revoke execute on function
  public.public_map_radius(),
  public.is_blocked_between(uuid, uuid),
  public.set_map_visibility(text),
  public.update_my_location(integer, integer),
  public.clamp_day(date),
  public.players_on_map(date),
  public.player_card(uuid, date),
  public.block_player(uuid),
  public.report_player(uuid)
from public, anon, authenticated;

grant execute on function
  public.set_map_visibility(text),
  public.update_my_location(integer, integer),
  public.players_on_map(date),
  public.player_card(uuid, date),
  public.block_player(uuid),
  public.report_player(uuid)
to authenticated;

-- ===== 20261025000000_anticheat.sql =====
-- Anti-triche : le serveur ne crédite que des pas humainement possibles.
--
-- Le téléphone envoie le total du jour. Au lieu de refuser un chiffre suspect,
-- on crédite au plus :
--   - 100 000 pas par jour (au-delà d'un marathon) ;
--   - et, pour un jour déjà enregistré, 200 pas par minute écoulée depuis le
--     dernier envoi (au-dessus d'une cadence de course), plus 2 000 de marge.
-- Un vrai marcheur n'est jamais freiné : s'il était hors ligne, le temps
-- écoulé couvre ses pas. Un faux envoi de 50 000 pas d'un coup ne passe pas.

create function public.max_daily_steps() returns integer language sql immutable as $$ select 100000 $$;
create function public.max_steps_per_minute() returns integer language sql immutable as $$ select 200 $$;
create function public.steps_burst() returns integer language sql immutable as $$ select 2000 $$;

-- Retourne les pas réellement crédités, pour que l'app affiche le bon chiffre.
drop function public.record_steps(jsonb);
create function public.record_steps(entries jsonb)
returns table (day date, steps integer)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'not_authenticated';
  end if;

  return query
  insert into public.daily_steps as d (user_id, day, steps)
  select me, x.day, least(greatest(x.steps, 0), public.max_daily_steps())
  from (
    -- Un même jour envoyé deux fois dans un lot : on garde le plus grand.
    select (e ->> 'day')::date as day, max((e ->> 'steps')::bigint) as steps
    from jsonb_array_elements(entries) as e
    group by 1
  ) as x
  where x.day between current_date - 8 and current_date + 1
  on conflict (user_id, day) do update
    set steps = greatest(
          d.steps,
          least(
            excluded.steps,
            d.steps + public.steps_burst()
              + (public.max_steps_per_minute() * extract(epoch from (now() - d.updated_at)) / 60)::int
          )
        ),
        updated_at = case when excluded.steps > d.steps then now() else d.updated_at end
  returning d.day, d.steps;
end;
$$;

revoke execute on function
  public.max_daily_steps(), public.max_steps_per_minute(), public.steps_burst(), public.record_steps(jsonb)
from public, anon;
revoke execute on function public.max_daily_steps(), public.max_steps_per_minute(), public.steps_burst() from authenticated;
grant execute on function public.record_steps(jsonb) to authenticated;

-- ===== 20261026000000_leagues.sql =====
-- Ligues hebdomadaires par niveau.
--
-- Chaque semaine (lundi-dimanche), un joueur est placé dans une ligue d'au
-- plus 30 joueurs de son niveau (1 Sentier, 2 Chemin, 3 Route, 4 Col,
-- 5 Sommet). À la fin de la semaine, les premiers montent d'un niveau et les
-- derniers descendent (jusqu'à 5 de chaque, aucun sous 4 joueurs).
-- Les règles sont les mêmes que dans src/lib/league.ts : garder les deux alignés.
--
-- Confidentialité : une ligue ne montre que le pseudo et le total de pas de la
-- semaine de chaque joueur. Pas de position, pas de fiche joueur (elle reste
-- réservée aux amis, coéquipiers et joueurs publics). Les joueurs bloqués
-- n'apparaissent pas, même s'ils comptent dans le classement.

create table public.league_groups (
  id uuid primary key default gen_random_uuid(),
  week_start date not null check (extract(isodow from week_start) = 1),
  division smallint not null check (division between 1 and 5),
  created_at timestamptz not null default now()
);

create index league_groups_week_idx on public.league_groups (week_start, division);

create table public.league_members (
  user_id uuid not null references public.profiles (id) on delete cascade,
  week_start date not null,
  group_id uuid not null references public.league_groups (id) on delete cascade,
  -- Niveau du joueur cette semaine (celui qui monte ou descend), qui peut
  -- différer de celui de la ligue tant qu'il y a peu de joueurs.
  division smallint not null check (division between 1 and 5),
  joined_at timestamptz not null default now(),
  primary key (user_id, week_start)
);

create index league_members_group_idx on public.league_members (group_id);

alter table public.league_groups enable row level security;
alter table public.league_members enable row level security;
revoke all on public.league_groups, public.league_members from anon, authenticated;

create function public.league_size() returns integer language sql immutable as $$ select 30 $$;

create function public.league_movement(members integer)
returns integer
language sql
immutable
as $$
  select case when members < 4 then 0 else least(5, members / 4) end;
$$;

create function public.division_for_average(average numeric)
returns smallint
language sql
immutable
as $$
  select case
    when average < 5000 then 1
    when average < 7500 then 2
    when average < 10000 then 3
    when average < 13000 then 4
    else 5
  end::smallint;
$$;

create function public.league_next_division(division integer, league_position integer, members integer)
returns smallint
language sql
immutable
as $$
  select case
    when league_position <= public.league_movement(members) and division < 5 then division + 1
    when league_position > members - public.league_movement(members) and division > 1 then division - 1
    else division
  end::smallint;
$$;

-- Classement d'une ligue : total de la semaine, à égalité le premier arrivé passe devant.
create function public.league_ranking(league uuid)
returns table (user_id uuid, steps bigint, league_position integer, members integer)
language sql
stable
security definer
set search_path = ''
as $$
  select
    m.user_id,
    coalesce(sum(s.steps), 0)::bigint,
    (row_number() over (order by coalesce(sum(s.steps), 0) desc, m.joined_at, m.user_id))::integer,
    (count(*) over ())::integer
  from public.league_members m
  join public.league_groups g on g.id = m.group_id
  left join public.daily_steps s
    on s.user_id = m.user_id and s.day between g.week_start and g.week_start + 6
  where m.group_id = league
  group by m.user_id, m.joined_at;
$$;

-- Ma ligue de la semaine du jour `day` (jour local de l'app). Me place dans une
-- ligue si ce n'est pas encore fait.
create function public.my_league(day date)
returns table (
  week_start date,
  division smallint,
  user_id uuid,
  name text,
  steps bigint,
  league_position integer,
  members integer,
  is_me boolean
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  me uuid := auth.uid();
  d date := public.clamp_day(day);
  ws date;
  my_div smallint;
  my_group uuid;
  prev record;
  prev_rank record;
begin
  if me is null then
    raise exception 'not_authenticated';
  end if;
  ws := d - (extract(isodow from d)::int - 1);

  select m.group_id, m.division into my_group, my_div
  from public.league_members m where m.user_id = me and m.week_start = ws;

  if my_group is null then
    -- Niveau de la semaine : résultat de la semaine dernière, sinon dernier
    -- niveau connu, sinon moyenne des 7 derniers jours.
    select m.group_id, m.division into prev
    from public.league_members m where m.user_id = me and m.week_start = ws - 7;
    if found then
      select r.league_position, r.members into prev_rank
      from public.league_ranking(prev.group_id) r where r.user_id = me;
      my_div := public.league_next_division(prev.division, prev_rank.league_position, prev_rank.members);
    else
      select m.division into my_div
      from public.league_members m where m.user_id = me and m.week_start < ws
      order by m.week_start desc limit 1;
      if my_div is null then
        my_div := public.division_for_average(
          coalesce((select sum(s.steps) from public.daily_steps s where s.user_id = me and s.day between d - 7 and d - 1), 0) / 7.0
        );
      end if;
    end if;

    -- Un seul placement à la fois par semaine : pas de ligue qui dépasse 30.
    perform pg_advisory_xact_lock(hashtextextended('league:' || ws::text, 0));

    -- 1. Une ligue de mon niveau avec de la place.
    select g.id into my_group
    from public.league_groups g
    where g.week_start = ws and g.division = my_div
      and (select count(*) from public.league_members x where x.group_id = g.id) < public.league_size()
    order by g.created_at
    limit 1;

    -- 2. Peu de joueurs : s'il n'existe encore aucune ligue de mon niveau, la
    --    plus proche avec de la place, pour ne jamais jouer seul.
    if my_group is null and not exists (
      select 1 from public.league_groups g where g.week_start = ws and g.division = my_div
    ) then
      select g.id into my_group
      from public.league_groups g
      where g.week_start = ws
        and (select count(*) from public.league_members x where x.group_id = g.id) < public.league_size()
      order by abs(g.division - my_div), g.created_at
      limit 1;
    end if;

    -- 3. Sinon, une nouvelle ligue de mon niveau.
    if my_group is null then
      insert into public.league_groups (week_start, division) values (ws, my_div) returning id into my_group;
    end if;

    insert into public.league_members (user_id, week_start, group_id, division) values (me, ws, my_group, my_div);
  end if;

  return query
  select ws, my_div, r.user_id, p.name, r.steps, r.league_position, r.members, r.user_id = me
  from public.league_ranking(my_group) r
  join public.profiles p on p.id = r.user_id
  where r.user_id = me or not public.is_blocked_between(me, r.user_id)
  order by r.league_position;
end;
$$;

revoke execute on function
  public.league_size(),
  public.league_movement(integer),
  public.division_for_average(numeric),
  public.league_next_division(integer, integer, integer),
  public.league_ranking(uuid),
  public.my_league(date)
from public, anon, authenticated;

grant execute on function public.my_league(date) to authenticated;

-- Le public visé marche pour atteindre 10 000 pas : c'est l'objectif par défaut.
alter table public.profiles alter column daily_goal set default 10000;
