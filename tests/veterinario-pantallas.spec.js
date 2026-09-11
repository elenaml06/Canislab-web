// ─── LO QUE UN VETERINARIO VE, Y LO QUE NO DEBERÍA VER ───────────────────────
//
// Siete cosas encontradas por la usuaria el 7 de septiembre usando el modo
// veterinario de verdad, con la cuenta de pruebas ya acreditada. Ninguna da
// error, ninguna sale en un log: todas se ven usando la app, y por eso todas
// se comprueban aquí MIRANDO LA PANTALLA.
//
// Lo que las une es una sola cosa mal hecha: el modo veterinario se construyó
// encima de la app del tutor apagando trozos, y donde no se apagó ninguno,
// al veterinario le habla la app del dueño. «Este menú TIENE que aprobarlo tu
// veterinario» dicho a la persona que lo va a firmar con su número de
// colegiado no es un fallo de tono: es decirle que lo que tiene delante no
// cuenta.
import { test, expect } from "@playwright/test";
import { CUENTA_DE_PRUEBA, PERRO_DE_PRUEBA, SEGUNDO_PERRO_DE_PRUEBA } from "./fake-supabase.js";
import { esperarLaFicha, esperarElPaciente } from "./ayudas.js";

const SUPABASE_FALSO = "http://127.0.0.1:54321";

const SU_PERRO = SEGUNDO_PERRO_DE_PRUEBA;   // Cairo, el perro del veterinario
const PACIENTE = PERRO_DE_PRUEBA;           // Nala, su paciente

const OTRO_PACIENTE = {
  ...PERRO_DE_PRUEBA,
  id: "33333333-3333-4333-8333-333333333333",
  nombre: "Ruffo",
  raza: "Galgo Español",
  peso_actual: 27,
  tutor_nombre: "Marta Ibáñez",
};
const TERCER_PACIENTE = {
  ...PERRO_DE_PRUEBA,
  id: "44444444-4444-4444-8444-444444444444",
  nombre: "Kira",
  raza: "Border Collie",
  peso_actual: 18,
  tutor_nombre: "Luis Prado",
};
const CUARTO_PACIENTE = {
  ...PERRO_DE_PRUEBA,
  id: "55555555-5555-4555-8555-555555555555",
  nombre: "Toby",
  raza: "Dachshund Estándar",
  peso_actual: 9,
  tutor_nombre: "Ana Ruiz",
};

const activo = (p) => ({ perro_id: p.id, estado: "activo", origen: "creado_por_el_profesional" });

const configurar = async (request, opciones) => {
  const res = await request.post(`${SUPABASE_FALSO}/__control`,
                                 { data: { sinTablaAccesos: false, ...opciones } });
  expect(res.ok()).toBeTruthy();
  return res.json();
};

const entrar = async (page) => {
  await page.goto("/");
  await page.getByPlaceholder("Email").fill(CUENTA_DE_PRUEBA.email);
  await page.getByPlaceholder("Contraseña").fill(CUENTA_DE_PRUEBA.password);
  await page.getByRole("button", { name: "Entrar" }).click();
};

const comoVeterinario = (extra = {}) => ({
  rolProfesional: true, rolVerificado: true, menus: [], ...extra,
});

const irAPacientes = async (page) => {
  await page.getByRole("button", { name: /Paciente actual/ }).last().click();
  await expect(page.getByRole("button", { name: /Dar de alta un paciente/ })).toBeVisible();
};

const abrirElPanel = async (page) => {
  await page.getByRole("button", { name: "Menú", exact: true }).last().click();
  return page.getByRole("dialog", { name: "Panel lateral" });
};


// ─── 1. LA PUERTA DEL VACÍO, CUANDO YA NO ESTÁ VACÍO ────────────────────────

