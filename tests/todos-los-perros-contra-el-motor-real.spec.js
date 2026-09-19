// ─── TODOS LOS TIPOS DE PERRO, EN LA APP DE VERDAD Y CONTRA EL MOTOR DE VERDAD ─
//
// POR QUÉ EXISTE (13 de septiembre de 2026). Lo pidió Elena el día que
// producción estuvo rota:
//
//     «a partir de ahora cuando hagas PR y fusiones tienes que hacer pruebas
//      para todo tipo de etapas y todo tipo de perros con todo tipo de
//      patologías en la app real con las cuentas de prueba, en veterinario y
//      usuario, para ver si falla algo»
//
// ⚠️ Y EL MOTIVO ESTÁ MEDIDO, no es una precaución: ese día había **101 bloques
// del motor en verde y 550 pruebas de esta app en verde, y la app no daba UN
// SOLO MENÚ**. Cairo, su cachorro de raza grande, se quedaba sin comer en
// cuanto se declaraban premios -- y ninguna de las dos baterías podía verlo.
//
// POR QUÉ NINGUNA DE LAS DOS LO VE, y es estructural:
//
//   · `pruebas_completas.py` prueba el motor por dentro y por sus endpoints,
//     con las peticiones que ESCRIBE ELLA. Nunca ve la que manda la app.
//   · Las otras pruebas de esta carpeta hablan con `servidor-fake.js`, que
//     siempre devuelve menú. Nunca ven al motor decir que no.
//
// Entre las dos queda un hueco del tamaño exacto del fallo: **una petición que
// la app manda bien y el motor contesta «no hay menú» por un motivo real.**
//
// QUÉ COMPRUEBA, Y QUÉ NO. No comprueba que el menú cumpla -- de eso se encarga
// la batería del otro repo, y `_garantizar_verificado()` no deja salir uno que
// no cumpla. Comprueba que **el perro que se puede escribir en la ficha
// obtiene menú**: que ninguna combinación normal de etapa, tamaño, premios y
// patología deje al dueño mirando «no hemos encontrado un menú que cumpla».
//
//     npx playwright test --config playwright.real.config.js
//
// ⚠️ LA MITAD DE LA CUENTA SIGUE SIENDO DE MENTIRA, y va dicho: el Supabase real
// necesita una credencial que no vive en el repo. Lo que se prueba de verdad
// aquí es la costura app↔motor, que es donde estaba el fallo de Cairo.
//
// PARA COMPROBAR QUE ESTA PRUEBA SIRVE (hazlo si la tocas): quítale al motor el
// factor de premios de `recomendaciones.suelo_que_de_verdad_se_aplica`. Los
// casos de cachorro de raza grande con premios tienen que ponerse rojos.

import { test, expect } from "@playwright/test";
import { CUENTA_DE_PRUEBA } from "./fake-supabase.js";
// ⚠️ La lista de perros vive aparte: la comparten esta prueba y la que corre
// contra rawku.app desplegado. Ver `perros-de-la-matriz.js`.
import { PERROS, fichaDe } from "./perros-de-la-matriz.js";
import { irAlGenerador } from "./ayudas.js";

const SUPABASE_FALSO = "http://127.0.0.1:54322";

const configurar = async (request, opciones) => {
  const res = await request.post(`${SUPABASE_FALSO}/__control`, { data: opciones });
  expect(res.ok()).toBeTruthy();
  return res.json();
};

