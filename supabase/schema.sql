-- =====================================================================
--  Equipo Casa · esquema de base de datos para Supabase
--
--  ANTES de ejecutar este script:
--    1. Authentication → Users → "Add user" → crea DOS usuarios
--       (marca "Auto Confirm User"):
--         · la cuenta de PADRES   (la que usaréis los dos)
--         · la cuenta de FAMILIA  (para activar los móviles de los niños)
--    2. Cambia los dos emails de la sección 9 (al final del script).
--    3. Pega TODO el script en SQL Editor y pulsa "Run".
--
--  Se puede volver a ejecutar sin perder datos.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
-- 1. Tablas
-- ---------------------------------------------------------------------

-- Quién puede usar la app: 'parent' (administra) o 'family' (dispositivos)
create table if not exists public.members (
  user_id uuid primary key references auth.users on delete cascade,
  role    text not null check (role in ('parent', 'family'))
);

create table if not exists public.settings (
  id              int primary key default 1 check (id = 1),
  point_value     numeric(6,2) not null default 0.10,  -- € por punto extra
  max_bonus       numeric(6,2) not null default 3.00,  -- tope semanal de bonificación (0 = sin tope)
  team_goal       text not null default 'Semana en equipo: si os tratáis bien entre vosotros, el sábado elegís la peli y la cena 🍕',
  parent_pin_hash text not null default extensions.crypt('0000', extensions.gen_salt('bf'))
);
insert into public.settings (id) values (1) on conflict do nothing;

create table if not exists public.kids (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  avatar          text not null default '🙂',
  color           text not null default '#5b5bd6',
  theme           text not null default 'kid' check (theme in ('kid', 'teen')),
  base_allowance  numeric(6,2) not null default 0,
  sort            int not null default 0,
  pin_hash        text not null,
  failed_attempts int not null default 0,
  locked_until    timestamptz
);

create table if not exists public.tasks (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  icon       text not null default '✅',
  kind       text not null check (kind in ('obligatoria', 'extra')),
  points     int  not null default 0 check (points >= 0),
  frequency  text not null default 'diaria' check (frequency in ('diaria', 'semanal')),
  kid_id     uuid references public.kids on delete cascade,  -- null = para todos
  active     boolean not null default true,
  sort       int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.completions (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references public.tasks on delete cascade,
  kid_id      uuid not null references public.kids on delete cascade,
  period_date date not null,           -- día (tarea diaria) o lunes (tarea semanal)
  status      text not null default 'pendiente' check (status in ('pendiente', 'aprobada', 'rechazada')),
  points      int  not null default 0, -- puntos de la tarea en el momento de marcarla
  created_at  timestamptz not null default now(),
  reviewed_at timestamptz,
  unique (task_id, kid_id, period_date)
);

create table if not exists public.bonuses (
  id         uuid primary key default gen_random_uuid(),
  kid_id     uuid not null references public.kids on delete cascade,
  points     int  not null check (points > 0),
  reason     text not null default '',
  day        date not null default (now() at time zone 'Europe/Madrid')::date,
  created_at timestamptz not null default now()
);

create table if not exists public.team_weeks (
  week_start date primary key,
  achieved   boolean not null default false
);

create table if not exists public.week_closures (
  id                 uuid primary key default gen_random_uuid(),
  week_start         date not null,
  kid_id             uuid not null references public.kids on delete cascade,
  mandatory_done     int not null default 0,
  mandatory_expected int not null default 0,
  extra_points       int not null default 0,
  bonus_points       int not null default 0,
  team_achieved      boolean not null default false,
  amount             numeric(6,2) not null default 0,
  paid               boolean not null default false,
  closed_at          timestamptz not null default now(),
  unique (week_start, kid_id)
);

create index if not exists completions_period_idx on public.completions (period_date);
create index if not exists completions_status_idx on public.completions (status);
create index if not exists bonuses_day_idx on public.bonuses (day);

-- ---------------------------------------------------------------------
-- 2. Funciones de rol
-- ---------------------------------------------------------------------
create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from members where user_id = auth.uid());
$$;

create or replace function public.is_parent() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from members where user_id = auth.uid() and role = 'parent');
$$;

-- ---------------------------------------------------------------------
-- 3. Permisos: nadie sin sesión ve nada
-- ---------------------------------------------------------------------
revoke all on all tables in schema public from anon;

-- El hash de los PIN no es legible ni siquiera para usuarios con sesión
revoke select on public.kids from authenticated;
grant  select (id, name, avatar, color, theme, base_allowance, sort) on public.kids to authenticated;
revoke select on public.settings from authenticated;
grant  select (id, point_value, max_bonus, team_goal) on public.settings to authenticated;
revoke update on public.settings from authenticated;
grant  update (point_value, max_bonus, team_goal) on public.settings to authenticated;
revoke insert, update on public.kids from authenticated;
grant  update (name, avatar, color, theme, base_allowance, sort) on public.kids to authenticated;

