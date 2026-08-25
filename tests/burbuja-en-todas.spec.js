// ─── La burbuja está en TODAS las pantallas ──────────────────────────────────
//
// CASO REAL (24 agosto): "la burbuja de perfiles de perro y configuración
// tiene que existir en todas las pantallas, y en todas las pantallas del
// menú lateral no aparecen. Tiene que estar en todas."
//
// Cierto: la burbuja se puso en las pantallas principales, pero las que se
// abren DESDE el panel lateral (Perfil, Evolución, Mis menús, Analizar, Por
// qué Rawku) tienen su propia cabecera y se quedaron sin ella. Entrabas en
// Evolución y ya no sabías de qué perro estabas viendo la evolución, ni
// podías cambiar sin volver atrás.
//
// POR QUÉ ESTA PRUEBA RECORRE LA LISTA EN VEZ DE MIRAR UNA PANTALLA
// Porque el fallo no es de una pantalla: es de que son SEIS cabeceras
// distintas copiadas, y el día que se añada la séptima nadie se acordará.
// Esto lee las entradas del panel y las abre TODAS, sean las que sean. Una
// pantalla nueva sin burbuja rompe esta prueba el primer día.

import { test, expect } from "@playwright/test";
import { CUENTA_DE_PRUEBA, PERRO_DE_PRUEBA, SEGUNDO_PERRO_DE_PRUEBA } from "./fake-supabase.js";

const SUPABASE_FALSO = "http://127.0.0.1:54321";

const configurar = async (request, opciones) => {
  const res = await request.post(`${SUPABASE_FALSO}/__control`, { data: opciones });
  expect(res.ok()).toBeTruthy();
  return res.json();
};