// ─── LA MATRIZ ───────────────────────────────────────────────────────────────
//
// No es el producto cartesiano de todo: eso serían miles de menús y cada uno
// tarda segundos en el MILP de verdad, así que la batería no se correría nunca
// -- y una batería que no se corre no vigila nada. Se eligen los cruces donde
// la ventana entre mínimos y máximos es MÁS ESTRECHA, que es donde el motor
// deja de dar menú:
//
//   · las siete etapas, porque cada una tiene su columna de requisitos
//   · los extremos de tamaño (toy y gigante), donde el escalado aprieta
//   · el cachorro de RAZA GRANDE, que es el caso de Cairo: tiene a la vez el
//     suelo reforzado de la nota b y el techo apretado de SACN5
//   · con y sin premios, porque los premios suben los suelos y no los techos
//   · las patologías que más aprietan, una por aparato
// ⚠️ QUÉ PATOLOGÍAS ENTRAN EN CADA ROL, Y **NO SE ESCRIBE AQUÍ** (13 de
// septiembre). Elena, al ver la primera versión de esta prueba:
//
//     «ten en cuenta que solo pueden entrar las patologías que puede generar un
//      usuario sin preguntas y sin supervisión veterinaria»
//
// Tiene razón y además la lista ya existe: cada patología lleva su
// `quien_puede_marcarla` en `quien_formula_cada_patologia.json`, derivado de la
// CITA de su propia fuente -- si su tabla condiciona la cifra a un dato clínico
// (el estadio IRIS, los triglicéridos, la taurina en sangre), no la puede
// marcar quien no tiene ese dato. Son 5 `dueno`, 18 `dueno_con_diagnostico` y
// 24 `solo_veterinario`.
//
// Y se LEE del motor, no se copia: es la regla 6 del CLAUDE.md. Una lista
// copiada a mano aquí se quedaría parada el día que una patología cambie de
// mano, y la prueba seguiría en verde probando un reparto que ya no existe --
// que es exactamente el fallo que esta prueba entera existe para cazar.
const API_REAL_PAT = "http://127.0.0.1:8012";

async function patologiasPorQuienLaMarca(request) {
  const res = await request.get(`${API_REAL_PAT}/vocabulario`);
  expect(res.ok(), "el motor de verdad no contesta a /vocabulario").toBeTruthy();
  const lista = (await res.json())?.patologias?.lista || [];
  expect(lista.length,
    "`/vocabulario` no trae patologías. Sin ellas esta prueba no vigila nada, " +
    "así que no se salta: falla").toBeGreaterThan(0);
  const por = { dueno: [], dueno_con_diagnostico: [], solo_veterinario: [] };
  for (const p of lista) {
    if (!p.formulable) continue;
    if (por[p.quien_puede_marcarla]) por[p.quien_puede_marcarla].push(p.clave);
  }
  return por;
}

// Cuánto se le da a cada menú. El MILP de verdad tarda, y en el peor caso la
// app recorre la escalera entera: seis peldaños. Con menos, lo que se mide es
// el reloj y no la nutrición -- que es el fallo que ya costó dos rondas en el
// BLOQUE 43 y en el 75 del otro repo.
const RELOJ_POR_MENU = 180_000;

// El «ojo» del modo cocinado, leído DEL MOTOR y no copiado aquí: es la señal de
// que el clic ha entrado, y si se copiase dejaría de servir el día que el motor
// cambie el texto -- la prueba seguiría verde buscando una frase que ya no se
// pinta. Regla 6 aplicada a la propia prueba.
let _ojoCocinado = null;
async function elOjoDelModoCocinado(request) {
  if (_ojoCocinado) return _ojoCocinado;
  const res = await request.get(`${API_REAL_PAT}/vocabulario`);
  expect(res.ok(), "el motor no contesta a /vocabulario").toBeTruthy();
  const ojo = (await res.json())?.modo_de_preparacion?.ojo || "";
  expect(ojo.length,
    "el motor no sirve `modo_de_preparacion.ojo`. Sin él esta prueba no puede "
    + "comprobar que el clic en «Cocinada» ha entrado, y el bucle entero podría "
    + "estar resolviendo en crudo").toBeGreaterThan(20);
  // La app le quita la señal de aviso de delante, que es NUESTRA y no del motor.
  _ojoCocinado = ojo.replace(/^\S+\s/, "");
  return _ojoCocinado;
}

