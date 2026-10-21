-- Guerre d'équipes : création, arrivée, visibilité, classement, signalements.
\set ON_ERROR_STOP on
\ir helpers.sql

insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000d1'),
  ('00000000-0000-0000-0000-0000000000d2'),
  ('00000000-0000-0000-0000-0000000000d3'),
  ('00000000-0000-0000-0000-0000000000d4'),
  ('00000000-0000-0000-0000-0000000000d5');

-- D1 crée une équipe et marche.
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');
select pg_temp.check((select name = 'Les Fusées' and code ~ '^[A-HJ-NP-Z2-9]{6}$' from public.create_team('  Les Fusées ', '🚀')), 'création d''équipe');
select pg_temp.expect_error($$select public.create_team('Autre', '🐢')$$, 'already_in_team');
select pg_temp.expect_error($$select public.create_team('X', '🐢')$$, 'already_in_team');
select public.record_steps(jsonb_build_array(
  jsonb_build_object('day', current_date, 'steps', 6000),
  jsonb_build_object('day', current_date - 1, 'steps', 4000)
));
select pg_temp.check((select count(*) = 1 from public.teams), 'on voit son équipe et son code');
select pg_temp.expect_error($$update public.profiles set team_id = null where id = auth.uid()$$, 'permission denied');
select pg_temp.expect_error($$update public.teams set name = 'Piratée'$$, 'permission denied');
reset role;
select set_config('test.team_code', (select code from public.teams where name = 'Les Fusées'), false);
-- Simule une arrivée de D1 la veille : ses pas d'hier comptent aussi.
update public.profiles set team_joined_on = current_date - 1 where id = '00000000-0000-0000-0000-0000000000d1';

-- D2 rejoint avec le code ; ses pas d'avant son arrivée ne comptent pas.
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d2');
select public.record_steps(jsonb_build_array(
  jsonb_build_object('day', current_date - 1, 'steps', 50000),
  jsonb_build_object('day', current_date, 'steps', 3000)
));
select pg_temp.expect_error($$select public.join_team('ZZZZZZ')$$, 'team_code_not_found');
select pg_temp.check((select name = 'Les Fusées' from public.join_team(lower(current_setting('test.team_code')))), 'rejoindre une équipe par code');
select pg_temp.check((select count(*) = 2 from public.profiles), 'on voit le profil de ses coéquipiers');
select pg_temp.check((select count(*) = 2 from public.daily_steps where user_id = '00000000-0000-0000-0000-0000000000d1'), 'on voit les pas de ses coéquipiers');
select pg_temp.check(
  (select steps = 6000 + 4000 + 3000 and members = 2 from public.team_leaderboard(current_date - 6, current_date) where name = 'Les Fusées'),
  'total d''équipe : pas de chaque membre depuis son arrivée'
);
select pg_temp.check(not public.is_friend('00000000-0000-0000-0000-0000000000d1'), 'coéquipier n''est pas ami pour autant');
select pg_temp.expect_error($$insert into public.challenges (challenger_id, opponent_id, start_day, days) values (auth.uid(), '00000000-0000-0000-0000-0000000000d1', current_date, 1)$$, 'row-level security');
reset role;

-- D3 crée une équipe rivale : il voit les totaux, pas les membres ni les codes.
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d3');
select public.create_team('Les Tortues', '🐢');
select public.record_steps(jsonb_build_array(jsonb_build_object('day', current_date, 'steps', 20000)));
select pg_temp.check((select count(*) = 2 from public.team_leaderboard(current_date - 6, current_date)), 'le classement montre toutes les équipes');
select pg_temp.check((select count(*) = 1 from public.teams), 'on ne voit pas le code des autres équipes');
select pg_temp.check((select count(*) = 1 from public.profiles), 'on ne voit pas les membres des autres équipes');
select pg_temp.check((select count(*) = 1 from public.daily_steps), 'on ne voit pas les pas des autres équipes');
select pg_temp.expect_error(format('select public.report_team(%L)', public.my_team_id()), 'cannot_report_own_team');
reset role;

-- Signalements : masquée après 3 signalements distincts, sauf pour ses membres.
select set_config('test.fusees', (select id::text from public.teams where name = 'Les Fusées'), false);
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d3');
select public.report_team(current_setting('test.fusees')::uuid);
select public.report_team(current_setting('test.fusees')::uuid);
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d4');
select public.report_team(current_setting('test.fusees')::uuid);
reset role;
select pg_temp.check((select not hidden from public.teams where name = 'Les Fusées'), 'un même joueur ne compte qu''une fois');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d5');
select public.report_team(current_setting('test.fusees')::uuid);
select pg_temp.check((select count(*) = 1 from public.team_leaderboard(current_date - 6, current_date)), 'équipe signalée masquée du classement');
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');
select pg_temp.check((select count(*) = 1 from public.team_leaderboard(current_date - 6, current_date) where name = 'Les Fusées'), 'ses membres voient toujours leur équipe');
reset role;

-- Limite de taille : on complète l'équipe avec des joueurs neufs.
create temp table fillers (id uuid);
insert into fillers select gen_random_uuid() from generate_series(1, 30);
insert into auth.users (id) select id from fillers;
update public.profiles set team_id = current_setting('test.fusees')::uuid, team_joined_on = current_date
where id in (
  select id from fillers
  limit 30 - (select count(*) from public.profiles where team_id = current_setting('test.fusees')::uuid)
);
select pg_temp.check((select count(*) = 30 from public.profiles where team_id = current_setting('test.fusees')::uuid), 'équipe remplie à 30');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d4');
select pg_temp.expect_error(format('select public.join_team(%L)', current_setting('test.team_code')), 'team_full');
reset role;

-- Quitter : le dernier membre qui part supprime l'équipe.
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d3');
select public.leave_team();
reset role;
select pg_temp.check((select count(*) = 0 from public.teams where name = 'Les Tortues'), 'équipe vide supprimée');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d2');
select public.leave_team();
select pg_temp.check((select count(*) = 1 from public.profiles), 'après départ, on ne voit plus ses ex-coéquipiers');
reset role;
select pg_temp.check((select count(*) = 1 from public.teams where name = 'Les Fusées'), 'l''équipe reste tant qu''il y a des membres');

-- Anonyme
select pg_temp.act_as(null);
select pg_temp.expect_error($$select * from public.team_leaderboard(current_date - 6, current_date)$$, 'permission denied');
select pg_temp.expect_error($$select * from public.teams$$, 'permission denied');
reset role;
