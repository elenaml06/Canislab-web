// ─── LO QUE NO SE PUEDE GUARDAR NO SE PIERDE TAMBIÉN DE LA SESIÓN ────────────
//
// ⚠️ CASO REAL, CONTADO POR ELENA (19 de septiembre de 2026), usando la app:
//
//     «He probado a hacer el menú para Cairo con bastantes premios y con
//      ninguno, y me salen exactamente las mismas kilocalorías.»
//
// Y el motor hace lo correcto: medido contra el desplegado, el mismo perro da
// 1645 kcal de ración sin premios, 1563 con «alguno» (5 %) y 1474 con
// «bastantes» (10 %). O sea que el motor nunca vio la respuesta.
//
// ⚠️ LA CAUSA ES UNA COLUMNA QUE NO EXISTE, y el camino es fino. `premios_nivel`
// (11-sep), `con_hidratos` (17-sep) y `peso_objetivo_kg` se añaden a Supabase
// con un SQL A MANO (`supabase/migracion-*.sql`). Hasta que alguien lo lanza,
// PostgREST contesta PGRST204 y `guardarPerro` reintenta SIN esa columna —
// decisión correcta y escrita: perder un campo es mejor que no poder guardar la
// ficha.
//
// Lo que estaba mal es lo de después: la fila que devolvía Supabase, ya sin la
// columna, era la que la app se quedaba como perfil. Así que la respuesta se
// perdía **también de la memoria**, y la siguiente petición de menú salía con
// `premios_nivel: null`. El dueño contesta, nadie se queja, y el menú es el de
// un perro que no come nada fuera de su ración.
//
// POR QUÉ NO LO VEÍA NADIE: `ficha-ida-y-vuelta.spec.js` comprueba justo esto
// —el campo va en su lista— y pasa, porque el Supabase de mentira **sí tiene la
// columna**. La diferencia entre las dos pruebas es esa: aquí se le quita.
import { test, expect } from "@playwright/test";
import { CUENTA_DE_PRUEBA, PERRO_DE_PRUEBA } from "./fake-supabase.js";
import { irAlGenerador } from "./ayudas.js";

const SUPABASE_FALSO = "http://127.0.0.1:54321";

const configurar = async (request, opciones) => {
  const res = await request.post(`${SUPABASE_FALSO}/__control`, { data: opciones });
  expect(res.ok()).toBeTruthy();
  return res.json();
};

test.describe("una respuesta que no se puede guardar no se pierde de la sesión", () => {
  test("sin la columna `premios_nivel`, el segundo menú SIGUE pidiéndose con premios",
    async ({ page, request }) => {
      await configurar(request, {
        premium: true, retrasoPerrosMs: 50, menus: [],
        // La ficha YA trae la respuesta contestada: lo que se prueba no es
        // contestarla, es que no se caiga al guardar.
        perros: [{ ...PERRO_DE_PRUEBA, premios_nivel: "hasta_el_maximo",
                   dieta_actual: "barf" }],
        // Y la columna no existe: es lo que pasa de verdad hasta que alguien
        // lanza `supabase/migracion-premios.sql`.
        columnasDePerroQueFaltan: ["premios_nivel"],
      });

      await page.goto("/");
      await page.getByPlaceholder("Email").fill(CUENTA_DE_PRUEBA.email);
      await page.getByPlaceholder("Contraseña").fill(CUENTA_DE_PRUEBA.password);
      await page.getByRole("button", { name: "Entrar" }).click();

      // DOS menús seguidos, y lo que importa es el SEGUNDO: entre uno y otro la
      // app guarda el perro, y es ese guardado el que se lleva la respuesta por
      // delante. Con uno solo la prueba pasaría siempre -- el primero sale de
      // la fila que se leyó, que sí la traía.
      for (let i = 0; i < 2; i++) {
        await irAlGenerador(page);
        await page.getByRole("button", { name: /^Automático/ }).click();
        await page.getByRole("button", { name: /^(Generar|Hacer)/ }).click();
        await expect(page.getByText(/Semana de/)).toBeVisible({ timeout: 30_000 });
      }

      const { peticionesMenu } = await configurar(request, { olvidarPeticionesMenu: false });
      expect((peticionesMenu || []).length,
        "no ha salido ninguna petición de menú").toBeGreaterThan(1);
      const ultima = peticionesMenu[peticionesMenu.length - 1];
      expect(ultima.premios_nivel,
        "el segundo menú se pide con `premios_nivel` vacío. La columna no existe en Supabase, " +
        "así que la fila vuelve sin ella -- y si la app se queda con esa fila tal cual, la " +
        "respuesta se evapora entre contestarla y usarla. El menú sale con las MISMAS kcal que " +
        "sin premios, sin ningún error y sin que nadie pueda verlo")
        .toBe("hasta_el_maximo");
    });
});

