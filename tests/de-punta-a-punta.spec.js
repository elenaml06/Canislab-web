// ─── De punta a punta, con la API DE VERDAD ──────────────────────────────────
//
// POR QUÉ ESTA PRUEBA ES DISTINTA DE LAS OTRAS 30 (28 de agosto)
//
// Las otras hablan con `servidor-fake.js`, y hacen bien: comprueban qué hace
// la app ante una respuesta concreta, y para eso el falso es mejor. Pero
// **ninguna prueba contra un servidor falso puede cazar un desacuerdo entre la
// app y el servidor**, porque en la prueba el servidor lo escribe el mismo
// lado que la app. Los dos fallos más caros que hemos tenido son justo eso:
//
//   · el DER calculado dos veces (aquí y en `der.py`), dando números distintos
//   · el peso de referencia sacado de donde no debía
//
// Los dos salieron VERDES en las pruebas de los dos lados, porque cada lado
// era coherente consigo mismo. Un menú hecho con las kcal equivocadas no es un
// menú roto: es un menú impecable **para otro perro**. No deja rastro en el
// resultado, solo en la costura.
//
// Así que esto no comprueba «¿cumple el menú?» -- de eso ya se encarga la
// batería del otro repo, y `_garantizar_verificado()` no deja salir uno que no
// cumpla. Comprueba **que las dos mitades hablan del mismo perro**.
//
//     npx playwright test --config playwright.real.config.js
//
// PARA COMPROBAR QUE ESTA PRUEBA SIRVE (hazlo si la tocas): pon en la API un
// `peso_objetivo_kg = None` a la fuerza dentro de `_peso_de_referencia`, o
// cambia un coeficiente de `der.js`. Tiene que ponerse roja. Si sigue verde
// con el fallo puesto, no está vigilando nada.

import { test, expect } from "@playwright/test";
import { CUENTA_DE_PRUEBA, PERRO_DE_PRUEBA } from "./fake-supabase.js";
import { irAlGenerador } from "./ayudas.js";

const SUPABASE_FALSO = "http://127.0.0.1:54322";
const API_REAL = "http://127.0.0.1:8012";

const configurar = async (request, opciones) => {
  const res = await request.post(`${SUPABASE_FALSO}/__control`, { data: opciones });
  expect(res.ok()).toBeTruthy();
  return res.json();
};

// Se apunta todo lo que cruza la costura, para poder mirarlo después.
function espiarLaCostura(page) {
  const idas = [];
  const vueltas = [];
  page.on("request", (r) => {
    if (!r.url().includes("/menu/")) return;
    let cuerpo = null;
    try { cuerpo = JSON.parse(r.postData() || "null"); } catch { /* no era JSON */ }
    idas.push({ url: r.url(), cuerpo });
  });
  page.on("response", async (r) => {
    if (!r.url().includes("/menu/")) return;
    try { vueltas.push({ url: r.url(), estado: r.status(), cuerpo: await r.json() }); }
    catch { vueltas.push({ url: r.url(), estado: r.status(), cuerpo: null }); }
  });
  return { idas, vueltas };
}

