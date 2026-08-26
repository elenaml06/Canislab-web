// ─── La compra, desde el panel lateral ───────────────────────────────────────
//
// POR QUÉ ESTÁ AQUÍ Y NO SOLO AL FINAL DEL MENÚ
// La lista de la compra no se mira al generar el menú: se mira EN LA TIENDA,
// dos días después. Estando solo dentro del menú había que volver a entrar
// en el menú para verla, y desde el perfil o desde Mis menús no se llegaba.
//
// LO QUE PUEDE ROMPERSE EN SILENCIO, que es lo que vigilan estas pruebas:
//
//   · Que sume solo el perro que tengas abierto. La app ya tiene cargados
//     los menús del perro actual (`menusGuardados`) y era lo cómodo de
//     usar; con dos perros eso da media compra, y media compra no se
//     distingue de una compra a simple vista.
//   · Que un menú guardado SIN los días de cada tanda cuente como un día.
//     Los primeros menús que se guardaron no llevaban `dias`. Sin ellos la
//     compra sale corta, y corta parece correcta.
//
// Ninguna de las dos da error. Por eso las dos miran NÚMEROS.

import { test, expect } from "@playwright/test";
import { CUENTA_DE_PRUEBA, PERRO_DE_PRUEBA, SEGUNDO_PERRO_DE_PRUEBA } from "./fake-supabase.js";
import { esperarLaFicha, irAlGenerador } from "./ayudas.js";

const SUPABASE_FALSO = "http://127.0.0.1:54321";

const configurar = async (request, opciones) => {
  const res = await request.post(`${SUPABASE_FALSO}/__control`, { data: opciones });
  expect(res.ok()).toBeTruthy();
  return res.json();
};

const menuGuardado = (perroId, menusData, extra = {}) => ({
  id: `menu-${perroId}-${(extra.created_at || "").slice(0, 10) || "x"}`,
  user_id: CUENTA_DE_PRUEBA.userId,
  perro_id: perroId,
  modo: "automatico",
  der_real: 1211,
  etapa_label: "Adulto",
  num_menus: menusData.length,
  nombre: null,
  created_at: "2026-08-01T10:00:00.000Z",
  menus_data: menusData,
  ...extra,
});

