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
