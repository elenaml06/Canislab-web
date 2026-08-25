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
  "Perfil de Nala",
  "Evolución y crecimiento",
  "Mis menús",
  "Analizar la dieta actual",
  "Por qué Rawku",
];

// ⚠️ REHECHO (24 agosto) — CASO REAL: "el menú lateral está jodido, cuando
// me meto en evolución y crecimiento cambia el menú lateral. Luego, desde
// la compra no puedo moverme a algunas pantallas del menú lateral."
//
// Había DOS paneles: uno dentro de VistaMenus y otro fuera, cada uno con
// sus entradas y su orden. Ahora hay uno solo, y esta lista es la suya, en
// el orden que ella pidió. Si alguien la cambia, esta prueba se cae.
const ENTRADAS_DEL_PANEL = [
  "Perfil de Nala",
  "Mis menús",
  "Evolución y crecimiento",
  "La compra",
  "Analizar la dieta actual",
];

const abrirPanel = async (page) => {
  const panel = page.getByRole("dialog", { name: "Panel lateral" });
  // Si ya estaba abierto, volver a tocar la hamburguesa no hace nada y el
  // resto de la prueba espera a un panel que nunca "aparece".
  if (await panel.count()) return panel;
  await page.getByRole("button", { name: "Menú", exact: true }).last().click();
  await expect(panel).toBeVisible();
  return panel;
};

test.describe("el panel lateral es UNO y llega a todo", () => {
  test.beforeEach(async ({ request }) => {
    await configurar(request, {
      retrasoPerrosMs: 50,
      perros: [{ ...PERRO_DE_PRUEBA, dieta_actual: "barf" }],
      menus: [], olvidarUltimoMenu: true,
    });
  });

  test("las mismas entradas, en el mismo orden, en todas las pantallas", async ({ page }) => {
    // Lo que ella vio: el panel CAMBIABA al entrar en una sección. Esto lo
    // caza comparando la lista entera, no una entrada suelta.
    await page.goto("/");
    await entrarYGenerar(page);

    const leerEntradas = async () => {
      const panel = await abrirPanel(page);
      const todas = (await panel.getByRole("button").allInnerTexts())
        .map((t) => t.trim().split("\n")[0].trim()).filter(Boolean);
      // Solo las cinco de navegación: fuera el cierre, el premium, la
      // sesión y "Por qué Rawku", que va aparte y en pequeño.
      const suyas = todas.filter((t) => ENTRADAS_DEL_PANEL.includes(t));
      await panel.getByRole("button", { name: "Cerrar el menú" }).click();
      await expect(panel).toHaveCount(0);
      return suyas;
    };

    const enElMenu = await leerEntradas();
    expect(enElMenu, "el panel del menú no tiene las cinco en orden")
      .toEqual(ENTRADAS_DEL_PANEL);

    // Y ahora desde una sección, que es donde ella vio que cambiaba.
    await (await abrirPanel(page))
      .getByRole("button", { name: "Evolución y crecimiento", exact: true }).click();

    const enEvolucion = await leerEntradas();
    expect(enEvolucion, "el panel CAMBIA al entrar en Evolución")
      .toEqual(ENTRADAS_DEL_PANEL);
  });

  test("desde cada pantalla se llega a TODAS las demás", async ({ page }) => {
    // "Y desde todas se tiene que poder abrir todas las demás sin
    // problema".
    //
    // ⚠️ ESTA PRUEBA PASABA CON EL FALLO PUESTO, y por eso está reescrita.
    // Antes solo miraba que las cinco entradas ESTUVIERAN VISIBLES en el
    // panel. Y estaban: el panel era correcto. Lo que fallaba era lo que
    // pasaba AL PULSARLAS.
    //
    // Dos fallos distintos, los dos mudos:
    //   · Desde la compra no se movía a ningún sitio ("ni a nada de
    //     nadaaaa"). La navegación ocurría de verdad, pero la compra es
    //     una capa fija que no depende de `fase` y seguía tapando la
    //     pantalla nueva.
    //   · Desde Analizar no se podía ir a Evolución ni a Por qué Rawku:
    //     las dos viven en la misma vista, que se quedaba montada con la
    //     sección con la que se estrenó.
    //
    // En los dos casos el botón parecía muerto. Por eso ahora se PULSA y
    // se comprueba que HAS LLEGADO, con una señal propia de cada pantalla.
    await page.goto("/");
    await entrarYGenerar(page);

    // La señal de que estás en cada sitio, no de que el botón exista.
    const LLEGADA = {
      "Perfil de Nala": (p) => p.getByRole("button", { name: /Hacer el menú de la semana/ }),
      "Mis menús": (p) => p.getByText(/Los menús de/),
      "Evolución y crecimiento": (p) => p.getByText(/Evolución de Nala/),
      // Con premium sale el analizador; sin él, el muro. Las dos valen:
      // lo que se comprueba es haber llegado, no qué se puede hacer allí.
      "Analizar la dieta actual": (p) =>
        p.getByText(/Analizar la dieta actual|Analizador nutricional/).first(),
      "La compra": (p) => p.getByRole("dialog", { name: "La compra" }),
    };

    const irA = async (destino) => {
      await (await abrirPanel(page)).getByRole("button", { name: destino, exact: true }).click();
    };

    for (const desde of ENTRADAS_DEL_PANEL) {
      for (const hacia of ENTRADAS_DEL_PANEL) {
        if (hacia === desde) continue;
        await irA(desde);
        await expect(LLEGADA[desde](page), `no se llega a «${desde}» para empezar`).toBeVisible();

        await irA(hacia);
        await expect(LLEGADA[hacia](page),
          `desde «${desde}» se pulsa «${hacia}» y no pasa nada: sigues donde estabas`)
          .toBeVisible();

        // Y lo de antes tiene que haberse ido. Sin esto, salir de la compra
        // pasaba igual: la pantalla nueva se montaba DEBAJO y la lista de
        // la compra seguía encima, tapándola entera.
        if (desde === "La compra") {
          await expect(page.getByRole("dialog", { name: "La compra" }),
            `se ha ido a «${hacia}» pero la compra sigue tapando la pantalla`)
            .toHaveCount(0);
        }
      }
    }
  });
});

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
      //
      // ⚠️ CAMBIADO (25 agosto): antes se salía por "El menú de la semana",
      // una sexta entrada que ya no existe -- ella pidió cinco y esas
      // cinco. Se sale por el perfil, que es una de las cinco.
      await page.getByRole("button", { name: "Menú", exact: true }).last().click();
      await page.getByRole("dialog", { name: "Panel lateral" })
                .getByRole("button", { name: "Perfil de Nala", exact: true }).click();
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
             && t !== "Cerrar sesión");

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
      //
      // ⚠️ CAMBIADO (25 agosto): antes se salía por "El menú de la semana",
      // una sexta entrada que ya no existe -- ella pidió cinco y esas
      // cinco. Se sale por el perfil, que es una de las cinco.
      await page.getByRole("button", { name: "Menú", exact: true }).last().click();
      await page.getByRole("dialog", { name: "Panel lateral" })
                .getByRole("button", { name: "Perfil de Nala", exact: true }).click();
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