test("con pacientes, dar de alta a otro NO dice «todavía no tienes ninguno»", async ({ page, request }) => {
  // ⚠️ CASO REAL (7 septiembre): «cuando ya hay pacientes y voy a meter uno
  // nuevo en modo veterinario me dice todavía no hay ningún paciente».
  //
  // La puerta se pintaba con `!yaTienePerroGuardado`, que NO es «no tiene
  // pacientes»: es «ahora mismo no hay ningún perro montado». Y dar de alta
  // a uno desmonta el perro a propósito, así que la pantalla de bienvenida
  // volvía a salir con treinta pacientes en la cuenta.
  await configurar(request, comoVeterinario({
    perros: [PACIENTE, OTRO_PACIENTE],
    accesos: [activo(PACIENTE), activo(OTRO_PACIENTE)],
  }));
  await entrar(page);
  await esperarElPaciente(page);

  await irAPacientes(page);
  await page.getByRole("button", { name: /Dar de alta un paciente/ }).click();

  // Lo que TIENE que salir: la ficha clínica en blanco.
  await expect(page.getByPlaceholder("Nombre del paciente")).toBeVisible();
  // Y lo que no puede salir de ninguna manera.
  await expect(page.getByText("Todavía no tienes ninguno")).toHaveCount(0);
});

test("y sin ninguno, la puerta sigue estando", async ({ page, request }) => {
  // El otro lado: arreglar lo de arriba no puede cargarse la pantalla de
  // bienvenida, que es lo único que ve un veterinario recién acreditado.
  await configurar(request, comoVeterinario({ perros: [SU_PERRO], accesos: [] }));
  await entrar(page);
  await expect(page.getByText("Todavía no tienes ninguno")).toBeVisible();
});


// ─── 2 y 7. LA LISTA DE PACIENTES, QUE ES LA CASA DEL VETERINARIO ───────────