// ⚠️ EL MODO ES UN PARÁMETRO, Y NO LO ERA (19 de septiembre de 2026). Esta
// matriz nació el 13 de septiembre, cuando solo existía la ración cruda. El
// modo cocinado se fusionó el 18 y **esta prueba siguió recorriendo los doce
// perros en crudo y solo en crudo**, así que la mitad nueva del producto -- un
// catálogo entero de 71 fichas cocidas, el hueso fuera, el calcio saliendo de
// otro sitio -- no tenía ni un perro que la ejercitara desde la app.
//
// Es exactamente el hueco que esta prueba existe para tapar, abierto otra vez:
// la batería del motor sí prueba cocinado (BLOQUES 128-130) y las pruebas de
// esta carpeta hablan con el servidor falso, que da menú siempre. Entre las dos
// cabía «el motor dice que no en cocinado y la app no lo enseña».
async function entrarYGenerar(page, request, ficha, modo = "crudo") {
  await configurar(request, {
    retrasoPerrosMs: 50, perros: [ficha], menus: [], premium: true,
  });
  // ⚠️ SE SALE DE LA SESION ANTES DE CADA PERRO. Sin esto, el segundo caso de
  // una prueba que recorre varios se encuentra la app YA ABIERTA con el perro
  // anterior en memoria: no hay campo «Email» que rellenar, y la prueba se
  // queda esperando hasta el timeout -- que es lo que le paso a la de
  // patologias la primera vez que se ejecuto. Y lo peor no es colgarse: es
  // que, sin limpiar, el caso 2 probaria el perro del caso 1 y saldria verde.
  await page.context().clearCookies();
  await page.goto("/");
  await page.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch {} });
  await page.goto("/");
  await page.getByPlaceholder("Email").fill(CUENTA_DE_PRUEBA.email);
  await page.getByPlaceholder("Contraseña").fill(CUENTA_DE_PRUEBA.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await irAlGenerador(page);
  // La pregunta de cruda o cocinada va ANTES de Automático, y el título lo
  // sirve el motor (regla 6). Se busca por el texto que pinta la app en vez de
  // por una clave: lo que se quiere probar es lo que ve el dueño.
  if (modo === "cocinado") {
    await page.getByText(/^Cocinada$/).click();
    // ⚠️ QUE EL CLIC HAYA ENTRADO, COMPROBADO CON EL TEXTO DEL MOTOR. Sin esto
    // el bucle entero podría resolver en CRUDO y salir verde: los doce perros
    // tienen menú en los dos modos, así que «no hizo clic» y «hizo clic» se ven
    // exactamente igual en pantalla. El «ojo» solo lo pinta la app cuando el
    // modo elegido es cocinado, y el texto lo sirve el motor (regla 6), así que
    // tampoco vale copiado a mano aquí.
    const ojo = await elOjoDelModoCocinado(request);
    await expect(page.getByText(ojo.slice(0, 60), { exact: false }),
      "se ha pulsado «Cocinada» y no sale el aviso de cómo se pesa que sirve el motor. "
      + "O el clic no ha entrado -- y entonces este caso está resolviendo en crudo sin "
      + "decirlo -- o la app ha dejado de pintar el «ojo»")
      .toBeVisible();
  }
  await page.getByRole("button", { name: /^Automático/ }).click();
  await page.getByRole("button", { name: /^(Generar|Hacer)/ }).click();

  // O sale la semana, o sale el error. Se espera a CUALQUIERA de los dos y se
  // mira cuál: esperar solo al bueno daría un «timeout» sin decir por qué, que
  // es justo lo que le pasó a Elena mirando la app desde el móvil.
  const bien = page.getByText(/Semana de/);
  const mal = page.getByText(/No hemos encontrado un menú que cumpla|Esto lo tiene que pautar|ha tardado demasiado/);
  await expect(bien.or(mal)).toBeVisible({ timeout: RELOJ_POR_MENU });
  if (await mal.isVisible()) {
    // Se recoge lo que dijo el motor, para que el fallo diga POR QUÉ y no
    // «no salió». El desplegable «Qué dijo el motor» lo pinta la app.
    let detalle = "";
    try {
      await page.getByText("Qué dijo el motor").click({ timeout: 2000 });
      detalle = (await page.locator("details").innerText()).slice(0, 600);
    } catch { /* puede no estar: no es el objeto de la prueba */ }
    return { ok: false, motivo: (await mal.innerText()) + " — " + detalle };
  }
  return { ok: true };
}

