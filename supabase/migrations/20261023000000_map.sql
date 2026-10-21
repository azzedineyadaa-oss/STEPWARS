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
