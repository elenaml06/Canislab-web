-- ─── LAS PAUTAS FIRMADAS ─────────────────────────────────────────────────────
--
-- Un documento firmado tiene que seguir diciendo lo mismo dentro de un año, y
-- en esta app no se queda quieto NADA:
--
--   · La ficha del perro cambia. Caso real: Lola pesaba 7,0 kg y dos meses
--     después 6,2. Si el veterinario firmó a 7,0, el documento dice 7,0.
--   · El catálogo cambia. Dos veces en una semana: fuera la borraja el 27 de
--     agosto, fuera cinco suplementos el 26. Un menú firmado que llevara
--     borraja no se puede regenerar hoy: saldría otro.
--   · El motor cambia. El tope de fósforo en renal pasó de 1400 a 1200 el 25
--     de agosto. El mismo menú, verificado antes y después, no da lo mismo.
--
-- Por eso aquí no se guarda "el menú": se guarda el DOCUMENTO ENTERO que
-- selló la API -- gramos, ficha verificada con sus 42 filas, contexto, huecos
-- del catálogo y los sellos de los datos y del código -- y su sello.
--
-- Las columnas sueltas (nombre_firmante, num_colegiado, firmada_en, sello)
-- son COPIAS para poder listar sin abrir el jsonb. Lo que vale es
-- `documento`: si alguna vez discreparan, manda el documento, que es sobre lo
-- que se calculó el sello.
--
-- Se ejecuta en el SQL Editor de Supabase. Es idempotente.

create table if not exists public.pautas_firmadas (
  id               uuid primary key default gen_random_uuid(),
  -- Se conserva aunque el perro se borre: un documento firmado no
  -- desaparece porque se borre una ficha.
  perro_id         uuid references public.perros(id) on delete set null,
  profesional      uuid not null references auth.users(id),
  -- ⚠️ EL TUTOR SE COPIA AQUÍ, no se busca en `perros`. La política de
  -- lectura del dueño tiene que seguir funcionando aunque el perro se borre
  -- o aunque el veterinario deje de tener acceso: "revocar el acceso no
  -- borra lo firmado". Si la política mirara `perros`, un borrado dejaría al
  -- dueño sin poder leer su propia pauta.
  tutor            uuid,
  -- Copiados, no leídos de `profiles`: un documento firmado no puede cambiar
  -- porque su autor edite su perfil.
  nombre_firmante  text not null,
  num_colegiado    text not null,
  firmada_en       timestamptz not null default now(),
  documento        jsonb not null,
  sello            text not null,
  creada_en        timestamptz not null default now()
);

create index if not exists pautas_firmadas_perro   on public.pautas_firmadas (perro_id, firmada_en desc);
create index if not exists pautas_firmadas_profesional on public.pautas_firmadas (profesional, firmada_en desc);

alter table public.pautas_firmadas enable row level security;

-- service_role se salta RLS pero NO los permisos de tabla. Sin este grant,
-- una tabla creada a mano da "permission denied" con un 42501 que no dice
-- nada. Ya pasó con `accesos`.
grant select, insert on public.pautas_firmadas to authenticated;

-- ─── QUIÉN PUEDE FIRMAR ──────────────────────────────────────────────────────
-- Solo una cuenta acreditada como profesional, y solo en su propio nombre.
-- Esto NO es un adorno: la API todavía no autentica (ver VETERINARIOS.md
-- §10), así que la seguridad por fila es lo único que hay entre "cualquiera
-- puede escribir una pauta firmada" y "no". Comprobarlo en el frontend sería
-- una sugerencia, no una regla.
drop policy if exists "firmar solo un profesional acreditado" on public.pautas_firmadas;
create policy "firmar solo un profesional acreditado"
  on public.pautas_firmadas for insert
  with check (
    auth.uid() = profesional
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.rol = 'profesional'
        and p.rol_verificado_en is not null
    )
  );

-- ─── QUIÉN PUEDE LEERLAS ─────────────────────────────────────────────────────
-- El que la firmó y el dueño del perro. Los dos para siempre: si el dueño
-- retira el acceso, el veterinario deja de ver al perro pero las pautas que
-- firmó siguen existiendo para ambos. Un documento firmado no se hace
-- desaparecer retirando un permiso.
drop policy if exists "leer las propias y las de mi perro" on public.pautas_firmadas;
create policy "leer las propias y las de mi perro"
  on public.pautas_firmadas for select
  using (auth.uid() = profesional or auth.uid() = tutor);

-- ─── Y NADIE LAS EDITA NI LAS BORRA ──────────────────────────────────────────
-- No hay política de update ni de delete, y esa ausencia es la regla: una
-- pauta firmada no se edita, se firma otra. La anterior queda, con su fecha.
-- El historial de un paciente es una lista de documentos, no un documento que
-- se va pisando -- que es además la única forma de mirar atrás y ver qué se
-- le pautó y cuándo.

comment on table public.pautas_firmadas is
  'Pautas firmadas por un veterinario colegiado. Inmutables: no se editan, se firma otra. `documento` es lo sellado por la API y manda sobre las columnas sueltas, que son copias para listar.';