// ⚠️ LOS PREMIOS POR ENCIMA DE LO QUE RECOMIENDA LA FUENTE SON OTRA COSA, Y NO
// UNA EXCEPCIÓN (16 de septiembre de 2026). Con el 20 % del día en premios y
// SIN DECIR CUÁLES SON, el motor ya no da menú: contesta que hace falta saber
// QUÉ se le da, y eso es una decisión de producto de Elena, no un fallo:
//
//     «¿pero para qué pones ese mensaje? si tiene que haber una parte en la que
//      elija lo que le da y se meta en el plato»
//
// Lo que salía antes era el peldaño que pone el techo de lo accesorio en el
// 100 % del plato, o sea los 484 g de alcachofa que ella rechazó.
//
// Así que para este perro la prueba cambia de pregunta, y exige LAS DOS
// MITADES, que es lo que hace que no sea una excusa:
//   1. que se le diga que la causa son los premios (no el mensaje genérico)
//   2. que DECLARANDO uno, el menú salga de verdad
// Si el motor dejara de dar menú al declararlo, la salida que se le ofrece al
// dueño no existiría, y eso es peor que no ofrecerla.
const PREMIOS_SIN_DECIR_QUE_SON = "Cairo más del máximo";

test.describe("todos los tipos de perro obtienen menú, con el motor de verdad", () => {
  for (const perro of PERROS) {
    if (perro[0] === PREMIOS_SIN_DECIR_QUE_SON) continue;
    test(`dueño · ${perro[0]}`, async ({ page, request }) => {
      test.setTimeout(RELOJ_POR_MENU + 60_000);
      const r = await entrarYGenerar(page, request, fichaDe(perro));
      expect(r.ok,
        `«${perro[0]}» no obtiene menú en la app con el motor de verdad. ` +
        `Esto es lo que le pasó a Cairo el 13 de septiembre: el motor y la app ` +
        `estaban los dos en verde y el perro se quedaba sin comer. ${r.motivo || ""}`)
        .toBe(true);
    });
  }

  // ⚠️ ESTA PRUEBA SE LLAMABA «y declararlo funciona» Y NO LO PROBABA (19 de
  // septiembre de 2026). Su segunda mitad le preguntaba A LA API directamente,
  // con un cuerpo escrito aquí, así que lo que demostraba es que el MOTOR sabe
  // recibir `premios_declarados` -- no que la app sepa mandarlo. Y la app NO
  // sabía: no existía ninguna pantalla para declarar un premio.
  //
  // O sea: un verde con un nombre que prometía una función que no existía. Es
  // exactamente lo que este repo tiene escrito que no puede pasar -- «un test
  // que pasa con el fallo puesto no sirve» -- y encima en su forma más cara,
  // porque se reportó como prueba de que la salida al dueño funcionaba.
  //
  // Ahora la segunda mitad va POR LA APP, como la primera.
  test(`dueño · ${PREMIOS_SIN_DECIR_QUE_SON}: se le pide decir QUÉ le da, y declarándolo desde la app sale`,
       async ({ page, request }) => {
    test.setTimeout(RELOJ_POR_MENU + 60_000);
    const perro = PERROS.find((p) => p[0] === PREMIOS_SIN_DECIR_QUE_SON);
    const r = await entrarYGenerar(page, request, fichaDe(perro));

    // 1. No hay menú, y el motivo habla de los premios -- no del mensaje
    //    genérico de «quita alguna restricción», que aquí es mentira: el dueño
    //    puede quitar todas las alergias y seguirá sin salir.
    expect(r.ok, `con el 20 % del día en premios SIN declarar, este cachorro sale con menú. ` +
      `Si el motor vuelve a dárselo, mira QUÉ plato es: antes era 484 g de alcachofa`).toBe(false);
    expect(r.motivo || "",
      `no hay menú y no se dice que la causa son los premios. El mensaje genérico aquí ` +
      `es mentira, y además no le da nada que hacer`).toMatch(/premios/i);
    expect(r.motivo || "",
      `no se le ofrece DECIR qué le da, que es la salida que existe y la que no le ` +
      `cuesta nada`).toMatch(/qué le das|que le das/i);

    // 2. Y LA SALIDA FUNCIONA DESDE LA APP. Se le da al perro la declaración
    //    hecha -- que es lo que la ficha guarda cuando el dueño la contesta --
    //    y se vuelve a generar por el mismo camino de antes. Si la app no
    //    mandara `premios_declarados`, esto sale igual de rojo que arriba.
    const r2 = await entrarYGenerar(
      page, request,
      { ...fichaDe(perro), premios_declarados: { "Corazón de pollo": 214.0 } });
    expect(r2.ok,
      `el dueño declara el premio en la ficha y la app SIGUE sin darle menú. O no manda ` +
      `\`premios_declarados\`, o el motor no lo acepta: la salida que se le ofrece no existe. ` +
      `${r2.motivo || ""}`)
      .toBe(true);

    // 3. Y lo que hace el motor con ese premio, preguntándoselo de frente: son
    //    gramos FIJOS y van marcados como premio dentro del menú. Esto sí va
    //    por la API a propósito -- es una afirmación sobre el MOTOR, y va
    //    dicho en vez de disfrazarlo de prueba de la app.
    const cuerpo = {
      modo: "automatico", nombres_alimentos: [], forzar_presencia: [],
      der_objetivo: 1581.0, actividad: "normal",
      etapa_requisitos: "CachorroCrecimiento", especies_excluidas: [],
      nombres_excluidos: [], peso_perro_kg: 20.0, patologias: [],
      categorias_excluidas: [], peso_adulto_esperado_kg: 31.0, tamano: "Mediano",
      premios_nivel: "mas_del_maximo",
      premios_declarados: { "Corazón de pollo": 214.0 },
    };
    const res = await request.post(`${API_REAL_PAT}/menu/v2`, { data: cuerpo, timeout: 120_000 });
    const j = await res.json();
    expect(j.factible,
      `se le dice al dueño que declare el premio y, declarándolo, TAMPOCO sale menú. ` +
      `Entonces la salida que se le ofrece no existe: ${JSON.stringify(j.motivo || "").slice(0, 300)}`)
      .toBe(true);
    expect(j.menu?.["Corazón de pollo"],
      `el menú sale pero NO lleva los 214 g declarados. Un premio declarado son gramos ` +
      `FIJOS: si el motor los mueve, lo que se le enseña al dueño no es lo que come`)
      .toBe(214.0);
    expect(j.premios_dentro_del_menu?.["Corazón de pollo"],
      `el premio está dentro del menú y no se marca como tal, así que el dueño lee ` +
      `214 g de corazón en la lista y entiende que se los tiene que dar ADEMÁS`)
      .toBe(214.0);
  });

  // ─── LAS QUE PUEDE MARCAR EL DUEÑO ÉL SOLO ────────────────────────────────
  //
  // Las cinco `dueno`: las que no piden ningún dato clínico que el dueño no
  // tenga. Son las únicas que se prueban en el rol de usuario, porque son las
  // únicas que un usuario puede llegar a marcar sin veterinario detrás.
  test("dueño · las patologías que puede marcar él solo", async ({ page, request }) => {
    test.setTimeout(RELOJ_POR_MENU * 6);
    const por = await patologiasPorQuienLaMarca(request);
    expect(por.dueno.length,
      "el motor no declara ninguna patología que el dueño pueda marcar solo").toBeGreaterThan(0);
    const sinMenu = [];
    for (const pat of por.dueno) {
      const r = await entrarYGenerar(
        page, request,
        fichaDe(["adulto con " + pat, "adulto", 24.5, "Pastor Alemán", "Grande", "2021-05-14", null],
                [pat]));
      if (!r.ok) sinMenu.push(`${pat}: ${r.motivo}`);
    }
    expect(sinMenu,
      "hay patologías que el dueño puede marcar él solo y que le dejan sin menú. " +
      "Las 39 formulables las recorre el BLOQUE 61 del motor, así que si allí " +
      "salen y aquí no, lo que falla es lo que la app MANDA")
      .toEqual([]);
  });

  // ─── Y LAS DEMÁS, QUE SON DEL VETERINARIO ─────────────────────────────────
  //
  // Las 18 `dueno_con_diagnostico` y las 24 `solo_veterinario` no las prueba
  // aquí el rol de usuario A PROPÓSITO: un usuario no puede marcarlas sin un
  // diagnóstico detrás. Se prueban con el rol profesional, que es quien las
  // formula de verdad, y con la muestra que cabe en el reloj -- las 39
  // formulables enteras ya las recorre el BLOQUE 61 del motor; lo que falta
  // aquí es que la APP se las mande bien.
  //
  // Se coge una por aparato para que la muestra no sea todo del mismo sitio.
  test("veterinario · una patología de cada aparato", async ({ page, request }) => {
    test.setTimeout(RELOJ_POR_MENU * 10);
    const res = await request.get(`${API_REAL_PAT}/vocabulario`);
    const lista = ((await res.json())?.patologias?.lista || []).filter((p) => p.formulable);
    const unaPorAparato = [];
    const vistos = new Set();
    for (const p of lista) {
      if (p.quien_puede_marcarla === "dueno") continue;   // esas ya van arriba
      if (vistos.has(p.aparato)) continue;
      vistos.add(p.aparato);
      unaPorAparato.push(p.clave);
    }
    expect(unaPorAparato.length,
      "el motor no agrupa las patologías por aparato, o no hay ninguna de "
      + "veterinario. Sin eso esta prueba no vigila nada").toBeGreaterThan(2);
    const sinMenu = [];
    for (const pat of unaPorAparato) {
      const r = await entrarYGenerar(
        page, request,
        fichaDe(["paciente con " + pat, "adulto", 24.5, "Pastor Alemán", "Grande", "2021-05-14", null],
                [pat]));
      if (!r.ok) sinMenu.push(`${pat}: ${r.motivo}`);
    }
    expect(sinMenu, "hay patologías de veterinario que no obtienen menú por la app")
      .toEqual([]);
  });
});