test("la pantalla de Pacientes busca por nombre, por tutor y por raza", async ({ page, request }) => {
  // ⚠️ CASO REAL (7 septiembre): «van a tener muchísimos pacientes, es que
  // igual tienen 50, y tiene que ser más accesible y de otra manera, o sea
  // tal como lo hacen los motores nutricionales».
  //
  // Y se busca por los TRES porque de un paciente no se recuerda el nombre
  // del perro: se recuerda el apellido del dueño, o la raza. Un buscador que
  // solo mire el nombre obliga a acordarse justo de lo que no se recuerda.
  await configurar(request, comoVeterinario({
    perros: [PACIENTE, OTRO_PACIENTE, TERCER_PACIENTE, CUARTO_PACIENTE],
    accesos: [activo(PACIENTE), activo(OTRO_PACIENTE),
              activo(TERCER_PACIENTE), activo(CUARTO_PACIENTE)],
  }));
  await entrar(page);
  await esperarElPaciente(page);
  await irAPacientes(page);

  // Primero: SIN buscar nada, están todos. Es la mitad que se olvida.
  for (const n of ["Nala", "Ruffo", "Kira", "Toby"]) {
    await expect(page.getByRole("button", { name: `Paciente ${n}` })).toBeVisible();
  }

  const buscador = page.getByLabel("Buscar pacientes");
  // Por raza.
  await buscador.fill("galgo");
  await expect(page.getByRole("button", { name: "Paciente Ruffo" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Paciente Nala" })).toHaveCount(0);

  // Por tutor.
  await buscador.fill("Luis Prado");
  await expect(page.getByRole("button", { name: "Paciente Kira" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Paciente Ruffo" })).toHaveCount(0);

  // Por nombre, y sin tildes (mismo criterio que el resto de la app).
  await buscador.fill("ibanez");
  await expect(page.getByRole("button", { name: "Paciente Ruffo" })).toBeVisible();
});

test("desde la lista se entra en un paciente", async ({ page, request }) => {
  await configurar(request, comoVeterinario({
    perros: [PACIENTE, OTRO_PACIENTE],
    accesos: [activo(PACIENTE), activo(OTRO_PACIENTE)],
  }));
  await entrar(page);
  await esperarElPaciente(page);
  await irAPacientes(page);

  await page.getByRole("button", { name: "Paciente Ruffo" }).click();
  await expect.poll(async () =>
    (await page.getByRole("button", { name: /Paciente actual/ }).first()
               .getAttribute("aria-label")) || "").toContain("Ruffo");
});


// ─── 3. LOS MENÚS: TODOS, Y LUEGO SE FILTRA ─────────────────────────────────

test("los menús del veterinario salen TODOS sin buscar nada", async ({ page, request }) => {
  // ⚠️ CASO REAL (7 septiembre): «cuando estoy dentro de mis menús no aparece
  // nada, a no ser que hagas una búsqueda, y tiene que aparecer todo, pero
  // luego poder filtrar por búsqueda».
  //
  // La lista se pedía SOLO por `creado_por`, una columna que se creó el 28 de
  // agosto y que hasta el 29 no rellenaba nadie: todo lo anterior vale NULL.
  // Eran menús suyos, de sus pacientes, y no salían por ningún lado.
  //
  // `sinCreador` es justo esa fila vieja: la prueba falla si se vuelve a
  // filtrar solo por `creado_por`.
  const sinCreador = {
    id: "menu-viejo", perro_id: PACIENTE.id, user_id: CUENTA_DE_PRUEBA.userId,
    creado_por: null, modo: "automatico", der_real: 1100,
    created_at: "2026-08-20T10:00:00.000Z", nombre: "Menú de agosto",
    menus_data: [], num_menus: 1,
  };
  const conCreador = {
    id: "menu-nuevo", perro_id: OTRO_PACIENTE.id, user_id: CUENTA_DE_PRUEBA.userId,
    creado_por: CUENTA_DE_PRUEBA.userId, modo: "personalizar", der_real: 1300,
    created_at: "2026-09-01T10:00:00.000Z", nombre: "Menú de septiembre",
    menus_data: [], num_menus: 1,
  };
  await configurar(request, comoVeterinario({
    perros: [PACIENTE, OTRO_PACIENTE],
    accesos: [activo(PACIENTE), activo(OTRO_PACIENTE)],
    menus: [conCreador, sinCreador],
  }));
  await entrar(page);
  await esperarElPaciente(page);

  const panel = await abrirElPanel(page);
  await panel.getByRole("button", { name: "Menús", exact: true }).click();

  // Los DOS, sin escribir nada en el buscador.
  await expect(page.getByRole("button", { name: "Menú de Ruffo" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Menú de Nala" })).toBeVisible();
  await expect(page.getByText(/Todavía no has hecho ningún menú/)).toHaveCount(0);

  // Y buscar sigue filtrando, que era la otra mitad de la frase.
  await page.getByLabel("Buscar menús").fill("galgo");
  await expect(page.getByRole("button", { name: "Menú de Ruffo" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Menú de Nala" })).toHaveCount(0);
});


// ─── 5. QUÉ LE CAMBIA AL MOTOR CADA PATOLOGÍA ───────────────────────────────

test("al marcar una patología, el veterinario ve el tope, la fuente y el margen", async ({ page, request }) => {
  // ⚠️ CASO REAL (7 septiembre): «cuando pones una patología, ¿te debería
  // salir algo sobre esa patología? Qué cambia, qué no, qué puedes modificar
  // y qué no, de qué margen puede salir».
  //
  // Antes: una casilla azul y nada más. El tope que decide si sale menú
  // (fósforo ≤ 1200 mg/1000 kcal contra un mínimo FEDIAF de 1160) vivía solo
  // dentro del solver, y lo firmaba sin verlo.
  await configurar(request, comoVeterinario({ perros: [], accesos: [] }));
  await entrar(page);
  await page.getByRole("button", { name: /Dar de alta un paciente/ }).click();

  // Sin patología marcada no se pinta nada: es información de una condición
  // concreta, no un cartel permanente.
  await expect(page.getByText(/Lo que le cambia al motor/)).toHaveCount(0);

  // Desde el 8 de septiembre las patologías van por aparato y plegadas, así
  // que se llega por el buscador. Ver `APARATOS` en App.jsx.
  await page.getByLabel("Buscar patología").fill("renal");
  await page.getByText("Insuficiencia renal crónica", { exact: true }).click();

  await expect(page.getByText(/Lo que le cambia al motor/)).toBeVisible();
  // El número, con su unidad y su base.
  await expect(page.getByText(/Fósforo ≤ 1200 mg\/1000 kcal/)).toBeVisible();
  // El margen, que es literalmente lo que preguntaba.
  await expect(page.getByText(/queda un 3,4 % de margen/)).toBeVisible();
  // La fuente, porque quien firma tiene derecho a saber de dónde sale.
  await expect(page.getByText(/Freeman LM, dvm360 2009/)).toBeVisible();
  // Y qué SÍ puede tocar y qué no. ⚠️ Desde el 8 de septiembre son DOS
  // listas enfrentadas y no una frase al final: «lo inamovible y lo que
  // puede tocar, y él tiene que tener visibilidad de todo eso».
  await expect(page.getByText("No se toca")).toBeVisible();
  await expect(page.getByText("Lo decides tú")).toBeVisible();
  await expect(page.getByText(/Qué alimentos entran y cuántos gramos/)).toBeVisible();
});

test("una patología sin topes lo dice, en vez de callarse", async ({ page, request }) => {
  // Callarse aquí sería peor que no enseñar nada: dejaría creer que el motor
  // ajusta algo cuando no ajusta ningún límite numérico.
  //
  // ⚠️ CAMBIADO (8 septiembre) DE `artrosis` A `hipotiroidismo`, y el motivo
  // no es cosmético: ARTROSIS SÍ MUEVE UN LÍMITE. El motor le pone un suelo
  // de EPA+DHA de 1 g/1000 kcal (SACN5 cap.34, Tabla 34-2). Esta prueba
  // pasaba porque el servidor de mentira la servía con `suelos: []` -- se
  // estaba comprobando la pantalla contra una ficción, que es el mismo fallo
  // de `dentro_de_rango`. Hipotiroidismo sí es de verdad una patología sin
  // ningún número: su restricción es por ALIMENTO (grelo y nabo).
  await configurar(request, comoVeterinario({ perros: [], accesos: [] }));
  await entrar(page);
  await page.getByRole("button", { name: /Dar de alta un paciente/ }).click();

  await page.getByLabel("Buscar patología").fill("hipotiroid");
  await page.getByText("Hipotiroidismo", { exact: true }).click();
  await expect(page.getByText(/No mueve ningún límite numérico del menú/)).toBeVisible();
});


// ─── 6. EL PANEL: LO QUE ES DEL TUTOR NO ES SUYO ────────────────────────────

test("«Analizar la dieta actual» no está en el panel del veterinario", async ({ page, request }) => {
  // ⚠️ PEDIDO EXPRESO (7 septiembre). Es la herramienta del dueño: coge lo
  // que ya le da de comer y le dice qué le falta. Un veterinario no analiza
  // lo que él mismo pauta.
  await configurar(request, comoVeterinario({
    perros: [PACIENTE], accesos: [activo(PACIENTE)],
  }));
  await entrar(page);
  await esperarElPaciente(page);

  const panel = await abrirElPanel(page);
  await expect(panel.getByRole("button", { name: "Analizar la dieta actual" })).toHaveCount(0);
  // Y lo que sí se queda: la evolución del paciente entre consultas, y su
  // lista de pacientes como primera entrada.
  await expect(panel.getByRole("button", { name: "Evolución y crecimiento" })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Pacientes", exact: true })).toBeVisible();
});

test("y a un tutor no se le quita nada", async ({ page, request }) => {
  // El otro lado del mismo cambio, que es donde se rompen estas cosas.
  await configurar(request, {
    rolProfesional: false, rolVerificado: false,
    perros: [PACIENTE], accesos: [], menus: [],
  });
  await entrar(page);
  await esperarLaFicha(page);

  const panel = await abrirElPanel(page);
  await expect(panel.getByRole("button", { name: "Analizar la dieta actual" })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Pacientes", exact: true })).toHaveCount(0);
});


// ─── 4 y 7-bis. EL MENÚ DE UN PACIENTE NO SE LEE COMO EL DE UN TUTOR ────────

test("dentro del menú de un paciente no le dicen que se lo enseñe a un veterinario", async ({ page, request }) => {
  // ⚠️ CASO REAL (7 septiembre): «cuando me meto dentro de mis menús de algún
  // menú de algún paciente en veterinario se ve igual que lo ve un usuario y
  // no debería ser así. O sea, además te pone esto: debería ser revisado por
  // un veterinario. Mal».
  //
  // Mal, sí, y no por el tono: es la persona que va a firmar esa pauta con
  // su número de colegiado. Decirle «enséñaselo a tu veterinario» es decirle
  // que lo que tiene delante no cuenta.
  const PACIENTE_RENAL = { ...PACIENTE, patologias: ["renal"], patologia_si: "si" };
  await configurar(request, comoVeterinario({
    perros: [PACIENTE_RENAL],
    accesos: [activo(PACIENTE_RENAL)],
    // Un aviso de seguridad de los de verdad: los que a un tutor le saltan
    // arriba, en ámbar, antes de ver el menú.
    problemasSeguridad: ["Las costillas de cordero aportan mucho hueso: revisa el total de calcio de la semana."],
    menus: [{
      id: "m-renal", perro_id: PACIENTE_RENAL.id, user_id: CUENTA_DE_PRUEBA.userId,
      creado_por: CUENTA_DE_PRUEBA.userId, modo: "automatico", der_real: 1211,
      etapa_label: "Adulto", num_menus: 1, nombre: "Pauta de septiembre",
      created_at: "2026-09-02T10:00:00.000Z",
      menus_data: [{
        menu: { "Carne muscular de pollo": 420, "Hueso carnoso de pollo": 150 },
        ficha: { semaforo: "verde", correctos: 43, total: 43, ratio_ca_p: 1.38,
                 gramos: 740, kcal: 1120.4, densidad_kcal_g: 1.51,
                 faltan: [], se_pasa: [], datos_incompletos: {}, datos_dudosos: {} },
        problemas_seguridad: ["Las costillas de cordero aportan mucho hueso: revisa el total de calcio de la semana."],
      }],
    }],
  }));
  await entrar(page);
  await esperarElPaciente(page);

  const panel = await abrirElPanel(page);
  await panel.getByRole("button", { name: "Menús", exact: true }).click();
  await page.getByRole("button", { name: "Menú de Nala" }).click();
  await expect(page.getByText(/SEMANA DE/i)).toBeVisible();

  // 1. Lo que NO puede salirle.
  await expect(page.getByText("Este menú TIENE que aprobarlo tu veterinario")).toHaveCount(0);
  await expect(page.getByText(/enséñaselo a tu\s+veterinario/)).toHaveCount(0);
  await expect(page.getByText(/crezca y se mantenga sano/)).toHaveCount(0);

  // 2. Lo que sí: el mismo semáforo, dicho para quien firma. Está detrás
  //    del icono de información del recuadro del semáforo, igual que para
  //    el tutor -- lo que cambia es a quién se le habla, no dónde está.
  await page.getByRole("button", { name: "Qué se ha verificado" }).click();
  await expect(page.getByText(/Verificado contra FEDIAF/)).toBeVisible();

  // 3. El paciente, sin salir a buscarlo: es lo que hacen los programas que
  //    ya usan (Nutrimenta, VetMenu) -- el caso acompaña a la formulación.
  await expect(page.getByText(/Pastor Alemán/)).toBeVisible();
  await expect(page.getByText(/1211 kcal\/día/)).toBeVisible();

  // 4. Y en vez del «que lo apruebe tu veterinario», el tope que la
  //    patología le ha metido al motor.
  await expect(page.getByText(/Lo que esta patología le ha impuesto al menú/)).toBeVisible();
  await expect(page.getByText(/Fósforo ≤ 1200 mg\/1000 kcal/)).toBeVisible();
});

test("y el aviso de seguridad baja al final, sin alarma pero sin perderse", async ({ page, request }) => {
  // ⚠️ CASO REAL (7 septiembre): «en el modo veterinario deberían desaparecer
  // los avisos de seguridad -- por ejemplo, costillas de cordero, le pones
  // seguridad y te salta el aviso. Eso tiene que estar abajo, acomodado, que
  // él puede editar».
  //
  // El aviso está bien calculado y no se quita: lo que está mal es DÓNDE. A
  // un tutor hay que pararle antes de que dé de comer algo; un veterinario
  // formula primero y revisa las notas después.
  const PACIENTE_RENAL = { ...PACIENTE, patologias: ["renal"], patologia_si: "si" };
  const AVISO = "Las costillas de cordero aportan mucho hueso: revisa el total de calcio de la semana.";
  await configurar(request, comoVeterinario({
    perros: [PACIENTE_RENAL], accesos: [activo(PACIENTE_RENAL)],
    problemasSeguridad: [AVISO],
    menus: [{
      id: "m-seg", perro_id: PACIENTE_RENAL.id, user_id: CUENTA_DE_PRUEBA.userId,
      creado_por: CUENTA_DE_PRUEBA.userId, modo: "automatico", der_real: 1211,
      etapa_label: "Adulto", num_menus: 1, nombre: "Pauta con hueso",
      created_at: "2026-09-02T10:00:00.000Z",
      menus_data: [{
        menu: { "Carne muscular de pollo": 420, "Costillas de cordero": 150 },
        ficha: { semaforo: "verde", correctos: 43, total: 43, ratio_ca_p: 1.38,
                 gramos: 740, kcal: 1120.4, densidad_kcal_g: 1.51,
                 faltan: [], se_pasa: [], datos_incompletos: {}, datos_dudosos: {} },
        problemas_seguridad: [AVISO],
      }],
    }],
  }));
  await entrar(page);
  await esperarElPaciente(page);

  const panel = await abrirElPanel(page);
  await panel.getByRole("button", { name: "Menús", exact: true }).click();
  await page.getByRole("button", { name: "Menú de Nala" }).click();
  await expect(page.getByText(/SEMANA DE/i)).toBeVisible();

  // ⚠️ ACTUALIZADO (8 septiembre, segunda pasada). El 7 las bajé al final de
  // la pestaña del menú; siguen sin ser su sitio. CASO REAL: «tampoco cosas
  // de seguridad, el veterinario sabe perfectamente eso; como mucho viene en
  // cómo darlo, cosas que él puede editar». Así que ahora viven ahí.
  //
  // En la pestaña del menú NO están: ni el aviso ni la alarma ámbar del
  // tutor. Eso es la mitad del pedido.
  await expect(page.getByText(AVISO)).toHaveCount(0);
  await expect(page.getByText(/avisos? de seguridad$/i)).toHaveCount(0);

  // Y en «Cómo darlo» sí, sin alarma y sin perderse.
  await page.getByRole("button", { name: "Cómo darlo" }).click();
  await expect(page.getByText(AVISO)).toBeVisible();
  await expect(page.getByText(/Nota de manejo/)).toBeVisible();
  await expect(page.getByText(/ya están dentro del cálculo/)).toBeVisible();
});