alter table public.members       enable row level security;
alter table public.settings      enable row level security;
alter table public.kids          enable row level security;
alter table public.tasks         enable row level security;
alter table public.completions   enable row level security;
alter table public.bonuses       enable row level security;
alter table public.team_weeks    enable row level security;
alter table public.week_closures enable row level security;

do $$
declare t text;
begin
  -- borra políticas previas para poder re-ejecutar el script
  for t in select format('drop policy if exists %I on %I.%I', policyname, schemaname, tablename)
           from pg_policies where schemaname = 'public' loop
    execute t;
  end loop;
end $$;

create policy "own membership" on public.members for select to authenticated using (user_id = auth.uid());

-- Lectura: cualquier dispositivo activado de la familia
create policy "members read"  on public.settings    for select to authenticated using (is_member());
create policy "members read"  on public.kids        for select to authenticated using (is_member());
create policy "members read"  on public.tasks       for select to authenticated using (is_member());
create policy "members read"  on public.completions for select to authenticated using (is_member());
create policy "members read"  on public.bonuses     for select to authenticated using (is_member());
create policy "members read"  on public.team_weeks  for select to authenticated using (is_member());

-- Escritura directa: solo padres (los niños escriben a través de funciones con PIN)
create policy "parents write" on public.settings      for update to authenticated using (is_parent()) with check (is_parent());
create policy "parents write" on public.kids          for update to authenticated using (is_parent()) with check (is_parent());
create policy "parents delete" on public.kids         for delete to authenticated using (is_parent());
create policy "parents all"   on public.tasks         for all    to authenticated using (is_parent()) with check (is_parent());
create policy "parents write" on public.completions   for update to authenticated using (is_parent()) with check (is_parent());
create policy "parents delete" on public.completions  for delete to authenticated using (is_parent());
create policy "parents all"   on public.bonuses       for all    to authenticated using (is_parent()) with check (is_parent());
create policy "parents all"   on public.team_weeks    for all    to authenticated using (is_parent()) with check (is_parent());
create policy "parents all"   on public.week_closures for all    to authenticated using (is_parent()) with check (is_parent());

-- ---------------------------------------------------------------------
-- 4. Funciones para los niños (validan el PIN en el servidor)
--    Devuelven {ok, error} en vez de lanzar excepciones para que el
--    contador de intentos fallidos no se deshaga.
-- ---------------------------------------------------------------------
create or replace function public._check_kid_pin(p_kid uuid, p_pin text) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare k kids%rowtype;
begin
  if not is_member() then return 'Dispositivo no autorizado'; end if;
  select * into k from kids where id = p_kid for update;
  if not found then return 'Perfil no encontrado'; end if;
  if k.locked_until is not null and k.locked_until > now() then
    return 'Demasiados intentos. Espera unos minutos ⏱️';
  end if;
  if k.pin_hash <> crypt(coalesce(p_pin, ''), k.pin_hash) then
    if k.failed_attempts + 1 >= 5 then
      update kids set failed_attempts = 0, locked_until = now() + interval '10 minutes' where id = p_kid;
      return 'Demasiados intentos. Espera 10 minutos ⏱️';
    end if;
    update kids set failed_attempts = failed_attempts + 1 where id = p_kid;
    return 'PIN incorrecto';
  end if;
  if k.failed_attempts > 0 or k.locked_until is not null then
    update kids set failed_attempts = 0, locked_until = null where id = p_kid;
  end if;
  return null;
end $$;

