-- Reproduction minimale de l'environnement Supabase pour tester la migration
-- sur un Postgres local : rôles, schéma auth, auth.uid() et droits par défaut.
-- Ne jamais exécuter ce fichier sur un vrai projet Supabase.

create role anon nologin;
create role authenticated nologin;

create schema auth;
grant usage on schema auth to anon, authenticated;

create table auth.users (id uuid primary key default gen_random_uuid());

-- Comme Supabase : lit `sub` dans le JWT transmis par PostgREST, ou dans le
-- réglage individuel utilisé par les tests SQL.
create function auth.uid() returns uuid language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  )::uuid;
$$;
grant execute on function auth.uid() to anon, authenticated;

grant usage on schema public to anon, authenticated;
-- Comme Supabase : tout est accordé par défaut, la migration doit donc retirer
-- explicitement ce qui ne doit pas être accessible.
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on functions to anon, authenticated;
