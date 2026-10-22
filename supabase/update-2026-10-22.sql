-- Mise à jour du 22 octobre 2026 : ligues, duels à accepter, bilan de la semaine.
-- Pour un projet qui a déjà reçu supabase/setup.sql avant ces migrations : à coller une seule fois.

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

-- ===== 20261027000000_duels.sql =====
-- Duels : l'adversaire accepte (ou refuse), avec un gage facultatif.
--
-- Un duel lancé est « en attente » ; il ne compte qu'une fois accepté par
-- l'adversaire. S'il est accepté un autre jour, il commence ce jour-là.
-- Refuser ou annuler, c'est supprimer le duel (règle de suppression existante).

alter table public.challenges
  add column status text not null default 'accepted' check (status in ('pending', 'accepted')),
  add column stake text check (char_length(stake) between 1 and 60);
-- Les duels existants restent acceptés ; les nouveaux attendent l'adversaire.
alter table public.challenges alter column status set default 'pending';

-- Le lanceur choisit le gage ; le statut ne change que par accept_challenge.
grant insert (stake) on public.challenges to authenticated;

create function public.accept_challenge(challenge uuid, day date)
returns table (id uuid, start_day date)
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
  update public.challenges c
  set status = 'accepted', start_day = greatest(c.start_day, public.clamp_day(day))
  where c.id = challenge and c.opponent_id = me and c.status = 'pending'
  returning c.id, c.start_day;
  if not found then
    raise exception 'challenge_not_found';
  end if;
end;
$$;

-- Fiche joueur : seuls les duels acceptés comptent dans le bilan.
create or replace function public.player_card(player uuid, day date)
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
    where player in (c.challenger_id, c.opponent_id) and c.status = 'accepted' and c.start_day + c.days - 1 < d
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

revoke execute on function public.accept_challenge(uuid, date) from public, anon;
grant execute on function public.accept_challenge(uuid, date) to authenticated;

-- ===== 20261028000000_league_results.sql =====
-- Bilan d'une semaine de ligue : ma place finale et mon niveau de la semaine
-- suivante. Affiché le lundi (« Tu montes en Route ! »).

create function public.my_league_result(week date)
returns table (
  week_start date,
  division smallint,
  next_division smallint,
  league_position integer,
  members integer,
  steps bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  ws date := week - (extract(isodow from week)::int - 1);
  membership record;
begin
  if me is null then
    raise exception 'not_authenticated';
  end if;
  select m.group_id, m.division into membership
  from public.league_members m where m.user_id = me and m.week_start = ws;
  if not found then
    return;
  end if;
  return query
  select ws, membership.division,
    public.league_next_division(membership.division, r.league_position, r.members),
    r.league_position, r.members, r.steps
  from public.league_ranking(membership.group_id) r
  where r.user_id = me;
end;
$$;

revoke execute on function public.my_league_result(date) from public, anon;
grant execute on function public.my_league_result(date) to authenticated;
