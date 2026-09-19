// ─── UNA COLUMNA QUE FALTA NO SE LLEVA POR DELANTE A LAS QUE ESTÁN ───────────
//
// ⚠️ CASO REAL, CONTADO POR ELENA (19 de septiembre de 2026), usando la app:
//
//     «He probado a hacer el menú para Cairo con bastantes premios y con
//      ninguno, y me salen exactamente las mismas kilocalorías.»
//
// Y el motor hace lo correcto: medido contra el desplegado, el mismo perro da
// 1645 kcal de ración sin premios, 1563 con «alguno» (5 %) y 1474 con
// «bastantes» (10 %). O sea que el motor NUNCA vio la respuesta.
//
// ⚠️ LA CAUSA, sondeando el ESQUEMA de producción con la clave pública:
//
//     perros.con_hidratos     -> 42703  «column perros.con_hidratos does not exist»
//     perros.premios_nivel    -> 42501  permiso denegado   (o sea: EXISTE)
//     perros.peso_objetivo_kg -> 42501  permiso denegado   (o sea: EXISTE)
//
// La que falta es `con_hidratos`: se empezó a escribir desde la app el 17 de
// septiembre y **su SQL no se escribió nunca** (ahora sí:
// `supabase/migracion-hidratos.sql`).
//
// Y eso no se quedó en que no se guardaran los hidratos. `esColumnaQueNoExiste`
// miraba SOLO EL CÓDIGO del error, así que ese PGRST204 daba `true` para
// CUALQUIER columna de `COLUMNAS_NUEVAS`. Al guardar una ficha, el bucle
// quitaba primero `peso_objetivo_kg`, reintentaba (mismo error), quitaba
// `premios_nivel`, reintentaba (mismo error) y por fin quitaba al culpable.
//
// La ficha se guardaba **sin dar ningún error** y sin dos respuestas que sí
// existen en la base. Una de ellas decide cuántas kcal lleva la ración; la otra
// es sobre la que FEDIAF §7.2.5 escala los mínimos.
//
// Se prueba la función sola porque `guardarPerro` habla con el Supabase de
// verdad en cuanto se importa el módulo fuera del navegador.
import { test, expect } from "@playwright/test";
import { esColumnaQueNoExiste } from "../src/supabase.js";

// El error tal cual lo manda PostgREST al ESCRIBIR una columna que no existe.
const ERROR_REAL = {
  code: "PGRST204",
  message: "Could not find the 'con_hidratos' column of 'perros' in the schema cache",
  details: null,
  hint: null,
};

test("el error de UNA columna no vale para las otras", () => {
  expect(esColumnaQueNoExiste(ERROR_REAL, "con_hidratos"),
    "no reconoce su propia columna").toBe(true);

  for (const otra of ["peso_objetivo_kg", "premios_nivel"]) {
    expect(esColumnaQueNoExiste(ERROR_REAL, otra),
      `un PGRST204 que habla de «con_hidratos» se está dando por bueno para «${otra}». ` +
      `Eso hace que guardar la ficha quite esa columna del payload aunque SÍ exista, y la ` +
      `respuesta del dueño se pierde sin ningún error: es el menú de Cairo con las mismas ` +
      `kcal contestando «bastantes premios» que «ninguno»`)
      .toBe(false);
  }
});

test("el 42703 de leer también se reconoce, y también por nombre", () => {
  const alLeer = { code: "42703", message: "column perros.con_hidratos does not exist" };
  expect(esColumnaQueNoExiste(alLeer, "con_hidratos")).toBe(true);
  expect(esColumnaQueNoExiste(alLeer, "premios_nivel")).toBe(false);
});

test("un error que no es de columna no quita nada", () => {
  // Si un fallo de permisos o de red contara como «la columna no existe», la
  // app se pondría a guardar fichas recortadas por cualquier motivo.
  const permisos = { code: "42501", message: "permission denied for table perros" };
  const red = { message: "Failed to fetch" };
  for (const columna of ["con_hidratos", "premios_nivel", "peso_objetivo_kg"]) {
    expect(esColumnaQueNoExiste(permisos, columna)).toBe(false);
    expect(esColumnaQueNoExiste(red, columna)).toBe(false);
  }
});
