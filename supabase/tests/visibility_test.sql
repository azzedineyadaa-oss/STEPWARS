-- Carte des joueurs : visibilité choisie, réciprocité, arrondi, blocage, signalements, fiches.
\set ON_ERROR_STOP on
\ir helpers.sql

-- F1 et F2 amis. P1, P2 inconnus proches. P3 inconnu loin. Tous dans la zone (100, 100) sauf P3.
insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000f1'),
  ('00000000-0000-0000-0000-0000000000f2'),
  ('00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000a2'),
  ('00000000-0000-0000-0000-0000000000a3'),
  ('00000000-0000-0000-0000-0000000000a4'),
  ('00000000-0000-0000-0000-0000000000a5');
update public.profiles set name = 'F1' where id = '00000000-0000-0000-0000-0000000000f1';
update public.profiles set name = 'F2' where id = '00000000-0000-0000-0000-0000000000f2';
update public.profiles set name = 'P1', daily_goal = 5000 where id = '00000000-0000-0000-0000-0000000000a1';
update public.profiles set name = 'P2' where id = '00000000-0000-0000-0000-0000000000a2';
update public.profiles set name = 'P3' where id = '00000000-0000-0000-0000-0000000000a3';

select set_config('test.f1_code', (select friend_code from public.profiles where id = '00000000-0000-0000-0000-0000000000f1'), false);
select pg_temp.act_as('00000000-0000-0000-0000-0000000000f2');
select public.add_friend(current_setting('test.f1_code'));
reset role;

create function pg_temp.place(who uuid, mode text, q int, r int) returns void language plpgsql as $$
begin
  perform pg_temp.act_as(who);
  perform public.set_map_visibility(mode);
  perform public.update_my_location(q, r);
  reset role;
end $$;

select pg_temp.place('00000000-0000-0000-0000-0000000000f1', 'ghost', 100, 100);
select pg_temp.check((select map_visibility = 'ghost' from public.profiles where id = '00000000-0000-0000-0000-0000000000a5'), 'fantôme par défaut');
select pg_temp.check((select count(*) = 0 from public.player_locations), 'en mode fantôme, aucune position stockée');

select pg_temp.place('00000000-0000-0000-0000-0000000000f1', 'friends', 100, 100);
select pg_temp.place('00000000-0000-0000-0000-0000000000a1', 'public', 101, 100);
select pg_temp.place('00000000-0000-0000-0000-0000000000a2', 'public', 104, 98);
select pg_temp.place('00000000-0000-0000-0000-0000000000a3', 'public', 400, 100);
select pg_temp.place('00000000-0000-0000-0000-0000000000a4', 'friends', 100, 101);

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select public.record_steps(jsonb_build_array(jsonb_build_object('day', current_date, 'steps', 6200)));
reset role;

-- F2 (ami de F1) en mode amis : voit F1 (position exacte) mais aucun inconnu (réciprocité).
select pg_temp.place('00000000-0000-0000-0000-0000000000f2', 'friends', 100, 100);
select pg_temp.act_as('00000000-0000-0000-0000-0000000000f2');
select pg_temp.check(
  (select array_agg(name order by name) = array['F1'] from public.players_on_map(current_date)),
  'mode amis : on voit ses amis, pas les inconnus'
);
select pg_temp.check(
  (select cell_q = 100 and cell_r = 100 and is_friend from public.players_on_map(current_date) where name = 'F1'),
  'position exacte (zone) pour un ami'
);
reset role;

-- F2 passe en public : voit les inconnus publics proches, arrondis ; pas P3 (loin), pas A4 (mode amis).
select pg_temp.place('00000000-0000-0000-0000-0000000000f2', 'public', 100, 100);
select pg_temp.act_as('00000000-0000-0000-0000-0000000000f2');
select pg_temp.check(
  (select array_agg(name order by name) = array['F1', 'P1', 'P2'] from public.players_on_map(current_date)),
  'public : amis + inconnus publics proches, pas les lointains ni les « amis seulement »'
);
select pg_temp.check(
  (select cell_q = 100 and cell_r = 100 and steps_today = 6200 and goal_reached and not is_friend
   from public.players_on_map(current_date) where name = 'P1'),
  'inconnu : position arrondie au bloc de 3 × 3 zones, pas du jour et objectif'
);
select pg_temp.check(
  (select cell_q = 103 and cell_r = 97 from public.players_on_map(current_date) where name = 'P2'),
  'arrondi correct pour un autre bloc'
);
reset role;

-- Le joueur public qui ne partage pas de position récente ne voit pas les inconnus.
update public.player_locations set updated_at = now() - interval '40 minutes' where user_id = '00000000-0000-0000-0000-0000000000f2';
select pg_temp.act_as('00000000-0000-0000-0000-0000000000f2');
select pg_temp.check(
  (select array_agg(name order by name) = array['F1'] from public.players_on_map(current_date)),
  'sans position récente, pas d’inconnus'
);
reset role;
select pg_temp.place('00000000-0000-0000-0000-0000000000f2', 'public', 100, 100);

-- Position périmée de P2 : disparaît.
update public.player_locations set updated_at = now() - interval '31 minutes' where user_id = '00000000-0000-0000-0000-0000000000a2';
select pg_temp.act_as('00000000-0000-0000-0000-0000000000f2');
select pg_temp.check((select count(*) = 0 from public.players_on_map(current_date) where name = 'P2'), 'position de plus de 30 min masquée');
reset role;

