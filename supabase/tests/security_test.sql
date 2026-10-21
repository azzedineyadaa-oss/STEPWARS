-- Scénarios de sécurité et de règles du jeu. Chaque échec stoppe le script.
\set ON_ERROR_STOP on

create function pg_temp.act_as(who uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(who::text, ''), false);
  if who is null then
    execute 'set role anon';
  else
    execute 'set role authenticated';
  end if;
end $$;

create function pg_temp.expect_error(sql text, fragment text) returns void language plpgsql as $$
begin
  execute sql;
  raise exception 'ATTENDU une erreur « % » pour : %', fragment, sql;
exception when others then
  if sqlerrm not like '%' || fragment || '%' then
    raise exception 'Mauvaise erreur pour % : % (attendu « % »)', sql, sqlerrm, fragment;
  end if;
end $$;

create function pg_temp.check(ok boolean, label text) returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'ÉCHEC : %', label; end if;
  raise notice 'ok - %', label;
end $$;

-- Trois joueurs : Alice, Bob, Chloé.
insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-00000000000b'),
  ('00000000-0000-0000-0000-00000000000c');

select pg_temp.check((select count(*) = 3 from public.profiles), 'un profil est créé à chaque inscription');
select pg_temp.check((select bool_and(friend_code ~ '^[A-HJ-NP-Z2-9]{6}$') from public.profiles), 'codes amis valides');

