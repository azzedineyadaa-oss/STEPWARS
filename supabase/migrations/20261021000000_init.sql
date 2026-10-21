-- StepWars : schéma initial.
--
-- Principe de sécurité : chaque joueur ne voit que son profil, ses amis,
-- les pas de ses amis et les défis auxquels il participe (Row Level Security).
-- Les opérations qui touchent deux joueurs à la fois (ajout d'ami, etc.)
-- passent par des fonctions `security definer` qui contrôlent auth.uid().

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null default 'Joueur' check (char_length(name) between 1 and 20),
  avatar text not null default '🏃' check (char_length(avatar) between 1 and 8),
  daily_goal integer not null default 8000 check (daily_goal between 1000 and 100000),
  friend_code text not null unique,
  created_at timestamptz not null default now()
);

create table public.friendships (
  -- Une amitié est stockée dans les deux sens : (a, b) et (b, a).
  user_id uuid not null references public.profiles (id) on delete cascade,
  friend_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id),
  check (user_id <> friend_id)
);

create table public.daily_steps (
  user_id uuid not null references public.profiles (id) on delete cascade,
  day date not null,
  steps integer not null check (steps between 0 and 200000),
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

create table public.challenges (
  id uuid primary key default gen_random_uuid(),
  challenger_id uuid not null references public.profiles (id) on delete cascade,
  opponent_id uuid not null references public.profiles (id) on delete cascade,
  start_day date not null,
  days integer not null check (days in (1, 3, 7)),
  created_at timestamptz not null default now(),
  check (challenger_id <> opponent_id)
);

create index challenges_challenger_idx on public.challenges (challenger_id);
create index challenges_opponent_idx on public.challenges (opponent_id);

-- ---------------------------------------------------------------------------
-- Création automatique du profil à l'inscription
-- ---------------------------------------------------------------------------

create function public.generate_friend_code()
returns text
language plpgsql
set search_path = ''
as $$
declare
  -- Sans 0/O/1/I, faciles à confondre.
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text;
begin
  loop
    code := '';
    for i in 1..6 loop
      code := code || substr(alphabet, 1 + floor(random() * 32)::int, 1);
    end loop;
    exit when not exists (select 1 from public.profiles where friend_code = code);
  end loop;
  return code;
end;
$$;

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, friend_code) values (new.id, public.generate_friend_code());
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

-- Utilisée dans les règles ci-dessous ; `security definer` évite que la règle
-- de `friendships` ne s'applique récursivement.
-- Ne répond que pour le joueur connecté, pour ne rien révéler des autres.
create function public.is_friend(other uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.friendships where user_id = auth.uid() and friend_id = other);
$$;

alter table public.profiles enable row level security;
alter table public.friendships enable row level security;
alter table public.daily_steps enable row level security;
alter table public.challenges enable row level security;

create policy "profil : soi-même et ses amis" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or public.is_friend(id));

create policy "profil : modifier le sien" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy "amitiés : les siennes" on public.friendships
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "pas : les siens et ceux de ses amis" on public.daily_steps
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_friend(user_id));

create policy "défis : ceux où l'on joue" on public.challenges
  for select to authenticated
  using ((select auth.uid()) in (challenger_id, opponent_id));

create policy "défis : lancer contre un ami" on public.challenges
  for insert to authenticated
  with check (
    challenger_id = (select auth.uid())
    and public.is_friend(opponent_id)
    -- Tolérance d'un jour : le jour local du téléphone peut différer du jour UTC.
    and start_day between current_date - 1 and current_date + 1
  );

create policy "défis : supprimer ceux où l'on joue" on public.challenges
  for delete to authenticated
  using ((select auth.uid()) in (challenger_id, opponent_id));

-- Droits : rien pour les visiteurs non connectés ; les connectés ne modifient
-- que les colonnes prévues, le reste passe par les fonctions ci-dessous.
revoke all on public.profiles, public.friendships, public.daily_steps, public.challenges from anon;
revoke insert, update, delete on public.profiles, public.friendships, public.daily_steps from authenticated;
grant select on public.profiles, public.friendships, public.daily_steps, public.challenges to authenticated;
grant update (name, avatar, daily_goal) on public.profiles to authenticated;
grant insert (challenger_id, opponent_id, start_day, days), delete on public.challenges to authenticated;

-- ---------------------------------------------------------------------------
-- Fonctions appelées par l'app (supabase.rpc)
-- ---------------------------------------------------------------------------

create function public.add_friend(code text)
returns table (id uuid, name text, avatar text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  target public.profiles%rowtype;
begin
  if me is null then
    raise exception 'not_authenticated';
  end if;

  select * into target from public.profiles p where p.friend_code = upper(trim(code));
  if not found then
    raise exception 'friend_code_not_found';
  end if;
  if target.id = me then
    raise exception 'cannot_add_self';
  end if;

  insert into public.friendships (user_id, friend_id)
  values (me, target.id), (target.id, me)
  on conflict do nothing;

  return query select target.id, target.name, target.avatar;
end;
$$;

create function public.remove_friend(friend uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'not_authenticated';
  end if;

  delete from public.friendships
  where (user_id = me and friend_id = friend) or (user_id = friend and friend_id = me);

  delete from public.challenges
  where (challenger_id = me and opponent_id = friend) or (challenger_id = friend and opponent_id = me);
end;
$$;

-- entries : [{"day": "2026-10-21", "steps": 4200}, ...]
-- Un total ne peut qu'augmenter, et seuls les 8 derniers jours sont acceptés.
create function public.record_steps(entries jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'not_authenticated';
  end if;

  insert into public.daily_steps (user_id, day, steps)
  select me, (e ->> 'day')::date, (e ->> 'steps')::int
  from jsonb_array_elements(entries) as e
  where (e ->> 'day')::date between current_date - 8 and current_date + 1
  on conflict (user_id, day) do update
    set steps = greatest(public.daily_steps.steps, excluded.steps),
        updated_at = now();
end;
$$;

-- Exigé par Apple dès qu'une app crée des comptes : suppression complète.
-- La suppression en cascade efface profil, amitiés, pas et défis.
create function public.delete_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'not_authenticated';
  end if;
  delete from auth.users where id = me;
end;
$$;

revoke execute on function
  public.generate_friend_code(),
  public.handle_new_user(),
  public.is_friend(uuid),
  public.add_friend(text),
  public.remove_friend(uuid),
  public.record_steps(jsonb),
  public.delete_account()
from public, anon, authenticated;

grant execute on function
  public.is_friend(uuid),
  public.add_friend(text),
  public.remove_friend(uuid),
  public.record_steps(jsonb),
  public.delete_account()
to authenticated;
