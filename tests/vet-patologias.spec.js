// ─── LAS PATOLOGÍAS, TAL COMO LAS VE UN VETERINARIO ─────────────────────────
//
// ⚠️ PEDIDO EXPRESO (8 de septiembre), tres cosas seguidas y las tres aquí:
//
//   «Obviamente a un veterinario no le tiene que saltar ningún tipo de aviso
//   de "necesitas una dieta pautada por tu veterinario". Eso es absurdo.»
//
//   «Que salte, cuando marca una patología, las recomendaciones: lo que
//   puede tocar y lo que no. Lo inamovible y lo que puede tocar, y él tiene
//   que tener visibilidad de todo eso.»
//
//   «La lista de patologías me parece un peñazo, es enorme. No me gusta que
//   más de la mitad de la página sea una lista de patologías hacia abajo.»
//
// Lo primero no era un fallo de tono: el motor YA le formula esas patologías
// desde el 29 de agosto (`formulable_por_profesional`), así que la pantalla
// era más restrictiva que el propio motor -- y el muro solo servía para
// mandarle a hacerlo en una hoja de cálculo, donde no lo verifica nadie.
import { test, expect } from "@playwright/test";
import { CUENTA_DE_PRUEBA, PERRO_DE_PRUEBA } from "./fake-supabase.js";
import { esperarElPaciente } from "./ayudas.js";

const SUPABASE_FALSO = "http://127.0.0.1:54321";
const PACIENTE = { ...PERRO_DE_PRUEBA, tutor_nombre: "María López" };

const configurar = async (request, opciones) => {
  const res = await request.post(`${SUPABASE_FALSO}/__control`,
    { data: { sinTablaAccesos: false, ...opciones } });
  expect(res.ok()).toBeTruthy();
  return res.json();
};