-- Alice
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
select pg_temp.check((select count(*) = 1 from public.profiles), 'sans amis, on ne voit que son profil');
update public.profiles set name = 'Alice' where id = auth.uid();
select pg_temp.check((select name = 'Alice' from public.profiles where id = auth.uid()), 'on peut renommer son profil');
select pg_temp.expect_error($$update public.profiles set friend_code = 'AAAAAA'$$, 'permission denied');
update public.profiles set name = 'Pirate' where id = '00000000-0000-0000-0000-00000000000b';
select pg_temp.expect_error($$insert into public.friendships values ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000c')$$, 'permission denied');
select pg_temp.expect_error($$insert into public.daily_steps (user_id, day, steps) values (auth.uid(), current_date, 5)$$, 'permission denied');
select pg_temp.expect_error($$select public.add_friend('ZZZZZZ')$$, 'friend_code_not_found');
select pg_temp.expect_error(format('select public.add_friend(%L)', (select friend_code from public.profiles where id = auth.uid())), 'cannot_add_self');
select pg_temp.expect_error($$insert into public.challenges (challenger_id, opponent_id, start_day, days) values (auth.uid(), '00000000-0000-0000-0000-00000000000b', current_date, 3)$$, 'row-level security');

-- Pas d'Alice : seuls les 8 derniers jours comptent et le total ne baisse jamais.
select public.record_steps(jsonb_build_array(
  jsonb_build_object('day', current_date, 'steps', 5000),
  jsonb_build_object('day', current_date - 1, 'steps', 7000),
  jsonb_build_object('day', current_date - 30, 'steps', 99999)
));
select public.record_steps(jsonb_build_array(jsonb_build_object('day', current_date, 'steps', 3000)));
select pg_temp.check((select steps = 5000 from public.daily_steps where day = current_date), 'le total du jour ne peut pas baisser');
select pg_temp.check((select count(*) = 2 from public.daily_steps), 'les jours trop anciens sont ignorés');
select pg_temp.expect_error($$select public.record_steps(jsonb_build_array(jsonb_build_object('day', current_date, 'steps', 999999)))$$, 'daily_steps_steps_check');
reset role;

select pg_temp.check((select name = 'Joueur' from public.profiles where id = '00000000-0000-0000-0000-00000000000b'), 'on ne peut pas modifier le profil des autres');

-- Bob ajoute Alice avec son code.
select pg_temp.act_as('00000000-0000-0000-0000-00000000000b');
select pg_temp.check((select count(*) = 0 from public.daily_steps), 'pas des inconnus invisibles');
reset role;
select set_config('test.alice_code', (select friend_code from public.profiles where id = '00000000-0000-0000-0000-00000000000a'), false);
select pg_temp.act_as('00000000-0000-0000-0000-00000000000b');
select pg_temp.check((select name = 'Alice' from public.add_friend(' ' || lower(current_setting('test.alice_code')) || ' ')), 'ajout d''ami par code (casse et espaces ignorés)');
select public.add_friend(current_setting('test.alice_code'));
select pg_temp.check((select count(*) = 1 from public.friendships), 'ajouter deux fois ne crée pas de doublon');
select pg_temp.check((select count(*) = 2 from public.profiles), 'on voit le profil de ses amis');
select pg_temp.check((select count(*) = 2 from public.daily_steps where user_id = '00000000-0000-0000-0000-00000000000a'), 'on voit les pas de ses amis');
select pg_temp.check(not public.is_friend('00000000-0000-0000-0000-00000000000c'), 'Chloé n''est pas amie de Bob');

-- Défis
select pg_temp.expect_error($$insert into public.challenges (challenger_id, opponent_id, start_day, days) values (auth.uid(), '00000000-0000-0000-0000-00000000000c', current_date, 3)$$, 'row-level security');
select pg_temp.expect_error($$insert into public.challenges (challenger_id, opponent_id, start_day, days) values ('00000000-0000-0000-0000-00000000000a', auth.uid(), current_date, 3)$$, 'row-level security');
select pg_temp.expect_error($$insert into public.challenges (challenger_id, opponent_id, start_day, days) values (auth.uid(), '00000000-0000-0000-0000-00000000000a', current_date - 10, 3)$$, 'row-level security');
select pg_temp.expect_error($$insert into public.challenges (challenger_id, opponent_id, start_day, days) values (auth.uid(), '00000000-0000-0000-0000-00000000000a', current_date, 5)$$, 'challenges_days_check');
-- Comme l'app : insertion puis relecture de la ligne créée.
with created as (
  insert into public.challenges (challenger_id, opponent_id, start_day, days)
  values (auth.uid(), '00000000-0000-0000-0000-00000000000a', current_date, 3)
  returning id, challenger_id, opponent_id, start_day, days, created_at
)
select pg_temp.check((select count(*) = 1 from created), 'lancer un défi contre un ami et relire la ligne créée');
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
select pg_temp.check((select count(*) = 1 from public.challenges), 'l''adversaire voit le défi');
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-00000000000c');
select pg_temp.check((select count(*) = 0 from public.challenges), 'un tiers ne voit pas le défi');
select pg_temp.check((select count(*) = 1 from public.profiles), 'un tiers ne voit pas les autres profils');
delete from public.challenges;
reset role;
select pg_temp.check((select count(*) = 1 from public.challenges), 'un tiers ne peut pas supprimer le défi');

-- Visiteur non connecté
select pg_temp.act_as(null);
select pg_temp.expect_error('select * from public.profiles', 'permission denied');
select pg_temp.expect_error('select * from public.daily_steps', 'permission denied');
select pg_temp.expect_error($$select public.add_friend('AAAAAA')$$, 'permission denied');
reset role;

-- Retrait d'ami : amitié supprimée dans les deux sens, défis communs aussi.
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
select public.remove_friend('00000000-0000-0000-0000-00000000000b');
reset role;
select pg_temp.check((select count(*) = 0 from public.friendships), 'retrait d''ami dans les deux sens');
select pg_temp.check((select count(*) = 0 from public.challenges), 'les défis communs sont supprimés');

-- Suppression de compte : tout disparaît.
select pg_temp.act_as('00000000-0000-0000-0000-00000000000b');
select public.add_friend(current_setting('test.alice_code'));
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
select public.delete_account();
reset role;
select pg_temp.check((select count(*) = 0 from auth.users where id = '00000000-0000-0000-0000-00000000000a'), 'compte supprimé');
select pg_temp.check((select count(*) = 0 from public.profiles where id = '00000000-0000-0000-0000-00000000000a'), 'profil supprimé');
select pg_temp.check((select count(*) = 0 from public.daily_steps where user_id = '00000000-0000-0000-0000-00000000000a'), 'pas supprimés');
select pg_temp.check((select count(*) = 0 from public.friendships), 'amitiés supprimées');

\echo 'Tous les tests de sécurité passent.'
