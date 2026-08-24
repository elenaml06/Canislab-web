// ─── Varios perros por cuenta ────────────────────────────────────────────────
//
// QUÉ ESTABA ROTO
// La base de datos siempre ha admitido varios perros por cuenta (la tabla
// `perros` va por user_id, y los menús llevan su `perro_id`), pero la app
// cogía el primero y tiraba el resto:
//
//     const perro = perros && perros.length > 0 ? perros[0] : null;
//
// Quien tuviera dos perros sólo podía usar uno, y no había forma de crear
// el segundo ni de borrar uno creado por error.
//
// POR QUÉ ESTAS PRUEBAS Y NO OTRAS
// Cambiar de perro no es enseñar otro nombre: RawkuOnboardingInterna
// calcula perfil, menús, kcal y hasta la pantalla de arranque UNA SOLA VEZ,
// al montarse. Si el cambio no lo remonta, se queda mezclando datos de los
// dos perros -- que es justo el fallo que sería invisible mirando sólo la
// cabecera. Por eso las pruebas miran el PESO y los MENÚS, que son lo que
// se quedaría del perro anterior.
//
// El Supabase de mentira guarda los perros por id de verdad (antes POST y
// PATCH machacaban la lista entera): sin eso, "crear el segundo perro"
// habría pasado en verde borrando el primero.

import { test, expect } from "@playwright/test";
import { CUENTA_DE_PRUEBA, PERRO_DE_PRUEBA, SEGUNDO_PERRO_DE_PRUEBA } from "./fake-supabase.js";

const SUPABASE_FALSO = "http://127.0.0.1:54321";

async function configurarBackend(request, opciones) {
  const res = await request.post(`${SUPABASE_FALSO}/__control`, { data: opciones });
  expect(res.ok()).toBeTruthy();
  return res.json();
}

