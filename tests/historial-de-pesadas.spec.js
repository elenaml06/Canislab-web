// ─── EL HISTORIAL DE PESADAS ────────────────────────────────────────────────
//
// ⚠️ POR QUÉ EXISTE (13 de septiembre de 2026). Hasta ese día NO SE GUARDABA NI
// UNA PESADA: `perros.peso_actual` se sobrescribía y la pantalla «Evolución y
// crecimiento» dibujaba la curva esperada con UN SOLO punto real -- el de hoy
// -- aunque llevaras un año pesándolo. Prometía una serie que no existía.
//
// Y no es una pantalla bonita: SACN5 cap.17 pide reevaluar peso y condición
// corporal «at least every two weeks», y dice que eso da «more immediate
// feedback about optimal nutritional status than using body weights based on
// estimated adult size». O sea que pone esto POR ENCIMA de estimar el peso
// adulto, que era lo único que teníamos. Con dos o más puntos, el peso adulto
// de un cachorro sale de SU trayectoria y no de la tabla de razas -- que es lo
// que hacen WALTHAM y MyVetDiet.
//
// SE MIRA LO GUARDADO, no la pantalla. Es la regla de CLAUDE.md: la ficha se
// pinta del estado local, así que puede verse perfecta y estar guardada vacía.
// Una prueba que mirara el «✅ Peso actualizado» aprobaría el fallo entero --
// que es literalmente lo que pasó en agosto con este mismo botón.
import { test, expect } from "@playwright/test";
import { CUENTA_DE_PRUEBA, PERRO_DE_PRUEBA } from "./fake-supabase.js";
import { esperarLaFicha } from "./ayudas.js";

const SUPABASE_FALSO = process.env.SUPABASE_FALSO || "http://127.0.0.1:54321";

const configurar = async (request, opciones) => {
  const res = await request.post(`${SUPABASE_FALSO}/__control`, { data: opciones });
  expect(res.ok()).toBeTruthy();
  return res.json();
};
const leer = async (request) => {
  const res = await request.post(`${SUPABASE_FALSO}/__control`, { data: {} });
  expect(res.ok()).toBeTruthy();
  return res.json();
};
const entrar = async (page) => {
  await page.goto("/");
  await page.getByPlaceholder("Email").fill(CUENTA_DE_PRUEBA.email);
  await page.getByPlaceholder("Contraseña").fill(CUENTA_DE_PRUEBA.password);
  await page.getByRole("button", { name: "Entrar" }).click();
};
const abrirMenuLateral = (page) =>
  page.getByRole("button", { name: "Menú", exact: true }).click();

