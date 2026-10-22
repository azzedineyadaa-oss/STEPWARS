-- Duels : invitation, acceptation, refus, gage.
\set ON_ERROR_STOP on

\ir helpers.sql

insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000b1'),
  ('00000000-0000-0000-0000-0000000000b2'),
  ('00000000-0000-0000-0000-0000000000b3');
insert into public.friendships (user_id, friend_id) values
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b2'),
  ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000b1');

-- B1 défie B2 avec un gage : le duel attend B2.
select pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');
insert into public.challenges (challenger_id, opponent_id, start_day, days, stake)
values (auth.uid(), '00000000-0000-0000-0000-0000000000b2', current_date - 1, 3, 'Le perdant paie le café');
select pg_temp.check((select status = 'pending' and stake = 'Le perdant paie le café' from public.challenges), 'un nouveau duel attend l’adversaire');
select pg_temp.expect_error(
  $$insert into public.challenges (challenger_id, opponent_id, start_day, days, status) values (auth.uid(), '00000000-0000-0000-0000-0000000000b2', current_date, 1, 'accepted')$$,
  'permission denied'
);
select pg_temp.expect_error(
  $$insert into public.challenges (challenger_id, opponent_id, start_day, days, stake) values (auth.uid(), '00000000-0000-0000-0000-0000000000b2', current_date, 1, repeat('x', 61))$$,
  'challenges_stake_check'
);
-- Le lanceur ne peut pas accepter à la place de l'adversaire.
select pg_temp.expect_error(
  format('select * from public.accept_challenge(%L, current_date)', (select id from public.challenges)),
  'challenge_not_found'
);

-- B3, étranger au duel, ne le voit pas et ne peut pas l'accepter.
select pg_temp.act_as('00000000-0000-0000-0000-0000000000b3');
select pg_temp.check((select count(*) = 0 from public.challenges), 'un duel est invisible pour les autres');
reset role;
select set_config('test.duel', (select id::text from public.challenges), false);
select pg_temp.act_as('00000000-0000-0000-0000-0000000000b3');
select pg_temp.expect_error($$select * from public.accept_challenge(current_setting('test.duel')::uuid, current_date)$$, 'challenge_not_found');

-- B2 accepte : le duel commence aujourd'hui, pas hier.
select pg_temp.act_as('00000000-0000-0000-0000-0000000000b2');
select pg_temp.check(
  (select start_day = current_date from public.accept_challenge(current_setting('test.duel')::uuid, current_date)),
  'accepté un autre jour, le duel commence ce jour-là'
);
select pg_temp.check((select status = 'accepted' from public.challenges), 'le duel est accepté');
select pg_temp.expect_error($$select * from public.accept_challenge(current_setting('test.duel')::uuid, current_date)$$, 'challenge_not_found');

-- Un nouveau duel refusé : l'adversaire le supprime.
select pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');
insert into public.challenges (challenger_id, opponent_id, start_day, days)
values (auth.uid(), '00000000-0000-0000-0000-0000000000b2', current_date, 1);
select pg_temp.act_as('00000000-0000-0000-0000-0000000000b2');
delete from public.challenges where status = 'pending';
select pg_temp.check((select count(*) = 1 from public.challenges), 'refuser supprime l’invitation');

-- Bilan de la fiche joueur : un duel jamais accepté ne compte pas.
reset role;
insert into public.challenges (challenger_id, opponent_id, start_day, days, status)
values ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b2', current_date - 10, 1, 'pending');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');
select pg_temp.check(
  (select duels_won + duels_lost + duels_tied = 0 from public.player_card('00000000-0000-0000-0000-0000000000b2', current_date)),
  'un duel en attente ne compte pas dans le bilan'
);
reset role;