async function iniciarSesion(page) {
  await page.getByPlaceholder("Email").fill(CUENTA_DE_PRUEBA.email);
  await page.getByPlaceholder("Contraseña").fill(CUENTA_DE_PRUEBA.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.getByRole("button", { name: /Hacer el menú de la semana/ }).waitFor();
}

// Sin perro guardado no existe el botón "Hacer el menú de la semana": se
// aterriza en el paso 1 del asistente.
async function iniciarSesion2(page) {
  await page.getByPlaceholder("Email").fill(CUENTA_DE_PRUEBA.email);
  await page.getByPlaceholder("Contraseña").fill(CUENTA_DE_PRUEBA.password);
  await page.getByRole("button", { name: "Entrar" }).click();
}

const abrirMenuLateral = (page) => page.getByRole("button", { name: "Menú", exact: true }).click();

// El panel lateral. Hace falta acotar a él porque desde que el selector de
// perros también se ve EN LA FICHA (las pestañas de la cabecera), un
// "Cairo" suelto encuentra dos botones distintos.
const panel = (page) => page.getByRole("dialog", { name: "Panel lateral" });

// ⚠️ REESCRITO (24 agosto) — LOS PERROS SALIERON DEL PANEL LATERAL.
// Pedido expreso: "que cambiar de perro esté metido en una pestaña del
// panel es esconderlo; va como burbuja de perfil bien visible".
//
// Ahora se cambia desde la BURBUJA de la cabecera, que está en todas las
// pantallas. Antes había dos caminos y ninguno completo: unas pastillas
// que solo salían en la ficha del perro, y una fila plegada dentro del
// panel. Desde "Mis menús", por ejemplo, no se podía cambiar de perro sin
// abrir el panel -- lo decía el comentario de una de estas pruebas.
async function abrirHojaDePerros(page) {
  await page.getByRole("button", { name: /Cambiar de perro/ }).click();
  return page.getByRole("dialog", { name: "Tus perros" });
}

// Cambiar de perro en un toque desde donde estés.
async function cambiarDePerro(page, nombre) {
  const hoja = await abrirHojaDePerros(page);
  await hoja.getByRole("button", { name: nombre, exact: true }).click();
}

const menuDeEjemplo = (perroId, extra = {}) => ({
  id: `menu-de-${perroId}`,
  user_id: CUENTA_DE_PRUEBA.userId,
  perro_id: perroId,
  modo: "automatico",
  der_real: 1211,
  etapa_label: "Adulto",
  num_menus: 1,
  nombre: null,
  created_at: "2026-08-01T10:00:00.000Z",
  menus_data: [{ menu: { "Carne muscular de pollo": 420, "Hueso carnoso de pollo": 150 } }],
  ...extra,
});

// ⚠️ El recorrido para varios perros es EL MISMO que para uno: elegir
// para quién, contestar qué come CADA perro, elegir automático o
// personalizar, y cuántos menús. Antes había un atajo que se saltaba
// todo eso y por eso no se podía ni elegir ni editar nada.
async function generarParaLaCasa(page, { cuantos = 1, personalizar = false,
                                         nombres = [PERRO_DE_PRUEBA.nombre, SEGUNDO_PERRO_DE_PRUEBA.nombre] } = {}) {
  await page.getByRole("button", { name: /Los mismos alimentos para todos/ }).click();

  // qué come cada perro, por separado
  for (const nombre of nombres) {
    await page.getByRole("group", { name: `Qué come ${nombre}` })
              .getByRole("button", { name: "Pienso", exact: true }).click();
  }

  await page.getByRole("button", { name: personalizar ? /^Personalizar/ : /^Automático/ }).click();

  // ¿cuántos menús?
  for (let i = 1; i < cuantos; i++) await page.getByRole("button", { name: "+" }).click();
  await page.getByRole("button", { name: /^(Generar|Elegir los ingredientes|Personalizar los)/ }).click();

  if (personalizar) {
    await page.getByRole("button", { name: /^Generar (este menú|los menús)/ }).click();
  }
}

test.describe("varios perros por cuenta", () => {
  test.beforeEach(async ({ request }) => {
    await configurarBackend(request, {
      retrasoPerrosMs: 100,
      perros: [PERRO_DE_PRUEBA, SEGUNDO_PERRO_DE_PRUEBA],
      menus: [],
      olvidarUltimoMenu: true,
    });
  });

  test("con dos perros, los dos salen en la hoja de la burbuja", async ({ page }) => {
    await page.goto("/");
    await iniciarSesion(page);
    const hoja = await abrirHojaDePerros(page);

    await expect(hoja.getByRole("button", { name: PERRO_DE_PRUEBA.nombre, exact: true })).toBeVisible();
    await expect(hoja.getByRole("button", { name: SEGUNDO_PERRO_DE_PRUEBA.nombre, exact: true })).toBeVisible();
    await expect(hoja.getByRole("button", { name: /Añadir otro perro/ })).toBeVisible();
  });

  test("los perros YA NO están escondidos en el panel lateral", async ({ page }) => {
    // Esto es el punto entero: si vuelven al panel, esta prueba lo dice.
    await page.goto("/");
    await iniciarSesion(page);
    await abrirMenuLateral(page);
    await expect(panel(page).getByRole("button", { name: /\d+ perros/ })).toHaveCount(0);
  });

  // ⚠️ Esta prueba existe por un fallo de DISEÑO, no de código: cuando
  // cambiar de perro solo vivía dentro del panel lateral, tener varios
  // perros era una función invisible — si no sabías que estaba ahí, no
  // existía. Se pidió expresamente que se viera al entrar.
  test("con dos perros, se puede cambiar sin abrir ningún panel", async ({ page }) => {
    await page.goto("/");
    await iniciarSesion(page);

    // La burbuja dice de quién es la pantalla, sin tocar nada.
    await expect(page.getByRole("button", { name: new RegExp(`Perro actual: ${PERRO_DE_PRUEBA.nombre}`) }))
      .toBeVisible();

    await cambiarDePerro(page, SEGUNDO_PERRO_DE_PRUEBA.nombre);
    await expect(page.getByText(`${SEGUNDO_PERRO_DE_PRUEBA.peso_actual}kg`).first()).toBeVisible();
  });

  test("con un solo perro se invita a añadir otro, sin buscarlo", async ({ page, request }) => {
    await configurarBackend(request, { perros: [PERRO_DE_PRUEBA] });
    await page.goto("/");
    await iniciarSesion(page);

    await page.getByRole("button", { name: /¿Tienes más perros\?/ }).click();
    // lleva al asistente, con la ficha en blanco
    await expect(page.getByPlaceholder(/nombre/i).first()).toHaveValue("");
  });

  test("cambiar de perro cambia los datos, no sólo el nombre", async ({ page }) => {
    await page.goto("/");
    await iniciarSesion(page);

    // Arranca con el primero (el más antiguo).
    await expect(page.getByText(`${PERRO_DE_PRUEBA.peso_actual}kg`).first()).toBeVisible();

    await cambiarDePerro(page, SEGUNDO_PERRO_DE_PRUEBA.nombre);

    // Si el componente no se remontara, aquí seguiría el peso del primero
    // con el nombre del segundo -- exactamente el fallo que se busca.
    await expect(page.getByText(`${SEGUNDO_PERRO_DE_PRUEBA.peso_actual}kg`).first()).toBeVisible();
    await expect(page.getByText(`${PERRO_DE_PRUEBA.peso_actual}kg`)).toHaveCount(0);
  });

  test("cada perro ve sus menús, no los del otro", async ({ page, request }) => {
    await configurarBackend(request, {
      menus: [
        menuDeEjemplo(PERRO_DE_PRUEBA.id, { id: "menu-de-nala", nombre: "Menú de Nala" }),
        menuDeEjemplo(SEGUNDO_PERRO_DE_PRUEBA.id, { id: "menu-de-cairo", nombre: "Menú de Cairo" }),
      ],
    });
    await page.goto("/");
    await iniciarSesion(page);

    await abrirMenuLateral(page);
    await page.getByRole("button", { name: /Mis menús/ }).click();
    await expect(page.getByText("Menú de Nala")).toBeVisible();
    await expect(page.getByText("Menú de Cairo")).toHaveCount(0);

    // ⚠️ Aquí estaba el agujero que arregla la burbuja: desde "Mis menús"
    // NO había forma de cambiar de perro sin abrir el panel lateral, y
    // esta prueba lo decía en su propio comentario. Ahora la burbuja está
    // también en esta pantalla, así que se cambia igual que en cualquier
    // otra -- sin abrir nada.
    await cambiarDePerro(page, SEGUNDO_PERRO_DE_PRUEBA.nombre);

    await abrirMenuLateral(page);
    await page.getByRole("button", { name: /Mis menús/ }).click();
    await expect(page.getByText("Menú de Cairo")).toBeVisible();
    await expect(page.getByText("Menú de Nala")).toHaveCount(0);
  });

  test("se recuerda con qué perro se estaba al volver a entrar", async ({ page }) => {
    await page.goto("/");
    await iniciarSesion(page);
    await cambiarDePerro(page, SEGUNDO_PERRO_DE_PRUEBA.nombre);
    await expect(page.getByText(`${SEGUNDO_PERRO_DE_PRUEBA.peso_actual}kg`).first()).toBeVisible();

    await page.reload();

    // Sin esto, cada recarga te devolvía al primer perro de la lista:
    // desconcertante cuando el que usas a diario es el segundo.
    await expect(page.getByText(`${SEGUNDO_PERRO_DE_PRUEBA.peso_actual}kg`).first()).toBeVisible();
  });

  test("añadir otro perro no borra el que ya había", async ({ page, request }) => {
    await page.goto("/");
    await iniciarSesion(page);
    await abrirHojaDePerros(page);
    await page.getByRole("button", { name: /Añadir otro perro/ }).click();

    // Empieza el asistente desde cero, con la ficha en blanco.
    await expect(page.getByPlaceholder(/nombre/i).first()).toBeVisible();
    await expect(page.getByPlaceholder(/nombre/i).first()).toHaveValue("");

    // Los dos de antes siguen en la base de datos: crear el tercero no
    // puede pasar por encima de ellos (que es lo que hacía el Supabase
    // de mentira antes de arreglarlo, y lo que haría un PATCH sin id).
    const estado = await configurarBackend(request, {});
    expect(estado.perros).toBe(2);
    expect(estado.nombresDePerros).toEqual([PERRO_DE_PRUEBA.nombre, SEGUNDO_PERRO_DE_PRUEBA.nombre]);
  });

  test("borrar un perro se lleva sus menús y deja los del otro", async ({ page, request }) => {
    await configurarBackend(request, {
      menus: [
        menuDeEjemplo(PERRO_DE_PRUEBA.id, { id: "menu-de-nala" }),
        menuDeEjemplo(SEGUNDO_PERRO_DE_PRUEBA.id, { id: "menu-de-cairo" }),
      ],
    });
    await page.goto("/");
    await iniciarSesion(page);

    await page.getByRole("button", { name: new RegExp(`Borrar a ${PERRO_DE_PRUEBA.nombre}`) }).click();
    await page.getByRole("button", { name: "Sí, borrar" }).click();

    // Queda el otro perro, y la app se planta en él en vez de quedarse
    // mirando a un perro que ya no existe.
    await expect(page.getByText(`${SEGUNDO_PERRO_DE_PRUEBA.peso_actual}kg`).first()).toBeVisible();

    const estado = await configurarBackend(request, {});
    expect(estado.perros).toBe(1);
    expect(estado.nombresDePerros).toEqual([SEGUNDO_PERRO_DE_PRUEBA.nombre]);
    // ⚠️ Los menús del perro borrado tienen que irse con él: la tabla
    // `menus` no borra en cascada, así que si no los borra la app se
    // quedan huérfanos para siempre (lo documenta la migración
    // supabase/migracion-menus-perro-id.sql).
    expect(estado.menus).toBe(1);
  });

  test("borrar el último perro devuelve al asistente, no a una pantalla vacía", async ({ page, request }) => {
    await configurarBackend(request, { perros: [PERRO_DE_PRUEBA] });
    await page.goto("/");
    await iniciarSesion(page);

    await page.getByRole("button", { name: new RegExp(`Borrar a ${PERRO_DE_PRUEBA.nombre}`) }).click();
    await page.getByRole("button", { name: "Sí, borrar" }).click();

    await expect(page.getByPlaceholder(/nombre/i).first()).toBeVisible();
  });

  test("con un solo perro no aparece ningún selector, sólo 'añadir otro'", async ({ page, request }) => {
    await configurarBackend(request, { perros: [PERRO_DE_PRUEBA] });
    await page.goto("/");
    await iniciarSesion(page);

    // A quien tenga un perro la app no le da a elegir entre nada: la
    // burbuja dice de quién es la pantalla y punto.
    const burbuja = page.getByRole("button", { name: new RegExp(`Perro actual: ${PERRO_DE_PRUEBA.nombre}`) });
    await expect(burbuja).toBeVisible();
    await expect(burbuja).not.toHaveAttribute("aria-label", /Cambiar de perro/);

    // Pero añadir el segundo sí tiene que poder hacerse desde cualquier
    // pantalla, no solo desde la ficha: por eso la hoja se abre también
    // con un perro.
    await burbuja.click();
    await expect(page.getByRole("dialog", { name: "Tus perros" })
                     .getByRole("button", { name: /Añadir otro perro/ })).toBeVisible();
  });
});

// ─── Los menús de toda la casa ───────────────────────────────────────────────
//
// Pedido expreso: "que el usuario tenga la opción de hacer menús totalmente
// diferentes para cada perro, o generar los menús de todos lo más parecidos
// posibles — si cuadra cambiando solo las cantidades, perfecto, y si no, los
// menos cambios de alimento posibles".
//
// El reparto lo decide el motor (tiene sus propias pruebas en el backend).
// Lo que se vigila aquí es la parte de la app:
//   · que la opción se vea cuando hay más de un perro, y NO cuando hay uno;
//   · que cada menú se guarde en la ficha de SU perro y no en la del que
//     estabas mirando (un menú en el perro equivocado son cantidades
//     equivocadas para un animal de verdad);
//   · que si falla para todos, no te deje sin poder hacer el de uno.
test.describe("los menús de toda la casa", () => {
  test.beforeEach(async ({ request }) => {
    await configurarBackend(request, {
      retrasoPerrosMs: 100,
      perros: [PERRO_DE_PRUEBA, SEGUNDO_PERRO_DE_PRUEBA],
      menus: [], olvidarUltimoMenu: true,
      casaCompraUnica: true, casaFalla: false,
    });
  });

  const irAlGenerador = async (page) => {
    await page.getByRole("button", { name: /Hacer el menú de la semana/ }).click();
  };

  test("con un solo perro no se ofrece nada de la casa", async ({ page, request }) => {
    await configurarBackend(request, { perros: [PERRO_DE_PRUEBA] });
    await page.goto("/");
    await iniciarSesion(page);
    await irAlGenerador(page);

    await expect(page.getByText("¿Para quién?")).toHaveCount(0);
  });

  test("cuando cuadra, dice que la compra es una sola", async ({ page }) => {
    await page.goto("/");
    await iniciarSesion(page);
    await irAlGenerador(page);

    await generarParaLaCasa(page);

    await expect(page.getByText(/Una sola compra/)).toBeVisible();
    // los dos perros, con sus cantidades distintas
    await expect(page.getByText(PERRO_DE_PRUEBA.nombre).first()).toBeVisible();
    await expect(page.getByText(SEGUNDO_PERRO_DE_PRUEBA.nombre).first()).toBeVisible();
    // ⚠️ QUITADO (24 agosto) — pedido expreso: "no quiero que la compra
    // aparezca en el menú, tiene que estar solo en el menú lateral". Aquí
    // se comprueba justo lo contrario de antes: que NO esté.
    // Dónde sí está, en tests/compra-en-el-panel.spec.js.
    await expect(page.getByText("La compra de la semana")).toHaveCount(0);
  });

  // ⚠️ AÑADIDO (24 agosto) — CASO REAL: "este menú de personalizar me ha
  // metido 3 verduras, no debería... yo puse zanahoria y ha metido dos más".
  //
  // El motor ya avisa cuando tiene que añadir algo que no elegiste
  // (`aviso`) o cuando con lo tuyo no había menú posible
  // (`no_se_pudo_forzar`). Con UN perro eso sale en un cartel. En esta
  // pantalla, la de la casa, estaban puestos a null a mano: el aviso
  // llegaba del servidor y la pantalla se lo comía. O sea que con dos
  // perros el motor podía cambiarte lo elegido sin que nadie lo dijera.
  //
  // Es de la familia de fallos que no se ven: el menú sale, sale verde, y
  // lo único que falta es la frase que explica por qué no es lo que pediste.
  test("si hizo falta añadir algo que no elegiste, se dice", async ({ page, request }) => {
    await configurarBackend(request, { casaAvisos: true, casaCompraUnica: false });
    await page.goto("/");
    await iniciarSesion(page);
    await irAlGenerador(page);

    await generarParaLaCasa(page, { cuantos: 2 });

    await expect(page.getByText(/también se ha añadido: Sardina/)).toBeVisible();
  });

  test("si no se pudo con nada de lo elegido, se dice de quién", async ({ page, request }) => {
    await configurarBackend(request, { casaAvisos: true, casaCompraUnica: false });
    await page.goto("/");
    await iniciarSesion(page);
    await irAlGenerador(page);

    await generarParaLaCasa(page, { cuantos: 2 });

    // Con varios perros, "no se pudo" a secas no vale: hay que decir a
    // cuál de ellos le pasó.
    await expect(page.getByText(
      new RegExp(`no había una combinación viable para\\s*${SEGUNDO_PERRO_DE_PRUEBA.nombre}`))
    ).toBeVisible();
  });

  test("cuando NO cuadra, dice cuántos alimentos cambian", async ({ page, request }) => {
    await configurarBackend(request, { casaCompraUnica: false });
    await page.goto("/");
    await iniciarSesion(page);
    await irAlGenerador(page);

    await generarParaLaCasa(page);

    await expect(page.getByText(/1 alimento distinto en total/)).toBeVisible();
    // y se ve DE QUIÉN es lo que no comparten
    await expect(page.getByText("solo suyo").first()).toBeVisible();
  });

  test("cada menú se guarda en la ficha de su perro", async ({ page, request }) => {
    await page.goto("/");
    await iniciarSesion(page);
    await irAlGenerador(page);
    await generarParaLaCasa(page);
    await page.getByRole("button", { name: "Guardar los menús" }).click();
    await expect(page.getByRole("button", { name: /Guardado/ })).toBeVisible();

    // ⚠️ Lo importante de esta prueba: UN menú para CADA perro. Guardar
    // los dos en el perro que estabas mirando le daría a un perro las
    // cantidades del otro — comida de verdad, mal medida.
    //
    // ⚠️ Y se mira lo que hay GUARDADO, no la lista de la pantalla. La
    // primera versión miraba la pantalla y no servía: esa lista se
    // actualiza en local y no vuelve a preguntar, así que seguía
    // enseñando lo correcto aunque se hubiera guardado todo en el mismo
    // perro. Se comprobó rompiéndolo a propósito: pasaba en verde.
    const estado = await configurarBackend(request, {});
    expect(estado.menus).toBe(2);
    expect(estado.menusPorPerro).toEqual({
      [PERRO_DE_PRUEBA.id]: 1,
      [SEGUNDO_PERRO_DE_PRUEBA.id]: 1,
    });

    // y en la pantalla, cada perro ve el suyo
    await abrirMenuLateral(page);
    await page.getByRole("button", { name: /Mis menús/ }).click();
    await expect(page.getByText(`Menú de casa · ${PERRO_DE_PRUEBA.nombre}`)).toBeVisible();
    await expect(page.getByText(`Menú de casa · ${SEGUNDO_PERRO_DE_PRUEBA.nombre}`)).toHaveCount(0);
  });

  test("ya no se puede pedir el menú de uno solo teniendo dos", async ({ page }) => {
    // Pedido expreso: "creo que tendrías que quitar el de solo para Cairo
    // porque no tiene sentido — si metes otro perro es porque también
    // quieres hacerle un menú, si no, no lo meterías".
    //
    // Lo que queda son las DOS formas de hacerlos, y la pantalla dice cuál
    // es la diferencia antes de los botones, que era lo otro que faltaba.
    await page.goto("/");
    await iniciarSesion(page);
    await irAlGenerador(page);

    await expect(page.getByRole("button", { name: new RegExp(`^Solo para ${PERRO_DE_PRUEBA.nombre}`) }))
      .toHaveCount(0);
    await expect(page.getByRole("button", { name: /Los mismos alimentos para todos/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Cada uno con lo suyo/ })).toBeVisible();
    // y la diferencia dicha, no sólo insinuada en los títulos
    await expect(page.getByText(/Lo que cambia es la compra/)).toBeVisible();
  });

  test("si falla para todos, se puede hacer el de uno solo", async ({ page, request }) => {
    // ⚠️ ESTA PRUEBA SALVÓ UN FALLO (23 agosto). Al quitar "Solo para X"
    // de la pantalla, la primera versión del cambio quitó también el valor
    // "solo" del estado y simplificó las condiciones que lo miraban. Este
    // botón dejó de funcionar: devolvía a la pantalla de la casa, la misma
    // que acababa de fallar, y no había forma de hacer NINGÚN menú.
    //
    // "solo" ya no se puede ELEGIR, pero se sigue pudiendo LLEGAR. Son
    // cosas distintas y ésta es la que no se puede perder.
    await configurarBackend(request, { casaFalla: true });
    await page.goto("/");
    await iniciarSesion(page);
    await irAlGenerador(page);
    await generarParaLaCasa(page);

    await expect(page.getByText("No hemos podido hacer los menús de todos")).toBeVisible();
    await page.getByRole("button", { name: new RegExp(`Hacer solo el de ${PERRO_DE_PRUEBA.nombre}`) }).click();
    // vuelve al generador de siempre, con sus modos
    await expect(page.getByText(/¿Qué come .* ahora mismo\?/)).toBeVisible();
  });
});

// ─── Decir que tienes más de un perro DESDE EL PRINCIPIO ─────────────────────
//
// Pedido expreso: "en la pantalla principal según entras para generar el menú,
// o sea el perfil del perro por primera vez, ahí puedes poner que tienes más
// de un perro y poder hacerlo desde ella directamente".
//
// El caso delicado es justo ése: la PRIMERA vez. En ese momento la ficha del
// perro todavía NO está en Supabase (se guarda al entrar al generador), y
// añadir otro perro remonta la app entera — así que si no se guarda antes, la
// ficha que se acaba de rellenar entera se pierde. Eso es lo que vigila esto.

// Rellena el asistente de 6 pasos con un perro cualquiera y lo deja en la
// pantalla de su ficha, SIN guardar todavía (no se ha ido al generador).
async function completarAsistente(page, nombre) {
  await page.getByText("1 / 6").waitFor();
  await page.getByPlaceholder("Nombre de tu perro").fill(nombre);
  await page.getByRole("button", { name: "Hembra", exact: true }).click();
  await page.getByRole("button", { name: "Continuar" }).click();

  await page.getByText("2 / 6").waitFor();
  await page.getByRole("button", { name: /Es mestizo/ }).click();
  await page.getByRole("button", { name: /^Mediano/ }).click();
  await page.getByRole("button", { name: "Continuar" }).click();

  await page.getByText("3 / 6").waitFor();          // fecha: valen los valores por defecto
  await page.getByRole("button", { name: "Continuar" }).click();

  await page.getByText("4 / 6").waitFor();
  await page.getByPlaceholder("0").fill("20");
  await page.getByRole("button", { name: "Continuar" }).click();

  await page.getByText("5 / 6").waitFor();
  await page.getByRole("button", { name: "No", exact: true }).click();  // sin esterilizar
  await page.getByRole("button", { name: "Continuar" }).click();

  // El paso 6 son cuatro preguntas (alergias, otras cosas a evitar,
  // categorías fuera, patologías): hay que contestarlas TODAS para que
  // "Terminar" se active. Se dice "No" a las cuatro.
  await page.getByText("6 / 6").waitFor();
  const noes = page.getByRole("button", { name: "No", exact: true });
  for (let i = 0; i < 4; i++) await noes.nth(i).click();
  await page.getByRole("button", { name: "Terminar" }).click();
}

test.describe("decir que tienes más de un perro desde el principio", () => {
  test.beforeEach(async ({ request }) => {
    // ⚠️ casaFalla/casaCompraUnica se ponen explícitamente aunque este
    // bloque no vaya de eso: el servidor de mentira es UNO para toda la
    // tanda, así que un escenario dejado por el bloque anterior (que
    // prueba justo el fallo) se colaba aquí. Pasaba en verde por
    // separado y fallaba en la tanda completa, que es la peor forma de
    // fallar: parece cosa del azar y no lo es.
    await configurarBackend(request, {
      sinPerro: true, retrasoPerrosMs: 100, menus: [],
      casaFalla: false, casaCompraUnica: true,
    });
  });

  test("la primera vez, la ficha ya ofrece añadir otro perro", async ({ page }) => {
    await page.goto("/");
    await iniciarSesion2(page);
    await completarAsistente(page, "Nala");

    // Estamos en su ficha, recién rellenada y todavía sin guardar.
    await expect(page.getByRole("button", { name: /¿Tienes más perros\?/ })).toBeVisible();
  });

  test("añadir el segundo NO pierde el primero, aunque no estuviera guardado", async ({ page, request }) => {
    await page.goto("/");
    await iniciarSesion2(page);
    await completarAsistente(page, "Nala");

    // Todavía no hay NINGÚN perro en la base de datos: es lo que hace que
    // esta prueba sirva de algo.
    expect((await configurarBackend(request, {})).perros).toBe(0);

    await page.getByRole("button", { name: /¿Tienes más perros\?/ }).click();

    // Nala se ha guardado antes de empezar con el siguiente. Si no, se
    // habría perdido: añadir perro vuelve a montar la app de cero.
    await expect.poll(async () => (await configurarBackend(request, {})).nombresDePerros)
      .toEqual(["Nala"]);

    // y se empieza el segundo desde el paso 1, en blanco
    await expect(page.getByText("1 / 6")).toBeVisible();
    await expect(page.getByPlaceholder("Nombre de tu perro")).toHaveValue("");
  });

  test("con los dos hechos, se pueden pedir sus menús a la vez", async ({ page, request }) => {
    await page.goto("/");
    await iniciarSesion2(page);
    await completarAsistente(page, "Nala");
    await page.getByRole("button", { name: /¿Tienes más perros\?/ }).click();
    await completarAsistente(page, "Cairo");

    // Desde la ficha del segundo, al generador: ahí tiene que poder
    // pedirse el menú de los dos.
    await page.getByRole("button", { name: /ir al generador de menús|Hacer el menú de la semana/ }).click();
    // El rótulo dice "¿Cómo?" y no "¿Para quién?" desde que se quitó la
    // opción de hacer el de uno solo: para quién ya no se elige — son
    // todos —, lo que se elige es cómo.
    await expect(page.getByRole("button", { name: /Los mismos alimentos para todos/ })).toBeVisible();
    await generarParaLaCasa(page);

    // ⚠️ QUITADO (24 agosto) — pedido expreso: "no quiero que la compra
    // aparezca en el menú, tiene que estar solo en el menú lateral". Aquí
    // se comprueba justo lo contrario de antes: que NO esté.
    // Dónde sí está, en tests/compra-en-el-panel.spec.js.
    await expect(page.getByText("La compra de la semana")).toHaveCount(0);
  });
});

// ─── La ficha del perro se guarda ENTERA ─────────────────────────────────────
//
// CASO REAL (21 de agosto): "añadí a Ruffo y le puse diez años y seis meses;
// después de hacer el menú me coge la fecha de nacimiento de Cairo otra vez".
//
// No copiaba la fecha de nadie: no guardaba NINGUNA. El payload de guardarPerro
// leía siete campos que en la app no existen con ese nombre
// (perfil.fechaNacimiento, perfil.castrado, perfil.actividad...), así que se
// guardaban vacíos, en silencio y sin error. Al releer, sin fecha, se usaba el
// valor por defecto — el MISMO para todos los perros de la cuenta, que es lo
// que parece "me ha copiado la del otro".
//
// GRAVE, no cosmético: de la fecha de nacimiento sale la ETAPA, y de la etapa
// salen los 30 requisitos de FEDIAF. Un perro de diez años volvía como cachorro
// y se le calculaba el menú de cachorro. Lo mismo con la esterilización y la
// actividad, que entran en las kcal.
//
// Se mira lo GUARDADO, no la pantalla: la ficha se pinta desde el estado local,
// así que puede verse perfecta y estar guardada vacía. Es justo lo que pasaba.
test.describe("la ficha del perro se guarda entera", () => {
  const PERRO_MAYOR = {
    ...PERRO_DE_PRUEBA,
    nombre: "Ruffo",
    fecha_nacimiento: "2015-03-10",   // un perro de diez años
    castrado: true,
    actividad: "baja",
    tamano: "Mediano",
    raza: null,                        // mestizo: su tamaño es el manual
  };

  test.beforeEach(async ({ request }) => {
    await configurarBackend(request, {
      retrasoPerrosMs: 100, perros: [PERRO_MAYOR], menus: [],
      casaFalla: false, casaCompraUnica: true,
    });
  });

  test("generar el menú no borra la fecha de nacimiento", async ({ page, request }) => {
    await page.goto("/");
    await iniciarSesion(page);

    // Esto es lo que hacía la usuaria: entrar al generador. Ahí se guarda
    // la ficha, y ahí era donde se vaciaba.
    await page.getByRole("button", { name: /Hacer el menú de la semana/ }).click();
    await expect(page.getByText(/¿Qué come .* ahora mismo\?/)).toBeVisible();

    await expect.poll(async () => {
      const { perrosGuardados } = await configurarBackend(request, {});
      return perrosGuardados[0];
    }).toMatchObject({
      nombre: "Ruffo",
      fecha_nacimiento: "2015-03-10",   // ← lo que se perdía
      castrado: true,                    // ← se guardaba siempre false
      actividad: "baja",                 // ← se guardaba vacío
      tamano: "Mediano",                 // ← se guardaba vacío
    });
  });

  test("un perro de diez años sigue siendo senior, no cachorro", async ({ page, request }) => {
    await page.goto("/");
    await iniciarSesion(page);
    await page.getByRole("button", { name: /Hacer el menú de la semana/ }).click();

    // La etapa guardada es la que de verdad tiene, no la del perro
    // recién nacido que salía al perder la fecha. De aquí salen los 30
    // requisitos de FEDIAF con los que se le calcula la comida.
    await expect.poll(async () => {
      const { perrosGuardados } = await configurarBackend(request, {});
      return perrosGuardados[0]?.etapa;
    }).toBe("senior");
  });

  test("al volver, la ficha sigue diciendo su edad de verdad", async ({ page }) => {
    await page.goto("/");
    await iniciarSesion(page);
    await page.getByRole("button", { name: /Hacer el menú de la semana/ }).click();
    await page.reload();

    // Los años se calculan aquí, no se escriben a mano: puesto a mano,
    // el test caducaría solo al pasar el cumpleaños del perro.
    const nac = new Date(PERRO_MAYOR.fecha_nacimiento);
    const hoy = new Date();
    let anios = hoy.getFullYear() - nac.getFullYear();
    if (hoy.getMonth() < nac.getMonth() ||
        (hoy.getMonth() === nac.getMonth() && hoy.getDate() < nac.getDate())) anios--;

    // Su edad de verdad, no el "0 años, 6 meses" del perro recién nacido
    // que salía al perder la fecha.
    await expect(page.getByText(new RegExp(`${anios} años`))).toBeVisible();
  });
});

// ─── El recorrido para varios perros es el mismo que para uno ────────────────
//
// PEDIDO EXPRESO (21 de agosto): "cuando generas los menús para los dos perros
// no tienes ni el automático ni el personalizar, solo te crea un menú y punto.
// No puedes ni editar alimentos. Tiene que ser todo igual que cuando lo
// generas para un perro, pero para dos. Tendría que aparecer también qué está
// comiendo el perro, si tiene que hacer transición o no, todo eso."
//
// Tenía razón y el fallo era de planteamiento: lo de varios perros se montó
// como un camino APARTE, y por eso perdió todo lo demás. Estas pruebas existen
// para que no vuelva a poder pasar: si alguien vuelve a poner un atajo que se
// salte una de estas pantallas, aquí se cae.
test.describe("para varios perros, el recorrido completo", () => {
  test.beforeEach(async ({ request }) => {
    await configurarBackend(request, {
      retrasoPerrosMs: 100, perros: [PERRO_DE_PRUEBA, SEGUNDO_PERRO_DE_PRUEBA],
      menus: [], olvidarUltimoMenu: true, casaFalla: false, casaCompraUnica: true,
    });
  });

  const irAlGenerador = (page) =>
    page.getByRole("button", { name: /Hacer el menú de la semana/ }).click();

  test("pregunta qué come CADA perro, no solo el que miras", async ({ page }) => {
    await page.goto("/");
    await iniciarSesion(page);
    await irAlGenerador(page);
    await page.getByRole("button", { name: /Los mismos alimentos para todos/ }).click();

    // Uno puede venir de pienso y el otro llevar años en BARF: la
    // transición depende de lo que come cada animal.
    await expect(page.getByRole("group", { name: `Qué come ${PERRO_DE_PRUEBA.nombre}` })).toBeVisible();
    await expect(page.getByRole("group", { name: `Qué come ${SEGUNDO_PERRO_DE_PRUEBA.nombre}` })).toBeVisible();
  });

  test("no deja pasar hasta saber qué come cada uno", async ({ page }) => {
    await page.goto("/");
    await iniciarSesion(page);
    await irAlGenerador(page);
    await page.getByRole("button", { name: /Los mismos alimentos para todos/ }).click();

    await expect(page.getByText("Elige primero qué come cada perro ahora")).toBeVisible();
    await expect(page.getByRole("button", { name: /^Automático/ })).toBeDisabled();

    // contestando SOLO uno, sigue sin dejar: faltaría el otro, y su menú
    // se calcularía sin saber si necesita transición
    await page.getByRole("group", { name: `Qué come ${PERRO_DE_PRUEBA.nombre}` })
              .getByRole("button", { name: "Pienso", exact: true }).click();
    await expect(page.getByRole("button", { name: /^Automático/ })).toBeDisabled();

    await page.getByRole("group", { name: `Qué come ${SEGUNDO_PERRO_DE_PRUEBA.nombre}` })
              .getByRole("button", { name: "BARF", exact: true }).click();
    await expect(page.getByRole("button", { name: /^Automático/ })).toBeEnabled();
  });

  test("avisa de la transición solo de quien la necesita", async ({ page }) => {
    await page.goto("/");
    await iniciarSesion(page);
    await irAlGenerador(page);
    await page.getByRole("button", { name: /Los mismos alimentos para todos/ }).click();
    await page.getByRole("group", { name: `Qué come ${PERRO_DE_PRUEBA.nombre}` })
              .getByRole("button", { name: "Pienso", exact: true }).click();
    await page.getByRole("group", { name: `Qué come ${SEGUNDO_PERRO_DE_PRUEBA.nombre}` })
              .getByRole("button", { name: "BARF", exact: true }).click();

    // Nala viene de pienso, Cairo ya está en BARF: el aviso es de Nala.
    const aviso = page.getByText(/viene de otra dieta/);
    await expect(aviso).toContainText(PERRO_DE_PRUEBA.nombre);
    await expect(aviso).not.toContainText(SEGUNDO_PERRO_DE_PRUEBA.nombre);
  });

  // ⚠️ PARADO (22 agosto) — igual que el bloque del candado en
  // secciones-desde-perfil: el muro está apagado por defecto, así que
  // pedir varios menús ya no ofrece nada. Se conserva porque el día que
  // se encienda hay que comprobar que la casa NO es un agujero por el que
  // colarse al muro. Apuntado en PENDIENTE.
  test.skip("con cuenta gratis, pedir más de un menú ofrece Premium", async ({ page }) => {
    await page.goto("/");
    await iniciarSesion(page);
    await irAlGenerador(page);
    await page.getByRole("button", { name: /Los mismos alimentos para todos/ }).click();
    for (const nombre of [PERRO_DE_PRUEBA.nombre, SEGUNDO_PERRO_DE_PRUEBA.nombre]) {
      await page.getByRole("group", { name: `Qué come ${nombre}` })
                .getByRole("button", { name: "BARF", exact: true }).click();
    }
    await page.getByRole("button", { name: /^Automático/ }).click();
    // Varios menús es de pago también aquí: la casa no es un agujero por
    // el que colarse al muro.
    await page.getByRole("button", { name: "+", exact: true }).click();
    await expect(page.getByText(/Premium/).first()).toBeVisible();
  });

  test("se puede pedir más de un menú para la semana", async ({ page, request }) => {
    // ⚠️ El muro de pago está en modo "demo", así que el Premium sale de
    // un interruptor en el propio navegador y no de Supabase. Se enciende
    // antes de cargar la app, que es cuando se lee.
    await configurarBackend(request, { premium: true });
    await page.addInitScript(() => window.localStorage.setItem("rawku_premium_demo", "si"));
    await page.goto("/");
    await iniciarSesion(page);
    await irAlGenerador(page);
    await generarParaLaCasa(page, { cuantos: 3 });

    // Lo que se pidió al servidor: tres menús, no uno.
    const { ultimaPeticionCasa } = await configurarBackend(request, {});
    expect(ultimaPeticionCasa.numero_de_menus).toBe(3);

    // Y se ven los tres de cada perro, con los días que cubre cada uno.
    await expect(page.getByText("Menú 1 · 3 días").first()).toBeVisible();
    await expect(page.getByText("Menú 3 · 2 días").first()).toBeVisible();
  });

  test("Personalizar existe, y lo elegido llega al servidor", async ({ page, request }) => {
    await page.goto("/");
    await iniciarSesion(page);
    await irAlGenerador(page);
    await page.getByRole("button", { name: /Los mismos alimentos para todos/ }).click();
    for (const nombre of [PERRO_DE_PRUEBA.nombre, SEGUNDO_PERRO_DE_PRUEBA.nombre]) {
      await page.getByRole("group", { name: `Qué come ${nombre}` })
                .getByRole("button", { name: "BARF", exact: true }).click();
    }
    // Personalizar ya NO está escondido para varios perros
    await page.getByRole("button", { name: /^Personalizar/ }).click();
    await page.getByRole("button", { name: /^(Elegir los ingredientes|Personalizar los)/ }).click();
    await page.getByRole("button", { name: /^Generar (este menú|los menús)/ }).click();

    // Aunque no se toque ninguna categoría (todo en automático), lo que
    // importa es que el camino existe y llega: modo personalizar de verdad.
    const { ultimaPeticionCasa } = await configurarBackend(request, {});
    expect(ultimaPeticionCasa.perros.length).toBe(2);
    // ⚠️ QUITADO (24 agosto) — pedido expreso: "no quiero que la compra
    // aparezca en el menú, tiene que estar solo en el menú lateral". Aquí
    // se comprueba justo lo contrario de antes: que NO esté.
    // Dónde sí está, en tests/compra-en-el-panel.spec.js.
    await expect(page.getByText("La compra de la semana")).toHaveCount(0);
  });

  test("desde el resultado se puede ir a editar el menú de cada perro", async ({ page }) => {
    await page.goto("/");
    await iniciarSesion(page);
    await irAlGenerador(page);
    await generarParaLaCasa(page);

    // ⚠️ "No puedes ni editar alimentos". Se puede: se abre el menú de ese
    // perro en la pantalla de siempre, que es donde vive el editor entero.
    await expect(page.getByRole("button", { name: new RegExp(`Ver y editar el menú de ${PERRO_DE_PRUEBA.nombre}`) })).toBeVisible();
    await page.getByRole("button", { name: new RegExp(`Ver y editar el menú de ${SEGUNDO_PERRO_DE_PRUEBA.nombre}`) }).click();

    // se cambia a ese perro y se ve SU ficha, con sus datos
    await expect(page.getByText(`${SEGUNDO_PERRO_DE_PRUEBA.peso_actual}kg`).first()).toBeVisible();
  });
});