create or replace function public.kid_login(p_kid uuid, p_pin text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare err text := _check_kid_pin(p_kid, p_pin);
begin
  if err is not null then return jsonb_build_object('ok', false, 'error', err); end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.kid_mark_done(p_kid uuid, p_pin text, p_task uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  err text := _check_kid_pin(p_kid, p_pin);
  t tasks%rowtype;
  today date := (now() at time zone 'Europe/Madrid')::date;
  period date;
begin
  if err is not null then return jsonb_build_object('ok', false, 'error', err); end if;
  select * into t from tasks where id = p_task and active and (kid_id is null or kid_id = p_kid);
  if not found then return jsonb_build_object('ok', false, 'error', 'Tarea no disponible'); end if;
  period := case when t.frequency = 'semanal' then date_trunc('week', today)::date else today end;
  insert into completions (task_id, kid_id, period_date, points)
  values (t.id, p_kid, period, case when t.kind = 'extra' then t.points else 0 end)
  on conflict (task_id, kid_id, period_date) do update
    set status = 'pendiente', created_at = now(), reviewed_at = null, points = excluded.points
    where completions.status = 'rechazada';
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.kid_undo(p_kid uuid, p_pin text, p_completion uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare err text := _check_kid_pin(p_kid, p_pin);
begin
  if err is not null then return jsonb_build_object('ok', false, 'error', err); end if;
  delete from completions where id = p_completion and kid_id = p_kid and status = 'pendiente';
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------------
-- 5. Funciones para los padres
-- ---------------------------------------------------------------------
create or replace function public.parent_check_pin(p_pin text) returns boolean
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not is_parent() then return false; end if;
  return exists (select 1 from settings where id = 1 and parent_pin_hash = crypt(coalesce(p_pin, ''), parent_pin_hash));
end $$;

create or replace function public.parent_set_own_pin(p_pin text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not is_parent() then raise exception 'No autorizado'; end if;
  if p_pin !~ '^\d{4}$' then raise exception 'El PIN debe tener 4 cifras'; end if;
  update settings set parent_pin_hash = crypt(p_pin, gen_salt('bf')) where id = 1;
end $$;

create or replace function public.parent_add_kid(p_name text, p_avatar text, p_color text, p_theme text, p_base numeric, p_pin text)
returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare new_id uuid;
begin
  if not is_parent() then raise exception 'No autorizado'; end if;
  if p_pin !~ '^\d{4}$' then raise exception 'El PIN debe tener 4 cifras'; end if;
  insert into kids (name, avatar, color, theme, base_allowance, sort, pin_hash)
  values (p_name, p_avatar, p_color, p_theme, p_base, (select coalesce(max(sort), 0) + 1 from kids), crypt(p_pin, gen_salt('bf')))
  returning id into new_id;
  return new_id;
end $$;

create or replace function public.parent_set_kid_pin(p_kid uuid, p_pin text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not is_parent() then raise exception 'No autorizado'; end if;
  if p_pin !~ '^\d{4}$' then raise exception 'El PIN debe tener 4 cifras'; end if;
  update kids set pin_hash = crypt(p_pin, gen_salt('bf')), failed_attempts = 0, locked_until = null where id = p_kid;
end $$;

-- Las funciones solo las puede ejecutar un dispositivo con sesión
revoke execute on all functions in schema public from anon, public;
-- "Ping" sin datos para la tarea automática que evita la pausa por inactividad
create or replace function public.ping() returns boolean language sql stable as $$ select true $$;
grant execute on function public.ping() to anon, authenticated;

grant execute on function public.is_member(), public.is_parent() to authenticated;
grant execute on function public.kid_login(uuid, text), public.kid_mark_done(uuid, text, uuid), public.kid_undo(uuid, text, uuid) to authenticated;
grant execute on function public.parent_check_pin(text), public.parent_set_own_pin(text), public.parent_add_kid(text, text, text, text, numeric, text), public.parent_set_kid_pin(uuid, text) to authenticated;
revoke execute on function public._check_kid_pin(uuid, text) from authenticated;

-- ---------------------------------------------------------------------
-- 6. Datos de ejemplo (solo si la base está vacía).
--    Nombres, PIN y tareas se cambian luego desde la app (Ajustes).
--    PIN iniciales: Hijo 1111 · Hija 2222 · Padres 0000
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from kids) then
    insert into kids (name, avatar, color, theme, base_allowance, sort, pin_hash) values
      ('Hijo', '🦁', '#2f6fed', 'teen', 5.00, 1, extensions.crypt('1111', extensions.gen_salt('bf'))),
      ('Hija', '🦄', '#e0457b', 'kid',  2.00, 2, extensions.crypt('2222', extensions.gen_salt('bf')));
  end if;
  if not exists (select 1 from tasks) then
    insert into tasks (title, icon, kind, points, frequency, sort) values
      ('Hacer la cama',               '🛏️', 'obligatoria', 0, 'diaria',  1),
      ('Llevar mi plato a la cocina', '🍽️', 'obligatoria', 0, 'diaria',  2),
      ('Deberes hechos',              '📚', 'obligatoria', 0, 'diaria',  3),
      ('Ropa sucia al cesto',         '🧺', 'obligatoria', 0, 'diaria',  4),
      ('Ordenar la habitación',       '🧸', 'obligatoria', 0, 'semanal', 5),
      ('Poner o quitar la mesa',      '🍴', 'extra',       2, 'diaria',  6),
      ('Ayudar a cocinar',            '🧑‍🍳', 'extra',     3, 'diaria',  7),
      ('Sacar la basura',             '🗑️', 'extra',       2, 'diaria',  8),
      ('Leer 20 minutos',             '📖', 'extra',       1, 'diaria',  9),
      ('Doblar y guardar la ropa',    '👕', 'extra',       2, 'diaria', 10),
      ('Ayudar con la compra',        '🛒', 'extra',       3, 'semanal', 11);
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 9. Cuentas: CAMBIA estos dos emails por los que creaste en el paso 1
-- ---------------------------------------------------------------------
insert into public.members (user_id, role)
  select id, 'parent' from auth.users where lower(email) = lower('PADRES@EJEMPLO.COM')
  on conflict (user_id) do update set role = excluded.role;

insert into public.members (user_id, role)
  select id, 'family' from auth.users where lower(email) = lower('FAMILIA@EJEMPLO.COM')
  on conflict (user_id) do update set role = excluded.role;

-- Comprobación: debe mostrar 2 filas (parent y family)
select u.email, m.role from public.members m join auth.users u on u.id = m.user_id;
