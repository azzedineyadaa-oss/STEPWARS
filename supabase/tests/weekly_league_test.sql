-- Ligues hebdomadaires : placement par niveau, classement, montées et descentes.
\set ON_ERROR_STOP on

\ir helpers.sql

create function pg_temp.uid(n integer) returns uuid language sql immutable as $$
  select ('00000000-0000-0000-0000-' || lpad(to_hex(4096 + n), 12, '0'))::uuid
$$;
create function pg_temp.week() returns date language sql stable as $$
  select current_date - (extract(isodow from current_date)::int - 1)
$$;

insert into auth.users (id) select pg_temp.uid(n) from generate_series(1, 40) n;
update public.profiles set name = 'L' || (('x' || right(id::text, 3))::bit(12)::int - 4096)
where id in (select pg_temp.uid(n) from generate_series(1, 40) n);

-- L1 marche beaucoup (≈ 12 000 par jour la semaine passée) : niveau Col (4).
insert into public.daily_steps (user_id, day, steps)
select pg_temp.uid(1), current_date - n, 12000 from generate_series(1, 7) n;

select pg_temp.act_as(pg_temp.uid(1));
select pg_temp.check((select division = 4 and members = 1 and is_me from public.my_league(current_date)), 'niveau de départ d’après la moyenne : Col');
select pg_temp.check((select count(*) = 1 from public.my_league(current_date)), 'rappeler my_league ne replace pas le joueur');
select pg_temp.expect_error($$select * from public.league_members$$, 'permission denied');
select pg_temp.expect_error($$select public.league_ranking(gen_random_uuid())$$, 'permission denied');

-- L2 sans historique : niveau Sentier (1), mais aucune ligue Sentier n'existe
-- encore : il rejoint celle de L1 plutôt que de jouer seul.
select pg_temp.act_as(pg_temp.uid(2));
select pg_temp.check(
  (select division = 1 and members = 2 from public.my_league(current_date) where is_me),
  'peu de joueurs : on rejoint la ligue la plus proche'
);

-- Ses pas de la semaine comptent, pas ceux d'avant lundi.
reset role;
insert into public.daily_steps (user_id, day, steps) values
  (pg_temp.uid(2), pg_temp.week(), 90000),
  (pg_temp.uid(2), pg_temp.week() - 1, 99000);
select pg_temp.act_as(pg_temp.uid(2));
select pg_temp.check(
  (select steps = 90000 and league_position = 1 from public.my_league(current_date) where is_me),
  'classement sur les pas de la semaine en cours'
);

-- 3 à 32 : niveau Sentier. Une ligue Sentier existe (celle de L2 est niveau Col,
-- donc une nouvelle est créée), puis elle se remplit jusqu'à 30.
do $$
begin
  for n in 3..32 loop
    perform pg_temp.act_as(pg_temp.uid(n));
    perform * from public.my_league(current_date);
  end loop;
end $$;
reset role;
select pg_temp.check(
  (select max(c) <= 30 from (select count(*) as c from public.league_members where week_start = pg_temp.week() group by group_id) x),
  'jamais plus de 30 joueurs par ligue'
);
select pg_temp.check(
  (select count(distinct group_id) = 1 from public.league_members
   where week_start = pg_temp.week() and user_id in (select pg_temp.uid(n) from generate_series(3, 30) n)),
  'les joueurs de même niveau sont regroupés'
);

-- Blocage : L4 ne voit plus L3, qui reste compté dans le classement.
insert into public.player_blocks (blocker_id, blocked_id) values (pg_temp.uid(4), pg_temp.uid(3));
select pg_temp.act_as(pg_temp.uid(4));
select pg_temp.check(
  (select count(*) filter (where user_id = pg_temp.uid(3)) = 0 and max(members) = count(*) + 1 from public.my_league(current_date)),
  'un joueur bloqué n’apparaît pas mais compte toujours'
);

-- Semaine suivante : montées et descentes selon le classement de la semaine passée.
-- Ligue niveau 3 de 8 joueurs la semaine dernière (33 à 40) : 2 montent, 2 descendent.
reset role;
insert into public.league_groups (id, week_start, division)
values ('00000000-0000-0000-0000-00000000aaaa', pg_temp.week() - 7, 3);
insert into public.league_members (user_id, week_start, group_id, division, joined_at)
select pg_temp.uid(n), pg_temp.week() - 7, '00000000-0000-0000-0000-00000000aaaa', 3, now() - (n || ' minutes')::interval
from generate_series(33, 40) n;
-- L33 fait le plus de pas, L40 le moins.
insert into public.daily_steps (user_id, day, steps)
select pg_temp.uid(n), pg_temp.week() - 7, (41 - n) * 1000 from generate_series(33, 40) n;

select pg_temp.act_as(pg_temp.uid(33));
select pg_temp.check((select division = 4 from public.my_league(current_date) where is_me), '1er la semaine passée : monte');
select pg_temp.act_as(pg_temp.uid(36));
select pg_temp.check((select division = 3 from public.my_league(current_date) where is_me), 'milieu de classement : reste');
select pg_temp.act_as(pg_temp.uid(40));
select pg_temp.check((select division = 2 from public.my_league(current_date) where is_me), 'dernier : descend');
reset role;

-- Une semaine sautée : on garde son dernier niveau.
select pg_temp.check(public.league_next_division(5, 1, 30) = 5, 'pas de montée au-delà du Sommet');
select pg_temp.check(public.league_next_division(1, 30, 30) = 1, 'pas de descente sous le Sentier');
select pg_temp.check(public.league_next_division(2, 1, 3) = 2, 'moins de 4 joueurs : personne ne bouge');

select pg_temp.act_as(null);
select pg_temp.expect_error($$select * from public.my_league(current_date)$$, 'permission denied');
reset role;