const entrarComoVeterinario = async (page, request, extra = {}) => {
  await configurar(request, {
    rolProfesional: true, rolVerificado: true,
    perros: [PACIENTE],
    accesos: [{ perro_id: PACIENTE.id, estado: "activo" }],
    menus: [], ...extra,
  });
  await page.goto("/");
  await page.getByPlaceholder("Email").fill(CUENTA_DE_PRUEBA.email);
  await page.getByPlaceholder("Contraseña").fill(CUENTA_DE_PRUEBA.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await esperarElPaciente(page);
};

// El aparato hay que abrirlo para llegar a sus patologías, salvo que se
// busquen por nombre. Las dos formas se prueban abajo.
const abrirAparato = (page, titulo) =>
  page.getByRole("button", { name: new RegExp(`^${titulo}`) }).click();


// ─── 1. NINGÚN MURO DE TUTOR ────────────────────────────────────────────────

test("las patologías que bloquean al tutor NO bloquean al veterinario", async ({ page, request }) => {
  // Hepatopatía, shunt y cálculos urinarios son `formulable: false`: al dueño
  // se le para en seco. Al veterinario se le formulan (`formulable_por_
  // profesional`), así que la pantalla no puede pararle.
  await entrarComoVeterinario(page, request);

  await page.getByLabel("Buscar patología").fill("hepatopatia");
  await page.getByText("Hepatopatía / predisposición al cobre", { exact: true }).click();

  // Lo que NO puede salirle, ni al marcarla ni al guardar.
  await expect(page.getByText(/necesitas una dieta pautada por tu veterinario/)).toHaveCount(0);
  await expect(page.getByText(/hace falta supervisión veterinaria/)).toHaveCount(0);

  await page.getByRole("button", { name: /Guardar y formular la ración/ }).click();
  await expect(page.getByText("Formular la ración")).toBeVisible();
  await expect(page.getByText("Esto lo tiene que pautar tu veterinario")).toHaveCount(0);
});

test("y varias de ésas a la vez tampoco le paran", async ({ page, request }) => {
  // Mezcladas, que es como llegan de verdad: un shunt con cálculos de urato.
  await entrarComoVeterinario(page, request);
  const buscador = page.getByLabel("Buscar patología");

  await buscador.fill("shunt");
  await page.getByText("Shunt portosistémico hepático", { exact: true }).click();
  await buscador.fill("urato");
  await page.getByText("Urolitos de urato", { exact: true }).click();

  await page.getByRole("button", { name: /Guardar y formular la ración/ }).click();
  await expect(page.getByText("Formular la ración")).toBeVisible();
});

test("a un TUTOR se le sigue parando: eso no se ha tocado", async ({ page, request }) => {
  // El otro lado, y el que importa de verdad: quitar el muro al veterinario
  // no puede quitárselo al dueño. La frontera es quién está delante.
  await configurar(request, {
    rolProfesional: false, rolVerificado: false,
    perros: [], accesos: [], menus: [],
  });
  await page.goto("/");
  await page.getByPlaceholder("Email").fill(CUENTA_DE_PRUEBA.email);
  await page.getByPlaceholder("Contraseña").fill(CUENTA_DE_PRUEBA.password);
  await page.getByRole("button", { name: "Entrar" }).click();

  await page.getByPlaceholder("Nombre de tu perro").waitFor();
  await expect(page.getByLabel("Buscar patología")).toHaveCount(0);
});


// ─── 2. QUÉ ES INAMOVIBLE Y QUÉ DECIDE ÉL ───────────────────────────────────

test("al marcar una patología ve el tope, qué no se toca y qué decide él", async ({ page, request }) => {
  await entrarComoVeterinario(page, request);

  await page.getByLabel("Buscar patología").fill("renal");
  await page.getByText("Insuficiencia renal crónica", { exact: true }).click();

  // El número, con su unidad y su base.
  await expect(page.getByText(/Fósforo ≤ 1200 mg\/1000 kcal/)).toBeVisible();
  await expect(page.getByText(/queda un 3,4 % de margen/)).toBeVisible();
  await expect(page.getByText(/Freeman LM, dvm360 2009/)).toBeVisible();

  // Las DOS listas, que es lo que se pidió: no una frase corrida al final.
  await expect(page.getByText("No se toca")).toBeVisible();
  await expect(page.getByText("Lo decides tú")).toBeVisible();
  await expect(page.getByText(/Los 43 requisitos de FEDIAF y el ratio Ca:P/)).toBeVisible();
  await expect(page.getByText(/Qué alimentos entran y cuántos gramos/)).toBeVisible();
  await expect(page.getByText(/Las proporciones BARF/)).toBeVisible();

  // Y la recomendación clínica, que no es un límite: el objetivo de la
  // literatura, que está por debajo de lo que el motor puede hacer.
  await expect(page.getByText("Recomendación clínica")).toBeVisible();
  await expect(page.getByText(/POR DEBAJO de algún mínimo de FEDIAF/)).toBeVisible();
});

test("una patología sin topes lo dice, y sigue diciendo qué decide él", async ({ page, request }) => {
  await entrarComoVeterinario(page, request);
  await page.getByLabel("Buscar patología").fill("artrosis");
  await page.getByText("Artrosis / osteoartritis", { exact: true }).click();

  await expect(page.getByText(/No mueve ningún límite numérico del menú/)).toBeVisible();
  await expect(page.getByText("Lo decides tú")).toBeVisible();
});

test("con dos patologías se ven los topes de las dos", async ({ page, request }) => {
  // Es como llegan: un renal que además es pancreático. Si solo se pintara
  // una, el veterinario firmaría creyendo que solo hay un límite en juego.
  await entrarComoVeterinario(page, request);
  const buscador = page.getByLabel("Buscar patología");

  await buscador.fill("renal");
  await page.getByText("Insuficiencia renal crónica", { exact: true }).click();
  await buscador.fill("pancrea");
  await page.getByText("Pancreatitis", { exact: true }).click();

  // Se limpia el buscador antes de mirar: con «pancrea» escrito la lista solo
  // enseña una, y estaríamos comprobando el filtro en vez de los topes.
  await buscador.fill("");

  // Cada nombre sale DOS veces a propósito: en su casilla, marcada, y como
  // título del bloque que explica qué le impone al motor. Se comprueban los
  // dos topes, que es lo que no puede faltar.
  await expect(page.getByText("Insuficiencia renal crónica")).toHaveCount(2);
  await expect(page.getByText("Pancreatitis", { exact: true })).toHaveCount(2);
  await expect(page.getByText(/Fósforo ≤ 1200 mg\/1000 kcal/).first()).toBeVisible();
  await expect(page.getByText(/Grasa ≤ 20 g\/1000 kcal/).first()).toBeVisible();
});


// ─── 3. LA LISTA, QUE ERA UN PEÑAZO ─────────────────────────────────────────

test("las patologías van por aparato, plegadas, no en una lista de 27", async ({ page, request }) => {
  await entrarComoVeterinario(page, request);

  // Las cabeceras SÍ están...
  for (const aparato of ["Renal y urinario", "Digestivo y páncreas", "Hepático y biliar",
                         "Corazón", "Endocrino y metabólico", "Piel"]) {
    await expect(page.getByRole("button", { name: new RegExp(`^${aparato}`) })).toBeVisible();
  }
  // ...y lo de dentro NO, hasta que se abre. Es la mitad del pedido: que la
  // ficha deje de ser una lista de patologías hacia abajo.
  await expect(page.getByText("Insuficiencia renal crónica", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Pancreatitis", { exact: true })).toHaveCount(0);

  await abrirAparato(page, "Renal y urinario");
  await expect(page.getByText("Insuficiencia renal crónica", { exact: true }).first()).toBeVisible();
  // Abrir uno no abre los demás.
  await expect(page.getByText("Pancreatitis", { exact: true })).toHaveCount(0);
});

test("el buscador salta los aparatos: escribes y sale", async ({ page, request }) => {
  await entrarComoVeterinario(page, request);
  await page.getByLabel("Buscar patología").fill("cushing");
  await expect(page.getByText("Hiperadrenocorticismo (Cushing)", { exact: true })).toBeVisible();
  // Y sin tildes, como el resto de la app.
  await page.getByLabel("Buscar patología").fill("cardiopatia");
  await expect(page.getByText("Cardiopatía", { exact: true })).toBeVisible();
  // Lo que no existe lo dice, y dice qué hacer.
  await page.getByLabel("Buscar patología").fill("zzzz");
  await expect(page.getByText(/Ninguna cuadra con «zzzz»/)).toBeVisible();
});

test("un aparato con algo marcado se abre solo, y lo cuenta", async ({ page, request }) => {
  // Lo que el paciente TIENE no puede quedarse escondido detrás de un clic:
  // al volver a abrir su ficha dentro de tres meses tiene que verse.
  await entrarComoVeterinario(page, request, {
    perros: [{ ...PACIENTE, patologias: ["renal", "oxalato"], patologia_si: true }],
  });

  await expect(page.getByRole("button", { name: /^Renal y urinario · 2/ })).toBeVisible();
  await expect(page.getByText("Insuficiencia renal crónica", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Cálculos de oxalato cálcico", { exact: true }).first()).toBeVisible();
  // Y un aparato sin nada marcado sigue plegado.
  await expect(page.getByText("Pancreatitis", { exact: true })).toHaveCount(0);
});


// ─── 4. LA MIGA DE PAN, QUE SEGUÍA SIENDO UNA MASCOTA ───────────────────────

test("arriba a la derecha no pone el nombre del perro: pone «Pacientes»", async ({ page, request }) => {
  // ⚠️ CASO REAL: «en tus capturas puedo ver perfectamente que en el icono de
  // arriba a la derecha sigue apareciendo Nala». El 7 de septiembre le cambié
  // a dónde lleva y me dejé lo que se ve: el mismo círculo con la inicial y
  // el mismo nombre que en la app del dueño. Un veterinario no está «en
  // Nala»: está dentro de una ficha y sale de ella.
  await entrarComoVeterinario(page, request);

  const miga = page.getByRole("button", { name: /Ver todos los pacientes/ });
  await expect(miga).toBeVisible();
  await expect(miga).toContainText("Pacientes");
  await expect(miga).not.toContainText("Nala");

  // De quién es la ficha lo dice la ficha, en su línea de caso.
  await expect(page.getByText(/Nala · 1211 kcal\/día/)).toBeVisible();
});

test("y a un tutor le sigue saliendo su perro, como siempre", async ({ page, request }) => {
  await configurar(request, {
    rolProfesional: false, rolVerificado: false,
    perros: [PACIENTE], accesos: [], menus: [],
  });
  await page.goto("/");
  await page.getByPlaceholder("Email").fill(CUENTA_DE_PRUEBA.email);
  await page.getByPlaceholder("Contraseña").fill(CUENTA_DE_PRUEBA.password);
  await page.getByRole("button", { name: "Entrar" }).click();

  const burbuja = page.getByRole("button", { name: /Perro actual/ }).first();
  await expect(burbuja).toBeVisible();
  await expect(burbuja).toContainText("Nala");
});
