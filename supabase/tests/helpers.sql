-- Fonctions d'aide partagées par les fichiers *_test.sql (inclus avec \ir).

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
declare
  failed boolean := false;
begin
  begin
    execute sql;
  exception when others then
    failed := true;
    if sqlerrm not like '%' || fragment || '%' then
      raise exception 'Mauvaise erreur pour % : % (attendu « % »)', sql, sqlerrm, fragment;
    end if;
  end;
  if not failed then
    raise exception 'ATTENDU une erreur « % » pour : %', fragment, sql;
  end if;
end $$;

create function pg_temp.check(ok boolean, label text) returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'ÉCHEC : %', label; end if;
  raise notice 'ok - %', label;
end $$;