async function entrarYGenerar(page) {
  await page.getByPlaceholder("Email").fill(CUENTA_DE_PRUEBA.email);
  await page.getByPlaceholder("Contraseña").fill(CUENTA_DE_PRUEBA.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await irAlGenerador(page);
  await page.getByRole("button", { name: /^Automático/ }).click();
  await page.getByRole("button", { name: /^(Generar|Hacer)/ }).click();
  await expect(page.getByText(/Semana de/)).toBeVisible();
}

test.describe("de punta a punta contra la API de verdad", () => {
  test.beforeEach(async ({ request }) => {
    await configurar(request, {
      retrasoPerrosMs: 50,
      perros: [{ ...PERRO_DE_PRUEBA, dieta_actual: "barf" }],
      menus: [], olvidarUltimoMenu: true,
    });
  });

  test("la API real devuelve un menú, y es del perro que pide la app", async ({ page }) => {
    const { idas, vueltas } = espiarLaCostura(page);
    await page.goto("/");
    await entrarYGenerar(page);

    const ida = idas.find((x) => x.url.includes("/menu/v2"));
    const vuelta = vueltas.find((x) => x.url.includes("/menu/v2"));
    expect(ida, "la app no ha llamado a /menu/v2").toBeTruthy();
    expect(vuelta && vuelta.estado, "la API real no ha contestado 200").toBe(200);

    // ── 1. EL MENÚ ES DE VERDAD, no un eco del falso ────────────────────
    const menu = vuelta.cuerpo;
    expect(Object.keys(menu.gramos || menu.menu || {}).length,
      "la API ha devuelto un menú vacío").toBeGreaterThan(0);

    // ── 2. LA COSTURA DEL PESO ──────────────────────────────────────────
    // El servidor dice sobre qué peso ha medido y de qué peldaño salió. Tiene
    // que ser el que la app quería decir. Este es el fallo de "una línea
    // sacaba el peso de donde no debía": el número solo es plausible, el
    // peldaño es comprobable.
    const pref = menu.peso_de_referencia;
    expect(pref, "la respuesta no dice sobre qué peso ha medido").toBeTruthy();
    const loQueQueriaLaApp = ida.cuerpo.peso_objetivo_kg ?? ida.cuerpo.peso_perro_kg;
    expect(pref.kg, "el servidor ha medido sobre un peso que la app no mandó")
      .toBeCloseTo(loQueQueriaLaApp, 2);
    expect(["declarado", "derivado_del_bcs", "peso_real_sin_objetivo"])
      .toContain(pref.procedencia);
    // Y la DER efectiva sale de ESE peso, no de otro.
    expect(pref.der_efectiva)
      .toBeCloseTo(ida.cuerpo.der_objetivo / Math.pow(pref.kg, 0.75), 0);

    // ── 3. LA COSTURA DE LAS KCAL ───────────────────────────────────────
    // Lo que se ve en pantalla y lo que recibió el motor tienen que ser el
    // mismo número. Este es el fallo del DER duplicado: la usuaria leía unas
    // kcal y el motor cumplía los requisitos sobre otras, sin dar error.
    const enPantalla = await page.getByText(/kcal \/ día/i).first()
      .locator("xpath=..").innerText();
    const numero = Number((enPantalla.match(/[\d.]+/g) || []).join("").replace(/\./g, ""));
    expect(numero, `la pantalla dice ${numero} kcal y el motor recibió ${ida.cuerpo.der_objetivo}`)
      .toBeCloseTo(Math.round(ida.cuerpo.der_objetivo), -1);
  });

  test("quitar un alimento rehace el menú en el motor de verdad", async ({ page }) => {
    const { idas, vueltas } = espiarLaCostura(page);
    await page.goto("/");
    await entrarYGenerar(page);

    const antes = vueltas.find((x) => x.url.includes("/menu/v2")).cuerpo;
    const gramosAntes = antes.gramos || antes.menu || {};
    const aQuitar = Object.keys(gramosAntes)[0];

    await page.getByRole("button", { name: `Quitar ${aQuitar}` }).click();
    await page.getByRole("button", { name: `Confirmar quitar ${aQuitar}` }).click();

    await expect.poll(() => vueltas.filter((x) => x.url.includes("/menu/quitar")).length,
      { message: "la app no ha llamado a /menu/quitar" }).toBeGreaterThan(0);
    const rehecho = vueltas.filter((x) => x.url.includes("/menu/quitar")).pop();
    expect(rehecho.estado).toBe(200);

    // El alimento se fue de verdad -- y el menú siguió existiendo, que es lo
    // que separa "lo ha quitado" de "se ha quedado sin menú y no lo dice".
    const gramosDespues = rehecho.cuerpo.gramos || rehecho.cuerpo.menu || {};
    expect(Object.keys(gramosDespues)).not.toContain(aQuitar);
    expect(Object.keys(gramosDespues).length).toBeGreaterThan(0);

    // Y se pidió quitar EL QUE ERA: mirando la pantalla no se distingue.
    const peticion = idas.filter((x) => x.url.includes("/menu/quitar")).pop();
    expect(JSON.stringify(peticion.cuerpo)).toContain(aQuitar);
  });

  // ⚠️ ESTA PRUEBA EXISTE POR UN AGUJERO QUE ENCONTRÉ SABOTEANDO LA DE ARRIBA,
  // Y AL ESCRIBIRLA SALIÓ ALGO QUE NO SABÍAMOS.
  //
  // `_peso_de_referencia` tiene TRES peldaños: `declarado`, `derivado_del_bcs`
  // y `peso_real_sin_objetivo`. Rompí el tercero a propósito para ver si la
  // prueba de arriba lo cazaba, y siguió verde: esa prueba solo cruza el
  // primero.
  //
  // Y buscando un perro que cruzara los otros dos, resultó que **no existe**:
  // la app manda SIEMPRE `peso_objetivo_kg` -- también cuando el perro no
  // tiene condición corporal puesta, porque `objetivoVigente` cae al peso de
  // hoy. Así que desde la app solo se pisa el peldaño `declarado`; los otros
  // dos solo los alcanza quien llame a la API directamente.
  //
  // Eso no es un fallo, pero conviene que esté escrito y vigilado: el día que
  // la app deje de mandar el objetivo, el servidor tiene que caer al peldaño
  // que toca **y decirlo**, no callarse. Por eso esto se comprueba de dos
  // maneras: la de la app por el navegador, y las otras dos llamando a la API
  // a pelo, que es la única forma de pisarlas hoy.
  test("los tres peldaños del peso dicen de dónde salieron", async ({ page, request }) => {
    // (a) Por la app: hoy siempre es `declarado`.
    const { idas, vueltas } = espiarLaCostura(page);
    await page.goto("/");
    await entrarYGenerar(page);
    const ida = idas.find((x) => x.url.includes("/menu/v2"));
    const menu = vueltas.find((x) => x.url.includes("/menu/v2")).cuerpo;
    expect(ida.cuerpo.peso_objetivo_kg,
      "la app ha dejado de mandar el peso objetivo: revisa que el servidor " +
      "cae al peldaño que toca y que la densidad se mide sobre el peso bueno")
      .toBeTruthy();
    expect(menu.peso_de_referencia.procedencia).toBe("declarado");

    // (b) A pelo contra la API real, los otros dos peldaños y los dos bordes
    // donde AAHA no cubre (BCS 9 y BCS por debajo de 5), que tienen que caer
    // al peso real en vez de inventar un objetivo.
    const base = { nombres_alimentos: [], der_objetivo: 900,
                   etapa_requisitos: "Adulto", peso_perro_kg: 30 };
    const casos = [
      [{ ...base, peso_objetivo_kg: 25 }, "declarado", 25],
      [{ ...base, bcs: 7 },               "derivado_del_bcs", 24],
      [{ ...base },                       "peso_real_sin_objetivo", 30],
      [{ ...base, bcs: 9 },               "peso_real_sin_objetivo", 30],
      [{ ...base, bcs: 4 },               "peso_real_sin_objetivo", 30],
    ];
    for (const [cuerpo, peldano, kg] of casos) {
      const res = await request.post(`${API_REAL}/menu/v2`, { data: cuerpo, timeout: 120000 });
      expect(res.ok()).toBeTruthy();
      const pref = (await res.json()).peso_de_referencia;
      expect(pref.procedencia, `bcs=${cuerpo.bcs} objetivo=${cuerpo.peso_objetivo_kg}`)
        .toBe(peldano);
      expect(pref.kg).toBeCloseTo(kg, 2);
    }
  });
});
