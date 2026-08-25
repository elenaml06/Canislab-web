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
  await page.getByRole("button", { name: /Hacer el menú de la semana/ }).waitFor();
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

test.describe("para cuántos días", () => {
  // PEDIDO EXPRESO: "y para cuántos días". Nadie compra siempre para siete:
  // se preparan tandas de tres días para la nevera o de dos semanas para
  // congelar. La cesta sale de una SEMANA, así que lo demás se escala en
  // proporción -- y eso es aritmética, o sea que se comprueba con números.
  test.beforeEach(async ({ request }) => {
    await configurar(request, {
      retrasoPerrosMs: 50, perros: [PERRO_DE_PRUEBA],
      menus: [menuGuardado(PERRO_DE_PRUEBA.id, [{ menu: { Conejo: 100 }, dias: 7 }])],
      olvidarUltimoMenu: true,
    });
  });

  test("por defecto, la semana", async ({ page }) => {
    await page.goto("/");
    await entrar(page);
    await abrirLaCompra(page);
    await expect(page.getByText("700 g")).toBeVisible();
  });

  test("dos semanas es el doble", async ({ page }) => {
    await page.goto("/");
    await entrar(page);
    await abrirLaCompra(page);
    await page.getByRole("button", { name: "2 semanas" }).click();
    await expect(page.getByText("1,4 kg")).toBeVisible();
  });

  test("tres días es menos, no lo mismo", async ({ page }) => {
    // Que el selector se pinte no basta: si no multiplicara, el número
    // seguiría siendo 700 g y la pantalla se vería idéntica de correcta.
    await page.goto("/");
    await entrar(page);
    await abrirLaCompra(page);
    await page.getByRole("button", { name: "3 días" }).click();
    await expect(page.getByText("300 g")).toBeVisible();
    await expect(page.getByText("700 g")).toHaveCount(0);
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
    await page.getByRole("button", { name: /Hacer el menú de la semana/ }).click();
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
    await page.getByRole("button", { name: /Hacer el menú de la semana/ }).click();
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
});
