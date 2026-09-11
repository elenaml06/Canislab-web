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

test("a un TUTOR se le sigue parando en seco: eso no se ha tocado", async ({ page, request }) => {
  // ⚠️ ESTA ES LA MITAD PELIGROSA, y no la tenía NADIE probada.
  //
  // Quitarle el muro al veterinario no puede quitárselo al dueño: la
  // frontera es quién está delante, no la patología. Un tutor que marca
  // hepatopatía tiene que seguir chocando con «Esto lo tiene que pautar tu
  // veterinario», porque la restricción de cobre que hace falta está POR
  // DEBAJO del mínimo que necesita cualquier perro para estar sano -- no es
  // algo que se arregle eligiendo mejor los alimentos.
  //
  // Se entra con el perro YA guardado y se abre el paso 6 desde el lápiz de
  // su perfil, que es como llega de verdad quien ya tiene ficha: recorrer
  // los seis pasos a ciegas haría que la prueba dependiera de qué pide cada
  // uno, y se rompería con el primer campo nuevo.
  await configurar(request, {
    rolProfesional: false, rolVerificado: false,
    perros: [PACIENTE], accesos: [], menus: [],
  });
  await page.goto("/");
  await page.getByPlaceholder("Email").fill(CUENTA_DE_PRUEBA.email);
  await page.getByPlaceholder("Contraseña").fill(CUENTA_DE_PRUEBA.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.getByText("Nombre y sexo").waitFor();

  // El buscador por aparato es del profesional: al dueño no le sale.
  await expect(page.getByLabel("Buscar patología")).toHaveCount(0);

  // Su paso 6, con su pregunta de sí/no antes de la lista: al dueño se le
  // pregunta si tiene patologías, y la lista solo aparece si dice que sí.
  // (En la ficha del profesional no hay pregunta: las listas SON la
  // respuesta, que es lo que se decidió el 29 de agosto.)
  await page.getByRole("button", { name: "Editar alergias y patologías" }).click();
  await page.getByText("¿Tiene alguna patología diagnosticada?").waitFor();

  // Su paso 6 son CUATRO preguntas de sí/no, y «Terminar» no se enciende
  // hasta que están las cuatro. Se contestan las tres primeras que no; la
  // cuarta, la de patologías, que sí.
  const noes = page.getByRole("button", { name: "No", exact: true });
  for (let i = 0; i < 3; i += 1) await noes.nth(i).click();
  await page.getByRole("button", { name: "Sí", exact: true }).last().click();

  // ⚠️ REESCRITA EL 11 DE SEPTIEMBRE, y hay que decir por qué para que nadie
  // la devuelva a como estaba.
  //
  // Aquí el tutor MARCABA «Hepatopatía» y chocaba con el muro. Ya no puede:
  // Elena, ese día, «Un dueño, obviamente, no puede marcar casillas de
  // veterinario, ni siquiera le deberían salir», y la hepatopatía es una de
  // las 15 que `quien_formula_cada_patologia.json` marca `solo_veterinario`.
  //
  // Y no es que el muro sobre: es que ahora se llega a él por el único camino
  // que queda, que es **el perro que ya la trae puesta** porque se la puso su
  // veterinario. Medido ese día: después del filtro, NINGUNA patología que el
  // dueño pueda marcar es `segura: false`. Así que la mitad peligrosa que esta
  // prueba vigila -- que quitarle el muro al veterinario no se lo quite al
  // dueño -- se comprueba justo por ahí.
  await expect(page.getByText("Hepatopatía / predisposición al cobre", { exact: true }),
    "al dueño le sigue saliendo la casilla de hepatopatía, que es de veterinario")
    .toHaveCount(0);
});

test("y si su veterinario se la puso, el muro le sigue parando", async ({ page, request }) => {
  // El único camino que queda hasta el muro, y es el que importa: el perro
  // trae la hepatopatía puesta desde su ficha clínica. El dueño la VE (si se
  // escondiera, creería que su perro no tiene nada y al guardar se perdería),
  // no la puede quitar, y al terminar el paso choca igual que antes.
  await configurar(request, {
    rolProfesional: false, rolVerificado: false,
    perros: [{ ...PACIENTE, patologias: ["hepatopatia"], patologia_si: "si" }],
    accesos: [], menus: [],
  });
  await page.goto("/");
  await page.getByPlaceholder("Email").fill(CUENTA_DE_PRUEBA.email);
  await page.getByPlaceholder("Contraseña").fill(CUENTA_DE_PRUEBA.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.getByText("Nombre y sexo").waitFor();
  await page.getByRole("button", { name: "Editar alergias y patologías" }).click();

  const hepatopatia = page.getByRole("button",
    { name: "Hepatopatía / predisposición al cobre", exact: true });
  await expect(hepatopatia,
    "el perro la trae puesta y no se ve: el dueño creería que no tiene nada")
    .toHaveCount(1);
  await expect(hepatopatia, "puede quitarla, y eso es de su veterinario").toBeDisabled();

  // Las otras tres preguntas, para poder terminar el paso.
  const noes = page.getByRole("button", { name: "No", exact: true });
  for (let i = 0; i < 3; i += 1) await noes.nth(i).click();

  // Y al terminar, el muro. Se comprueba AQUÍ y no al marcarla porque el
  // asistente del dueño no enseña el aviso en la casilla: le para al
  // terminar el paso, que es donde se decidió el 5 de agosto («salta el
  // aviso AQUÍ MISMO, sin dejar avanzar hasta elegir modo y generar»).
  await page.getByRole("button", { name: /Terminar/ }).click();
  await expect(page.getByText("Esto lo tiene que pautar tu veterinario")).toBeVisible();
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

// ─── HASTA DÓNDE PUEDE MOVER CADA CIFRA ─────────────────────────────────────
//
// ⚠️ PEDIDO EXPRESO (10 septiembre): «tenemos que estipular qué porcentajes
// puede variar el veterinario y cuáles NO, y hasta qué punto o qué techo,
// dentro de cada patología, de cada caso concreto».
//
// La ventana la calcula el backend y la sirve `GET /patologias` en el bloque
// `margen_profesional`, con la PROCEDENCIA de cada extremo. Aquí se comprueba
// que llega a la pantalla, porque un margen que solo vive en un JSON del
// servidor no le sirve a quien firma la pauta -- es el hueco de los ocho
// `avisos_extra`, escritos con su fuente y sin llegar a nadie.
test("al marcar una patología ve hasta dónde se puede mover el tope, y de dónde sale cada extremo", async ({ page, request }) => {
  await entrarComoVeterinario(page, request);

  await page.getByLabel("Buscar patología").fill("renal");
  await page.getByText("Insuficiencia renal crónica", { exact: true }).click();

  await expect(page.getByText("Hasta dónde se puede mover")).toBeVisible();
  // Los dos extremos, cada uno con de dónde sale. El de abajo es el mínimo de
  // FEDIAF; el de arriba, en el renal, es LEY.
  await expect(page.getByText(/1160 mg.*mínimo de FEDIAF/)).toBeVisible();
  await expect(page.getByText(/1420,45 mg.*Reglamento \(UE\) 2020\/354/)).toBeVisible();
  // Y las dos frases que NO dicen lo mismo: bajar del suelo se puede y se
  // firma; pasar del techo legal no lo puede hacer nadie.
  await expect(page.getByText(/Por debajo de 1160 deja de ser una dieta completa/)).toBeVisible();
  await expect(page.getByText(/Ese techo no lo pasa nadie, ni tú ni el motor/)).toBeVisible();
});

// ⚠️ Y LO QUE LA PANTALLA NO PUEDE AFIRMAR. El Reglamento (UE) 2020/354 NO da
// un rango de maniobra por nutriente: da un techo o un suelo por objetivo, y su
// ±15 % es tolerancia analítica de etiquetado, no margen clínico. Enseñar la
// ventana como «muévete libremente aquí dentro» sería inventarse una fuente.
// Ver P-03 de PREGUNTAS_ABIERTAS.md, que sigue abierta.
test("la ventana se enseña como los bordes, no como permiso para moverse dentro", async ({ page, request }) => {
  await entrarComoVeterinario(page, request);
  await page.getByLabel("Buscar patología").fill("renal");
  await page.getByText("Insuficiencia renal crónica", { exact: true }).click();

  await expect(page.getByText(
    /Son los bordes, no una recomendación de moverse dentro de ellos/)).toBeVisible();
});

// ─── EL SEGUNDO ESCALÓN DE LA GRASA, QUE NO SE VEÍA ─────────────────────────
//
// El tope condicional existe en el motor desde el 8 de septiembre (SACN5 Tabla
// 67-3 baja la grasa de 37,5 a 25 si el perro además es obeso o
// hipertrigliceridémico) y no salía por ninguna puerta: quien leía la ficha
// veía 37,5 y creía que era el único número.
test("la pancreatitis enseña su segundo tope de grasa y con qué se activa", async ({ page, request }) => {
  await entrarComoVeterinario(page, request);
  await page.getByLabel("Buscar patología").fill("pancrea");
  await page.getByText("Pancreatitis", { exact: true }).click();

  await expect(page.getByText(/Grasa ≤ 37,5 g\/1000 kcal/)).toBeVisible();
  await expect(page.getByText(/Y si además marcas obesidad o hiperlipidemia/)).toBeVisible();
  await expect(page.getByText(/Grasa ≤ 25 g\/1000 kcal/)).toBeVisible();
});

// ⚠️ CORREGIDO (8 septiembre) — ESTE TEST USABA `artrosis` COMO EJEMPLO DE
// «PATOLOGÍA SIN TOPES», Y ARTROSIS SÍ TIENE UNO.
//
// El motor le pone un SUELO de EPA+DHA de 1 g/1000 kcal (SACN5 cap.34, Tabla
// 34-2). Lo que hacía pasar el test era el propio servidor de mentira, que
// la servía con `suelos: []` -- o sea que la pantalla se comprobaba contra
// una ficción. Es literalmente el fallo de `dentro_de_rango` otra vez: «las
// pruebas pasaban, porque el Supabase de mentira devolvía el nombre
// equivocado igual que el código».
//
// Ahora son DOS pruebas, y cada una comprueba lo suyo:
//   · hipotiroidismo, que sí es de verdad una patología sin ningún número
//     (su restricción es por ALIMENTO: grelo y nabo);
//   · artrosis, que tiene que ENSEÑAR su suelo -- si no, un veterinario
//     firma creyendo que esa patología no le impone nada al menú.
test("una patología sin topes lo dice, y sigue diciendo qué decide él", async ({ page, request }) => {
  await entrarComoVeterinario(page, request);
  await page.getByLabel("Buscar patología").fill("hipotiroid");
  await page.getByText("Hipotiroidismo", { exact: true }).click();

  await expect(page.getByText(/No mueve ningún límite numérico del menú/)).toBeVisible();
  await expect(page.getByText("Lo decides tú")).toBeVisible();
});

test("una patología con SUELO enseña el suelo, no dice que no mueve nada", async ({ page, request }) => {
  await entrarComoVeterinario(page, request);
  await page.getByLabel("Buscar patología").fill("artrosis");
  await page.getByText("Artrosis / osteoartritis", { exact: true }).click();

  await expect(page.getByText(/No mueve ningún límite numérico del menú/)).toHaveCount(0);
  await expect(page.getByText(/EPA/i).first()).toBeVisible();
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
  // 8 sep: 20 -> 37,5. La grasa de la pancreatitis se cambió en el motor por
  // la regla de fuentes (SACN5 Tabla 67-3 manda sobre Merck) y el servidor de
  // mentira se actualizó, pero esta línea se quedó con el número viejo y la
  // prueba se puso roja. Es la prueba haciendo su trabajo: el número que pinta
  // la pantalla del veterinario no puede ir por libre.
  await expect(page.getByText(/Grasa ≤ 37,5 g\/1000 kcal/).first()).toBeVisible();
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
    perros: [{ ...PACIENTE, patologias: ["renal", "oxalato"], patologia_si: "si" }],
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

test("la rueda de ajustes está en TODAS las pantallas del veterinario", async ({ page, request }) => {
  // ⚠️ CASO REAL, mirando Vercel (8 septiembre): «la burbuja de
  // configuración desaparece, y esa tiene que estar en TODAS las pantallas».
  //
  // Y era verdad: al convertir la burbuja en miga de pan, los ajustes se
  // quedaron colgando solo del engranaje de la pantalla de Pacientes. Desde
  // la ficha, el formulador o los menús no había forma de llegar a su cuenta
  // ni al interruptor de modo sin dar un rodeo.
  //
  // Es la misma regla que ya tenía escrita el tutor desde el 24 de agosto
  // («tiene que existir en todas las pantallas»), que no se trasladó a su
  // modo. Por eso esto RECORRE las pantallas en vez de mirar una: el día que
  // se añada la séptima, esta prueba la caza.
  await entrarComoVeterinario(page, request);

  const irA = async (entrada) => {
    await page.getByRole("button", { name: "Menú", exact: true }).last().click();
    await page.getByRole("dialog", { name: "Panel lateral" })
              .getByRole("button", { name: entrada, exact: true }).click();
  };

  // En la ficha, que es donde se aterriza.
  await expect(page.getByRole("button", { name: "Ajustes" }).first()).toBeVisible();

  for (const pantalla of ["Pacientes", "Menús", "Pautas firmadas"]) {
    await irA(pantalla);
    await expect(page.getByRole("button", { name: "Ajustes" }).first())
      .toBeVisible({ timeout: 10000 });
  }

  // Y en el formulador, que es donde más rato pasa y que NO lleva miga de
  // pan: su cabecera solo tiene la hamburguesa. Ahí llega por el panel.
  await irA("Menús");
  await page.getByRole("button", { name: /Hacer otro menú/ }).click();
  await expect(page.getByText("Formular la ración")).toBeVisible();
  await page.getByRole("button", { name: "Menú", exact: true }).last().click();
  await expect(page.getByRole("dialog", { name: "Panel lateral" })
                   .getByRole("button", { name: "Ajustes", exact: true })).toBeVisible();
});

test("y desde ahí se llega de verdad a la cuenta y al interruptor", async ({ page, request }) => {
  // Que el botón exista no basta: tiene que abrir los ajustes de verdad.
  await entrarComoVeterinario(page, request);
  await page.getByRole("button", { name: "Ajustes" }).first().click();
  await expect(page.getByRole("button", { name: /Modo veterinario/ })).toBeVisible();
  await expect(page.getByText("Tu clínica")).toBeVisible();
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