// ─── Y UNA COLUMNA QUE FALTA NO SE LLEVA POR DELANTE A LAS QUE ESTÁN ─────────
//
// ⚠️ ESTA ES LA QUE CAZA EL FALLO DE VERDAD, y la de arriba no. Comprobado
// sondeando el ESQUEMA de producción con la clave pública:
//
//     perros.con_hidratos     -> 42703  «column perros.con_hidratos does not exist»
//     perros.premios_nivel    -> 42501  permiso denegado  (o sea: EXISTE)
//     perros.peso_objetivo_kg -> 42501  permiso denegado  (o sea: EXISTE)
//
// O sea que la que faltaba era `con_hidratos` -- se empezó a escribir el 17 de
// septiembre y su SQL no se escribió nunca. Y `esColumnaQueNoExiste` miraba
// SOLO EL CÓDIGO del error, así que ese PGRST204 valía para cualquier columna
// de `COLUMNAS_NUEVAS`: al guardar, el bucle quitaba primero
// `peso_objetivo_kg`, luego `premios_nivel`, y por fin el culpable.
//
// La ficha se guardaba sin dar ningún error y sin dos respuestas que SÍ
// existían en la base. De ahí el menú de Cairo con las mismas kcal — y de ahí,
// además, un perro sin `peso_objetivo_kg`, que es sobre lo que FEDIAF §7.2.5
// escala los mínimos.
test("una columna que falta no arrastra a las demás", async ({ page, request }) => {
  await configurar(request, {
    premium: true, retrasoPerrosMs: 50, menus: [],
    perros: [{ ...PERRO_DE_PRUEBA, premios_nivel: "hasta_el_maximo",
               peso_objetivo_kg: 17.5, dieta_actual: "barf" }],
    // SOLO falta la de los hidratos, que es lo que pasa de verdad.
    columnasDePerroQueFaltan: ["con_hidratos"],
  });

  await page.goto("/");
  await page.getByPlaceholder("Email").fill(CUENTA_DE_PRUEBA.email);
  await page.getByPlaceholder("Contraseña").fill(CUENTA_DE_PRUEBA.password);
  await page.getByRole("button", { name: "Entrar" }).click();

  for (let i = 0; i < 2; i++) {
    await irAlGenerador(page);
    await page.getByRole("button", { name: /^Automático/ }).click();
    await page.getByRole("button", { name: /^(Generar|Hacer)/ }).click();
    await expect(page.getByText(/Semana de/)).toBeVisible({ timeout: 30_000 });
  }

  const { peticionesMenu } = await configurar(request, { olvidarPeticionesMenu: false });
  const ultima = (peticionesMenu || [])[(peticionesMenu || []).length - 1] || {};
  expect(ultima.premios_nivel,
    "falta `con_hidratos` en la base y el menú sale sin `premios_nivel`. Una columna que no " +
    "existe se está llevando por delante a otra que SÍ existe, porque el error se reconoce por " +
    "el CÓDIGO y no por el nombre de la columna")
    .toBe("hasta_el_maximo");
  expect(ultima.peso_objetivo_kg,
    "lo mismo con `peso_objetivo_kg`, que es sobre lo que FEDIAF §7.2.5 escala los mínimos: " +
    "perderlo sube la densidad exigida sin que nadie lo vea")
    .toBe(17.5);
  // Y la fila GUARDADA conserva las dos, que es lo que de verdad sobrevive al
  // recargar. Sin esto la prueba solo diría que la memoria aguanta.
  const guardados = await (await request.get(`${SUPABASE_FALSO}/rest/v1/perros`)).json();
  const fila = (guardados || [])[0] || {};
  expect(fila.premios_nivel,
    "la fila guardada perdió `premios_nivel` por culpa de otra columna que no existe")
    .toBe("hasta_el_maximo");
  expect(fila.peso_objetivo_kg,
    "la fila guardada perdió `peso_objetivo_kg` por culpa de otra columna que no existe")
    .toBe(17.5);
});
