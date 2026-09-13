-- ─── EL HISTORIAL DE PESADAS ─────────────────────────────────────────────────
--
-- ⚠️ POR QUÉ EXISTE (13 de septiembre de 2026). Hasta hoy NO SE GUARDABA NI UNA
-- PESADA: `perros.peso_actual` se sobrescribía, y la pantalla «Evolución y
-- crecimiento» dibujaba la curva esperada con UN SOLO punto real -- el de hoy
-- -- aunque llevaras un año pesándolo. Prometía una serie que no existía.
--
-- Y no es una pantalla bonita: es el instrumento que la fuente pone POR ENCIMA
-- del que usamos. SACN5 cap.17, «Feeding Growing Puppies»:
--
--   «All puppies should have their body condition evaluated and reassessed at
--    least every two weeks to allow for adjustments in amounts fed and, thus,
--    growth rates»
--
--   «regularly assessing body condition provides more immediate feedback about
--    optimal nutritional status than using body weights based on estimated
--    adult size»
--
-- Y la frase de en medio llama al camino que sí usábamos -- estimar el peso
-- adulto -- «a markedly less effective option».
--
-- Con dos o más pesadas se puede estimar el peso adulto de la TRAYECTORIA del
-- propio cachorro, que es lo que hacen las curvas de WALTHAM (50.000 perros) y
-- lo que hace MyVetDiet. Eso cierra de golpe el tramo de 12 a 24 meses, donde
-- la ecuación de FEDIAF ya no vale y 202 de las 270 razas siguen creciendo, sin
-- depender de las 185 razas que no tienen fuente publicada.
--
-- Se ejecuta en el SQL Editor de Supabase. Es idempotente.

create table if not exists public.pesos (
  id           uuid primary key default gen_random_uuid(),
  perro_id     uuid not null references public.perros(id) on delete cascade,
  -- El dueño se copia aquí y no se busca en `perros`, por lo mismo que en
  -- `pautas_firmadas`: la política de lectura tiene que poder resolverse sin
  -- un join, que es lo que la hace barata y lo que evita que un cambio en
  -- `perros` la deje sin efecto sin que se note.
  user_id      uuid not null references auth.users(id),
  -- La FECHA de la pesada, no la de la fila: una pesada se puede apuntar al
  -- día siguiente y lo que importa para la curva es cuándo se pesó.
  fecha        date not null default current_date,
  peso_kg      numeric(6,2) not null check (peso_kg > 0 and peso_kg < 200),
  -- El BCS del día, si se miró. Va aquí y no en otra tabla porque la fuente
  -- pide las dos cosas a la vez y cada dos semanas: el peso dice cuánto crece
  -- y el BCS dice si ese ritmo es sano.
  bcs          smallint check (bcs between 1 and 9),
  creado_en    timestamptz not null default now()
);

-- ⚠️ UNA PESADA POR PERRO Y DÍA. Sin esto, tocar el peso tres veces en la
-- misma pantalla mete tres filas del mismo día y la curva sale con escalones
-- que no son del perro. Se resuelve con `on conflict` al escribir: la última
-- del día pisa a la anterior.
create unique index if not exists pesos_perro_fecha on public.pesos (perro_id, fecha);
create index if not exists pesos_perro on public.pesos (perro_id, fecha desc);

alter table public.pesos enable row level security;

-- service_role se salta RLS pero NO los permisos de tabla. Sin este grant, una
-- tabla creada a mano da «permission denied» con un 42501 que no dice nada. Ya
-- pasó con `accesos`.
grant select, insert, update, delete on public.pesos to authenticated;

-- ─── QUIÉN ESCRIBE Y QUIÉN LEE ───────────────────────────────────────────────
-- El dueño del perro, y nadie más. El veterinario con acceso lee por la vía de
-- `accesos`, igual que lee los menús.
drop policy if exists "el dueño escribe sus pesadas" on public.pesos;
create policy "el dueño escribe sus pesadas"
  on public.pesos for insert
  with check (auth.uid() = user_id);

drop policy if exists "el dueño corrige sus pesadas" on public.pesos;
create policy "el dueño corrige sus pesadas"
  on public.pesos for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "el dueño borra sus pesadas" on public.pesos;
create policy "el dueño borra sus pesadas"
  on public.pesos for delete
  using (auth.uid() = user_id);

drop policy if exists "leer las pesadas de mi perro o de mi paciente" on public.pesos;
create policy "leer las pesadas de mi perro o de mi paciente"
  on public.pesos for select
  using (
    auth.uid() = user_id
    or exists (
      select 1 from public.accesos a
      where a.perro_id = pesos.perro_id
        and a.profesional = auth.uid()
        and a.estado = 'activo'
    )
  );

comment on table public.pesos is
  'Historial de pesadas. La fuente (SACN5 cap.17) pide reevaluar peso y condición corporal al menos cada dos semanas, y con dos o más puntos el peso adulto de un cachorro sale de su propia trayectoria y no de la tabla de razas.';
