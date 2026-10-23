-- Mise à jour du 23 octobre 2026 : correctif de sécurité sur les duels.
-- À coller après supabase/update-2026-10-22.sql. Sans risque si collé deux fois.

-- ===== 20261029000000_duel_grants.sql =====
-- Correctif : Supabase accorde par défaut l'écriture sur toutes les colonnes ;
-- sans ce retrait, un joueur pouvait créer un duel déjà « accepté » (ou fixer
-- son id), sans l'accord de l'adversaire. On ne garde que les colonnes prévues.
revoke insert, update on public.challenges from authenticated;
grant insert (challenger_id, opponent_id, start_day, days, stake) on public.challenges to authenticated;

-- TRUNCATE passe outre les règles RLS : jamais pour les joueurs (PostgREST ne
-- l'expose pas, mais rien ne doit dépendre de ce détail).
revoke truncate on public.profiles, public.friendships, public.daily_steps, public.challenges from anon, authenticated;
