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