test.describe("el historial de pesadas", () => {
  test("pesar al perro GUARDA la pesada, no solo el peso de hoy", async ({ page, request }) => {
    await configurar(request, { perros: [PERRO_DE_PRUEBA], menus: [], premium: true });
    await entrar(page);
    await esperarLaFicha(page);

    await abrirMenuLateral(page);
    await page.getByRole("button", { name: /Evolución y crecimiento/ }).click();
    await page.getByRole("spinbutton").first().fill("26.3");
    await page.getByRole("button", { name: "Guardar", exact: true }).click();

    await expect.poll(async () => (await leer(request)).pesos.length,
      { message: "pesar al perro no ha guardado ninguna pesada. El peso de hoy se sobrescribe y " +
                 "no queda rastro: la curva de crecimiento se queda con un punto para siempre" })
      .toBeGreaterThan(0);

    const { pesos } = await leer(request);
    const ultima = pesos[pesos.length - 1];
    expect(Number(ultima.peso_kg), "la pesada guardada no es la que se escribió").toBe(26.3);
    expect(ultima.perro_id,
      "la pesada se ha guardado en otro perro. Eso no se ve en pantalla y ensucia la curva de " +
      "un animal que no es").toBe(PERRO_DE_PRUEBA.id);
    expect(ultima.fecha, "la pesada no lleva fecha, y sin fecha no hay curva").toBeTruthy();
  });

  // ⚠️ UNA POR PERRO Y DÍA. Sin esto, tocar el peso tres veces seguidas mete
  // tres puntos del mismo día y la curva sale con escalones que no son del
  // perro. En Supabase lo resuelve el índice único de `migracion-pesos.sql`; la
  // app tiene que estar pidiéndolo con el `on_conflict` correcto, y eso solo se
  // ve mirando lo guardado.
  test("pesar dos veces el mismo día deja UNA pesada, la última", async ({ page, request }) => {
    await configurar(request, { perros: [PERRO_DE_PRUEBA], menus: [], premium: true });
    await entrar(page);
    await esperarLaFicha(page);
    await abrirMenuLateral(page);
    await page.getByRole("button", { name: /Evolución y crecimiento/ }).click();

    for (const kg of ["25.0", "25.4", "25.9"]) {
      await page.getByRole("spinbutton").first().fill(kg);
      await page.getByRole("button", { name: "Guardar", exact: true }).click();
      await page.waitForTimeout(150);
    }

    await expect.poll(async () => {
      const { pesos } = await leer(request);
      return pesos.filter((p) => p.perro_id === PERRO_DE_PRUEBA.id).length;
    }, { message: "tres pesadas del mismo día en la curva. El upsert no está pisando la fila del " +
                  "día, y la gráfica sale con escalones que no son del perro" })
      .toBe(1);

    const { pesos } = await leer(request);
    expect(Number(pesos[0].peso_kg), "se ha quedado la primera pesada del día y no la última")
      .toBe(25.9);
  });

  // Y que la gráfica pinte lo GUARDADO y no solo el peso de hoy. Se siembran
  // pesadas viejas: si la pantalla siguiera con el punto único, esto no saldría.
  test("la gráfica de crecimiento pinta las pesadas guardadas", async ({ page, request }) => {
    // ⚠️ UN CACHORRO, y no el perro de prueba. La gráfica de «Evolución y
    // crecimiento» son los DOCE PRIMEROS MESES de vida: con un adulto de
    // cuatro años no hay ningún punto real que pintar, ni antes ni después de
    // este cambio, así que la prueba no distinguiría nada.
    const hace = (dias) => new Date(Date.now() - dias * 86400000).toISOString().slice(0, 10);
    const CACHORRO = { ...PERRO_DE_PRUEBA, fecha_nacimiento: hace(240), peso_kg: undefined,
                       peso_actual: 23.6, etapa: "cachorro_crecimiento" };
    await configurar(request, {
      perros: [CACHORRO], menus: [], premium: true,
      pesos: [
        { id: "p1", perro_id: PERRO_DE_PRUEBA.id, fecha: hace(90), peso_kg: 21.1, bcs: 5 },
        { id: "p2", perro_id: PERRO_DE_PRUEBA.id, fecha: hace(60), peso_kg: 22.4, bcs: 5 },
        { id: "p3", perro_id: PERRO_DE_PRUEBA.id, fecha: hace(30), peso_kg: 23.6, bcs: 5 },
      ],
    });
    await entrar(page);
    await esperarLaFicha(page);
    await abrirMenuLateral(page);
    await page.getByRole("button", { name: /Evolución y crecimiento/ }).click();

    // La app tiene que haber PEDIDO el historial. Sin esto, la gráfica se
    // pinta con el punto único y nadie se entera: se ve una línea igual.
    await expect.poll(async () => {
      const { pesos } = await leer(request);
      return pesos.length;
    }, { message: "las pesadas sembradas no están" }).toBe(3);

    // Y la curva tiene que tener MÁS de un punto rosa. `connectNulls` une los
    // que haya, así que con un solo punto no hay segmento que dibujar.
    const puntos = page.locator("svg .recharts-line-dot");
    await expect.poll(async () => puntos.count(),
      { message: "la gráfica sigue pintando un solo punto real: no está leyendo el historial" })
      .toBeGreaterThan(1);
  });
});