// ─── Y LOS MISMOS PERROS, PERO COCINADO ──────────────────────────────────────
//
// POR QUÉ ES UN BUCLE APARTE Y NO UN PARÁMETRO DEL DE ARRIBA (19 de septiembre
// de 2026). Porque no es la misma pregunta. En crudo el calcio lo pone el hueso
// carnoso y fija el ratio Ca:P; en cocinado **el hueso no es candidato** -- es
// una exclusión dura, como una alergia, porque cocido astilla -- y el calcio
// tiene que salir de la cáscara de huevo o del bote. Es decir: el motor resuelve
// un problema DISTINTO, con otro catálogo y otra fuente de calcio, y que salga
// menú en crudo no dice absolutamente nada de si sale en cocinado.
//
// Medido contra el motor DESPLEGADO el 19 de septiembre, los dos modos: los
// trece perros dan menú verde en los dos, y en cocinado varios bajan de peldaño
// (Cairo sale en `hasta_dos_suplementos`, no en `estricto`). Bajar de peldaño es
// legítimo y se dice, así que la prueba NO afirma en cuál sale -- esa es la
// regla del 10 de septiembre y aquí muerde de verdad.
//
// PARA COMPROBAR QUE SIRVE (hazlo si la tocas): quítale al motor la exclusión
// del hueso carnoso en cocinado. No se pone roja -- y eso es correcto, porque
// esto vigila que HAYA menú, no que cumpla. Lo que sí la pone roja es quitar el
// `if (modo === "cocinado")` de `entrarYGenerar`: sin el clic no sale el «ojo»
// del motor y los doce casos se caen diciendo que están resolviendo en crudo.
// Esa guarda es la mitad que hace que esto no sea un bucle decorativo: los doce
// perros tienen menú en los DOS modos, así que sin ella «hizo clic» y «no hizo
// clic» saldrían los dos verdes.
test.describe("los mismos perros, con la ración COCINADA", () => {
  for (const perro of PERROS) {
    if (perro[0] === PREMIOS_SIN_DECIR_QUE_SON) continue;
    test(`dueño · cocinado · ${perro[0]}`, async ({ page, request }) => {
      test.setTimeout(RELOJ_POR_MENU + 60_000);
      const r = await entrarYGenerar(page, request, fichaDe(perro), "cocinado");
      expect(r.ok,
        `«${perro[0]}» obtiene menú CRUDO y no obtiene menú COCINADO. En cocinado el ` +
        `hueso carnoso no es candidato y el calcio tiene que salir de otro sitio, así que ` +
        `este caso no lo cubre ninguna prueba de arriba. ${r.motivo || ""}`)
        .toBe(true);
    });
  }
});
