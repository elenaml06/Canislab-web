// ─── UNA PETICIÓN QUE FALLA NO SE QUEDA CACHEADA ─────────────────────────────
//
// ⚠️ CASO REAL, ENCONTRADO ABRIENDO rawku.app CON UN NAVEGADOR DE VERDAD
// (19 de septiembre de 2026). En la consola, nada más cargar:
//
//     Access to fetch at 'https://canislab-api.onrender.com/alimentos' from
//     origin 'https://rawku.app' has been blocked by CORS policy
//
// Y el CORS está BIEN: comprobado contra la API desplegada, devuelve
// `access-control-allow-origin: https://rawku.app` y nada para un origen
// desconocido. Lo que pasaba es que **Render estaba dormido** -- tarda ~30-60 s
// en despertar -- y esa primera petición se la come su borde sin cabeceras, que
// el navegador cuenta como CORS.
//
// LO GRAVE NO ES ESO, ES LO DE DESPUÉS: `pedirAlimentos()` y `pedirVocabulario()`
// guardaban la promesa **también cuando fallaba** (`.catch(() => null)`), así
// que la app se quedaba con el RESPALDO durante TODA la sesión, sin reintentar
// jamás. Le pasa a la primera visita después de cada rato sin uso, que es
// exactamente la visita de alguien que entra por primera vez.
//
// Es la otra mitad de «NO VEO EL PETS PUREST EN OMEGA 3»: el arreglo del 15 de
// septiembre (`useAlimentos`) hace repintar cuando la lista LLEGA, y aquí no
// llegaba nunca. Por eso `suplementos-del-motor.spec.js` no puede ver esto: allí
// la petición tarda, aquí FALLA.
//
// ⚠️ SE SIEMBRA UN NOMBRE INVENTADO, por lo de siempre: con el nombre de verdad
// «la app lo ha leído del motor» y «la app está pintando su respaldo» se ven
// exactamente igual en pantalla.
import { test, expect } from "@playwright/test";
import { CUENTA_DE_PRUEBA } from "./fake-supabase.js";
import { irAlGenerador } from "./ayudas.js";

const SUPABASE_FALSO = "http://127.0.0.1:54321";

async function configurarBackend(request, opciones) {
  const res = await request.post(`${SUPABASE_FALSO}/__control`, { data: opciones });
  expect(res.ok()).toBeTruthy();
}

// La primera petición se cae, como con Render dormido. Las demás pasan, como
// cuando ya despertó. Devuelve un contador para poder afirmar que hubo MÁS de
// una: sin reintento solo habría una, y la prueba tiene que poder decir eso.
async function laPrimeraSeCae(page, ruta) {
  const cuenta = { intentos: 0 };
  await page.route(`**${ruta}`, async (route) => {
    cuenta.intentos += 1;
    if (cuenta.intentos === 1) return route.abort("failed");
    return route.continue();
  });
  return cuenta;
}

const CARNE_INVENTADA = "Zzyrax Lomo de Basilisco";

const CATALOGO_SEMBRADO = {
  por_categoria: {},
  sin_pantalla: [],
  como_se_da_por_categoria: {},
  pantallas: [
    {
      clave: "Carne muscular",
      dueno: { titulo: "Carne", ejemplo: "pechuga de pollo" },
      la_elige_el_usuario: true,
      categorias_del_motor: ["Carne muscular"],
      grupos: { Basilisco: [{ nombre: CARNE_INVENTADA, kcal_100g: 120,
                              categoria_del_motor: "Carne muscular" }] },
    },
  ],
};

async function entrar(page) {
  await page.goto("/");
  await page.getByPlaceholder("Email").fill(CUENTA_DE_PRUEBA.email);
  await page.getByPlaceholder("Contraseña").fill(CUENTA_DE_PRUEBA.password);
  await page.getByRole("button", { name: "Entrar" }).click();
}

test.describe("con Render dormido la app vuelve a preguntar", () => {
  test("si `/alimentos` falla la primera vez, el catálogo del motor acaba llegando",
    async ({ page, request }) => {
      await configurarBackend(request, { premium: true, catalogo: CATALOGO_SEMBRADO });
      const cuenta = await laPrimeraSeCae(page, "/alimentos");
      await entrar(page);
      await irAlGenerador(page);
      await page.getByRole("button", { name: "Pienso" }).click();
      await page.getByRole("button", { name: /^Personalizar/ }).click();
      await page.getByRole("button", { name: /Elegir los ingredientes/i }).click();
      await page.getByRole("button", { name: "Carne muscular: elijo yo" }).click();
      await page.getByRole("button", { name: "Carne muscular: elegir alimento" }).click();

      await expect(page.getByText(CARNE_INVENTADA),
        `«${CARNE_INVENTADA}» lo sirve el motor en /alimentos y no se puede elegir. La primera ` +
        `petición se ha caído -- que es lo que pasa con Render dormido -- y si la promesa ` +
        `fallida se cachea, la app se queda con CATEGORIAS_ALIMENTO_RESPALDO durante TODA la ` +
        `sesión, sin reintentar jamás. Ver _cacheaSoloSiLlega() en vocabulario.js`)
        .toBeVisible({ timeout: 15_000 });

      expect(cuenta.intentos,
        "solo ha salido UNA petición de /alimentos. Si la primera falla y no hay una segunda, " +
        "es que la promesa fallida se quedó guardada")
        .toBeGreaterThan(1);
    });

  test("si `/vocabulario` falla la primera vez, tampoco se queda cacheado",
    async ({ page, request }) => {
      await configurarBackend(request, { premium: true });
      const cuenta = await laPrimeraSeCae(page, "/vocabulario");
      await entrar(page);
      await irAlGenerador(page);
      // ⚠️ HAY QUE LLEGAR HASTA EL MENÚ, y eso no es relleno: medido, la app
      // pide `/vocabulario` UNA sola vez en la pantalla de la ficha y ninguna
      // más navegando por ahí -- son `useVocabulario()` al montarse, y esos
      // componentes ya están montados. El que vuelve a montarse es el de la
      // vista del menú. Sin este paso la prueba saldría roja con el arreglo
      // PUESTO, que es la peor clase de rojo.
      await page.getByRole("button", { name: "Pienso" }).click();
      await page.getByRole("button", { name: /^Automático/ }).click();
      await page.getByRole("button", { name: /^(Generar|Hacer)/ }).click();
      await expect(page.getByText(/SEMANA DE/i)).toBeVisible({ timeout: 30_000 });

      await expect(async () => {
        expect(cuenta.intentos,
          "solo ha salido UNA petición de /vocabulario. La primera se ha caído -- Render " +
          "dormido -- y si la promesa fallida se cachea, la app se queda con los respaldos " +
          "de razas, actividad, BCS, premios y patologías para TODA la sesión")
          .toBeGreaterThan(1);
      }).toPass({ timeout: 10_000 });
    });
});
