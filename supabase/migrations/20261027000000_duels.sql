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