async function entrar(page) {
  await page.getByPlaceholder("Email").fill(CUENTA_DE_PRUEBA.email);
  await page.getByPlaceholder("Contraseña").fill(CUENTA_DE_PRUEBA.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await esperarLaFicha(page);
}

async function elegirEnCategoria(page, categoria, especie, alimento) {
  await page.getByRole("button", { name: `${categoria}: elijo yo` }).click();
  await page.getByRole("button", { name: `${categoria}: elegir alimento` }).click();
  await page.getByRole("button", { name: new RegExp(`^${especie}`) }).first().click();
  await page.getByRole("button", { name: alimento, exact: true }).click();
  await expect(page.getByText(alimento, { exact: true }).first()).toBeVisible();
}

const abrirLaCompra = async (page) => {
  await page.getByRole("button", { name: "Menú", exact: true }).click();
  await page.getByRole("button", { name: "La compra", exact: true }).click();
};

test.describe("la compra desde el panel", () => {
  test("sin nada que comprar, la entrada sigue estando y lo EXPLICA", async ({ page, request }) => {
    // ⚠️ CAMBIADO (24 agosto). Antes esta entrada se escondía cuando no
    // había menús: "el botón sería una promesa vacía". Pero el panel tiene
    // que ser EL MISMO en todas las pantallas y en todo momento -- pedido
    // expreso, después de que el panel cambiara según dónde estuvieras.
    //
    // Un panel que cambia de contenido es peor que una entrada que abre
    // una pantalla que explica que todavía no hay nada. Lo que NO puede
    // pasar es que abra una pantalla en blanco, y eso es lo que se
    // comprueba aquí.
    await configurar(request, {
      retrasoPerrosMs: 50, perros: [PERRO_DE_PRUEBA], menus: [], olvidarUltimoMenu: true,
    });
    await page.goto("/");
    await entrar(page);
    await abrirLaCompra(page);

    await expect(page.getByText(/Todavía no hay ningún menú guardado/)).toBeVisible();
  });

  test("suma el último menú de TODOS los perros, no solo el abierto", async ({ page, request }) => {
    // Éste es el fallo fácil de cometer: tirar de `menusGuardados`, que
    // solo tiene los del perro actual. Con dos perros daría media compra.
    await configurar(request, {
      retrasoPerrosMs: 50,
      perros: [PERRO_DE_PRUEBA, SEGUNDO_PERRO_DE_PRUEBA],
      menus: [
        menuGuardado(PERRO_DE_PRUEBA.id, [{ menu: { Conejo: 100 }, dias: 7 }]),
        menuGuardado(SEGUNDO_PERRO_DE_PRUEBA.id, [{ menu: { Conejo: 50 }, dias: 7 }]),
      ],
      olvidarUltimoMenu: true,
    });
    await page.goto("/");
    await entrar(page);
    await abrirLaCompra(page);

    // (100 + 50) x 7 = 1050 g. Con un solo perro serían 700 g.
    await expect(page.getByText("1,1 kg")).toBeVisible();
  });

  test("se puede ver la de un perro solo", async ({ page, request }) => {
    await configurar(request, {
      retrasoPerrosMs: 50,
      perros: [PERRO_DE_PRUEBA, SEGUNDO_PERRO_DE_PRUEBA],
      menus: [
        menuGuardado(PERRO_DE_PRUEBA.id, [{ menu: { Conejo: 100 }, dias: 7 }]),
        menuGuardado(SEGUNDO_PERRO_DE_PRUEBA.id, [{ menu: { Conejo: 50 }, dias: 7 }]),
      ],
      olvidarUltimoMenu: true,
    });
    await page.goto("/");
    await entrar(page);
    await abrirLaCompra(page);

    await page.getByRole("button", { name: SEGUNDO_PERRO_DE_PRUEBA.nombre, exact: true }).click();
    // Solo Cairo: 50 x 7 = 350 g.
    await expect(page.getByText("350 g")).toBeVisible();
  });

  test("tiene hamburguesa y burbuja, como todas las demás", async ({ page, request }) => {
    // ⚠️ CASO REAL: "en la pantalla de la compra no aparece la hamburguesa
    // del menú lateral ni lo del perfil". Se quedó fuera porque no es una
    // sección del menú: es una pantalla propia, con su propia cabecera.
    await configurar(request, {
      retrasoPerrosMs: 50, perros: [PERRO_DE_PRUEBA],
      menus: [menuGuardado(PERRO_DE_PRUEBA.id, [{ menu: { Conejo: 100 }, dias: 7 }])],
      olvidarUltimoMenu: true,
    });
    await page.goto("/");
    await entrar(page);
    await abrirLaCompra(page);

    await expect(page.getByRole("button", { name: /Perro actual/ }).last()).toBeVisible();
    await expect(page.getByRole("button", { name: "Ajustes" }).last()).toBeVisible();

    // Y la hamburguesa abre el panel de verdad, no es un dibujo.
    await page.getByRole("button", { name: "Menú", exact: true }).last().click();
    await expect(page.getByRole("dialog", { name: "Panel lateral" })).toBeVisible();
  });

  test("con un perro no se pregunta de quién: sobra", async ({ page, request }) => {
    await configurar(request, {
      retrasoPerrosMs: 50, perros: [PERRO_DE_PRUEBA],
      menus: [menuGuardado(PERRO_DE_PRUEBA.id, [{ menu: { Conejo: 100 }, dias: 7 }])],
      olvidarUltimoMenu: true,
    });
    await page.goto("/");
    await entrar(page);
    await abrirLaCompra(page);

    await expect(page.getByText("700 g")).toBeVisible();
    await expect(page.getByRole("button", { name: "Toda la casa" })).toHaveCount(0);
  });

  test("un menú guardado SIN días cuenta la semana, no un día", async ({ page, request }) => {
    // Los primeros menús que se guardaron no llevaban `dias`. Si se dan por
    // un día, la compra sale corta -- y corta parece correcta.
    await configurar(request, {
      retrasoPerrosMs: 50, perros: [PERRO_DE_PRUEBA],
      menus: [menuGuardado(PERRO_DE_PRUEBA.id, [
        { menu: { Conejo: 100 } },          // sin dias
        { menu: { Conejo: 100 } },          // sin dias
      ])],
      olvidarUltimoMenu: true,
    });
    await page.goto("/");
    await entrar(page);
    await abrirLaCompra(page);

    // Dos menús se reparten la semana: 4 + 3 días. 100 x 7 = 700 g.
    // Contándolos por un día darían 200 g.
    await expect(page.getByText("700 g")).toBeVisible();
  });
});

test.describe("qué menú y para cuánto", () => {
  // ⚠️ REHECHO (24 agosto) — CASO REAL: "no debería poner para 3 días, 1
  // semana, y multiplicar por 7 días, porque hay menús que pone que se den
  // 3 días y otro 4 — entonces si cocinas para 1 semana uno de 3 días
  // tienes para más de dos".
  //
  // Tenía razón, y era un fallo de CONCEPTO. La cesta salía de una semana y
  // todo se escalaba por dias/7. Con los menús juntos eso vale. Mirando UN
  // menú de 3 días, "1 semana" no significa nada.
  //
  // Ahora: juntos → semanas; uno solo → tandas de ESE menú, y cada opción
  // dice cuántos DÍAS DE COMIDA da.
  const DOS_MENUS = [
    { menu: { Conejo: 100, "Solo del 1": 10 }, dias: 4 },
    { menu: { Conejo: 200, "Solo del 2": 20 }, dias: 3 },
  ];

  test.beforeEach(async ({ request }) => {
    await configurar(request, {
      retrasoPerrosMs: 50, perros: [PERRO_DE_PRUEBA],
      menus: [menuGuardado(PERRO_DE_PRUEBA.id, DOS_MENUS)],
      olvidarUltimoMenu: true,
    });
  });

  test("por defecto, todos juntos y la semana entera", async ({ page }) => {
    await page.goto("/");
    await entrar(page);
    await abrirLaCompra(page);
    const compra = page.getByRole("dialog", { name: "La compra" });

    // 100x4 + 200x3 = 1000 g de conejo.
    await expect(compra.getByText("1 kg")).toBeVisible();
    await expect(compra.getByText(/7 días de comida/)).toBeVisible();
  });

  test("se puede ver UN menú solo, con sus días", async ({ page }) => {
    await page.goto("/");
    await entrar(page);
    await abrirLaCompra(page);
    const compra = page.getByRole("dialog", { name: "La compra" });

    await compra.getByRole("button", { name: /^Menú 1 · 4 días/ }).click();

    // Solo el menú 1: 100 x 4 = 400 g. Y su alimento propio, no el del otro.
    await expect(compra.getByText("400 g")).toBeVisible();
    await expect(compra.getByText("Solo del 1")).toBeVisible();
    await expect(compra.getByText("Solo del 2")).toHaveCount(0);
  });

  test("con un menú solo, las opciones son TANDAS y dicen los días", async ({ page }) => {
    // Aquí está el fallo que ella describió: "1 semana" de un menú de 3
    // días no se entiende. Ahora pone "2 tandas · 6 días".
    await page.goto("/");
    await entrar(page);
    await abrirLaCompra(page);
    const compra = page.getByRole("dialog", { name: "La compra" });

    await compra.getByRole("button", { name: /^Menú 2 · 3 días/ }).click();

    await expect(compra.getByRole("button", { name: "1 tanda · 3 días" })).toBeVisible();
    await expect(compra.getByRole("button", { name: "2 tandas · 6 días" })).toBeVisible();
    // Y NO se ofrece "1 semana", que es lo que no significaba nada.
    await expect(compra.getByRole("button", { name: /semana/ })).toHaveCount(0);
  });

  test("dos tandas de un menú de 3 días son el doble, y 6 días", async ({ page }) => {
    await page.goto("/");
    await entrar(page);
    await abrirLaCompra(page);
    const compra = page.getByRole("dialog", { name: "La compra" });

    await compra.getByRole("button", { name: /^Menú 2 · 3 días/ }).click();
    // Menú 2 solo: 200 x 3 = 600 g.
    await expect(compra.getByText("600 g")).toBeVisible();

    await compra.getByRole("button", { name: "2 tandas · 6 días" }).click();
    await expect(compra.getByText("1,2 kg")).toBeVisible();
    await expect(compra.getByText(/6 días de comida/)).toBeVisible();
  });

  test("juntos, las opciones son SEMANAS", async ({ page }) => {
    await page.goto("/");
    await entrar(page);
    await abrirLaCompra(page);
    const compra = page.getByRole("dialog", { name: "La compra" });

    await expect(compra.getByRole("button", { name: "2 semanas" })).toBeVisible();
    await compra.getByRole("button", { name: "2 semanas" }).click();
    await expect(compra.getByText("2 kg")).toBeVisible();
    await expect(compra.getByText(/14 días de comida/)).toBeVisible();
  });
});

test.describe("marcar lo que ya tienes", () => {
  // PEDIDO EXPRESO: "molaría que tuviera casillas de marcaje, como para
  // saber cuándo has comprado algo o lo tienes y cuándo te falta, y luego un
  // botón para regenerar y dejarlo todo a cero. Esto tiene que ser user
  // friendly".
  test.beforeEach(async ({ request }) => {
    await configurar(request, {
      retrasoPerrosMs: 50, perros: [PERRO_DE_PRUEBA],
      menus: [menuGuardado(PERRO_DE_PRUEBA.id, [{ menu: { Conejo: 100, Zanahoria: 20 }, dias: 7 }])],
      olvidarUltimoMenu: true,
    });
  });

  test("se marca y se desmarca tocando la línea entera", async ({ page }) => {
    await page.goto("/");
    await entrar(page);
    await abrirLaCompra(page);
    const compra = page.getByRole("dialog", { name: "La compra" });

    const conejo = compra.getByRole("button", { name: /^Conejo:/ });
    await expect(conejo).toHaveAttribute("aria-pressed", "false");
    await conejo.click();
    await expect(conejo).toHaveAttribute("aria-pressed", "true");
    await conejo.click();
    await expect(conejo).toHaveAttribute("aria-pressed", "false");
  });

  test("lo marcado sobrevive a cerrar la app", async ({ page }) => {
    // Esto se usa de pie en una tienda: te llaman, cierras, vuelves. Si lo
    // marcado viviera solo en memoria se perdería justo cuando hace falta.
    await page.goto("/");
    await entrar(page);
    await abrirLaCompra(page);
    await page.getByRole("dialog", { name: "La compra" })
              .getByRole("button", { name: /^Conejo:/ }).click();

    // Cerrar y volver a abrir NO es volver a entrar: la sesión sigue viva,
    // así que tras recargar no hay pantalla de login que rellenar. Esperar
    // aquí el formulario era esperar algo que no llega nunca.
    await page.reload();
    await esperarLaFicha(page);
    await abrirLaCompra(page);

    await expect(page.getByRole("dialog", { name: "La compra" })
                     .getByRole("button", { name: /^Conejo:/ }),
      "lo marcado se ha perdido al recargar").toHaveAttribute("aria-pressed", "true");
  });

  test("el botón de empezar de cero desmarca todo, y solo sale si hay algo", async ({ page }) => {
    await page.goto("/");
    await entrar(page);
    await abrirLaCompra(page);
    const compra = page.getByRole("dialog", { name: "La compra" });

    // Sin nada marcado no se ofrece: un botón de borrar siempre visible se
    // pulsa sin querer.
    await expect(compra.getByRole("button", { name: /Empezar de cero/ })).toHaveCount(0);

    await compra.getByRole("button", { name: /^Conejo:/ }).click();
    await compra.getByRole("button", { name: /^Zanahoria:/ }).click();
    await expect(compra.getByRole("button", { name: /Empezar de cero \(2 marcados\)/ })).toBeVisible();

    await compra.getByRole("button", { name: /Empezar de cero/ }).click();
    await expect(compra.getByRole("button", { name: /^Conejo:/ })).toHaveAttribute("aria-pressed", "false");
    await expect(compra.getByRole("button", { name: /Empezar de cero/ })).toHaveCount(0);
  });
});

test.describe("con varios menús en la semana", () => {
  // ⚠️ CASO REAL (24 agosto): "la compra está mal, porque he hecho dos
  // menús personalizados para la semana y solo me pone la compra de lo que
  // tiene uno".
  //
  // Hasta ahora los dos menús de mentira eran IDÉNTICOS, así que sumar los
  // dos o sumar uno dos veces daba lo mismo y las pruebas pasaban en los
  // dos casos. Con `menusDistintos` cada menú trae un alimento propio: si
  // falta uno, se ve.
  test("los DOS menús están en la compra, no solo el primero", async ({ page, request }) => {
    await configurar(request, {
      retrasoPerrosMs: 50,
      perros: [{ ...PERRO_DE_PRUEBA, dieta_actual: "barf" }],
      menus: [], olvidarUltimoMenu: true, menusDistintos: true,
    });
    await page.goto("/");
    await entrar(page);
    await irAlGenerador(page);
    await page.getByRole("button", { name: /^Personalizar/ }).click();
    await page.getByRole("button", { name: "+", exact: true }).click();   // dos menús
    await page.getByRole("button", { name: /^(Elegir los ingredientes|Personalizar los)/ }).click();

    await elegirEnCategoria(page, "Carne muscular", "Conejo", "Conejo");
    await page.getByRole("button", { name: /Siguiente: Menú 2/ }).click();
    await elegirEnCategoria(page, "Carne muscular", "Pollo", "Pollo muslo con piel");
    await page.getByRole("button", { name: /Generar los menús/ }).click();

    await page.getByRole("button", { name: /Perro actual/ }).waitFor({ timeout: 40000 });

    await abrirLaCompra(page);

    // Acotado a la pantalla de la compra: el nombre del alimento también
    // sale en el menú de detrás, y sin acotar la prueba mide otra cosa.
    const compra = page.getByRole("dialog", { name: "La compra" });
    await expect(compra.getByText("Marcador de prueba 1")).toBeVisible();
    await expect(compra.getByText("Marcador de prueba 2"),
      "falta el segundo menú: la compra solo ha sumado uno").toBeVisible();
  });

  test("y también cuando vienen de lo GUARDADO", async ({ page, request }) => {
    // El otro camino: no estás mirando ningún menú, así que la compra sale
    // de la última fila guardada -- que lleva los dos menús dentro.
    await configurar(request, {
      retrasoPerrosMs: 50, perros: [PERRO_DE_PRUEBA],
      menus: [menuGuardado(PERRO_DE_PRUEBA.id, [
        { menu: { Conejo: 100, "Solo del menú 1": 50 }, dias: 4 },
        { menu: { Conejo: 100, "Solo del menú 2": 50 }, dias: 3 },
      ])],
      olvidarUltimoMenu: true,
    });
    await page.goto("/");
    await entrar(page);
    await abrirLaCompra(page);

    const compra = page.getByRole("dialog", { name: "La compra" });
    await expect(compra.getByText("Solo del menú 1")).toBeVisible();
    await expect(compra.getByText("Solo del menú 2"),
      "falta el segundo menú guardado").toBeVisible();
    // Y el conejo son los 7 días, no los 4 del primero.
    await expect(compra.getByText("700 g")).toBeVisible();
  });
});

test.describe("si editas un alimento, la compra se entera", () => {
  // ⚠️ FALLO ENCONTRADO (24 agosto) buscando por qué "la compra está mal".
  //
  // Al editar un alimento, el servidor recalcula el menú ENTERO y el
  // resultado se guardaba SOLO dentro de VistaMenus (`gramosRealesPorMenu`).
  // Fuera, `menuReal` seguía con el menú de antes -- y de ahí sale la lista
  // de la compra. O sea: editabas, la pantalla te enseñaba lo nuevo, y la
  // compra te mandaba a comprar lo VIEJO. Sin error y sin nada que lo
  // delatara: los números eran correctos, del menú equivocado.
  test("lo editado sale en la compra, no el menú de antes", async ({ page, request }) => {
    await configurar(request, {
      retrasoPerrosMs: 50,
      perros: [{ ...PERRO_DE_PRUEBA, dieta_actual: "barf" }],
      menus: [], olvidarUltimoMenu: true, menusDistintos: true,
    });
    await page.goto("/");
    await entrar(page);
    await irAlGenerador(page);
    await page.getByRole("button", { name: /^Automático/ }).click();
    await page.getByRole("button", { name: /^(Generar|Hacer)/ }).click();
    await page.getByRole("button", { name: /Perro actual/ }).waitFor();

    // Editar un alimento cualquiera: el de mentira devuelve un menú con
    // "Marcador tras editar" dentro.
    await page.getByRole("button", { name: /^Cambiar / }).first().click();
    await page.getByRole("button", { name: "Verduras y frutas", exact: true }).click();
    await page.getByRole("button", { name: /^Calabacín/ }).first().click();
    await expect(page.getByText("Marcador tras editar").first()).toBeVisible({ timeout: 20000 });

    await abrirLaCompra(page);
    const compra = page.getByRole("dialog", { name: "La compra" });
    await expect(compra.getByText("Marcador tras editar"),
      "la compra se ha quedado con el menú de ANTES de editar").toBeVisible();
  });

  test("los menús con nombre salen con SU NOMBRE en la compra", async ({ page, request }) => {
    // ⚠️ CASO REAL — pedido expreso (26 agosto): "dentro de la compra, donde
    // aparecen los nombres de los menús que pone menú uno o menú tres días,
    // ahí tiene que aparecer el nombre de cada menú si lo tiene".
    //
    // No era cambiar un texto: el nombre NO LLEGABA hasta aquí. `compraGuardada`
    // se arma en tres ramas (los menús de varios perros en pantalla, el menú
    // recién hecho del perro abierto, y el último guardado leído de la base de
    // datos) y ninguna arrastraba más que los gramos y los días. La etiqueta se
    // construía con el número porque era lo único que había.
    //
    // Se comprueba EN LA COMPRA a propósito, no en la pantalla del menú: ahí
    // el nombre ya se veía de antes, así que una prueba allí pasaría en verde
    // con este fallo puesto.
    await configurar(request, {
      perros: [PERRO_DE_PRUEBA],
      menus: [menuGuardado(PERRO_DE_PRUEBA.id, [
        { menu: { "Carne muscular de pollo": 400 }, dias: 4, nombre: "El de pollo" },
        { menu: { "Carne muscular de ternera": 380 }, dias: 3 },
      ])],
      olvidarUltimoMenu: true,
    });
    await page.goto("/");
    await entrar(page);
    await abrirLaCompra(page);
    const compra = page.getByRole("dialog", { name: "La compra" });

    // El que tiene nombre, con su nombre y sus días.
    await expect(compra.getByRole("button", { name: /^El de pollo · 4 días/ })).toBeVisible();
    // Y el que NO lo tiene sigue con el número: el respaldo no puede perderse
    // por el camino, o los menús sin renombrar se quedarían sin etiqueta.
    await expect(compra.getByRole("button", { name: /^Menú 2 · 3 días/ })).toBeVisible();
  });
});
