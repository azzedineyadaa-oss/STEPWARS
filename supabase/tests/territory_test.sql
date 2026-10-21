-- Carte : territoire avec délai, par équipe, et positions visibles des seuls amis volontaires.
\set ON_ERROR_STOP on
\ir helpers.sql

insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000e1'),
  ('00000000-0000-0000-0000-0000000000e2'),
  ('00000000-0000-0000-0000-0000000000e3'),
  ('00000000-0000-0000-0000-0000000000e4');

-- E1 et E2 : équipe « Rouge ». E3 : équipe « Bleue ». E4 : sans équipe, ami de E1.
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');
select public.create_team('Rouge', '🔴');
reset role;
select set_config('test.rouge', (select code from public.teams where name = 'Rouge'), false);
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e2');
select public.join_team(current_setting('test.rouge'));
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e3');
select public.create_team('Bleue', '🔵');
reset role;
-- Arrivées « hier », pour que les heures passées comptent.
update public.profiles set team_joined_on = current_date - 1
where id in ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000e3');

-- Pas dans la zone (10, 20) : Rouge 300 + 200 il y a 3 h, Bleue 450 il y a 3 h puis 400 maintenant.
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');
select public.record_cell_steps(jsonb_build_array(
  jsonb_build_object('q', 10, 'r', 20, 'hour', date_trunc('hour', now() - interval '3 hours'), 'steps', 300),
  jsonb_build_object('q', 11, 'r', 20, 'hour', date_trunc('hour', now() - interval '3 hours'), 'steps', 50),
  jsonb_build_object('q', 10, 'r', 20, 'hour', now() - interval '5 days', 'steps', 9999)
));
select public.record_cell_steps(jsonb_build_array(
  jsonb_build_object('q', 10, 'r', 20, 'hour', date_trunc('hour', now() - interval '3 hours'), 'steps', 100)
));
reset role;
select pg_temp.check((select steps = 300 from public.cell_steps where user_id = '00000000-0000-0000-0000-0000000000e1' and cell_q = 10), 'un total par heure ne peut pas baisser');
select pg_temp.check((select count(*) = 2 from public.cell_steps where user_id = '00000000-0000-0000-0000-0000000000e1'), 'les heures de plus de 48 h sont ignorées');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000e2');
select public.record_cell_steps(jsonb_build_array(
  jsonb_build_object('q', 10, 'r', 20, 'hour', date_trunc('hour', now() - interval '3 hours'), 'steps', 200)
));
select pg_temp.expect_error($$select * from public.cell_steps$$, 'permission denied');
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-0000000000e3');
select public.record_cell_steps(jsonb_build_array(
  jsonb_build_object('q', 10, 'r', 20, 'hour', date_trunc('hour', now() - interval '3 hours'), 'steps', 450),
  jsonb_build_object('q', 10, 'r', 20, 'hour', date_trunc('hour', now()), 'steps', 400)
));
-- Vu par Bleue : Rouge mène avec 500 (délai), Bleue a 850 à jour, donc la prend côté Bleue.
select pg_temp.check(
  (select leader_name = 'Rouge' and leader_steps = 500 and my_team_steps = 850
   from public.territory_map(now() - interval '1 day', now() + interval '1 hour', 0, 30, 0, 30) where cell_q = 10 and cell_r = 20),
  'territoire : équipe en tête avec délai, et pas à jour de sa propre équipe'
);
select pg_temp.expect_error($$select * from public.territory_map(now() - interval '1 day', now(), 0, 500, 0, 30)$$, 'area_too_large');
reset role;

-- Vu par Rouge : les 400 pas récents de Bleue sont encore invisibles.
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');
select pg_temp.check(
  (select leader_name = 'Rouge' and leader_steps = 500 and my_team_steps = 500
   from public.territory_map(now() - interval '1 day', now() + interval '1 hour', 0, 30, 0, 30) where cell_q = 10 and cell_r = 20),
  'les pas de la dernière heure des autres équipes restent cachés'
);
select pg_temp.check(
  (select count(*) = 2 from public.territory_map(now() - interval '1 day', now() + interval '1 hour', 0, 30, 0, 30)),
  'seules les zones parcourues apparaissent'
);
select pg_temp.check(
  (select count(*) = 0 from public.territory_map(now() - interval '1 day', now() + interval '1 hour', 100, 130, 0, 30)),
  'rien hors de la zone demandée'
);
reset role;

-- Une équipe masquée (signalée) disparaît du territoire des autres.
update public.teams set hidden = true where name = 'Rouge';
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e3');
select pg_temp.check(
  (select leader_name = 'Bleue' from public.territory_map(now() - interval '1 day', now() + interval '1 hour', 0, 30, 0, 30) where cell_q = 10 and cell_r = 20),
  'équipe masquée absente du territoire des autres'
);
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');
select pg_temp.check(
  (select my_team_steps = 500 from public.territory_map(now() - interval '1 day', now() + interval '1 hour', 0, 30, 0, 30) where cell_q = 10 and cell_r = 20),
  'ses membres voient toujours leur territoire'
);
reset role;
update public.teams set hidden = false where name = 'Rouge';

-- Positions : E4 devient ami de E1. E2 (coéquipier de E1, pas ami) partage aussi.
select set_config('test.e1_code', (select friend_code from public.profiles where id = '00000000-0000-0000-0000-0000000000e1'), false);
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e4');
select public.add_friend(current_setting('test.e1_code'));
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');
select public.update_my_location(10, 20);
reset role;
select pg_temp.check((select count(*) = 0 from public.player_locations), 'position non partagée par défaut');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');
select public.set_location_sharing(true);
select public.update_my_location(10, 20);
select pg_temp.expect_error($$select * from public.player_locations$$, 'permission denied');
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e2');
select public.set_location_sharing(true);
select public.update_my_location(11, 20);
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-0000000000e4');
select pg_temp.check((select count(*) = 1 and min(cell_q) = 10 from public.friends_on_map()), 'un ami voit la zone de son ami');
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');
select pg_temp.check((select count(*) = 0 from public.friends_on_map()), 'un coéquipier non ami n’apparaît pas ; E4 ne partage pas');
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e3');
select pg_temp.check((select count(*) = 0 from public.friends_on_map()), 'un inconnu ne voit personne');
reset role;

-- Position périmée puis mode fantôme.
update public.player_locations set updated_at = now() - interval '31 minutes' where user_id = '00000000-0000-0000-0000-0000000000e1';
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e4');
select pg_temp.check((select count(*) = 0 from public.friends_on_map()), 'position de plus de 30 min masquée');
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');
select public.update_my_location(10, 21);
select public.set_location_sharing(false);
reset role;
select pg_temp.check((select count(*) = 0 from public.player_locations where user_id = '00000000-0000-0000-0000-0000000000e1'), 'mode fantôme : position effacée');

select pg_temp.act_as(null);
select pg_temp.expect_error($$select * from public.territory_map(now(), now(), 0, 1, 0, 1)$$, 'permission denied');
select pg_temp.expect_error($$select * from public.friends_on_map()$$, 'permission denied');
reset role;