-- Fiche joueur.
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select public.record_steps(jsonb_build_array(
  jsonb_build_object('day', current_date - 1, 'steps', 5100),
  jsonb_build_object('day', current_date - 2, 'steps', 5000),
  jsonb_build_object('day', current_date - 3, 'steps', 1000)
));
reset role;
-- Rang attendu : 1 + nombre de joueurs avec plus de pas sur les 7 derniers jours (calculé sans RLS).
select set_config('test.rank', (1 + (select count(*) from (
  select user_id from public.daily_steps where day between current_date - 6 and current_date
  group by user_id having sum(steps) > 17300) better))::text, false);
select set_config('test.players', (select count(distinct user_id) from public.daily_steps
  where day between current_date - 6 and current_date and user_id <> '00000000-0000-0000-0000-0000000000a1')::text, false);
select pg_temp.act_as('00000000-0000-0000-0000-0000000000f2');
select pg_temp.check(
  (select name = 'P1' and steps_today = 6200 and steps_week = 17300 and best_day = 6200 and streak = 3
     and not is_friend
     and week_rank = current_setting('test.rank')::int
     and week_players = current_setting('test.players')::int + 1
   from public.player_card('00000000-0000-0000-0000-0000000000a1', current_date)),
  'fiche : pas, semaine, record, série, rang'
);
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000f2');
select pg_temp.check(
  (select steps_week = 0 and week_rank <= week_players from public.player_card('00000000-0000-0000-0000-0000000000a2', current_date)),
  'fiche d’un joueur sans pas : rang jamais supérieur au nombre de joueurs'
);
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000f1');
select pg_temp.expect_error($$select * from public.player_card('00000000-0000-0000-0000-0000000000a1', current_date)$$, 'player_not_visible');
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a5');
select pg_temp.expect_error($$select * from public.player_card('00000000-0000-0000-0000-0000000000f1', current_date)$$, 'player_not_visible');
reset role;

-- Bilan de duels de F1 : 1 victoire (contre F2), dans un duel terminé.
select pg_temp.act_as('00000000-0000-0000-0000-0000000000f1');
select public.record_steps(jsonb_build_array(jsonb_build_object('day', current_date - 2, 'steps', 9000)));
reset role;
insert into public.challenges (challenger_id, opponent_id, start_day, days, status)
values ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f2', current_date - 2, 1, 'accepted');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000f2');
select pg_temp.check(
  (select duels_won = 1 and duels_lost = 0 and is_friend from public.player_card('00000000-0000-0000-0000-0000000000f1', current_date)),
  'fiche d’un ami : bilan de duels'
);
reset role;

-- Blocage : dans les deux sens, et fin de l'amitié.
select pg_temp.act_as('00000000-0000-0000-0000-0000000000f2');
select public.block_player('00000000-0000-0000-0000-0000000000a1');
select pg_temp.check((select count(*) = 0 from public.players_on_map(current_date) where name = 'P1'), 'un joueur bloqué disparaît de ma carte');
select pg_temp.expect_error($$select * from public.player_card('00000000-0000-0000-0000-0000000000a1', current_date)$$, 'player_not_visible');
select pg_temp.expect_error($$select public.block_player(auth.uid())$$, 'cannot_block_self');
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select pg_temp.check((select count(*) = 0 from public.players_on_map(current_date) where name = 'F2'), 'et je disparais de la sienne');
reset role;

-- Signalements : 3 joueurs distincts retirent P2 de la carte publique.
select pg_temp.place('00000000-0000-0000-0000-0000000000a2', 'public', 104, 98);
select pg_temp.act_as('00000000-0000-0000-0000-0000000000f1');
select public.report_player('00000000-0000-0000-0000-0000000000a2');
select public.report_player('00000000-0000-0000-0000-0000000000a2');
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a3');
select public.report_player('00000000-0000-0000-0000-0000000000a2');
reset role;
select pg_temp.check((select not public_map_banned from public.profiles where name = 'P2'), 'un même joueur ne compte qu’une fois');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a4');
select public.report_player('00000000-0000-0000-0000-0000000000a2');
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000f2');
select pg_temp.check((select count(*) = 0 from public.players_on_map(current_date) where name = 'P2'), 'retiré de la carte publique après 3 signalements');
reset role;

-- Mode fantôme : la position est effacée.
select pg_temp.place('00000000-0000-0000-0000-0000000000f1', 'ghost', 100, 100);
select pg_temp.check((select count(*) = 0 from public.player_locations where user_id = '00000000-0000-0000-0000-0000000000f1'), 'retour en fantôme : position effacée');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000f2');
select pg_temp.expect_error($$select * from public.player_locations$$, 'permission denied');
select pg_temp.expect_error($$select * from public.player_blocks$$, 'permission denied');
reset role;
select pg_temp.act_as(null);
select pg_temp.expect_error($$select * from public.players_on_map(current_date)$$, 'permission denied');
select pg_temp.expect_error($$select * from public.player_card('00000000-0000-0000-0000-0000000000f1', current_date)$$, 'permission denied');
reset role;
