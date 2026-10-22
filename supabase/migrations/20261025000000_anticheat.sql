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