async function entrarYGenerar(page) {
  await page.getByPlaceholder("Email").fill(CUENTA_DE_PRUEBA.email);
  await page.getByPlaceholder("Contraseña").fill(CUENTA_DE_PRUEBA.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.getByRole("button", { name: /Hacer el menú de la semana/ }).click();
  await page.getByRole("button", { name: /^Automático/ }).click();
  await page.getByRole("button", { name: /^(Generar|Hacer)/ }).click();
  // Ya en la pantalla del menú.
  await page.getByRole("button", { name: /Perro actual/ }).waitFor();
}

// ⚠️ UNA SOLA burbuja (24 agosto). Antes eran dos botones pegados: el
// perro y un engranaje aparte. Pedido expreso: "NO QUIERO DOS, QUIERO UNA
// SOLA BURBUJITA PARA CONFIGURACIÓN Y LOS PERROS". Los ajustes viven ahora
// dentro de la hoja que abre la burbuja.
const laBurbuja = (page) => page.getByRole("button", { name: /Perro actual/ });

// Las pantallas que abre el panel del menú. Va escrita a mano Y contrastada
// con lo que el panel tiene de verdad (última prueba): si alguien añade una
// entrada nueva y no la mete aquí, la prueba se cae y le obliga a mirar si
// su pantalla tiene burbuja. Escribirla sola no valía: el bucle se enredaba
// con las pantallas que se abren encima.
const PANTALLAS_DEL_PANEL = [
  // ⚠️ "El menú de la semana" NO va aquí: no es una sección, es volver a la
  // pantalla de debajo. Se añadió al panel el 24 de agosto porque al quitar
  // los "← Volver" de estas pantallas había que poder salir de ellas por
  // algún sitio, y el sitio es el panel -- pedido expreso: "para algo hay
  // una pestaña de menú para elegir a dónde te quieres mover".
  "Perfil de Nala",
  "Evolución y crecimiento",
  "Mis menús",
  "Analizar la dieta actual",
  "Por qué Rawku",
];

test.describe("la burbuja y el engranaje, en todas", () => {
  test("en todas las pantallas que abre el panel lateral", async ({ page, request }) => {
    // Un solo perro: con dos, llegar al menú pide contestar antes qué come
    // cada uno, y eso no es lo que se está probando aquí.
    await configurar(request, {
      retrasoPerrosMs: 50,
      perros: [{ ...PERRO_DE_PRUEBA, dieta_actual: "barf" }],
      menus: [], olvidarUltimoMenu: true,
    });
    await page.goto("/");
    await entrarYGenerar(page);

    for (const etiqueta of PANTALLAS_DEL_PANEL) {
      await page.getByRole("button", { name: "Menú", exact: true }).last().click();
      await page.getByRole("dialog", { name: "Panel lateral" })
                .getByRole("button", { name: etiqueta, exact: true }).click();

      // ⚠️ NO vale con mirar que EXISTA una burbuja. La pantalla de debajo
      // sigue en el DOM detrás de la sección, con la suya, y Playwright la
      // encuentra igual: quitando la burbuja de las seis cabeceras, esta
      // prueba seguía pasando. Comprobado.
      //
      // Así que se comprueba que FUNCIONA: se toca y tiene que abrirse la
      // hoja de perros. Si la única burbuja está detrás de la sección, el
      // toque no llega y esto se cae, que es lo que tiene que pasar.
      await laBurbuja(page).last().click({ timeout: 5000 });
      const hoja = page.getByRole("dialog", { name: "Tus perros" });
      await expect(hoja, `la burbuja de «${etiqueta}» no abre nada`).toBeVisible();
      // Y los ajustes están AHÍ DENTRO, que es lo que hace que baste una
      // sola burbuja.
      await expect(hoja.getByRole("button", { name: "Ajustes", exact: true }),
                   `en «${etiqueta}» la hoja no lleva los ajustes`).toBeVisible();
      await hoja.getByRole("button", { name: "Cerrar" }).click();
      await expect(hoja).toHaveCount(0);

      // ⚠️ Para salir se usa el PANEL, no un "← Volver": esas pantallas ya
      // no lo tienen. Pedido expreso -- "para algo hay una pestaña de menú
      // para elegir a dónde te quieres mover". Si el panel dejara de tener
      // salida, esto se cae, que es exactamente lo que hay que vigilar:
      // sin volver Y sin salida en el panel, te quedas encerrada.
      await page.getByRole("button", { name: "Menú", exact: true }).last().click();
      await page.getByRole("dialog", { name: "Panel lateral" })
                .getByRole("button", { name: "El menú de la semana", exact: true }).click();
    }
  });

  test("y el panel no tiene ninguna pantalla que esta prueba no mire", async ({ page, request }) => {
    // El fallo no fue de una pantalla: fue de que son SEIS cabeceras
    // copiadas y nadie se acordó de la séptima. Esto obliga a acordarse.
    await configurar(request, {
      retrasoPerrosMs: 50,
      perros: [{ ...PERRO_DE_PRUEBA, dieta_actual: "barf" }],
      menus: [], olvidarUltimoMenu: true,
    });
    await page.goto("/");
    await entrarYGenerar(page);

    await page.getByRole("button", { name: "Menú", exact: true }).click();
    const etiquetas = (await page.getByRole("dialog", { name: "Panel lateral" })
                                 .getByRole("button").allInnerTexts())
      .map((t) => t.trim().split("\n")[0].trim())
      .filter(Boolean);

    // "La compra" se comprueba en compra-en-el-panel.spec.js: abre una
    // pantalla propia, no una sección de ésta.
    const sinCubrir = etiquetas.filter(
      (t) => !PANTALLAS_DEL_PANEL.includes(t) && t !== "La compra"
             && t !== "Cerrar sesión" && t !== "El menú de la semana");

    expect(sinCubrir,
      `El panel tiene entradas que la prueba de la burbuja no mira: ${JSON.stringify(sinCubrir)}. ` +
      `Si has añadido una pantalla, añádela a PANTALLAS_DEL_PANEL y comprueba que lleva burbuja.`)
      .toEqual([]);
  });

  test("y siempre en la misma esquina, no en medio", async ({ page, request }) => {
    // ⚠️ CASO REAL: "se ve raro lo del engranaje y el perfil en varias
    // pantallas, se ve como arriba centrado, debería estar siempre en el
    // mismo sitio".
    //
    // La regla de toda la app es: hamburguesa IZQUIERDA, burbuja DERECHA.
    // Al meter el "← Volver" como tercer hijo del `justify-between`, el
    // reparto dejaba la burbuja en medio. Se veía, funcionaba, y estaba
    // mal puesta -- ninguna prueba de "existe" lo iba a cazar.
    //
    // Por eso esto mide POSICIONES, no presencia: la burbuja tiene que
    // estar a la derecha de la hamburguesa y pegada al borde derecho.
    await configurar(request, {
      retrasoPerrosMs: 50,
      perros: [{ ...PERRO_DE_PRUEBA, dieta_actual: "barf" }],
      menus: [], olvidarUltimoMenu: true,
    });
    await page.goto("/");
    await entrarYGenerar(page);

    const ancho = page.viewportSize().width;

    for (const etiqueta of PANTALLAS_DEL_PANEL) {
      await page.getByRole("button", { name: "Menú", exact: true }).last().click();
      await page.getByRole("dialog", { name: "Panel lateral" })
                .getByRole("button", { name: etiqueta, exact: true }).click();

      // ⚠️ TODAS las burbujas, no `.last()`. La pantalla de debajo sigue
      // en el DOM con la suya BIEN puesta, así que mirar una sola podía
      // medir la de abajo y dar por buena la de arriba estando en medio.
      // Comprobado: con esa versión, el sabotaje pasaba.
      const cuantas = await laBurbuja(page).count();
      expect(cuantas, `no hay ninguna burbuja en «${etiqueta}»`).toBeGreaterThan(0);

      for (let i = 0; i < cuantas; i++) {
        const caja = await laBurbuja(page).nth(i).boundingBox();
        if (!caja) continue;   // fuera de pantalla
        const distanciaAlBorde = ancho - (caja.x + caja.width);
        expect(distanciaAlBorde,
          `en «${etiqueta}» hay una burbuja a ${Math.round(distanciaAlBorde)}px del borde ` +
          `derecho (pantalla de ${ancho}px): se ha ido al centro`)
          .toBeLessThan(ancho / 3);
      }

      // ⚠️ Para salir se usa el PANEL, no un "← Volver": esas pantallas ya
      // no lo tienen. Pedido expreso -- "para algo hay una pestaña de menú
      // para elegir a dónde te quieres mover". Si el panel dejara de tener
      // salida, esto se cae, que es exactamente lo que hay que vigilar:
      // sin volver Y sin salida en el panel, te quedas encerrada.
      await page.getByRole("button", { name: "Menú", exact: true }).last().click();
      await page.getByRole("dialog", { name: "Panel lateral" })
                .getByRole("button", { name: "El menú de la semana", exact: true }).click();
    }
  });

  test("y desde ahí se puede cambiar de perro sin volver atrás", async ({ page, request }) => {
    // Que se VEA no basta: la burbuja está para poder cambiar. Si estuviera
    // pintada pero muerta, la prueba de arriba pasaría igual.
    //
    // Va por el OTRO camino a propósito: Evolución abierta desde el perfil,
    // que es una llamada distinta a VistaMenus y también se había quedado
    // sin burbuja.
    await configurar(request, {
      retrasoPerrosMs: 50,
      perros: [{ ...PERRO_DE_PRUEBA, dieta_actual: "barf" }, SEGUNDO_PERRO_DE_PRUEBA],
      menus: [], olvidarUltimoMenu: true,
    });
    await page.goto("/");
    await page.getByPlaceholder("Email").fill(CUENTA_DE_PRUEBA.email);
    await page.getByPlaceholder("Contraseña").fill(CUENTA_DE_PRUEBA.password);
    await page.getByRole("button", { name: "Entrar" }).click();
    await page.getByRole("button", { name: /Hacer el menú de la semana/ }).waitFor();

    await page.getByRole("button", { name: "Menú", exact: true }).click();
    await page.getByRole("button", { name: "Evolución y crecimiento", exact: true }).click();

    await expect(laBurbuja(page).first()).toBeVisible();
    await laBurbuja(page).first().click();
    const hoja = page.getByRole("dialog", { name: "Tus perros" });
    await expect(hoja.getByRole("button", { name: SEGUNDO_PERRO_DE_PRUEBA.nombre, exact: true }))
      .toBeVisible();
  });
});

test.describe("la hoja de perros, según la pantalla", () => {
  // ⚠️ CASO REAL (24 agosto): "en el ordenador necesito que cuando se
  // despliega esté abajo en pequeñito".
  //
  // En el móvil una hoja a todo lo ancho es lo natural: ahí el ancho ES la
  // pantalla. En un monitor de 1200px la misma hoja son 1200px de blanco
  // para enseñar dos nombres.
  //
  // Esto mide ANCHOS y no busca clases: lo que importa es cómo se ve, y
  // una clase de Tailwind puede estar puesta y no aplicarse.
  const abrirLaHoja = async (page) => {
    await page.getByRole("button", { name: /Perro actual/ }).last().click();
    return page.getByRole("dialog", { name: "Tus perros" });
  };

  test.beforeEach(async ({ request }) => {
    await configurar(request, {
      retrasoPerrosMs: 50,
      perros: [{ ...PERRO_DE_PRUEBA, dieta_actual: "barf" }, SEGUNDO_PERRO_DE_PRUEBA],
      menus: [], olvidarUltimoMenu: true,
    });
  });

  test("en el ordenador es pequeña y va abajo a la derecha", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");
    await page.getByPlaceholder("Email").fill(CUENTA_DE_PRUEBA.email);
    await page.getByPlaceholder("Contraseña").fill(CUENTA_DE_PRUEBA.password);
    await page.getByRole("button", { name: "Entrar" }).click();
    await page.getByRole("button", { name: /Hacer el menú de la semana/ }).waitFor();

    const caja = await (await abrirLaHoja(page)).boundingBox();

    // Pequeña: menos de la mitad de la pantalla. Antes ocupaba los 1280.
    expect(caja.width, `la hoja mide ${Math.round(caja.width)}px de 1280: sigue a todo lo ancho`)
      .toBeLessThan(640);
    // Abajo: pegada al borde inferior.
    expect(800 - (caja.y + caja.height)).toBeLessThan(60);
    // Y a la derecha, que es donde está la burbuja que la abre.
    expect(1280 - (caja.x + caja.width)).toBeLessThan(60);
  });

  test("en el móvil sigue ocupando todo el ancho", async ({ page }) => {
    // Acotarla en el móvil sería el error contrario: ahí sobra el hueco.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await page.getByPlaceholder("Email").fill(CUENTA_DE_PRUEBA.email);
    await page.getByPlaceholder("Contraseña").fill(CUENTA_DE_PRUEBA.password);
    await page.getByRole("button", { name: "Entrar" }).click();
    await page.getByRole("button", { name: /Hacer el menú de la semana/ }).waitFor();

    const caja = await (await abrirLaHoja(page)).boundingBox();
    expect(caja.width, `la hoja mide ${Math.round(caja.width)}px de 390`).toBe(390);
  });
});
