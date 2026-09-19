// ─── Los suplementos que se pueden elegir salen del MOTOR ────────────────────
//
// POR QUÉ EXISTE (15 de septiembre de 2026). Elena, en Personalizar:
//
//     «NO VEO EL PETS PUREST EN OMEGA 3 EN SUPLEMENTOS EN PERSONALIZAR MENU!!!»
//
// Y el motor SÍ lo servía. Comprobado contra la API desplegada, no leyendo el
// repo: `GET /alimentos` devuelve
// `Suplementos comerciales / Omega-3 -> Pets Purest Aceite de Salmón Escocés`.
// La app también lo pedía. Lo que fallaba es lo de en medio.
//
// ⚠️ LA CAUSA, Y ES LA REGLA 6 EN SU FORMA MÁS FINA: `CATEGORIAS_ALIMENTO` es
// una variable de MÓDULO que se reasigna dentro del `.then` de la petición, y
// eso no es estado de React -- así que **no vuelve a pintar nada**. Lo que se
// ve es lo que hubiera en el momento de renderizar, y con Render dormido (~30 s
// en despertar) eso es SIEMPRE el respaldo, que no tiene ese aceite.
//
// O sea: la app no pintaba su respaldo porque no preguntara, sino porque la
// respuesta llegaba DESPUÉS de pintar. Las dos puntas que ya vigilan la regla 6
// no pueden ver esto: el BLOQUE 99 comprueba que el motor sirva la lista y
// `la-ley-del-motor.spec.js` que esté declarada, y las dos eran ciertas.
//
// ⚠️ SE SIEMBRA UN NOMBRE INVENTADO, que es lo único que distingue «la app lo
// ha leído del motor» de «la app está pintando su respaldo»: con el nombre de
// verdad las dos cosas se ven idénticas en pantalla, y esta prueba pasaría en
// verde con la petición entera comentada.
import { test, expect } from "@playwright/test";
import { CUENTA_DE_PRUEBA } from "./fake-supabase.js";
import { irAlGenerador } from "./ayudas.js";

const SUPABASE_FALSO = "http://127.0.0.1:54321";

async function configurarBackend(request, opciones) {
  const res = await request.post(`${SUPABASE_FALSO}/__control`, { data: opciones });
  expect(res.ok()).toBeTruthy();
}

// ⚠️ Y HAY QUE HACER QUE `/alimentos` LLEGUE TARDE, O ESTA PRUEBA NO PRUEBA NADA.
//
// Comprobado: con el arreglo QUITADO la prueba pasaba igual, porque el backend
// de mentira contesta al instante y para cuando se pinta la lista la variable
// de módulo ya estaba puesta. El fallo de Elena ocurre con Render DORMIDO, que
// tarda ~30 s en despertar: ahí la respuesta llega mucho después de pintar.
//
// Así que se retrasa a mano. Es la única forma de que el rojo aparezca, y sin
// ella esto sería un guardia inerte -- peor que no tenerlo, porque parece que
// alguien mira.
const LO_QUE_TARDA_RENDER_EN_DESPERTAR_MS = 2500;

async function elMotorContestaTarde(page) {
  await page.route("**/alimentos", async (route) => {
    await new Promise((r) => setTimeout(r, LO_QUE_TARDA_RENDER_EN_DESPERTAR_MS));
    await route.continue();
  });
}

async function generarMenu(page) {
  await elMotorContestaTarde(page);
  await page.goto("/");
  await page.getByPlaceholder("Email").fill(CUENTA_DE_PRUEBA.email);
  await page.getByPlaceholder("Contraseña").fill(CUENTA_DE_PRUEBA.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await irAlGenerador(page);
  await page.getByRole("button", { name: "Pienso" }).click();
  await page.getByRole("button", { name: /Automático/ }).click();
  await page.getByRole("button", { name: /Generar/i }).first().click();
  await expect(page.getByText(/SEMANA DE/i)).toBeVisible({ timeout: 30_000 });
}

// El nombre no existe en ningún catálogo ni en ningún respaldo. Si aparece en
// pantalla es porque viene de `GET /alimentos`.
const INVENTADO = "Zzyrax Aceite de Krill Antártico";

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
      grupos: { Pollo: [{ nombre: "Muslo de pollo sin piel", kcal_100g: 120,
                          categoria_del_motor: "Carne muscular" }] },
    },
    {
      clave: "Suplementos comerciales",
      dueno: { titulo: "Suplementos", ejemplo: "aceite de salmón" },
      la_elige_el_usuario: false,
      categorias_del_motor: ["Omega-3"],
      grupos: { "Omega-3": [{ nombre: INVENTADO, kcal_100g: 900,
                              categoria_del_motor: "Omega-3" }] },
    },
  ],
};

