-- Anti-triche : seuls des pas humainement possibles sont crédités.
\set ON_ERROR_STOP on

\ir helpers.sql

insert into auth.users (id) values ('00000000-0000-0000-0000-0000000000e1');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');

-- Premier envoi : l'historique de la semaine passe tel quel, plafonné à 100 000.
select pg_temp.check(
  (select count(*) = 3 from public.record_steps(jsonb_build_array(
    jsonb_build_object('day', current_date - 2, 'steps', 12000),
    jsonb_build_object('day', current_date - 1, 'steps', 250000),
    jsonb_build_object('day', current_date, 'steps', 4000)
  ))),
  'record_steps renvoie les jours crédités'
);
select pg_temp.check((select steps = 12000 from public.daily_steps where day = current_date - 2), 'un historique normal est crédité');
select pg_temp.check((select steps = 100000 from public.daily_steps where day = current_date - 1), 'plafond de 100 000 pas par jour');

-- Juste après : +50 000 d'un coup ne passe pas, seule la marge de 2 000 est créditée.
select pg_temp.check(
  (select steps = 6000 from public.record_steps(jsonb_build_array(jsonb_build_object('day', current_date, 'steps', 54000)))),
  'un bond impossible est limité et l’app reçoit le chiffre crédité'
);

-- Une heure plus tard (hors ligne pendant la marche) : jusqu'à 12 000 pas de plus.
reset role;
update public.daily_steps set updated_at = now() - interval '1 hour' where day = current_date;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');
select public.record_steps(jsonb_build_array(jsonb_build_object('day', current_date, 'steps', 15000)));
select pg_temp.check((select steps = 15000 from public.daily_steps where day = current_date), 'une vraie marche hors ligne est entièrement créditée');

-- Un envoi sans nouveaux pas ne remet pas le compteur de temps à zéro.
reset role;
update public.daily_steps set updated_at = now() - interval '30 minutes' where day = current_date;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');
select public.record_steps(jsonb_build_array(jsonb_build_object('day', current_date, 'steps', 15000)));
select pg_temp.check(
  (select updated_at < now() - interval '29 minutes' from public.daily_steps where day = current_date),
  'renvoyer le même total ne consomme pas le temps écoulé'
);

-- Un même jour en double dans un lot, ou négatif, ne casse rien.
select public.record_steps(jsonb_build_array(
  jsonb_build_object('day', current_date - 3, 'steps', 3000),
  jsonb_build_object('day', current_date - 3, 'steps', 5000),
  jsonb_build_object('day', current_date - 4, 'steps', -50)
));
select pg_temp.check((select steps = 5000 from public.daily_steps where day = current_date - 3), 'doublon dans un lot : le plus grand gagne');
select pg_temp.check((select steps = 0 from public.daily_steps where day = current_date - 4), 'un total négatif devient 0');

select pg_temp.expect_error($$select public.max_daily_steps()$$, 'permission denied');
reset role;
