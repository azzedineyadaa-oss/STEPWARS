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