test.describe("los suplementos de Personalizar salen del motor", () => {
  test("el aceite que sirve el motor aparece en la lista, aunque llegue tarde", async ({ page, request }) => {
    await configurarBackend(request, { premium: true, catalogo: CATALOGO_SEMBRADO });
    await generarMenu(page);

    // La lista de suplementos de la vista del menú. Se abre como lo abre quien
    // usa la app: por el texto del botón.
    await page.getByRole("button", { name: /Añadir suplemento/i }).first().click();

    // ⚠️ No hay que abrir «Omega-3»: `ListaDeEspecies` pinta el PRODUCTO cuando
    // el grupo tiene uno solo, y el grupo sembrado tiene uno. Buscar el nombre
    // del grupo aquí hacía que la prueba se colgara esperando algo que la app
    // nunca pinta -- y eso es un rojo que no habla del motor, que es justo lo
    // que este repo tiene escrito que no puede pasar.

    await expect(page.getByText(INVENTADO),
      `«${INVENTADO}» lo sirve el motor en /alimentos y no sale en la lista. Si no está, la ` +
      `app está pintando CATEGORIAS_ALIMENTO_RESPALDO: la lista del motor llega después de ` +
      `pintar y reasignar una variable de módulo no repinta nada. Ver useAlimentos() en ` +
      `vocabulario.js`).toBeVisible();
  });
});

// ─── Y LA OTRA PANTALLA, QUE ES LA QUE ELENA NOMBRÓ ──────────────────────────
//
// ⚠️ ESTA MITAD SE AÑADIÓ AL FUSIONAR (19 de septiembre de 2026), leyendo el
// arreglo antes de meterlo. `useAlimentos()` obliga a repintar -- eso es
// correcto y necesario -- pero en la pantalla de Personalizar el árbol no se
// calcula al pintar: sale de
//
//     const categoriasDisponibles = useMemo(
//       () => filtrarCategoriasPorEspecies(CATEGORIAS_ALIMENTO, especiesExcluidas),
//       [especiesExcluidas]);
//
// y un `useMemo` cuyas dependencias no han cambiado **devuelve el valor viejo
// aunque el componente se vuelva a pintar**. O sea que repintar no basta ahí:
// el árbol seguiría siendo el del respaldo.
//
// Las dos pantallas no se ven igual desde fuera, así que hacen falta las dos
// pruebas. La de arriba mira «Añadir suplemento» dentro del menú ya hecho, que
// es donde `SelectorAlimentos` cae a `CATEGORIAS_ALIMENTO` y se recalcula al
// pintar. Ésta mira la pantalla donde se eligen los alimentos ANTES de generar,
// que es la que va por el memo.
const CARNE_INVENTADA = "Zzyrax Solomillo de Quimera";

test.describe("el catálogo de Personalizar sale del motor", () => {
  test("el alimento que sirve el motor se puede elegir, aunque llegue tarde",
    async ({ page, request }) => {
      const sembrado = JSON.parse(JSON.stringify(CATALOGO_SEMBRADO));
      sembrado.pantallas[0].grupos = {
        Quimera: [{ nombre: CARNE_INVENTADA, kcal_100g: 120,
                    categoria_del_motor: "Carne muscular" }],
      };
      await configurarBackend(request, { premium: true, catalogo: sembrado });
      await elMotorContestaTarde(page);
      await page.goto("/");
      await page.getByPlaceholder("Email").fill(CUENTA_DE_PRUEBA.email);
      await page.getByPlaceholder("Contraseña").fill(CUENTA_DE_PRUEBA.password);
      await page.getByRole("button", { name: "Entrar" }).click();
      await irAlGenerador(page);
      // «Personalizar» está deshabilitado hasta contestar de qué viene el perro.
      await page.getByRole("button", { name: "Pienso" }).click();
      await page.getByRole("button", { name: /^Personalizar/ }).click();
      await page.getByRole("button", { name: /Elegir los ingredientes/i }).click();
      // Y se pone la categoría en «Manual», que es lo que abre la lista de
      // alimentos elegibles. Sin esto la pantalla solo enseña los ocho títulos.
      await page.getByRole("button", { name: "Carne muscular: elijo yo" }).click();
      await page.getByRole("button", { name: "Carne muscular: elegir alimento" }).click();

      await expect(page.getByText(CARNE_INVENTADA),
        `«${CARNE_INVENTADA}» lo sirve el motor en /alimentos y no se puede elegir en ` +
        `Personalizar. Repintar no basta aquí: «categoriasDisponibles» es un useMemo cuyas ` +
        `dependencias no cambian cuando llega la lista, así que devuelve el árbol del ` +
        `RESPALDO aunque el componente se vuelva a pintar`)
        .toBeVisible({ timeout: 15_000 });
    });
});
