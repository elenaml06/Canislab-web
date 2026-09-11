// ─── LA PANTALLA DEL FORMULADOR ─────────────────────────────────────────────
//
// ⚠️ PEDIDO EXPRESO: "ellos no tienen que tener automático personalizar,
// ellos tienen su propio modo de crear el menú... van poniendo los alimentos
// y los gramos y van viendo todos los nutrientes por categorías en tiempo
// real... y lo del botón de autocompletar, que pueda pulsarlo y que se
// complete solo con lo que falta, y que luego también pueda modificar cosas
// de lo que le ha rellenado automáticamente".
//
// Lo que se prueba aquí NO es la nutrición: eso se comprueba contra el motor
// de verdad, en `pruebas_completas.py` (BLOQUE 41). Aquí se prueba la
// pantalla, y en concreto las cuatro cosas que si se rompen no dan error:
//
//   · Que un veterinario NO vea "Automático / Personalizar".
//   · Que al cambiar los gramos se vuelva a preguntar -- "en vivo" es eso, y
//     una pantalla que pinta una vez y se queda quieta se ve igual.
//   · Que lo que rellena Autocompletar quede EDITABLE, que es la mitad de lo
//     que se pidió.
//   · Y que un tope de patología roto se vea AUNQUE FEDIAF diga verde. Es la
//     regla 2: el semáforo son los requisitos de un perro sano.
import { test, expect } from "@playwright/test";
import { CUENTA_DE_PRUEBA, PERRO_DE_PRUEBA } from "./fake-supabase.js";
import { irAlGenerador, esperarElPaciente, esperarLaFicha } from "./ayudas.js";

const SUPABASE_FALSO = "http://127.0.0.1:54321";

const configurar = async (request, opciones) => {
  const res = await request.post(`${SUPABASE_FALSO}/__control`,
                                 { data: { sinTablaAccesos: false, olvidarFormular: true, ...opciones } });
  expect(res.ok()).toBeTruthy();
  return res.json();
};

// ⚠️ LEER NO PUEDE BORRAR. `configurar` limpia las peticiones al formulador
// -- para que cada prueba empiece de cero --, así que usarla también para
// MIRARLAS dejaba el contador siempre a cero y la prueba de "en vivo" no
// probaba nada: comparaba 0 con 0. Se separa preguntar de poner.
const leer = async (request) => {
  const res = await request.post(`${SUPABASE_FALSO}/__control`, { data: {} });
  expect(res.ok()).toBeTruthy();
  return res.json();
};

const comoVeterinario = async (page, request, extra = {}) => {
  await configurar(request, {
    rolProfesional: true, rolVerificado: true,
    perros: [PERRO_DE_PRUEBA],
    accesos: [{ perro_id: PERRO_DE_PRUEBA.id, estado: "activo" }],
    menus: [], ...extra,
  });
  await page.goto("/");
  await page.getByPlaceholder("Email").fill(CUENTA_DE_PRUEBA.email);
  await page.getByPlaceholder("Contraseña").fill(CUENTA_DE_PRUEBA.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await esperarElPaciente(page);   // la ficha clínica del paciente
  await irAlFormulador(page);
};

// El camino al generador pasa por el panel, igual que para un tutor. La
// entrada se llama "Menús" y no "Mis menús" en modo veterinario: los menús
// de un paciente no son suyos.
async function irAlFormulador(page) {
  await page.getByRole("button", { name: "Menú", exact: true }).last().click();
  await page.getByRole("dialog", { name: "Panel lateral" })
            .getByRole("button", { name: "Menús", exact: true }).click();
  await page.getByRole("button", { name: /Hacer otro menú/ }).click();
  await expect(page.getByText("Formular la ración")).toBeVisible();
}

// ─── EL SELECTOR: POR CATEGORÍAS, Y SE EXCLUYE SIN SALIR ────────────────────
//
// ⚠️ PEDIDO EXPRESO (11 septiembre), las dos mitades:
//
//   «la lista de ingredientes a seleccionar no está dividida por categorias
//    /carne muscular /verduras /vísceras... y debería, para que no aparezca
//    una lista infinita, y dentro de eso pues que aparezca por ejemplo pollo,
//    se entre dentro de pollo y aparezca todo lo que sea de pollo»
//
//   «lo de excluir un alimento o un grupo de alimentos se tiene que poder
//    hacer desde el mismo generador de menú, porque igual quiere hacer pruebas
//    y tener que salir y volver a entrar es un coñazo»
//
// Antes esto era SOLO un buscador: sin escribir no se veía nada, así que para
// encontrar un alimento había que saber ya cómo se llama. Son 163 en 14
// categorías.
test("el selector se navega por categoría y por especie, sin escribir nada", async ({ page, request }) => {
  await comoVeterinario(page, request);
  await page.getByRole("button", { name: /Añadir alimento/ }).click();

  // Las categorías, sin buscar nada.
  const carne = page.getByRole("button", { name: /^Carne muscular/ });
  await expect(carne, "sin escribir no se ve ninguna categoría: el selector sigue siendo solo " +
                      "un buscador, y para encontrar algo hay que saber ya cómo se llama")
    .toBeVisible();
  // Y lo de dentro, plegado.
  await expect(page.getByRole("button", { name: /^Carne muscular de pollo/ })).toHaveCount(0);

  await carne.click();
  // Dentro, las ESPECIES, no la lista entera.
  await expect(page.getByRole("button", { name: /^Pollo/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Vaca/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Carne muscular de pollo/ }),
    "al abrir la categoría salen ya todos los alimentos: falta el nivel de especie")
    .toHaveCount(0);

  await page.getByRole("button", { name: /^Pollo/ }).click();
  await expect(page.getByRole("button", { name: /^Carne muscular de pollo/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Muslo de pollo sin piel/ })).toBeVisible();
  // Y lo de la otra especie sigue sin salir.
  await expect(page.getByRole("button", { name: /^Carne muscular de vaca/ })).toHaveCount(0);
});

test("una categoría sin especie no mete un nivel de más", async ({ page, request }) => {
  // La verdura y los suplementos vienen con `especie: null` de la API de
  // verdad. Meterles un escalón que dice «null» sería peor que no tenerlo.
  await comoVeterinario(page, request);
  await page.getByRole("button", { name: /Añadir alimento/ }).click();
  await page.getByRole("button", { name: /^Verduras y frutas/ }).click();
  await expect(page.getByRole("button", { name: /^Zanahoria/ })).toBeVisible();
});

test("se deja fuera una categoría entera sin salir del generador", async ({ page, request }) => {
  await comoVeterinario(page, request);
  await page.getByRole("button", { name: /Añadir alimento/ }).click();
  await page.getByRole("button", { name: "Dejar fuera Hueso carnoso" }).click();

  // Se ve que está fuera, y se puede volver a meter. Un filtro que no se ve es
  // un filtro que explica por qué no sale el menú sin que nadie pueda saberlo.
  await expect(page.getByText("Fuera de esta prueba", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Volver a meter Hueso carnoso" }).first())
    .toBeVisible();

  // Y viaja al motor en la siguiente llamada.
  await page.getByRole("button", { name: /Autocompletar/ }).click();
  await expect.poll(async () => {
    const { peticionesFormular } = await leer(request);
    const ultima = peticionesFormular[peticionesFormular.length - 1];
    return (ultima?.categorias_excluidas || []).includes("Hueso carnoso");
  }, { message: "la categoría que el veterinario ha dejado fuera no viaja al motor: la " +
                "excluye en la pantalla y el motor se la sigue metiendo" })
    .toBe(true);
});

test("lo excluido en la ficha del paciente no se puede quitar desde aquí", async ({ page, request }) => {
  // ⚠️ Regla 4 del proyecto: «las alergias y las categorías excluidas a mano
  // no se tocan jamás, pueden ser médicas». Quitar desde un generador la
  // exclusión que alguien anotó en la ficha es exactamente lo que esa regla
  // previene -- y ahora que desde aquí se puede excluir, hay que comprobar que
  // NO se puede desexcluir lo de la ficha.
  await comoVeterinario(page, request, {
    perros: [{ ...PERRO_DE_PRUEBA, categorias_excluidas_si: "si",
               categorias_excluidas: ["Hueso carnoso"] }],
  });
  await page.getByRole("button", { name: /Añadir alimento/ }).click();
  await expect(page.getByText("fuera por su ficha")).toBeVisible();
  await expect(page.getByRole("button", { name: "Volver a meter Hueso carnoso" }),
    "se puede quitar desde el generador una exclusión de la ficha, que puede ser médica")
    .toHaveCount(0);
});

// ─── LOS OBJETIVOS QUE PONE EL VETERINARIO ──────────────────────────────────
//
// ⚠️ PEDIDO EXPRESO (11 septiembre): «para ciertas patologias el veterinario
// debe poder decidir en que porcentaje quiere dejar la grasa, la proteina, lo
// que sea... y eso hay que aplicarlo tambien».
//
// Y la regla que los limita, suya del mismo dia: «los requisitos se respetan
// SIEMPRE, eso no se negocia». Lo que recorta es el motor; lo que se comprueba
// aqui es que el numero VIAJA y que lo recortado SE VE.
test("lo que fija el veterinario viaja al motor", async ({ page, request }) => {
  await comoVeterinario(page, request);
  await page.getByRole("button", { name: /Tus objetivos/ }).click();
  await page.getByLabel("Máximo de Grasa (g)").fill("30");
  await page.getByLabel("Mínimo de Proteína (g)").fill("80");
  await page.getByRole("button", { name: /Autocompletar/ }).click();

  await expect.poll(async () => {
    const { peticionesFormular } = await leer(request);
    const u = peticionesFormular[peticionesFormular.length - 1];
    return u?.objetivos_del_profesional || null;
  }, { message: "el objetivo que escribe el veterinario no llega al motor: lo teclea, lo ve en " +
                "pantalla y el menú sale igual que sin él" })
    .toEqual({ grasa: { max: 30 }, proteina: { min: 80 } });
});

test("lo que el motor recorta contra FEDIAF se ve", async ({ page, request }) => {
  // ⚠️ Esto es lo que impide el fallo de verdad: aplicar el número de FEDIAF en
  // lugar del suyo EN SILENCIO le deja firmando algo que no escribió, con su
  // nombre y su número de colegiado debajo.
  await comoVeterinario(page, request, {
    objetivosAjustados: [{
      nutriente: "Proteína_total", que_ha_pasado: "suelo_subido", tuyo: 5.0, de_fediaf: 52.1,
      explicacion: "Tu suelo de 5.0 queda por debajo del minimo de FEDIAF (52.1), asi que manda " +
                   "FEDIAF. Los requisitos no se negocian.",
    }],
  });
  await page.getByRole("button", { name: /Autocompletar/ }).click();
  await expect(page.getByText("Lo que no se ha podido aplicar tal cual")).toBeVisible();
  await expect(page.getByText(/queda por debajo del minimo de FEDIAF/),
    "el motor dice que ha recortado el objetivo y la pantalla no lo enseña: el veterinario firma " +
    "una ración creyendo que lleva el número que él escribió")
    .toBeVisible();
});

test("sin objetivos, no se manda el campo", async ({ page, request }) => {
  // Un campo vacío que viaja igual es ruido que un día se lee como un cero.
  await comoVeterinario(page, request);
  await page.getByRole("button", { name: /Autocompletar/ }).click();
  await expect.poll(async () => {
    const { peticionesFormular } = await leer(request);
    const u = peticionesFormular[peticionesFormular.length - 1];
    return u ? ("objetivos_del_profesional" in u) : null;
  }).toBe(false);
});

test("un veterinario formula: no hay automático ni personalizar", async ({ page, request }) => {
  await comoVeterinario(page, request);
  await expect(page.getByRole("button", { name: /^Automático/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Personalizar/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Añadir alimento/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Autocompletar/ })).toBeVisible();
});

test("los nutrientes se recalculan al cambiar los gramos, por categorías", async ({ page, request }) => {
  await comoVeterinario(page, request);
  await page.getByRole("button", { name: /Añadir alimento/ }).click();
  await page.getByLabel("Buscar alimento").fill("pollo");
  await page.getByRole("button", { name: /Carne muscular de pollo/ }).click();

  // Con poca cantidad, faltan cosas y se ven agrupadas.
  await expect(page.getByText("Macronutrientes")).toBeVisible();
  await expect(page.getByText("Minerales")).toBeVisible();
  await expect(page.getByText(/Calcio/)).toBeVisible();

  // Y al subir los gramos se vuelve a preguntar: eso es "en vivo". Si la
  // pantalla pintara una vez y se quedara quieta, esto no cambiaría.
  const antes = (await leer(request)).peticionesFormular.length;
  await page.getByLabel("Gramos de Carne muscular de pollo").fill("700");
  await expect.poll(async () => (await leer(request)).peticionesFormular.length,
    { message: "no se ha vuelto a calcular al cambiar los gramos" }).toBeGreaterThan(antes);
  const peticiones = (await leer(request)).peticionesFormular;
  const ultima = peticiones[peticiones.length - 1];
  expect(ultima.gramos_por_alimento["Carne muscular de pollo"]).toBe(700);
});

test("autocompletar rellena, y lo rellenado se puede seguir editando", async ({ page, request }) => {
  await comoVeterinario(page, request);
  await page.getByRole("button", { name: /Añadir alimento/ }).click();
  await page.getByLabel("Buscar alimento").fill("pollo");
  await page.getByRole("button", { name: /Carne muscular de pollo/ }).click();
  await page.getByLabel("Gramos de Carne muscular de pollo").fill("400");

  await page.getByRole("button", { name: /Autocompletar/ }).click();

  // Ha entrado lo que faltaba...
  const elHueso = page.getByLabel("Gramos de Hueso carnoso de pollo");
  await expect(elHueso).toBeVisible();
  await expect(elHueso).toHaveValue("180");
  // ...sus gramos siguen siendo los suyos...
  await expect(page.getByLabel("Gramos de Carne muscular de pollo")).toHaveValue("400");
  // ...y lo rellenado NO está bloqueado: es la mitad de lo que se pidió.
  await elHueso.fill("220");
  await expect(elHueso).toHaveValue("220");
});

test("cuando no cuadra, ofrece la alternativa sin aplicarla", async ({ page, request }) => {
  await comoVeterinario(page, request, { formularNoCuadra: true });
  await page.getByRole("button", { name: /Añadir alimento/ }).click();
  await page.getByLabel("Buscar alimento").fill("pollo");
  await page.getByRole("button", { name: /Carne muscular de pollo/ }).click();
  await page.getByLabel("Gramos de Carne muscular de pollo").fill("400");
  await page.getByRole("button", { name: /Autocompletar/ }).click();

  await expect(page.getByText(/Lo que no cuadra son las cifras/)).toBeVisible();
  // NO se ha aplicado: sus 400 g siguen ahí y el hueso no ha entrado solo.
  await expect(page.getByLabel("Gramos de Carne muscular de pollo")).toHaveValue("400");
  await expect(page.getByLabel("Gramos de Hueso carnoso de pollo")).toHaveCount(0);
  // Se ofrece, y hasta que no la pide él no entra.
  await page.getByRole("button", { name: /Ver la ración que sí cuadra/ }).click();
  await expect(page.getByLabel("Gramos de Hueso carnoso de pollo")).toHaveValue("200");
});

test("un tope de patología roto se ve aunque FEDIAF diga verde", async ({ page, request }) => {
  // ⚠️ LA REGLA 2. El semáforo de FEDIAF son los requisitos de un perro
  // SANO: un renal con 3084 mg de fósforo salía VERDE. Si esta pantalla
  // enseñara solo el semáforo, el veterinario formularía en verde algo que
  // el motor va a rechazar al final.
  await comoVeterinario(page, request, {
    perros: [{ ...PERRO_DE_PRUEBA, patologia_si: "si", patologias: ["renal"] }],
  });
  await page.getByRole("button", { name: /Añadir alimento/ }).click();
  await page.getByLabel("Buscar alimento").fill("pollo");
  await page.getByRole("button", { name: /Carne muscular de pollo/ }).click();
  await page.getByLabel("Gramos de Carne muscular de pollo").fill("700");

  await expect(page.getByText("Topes por patología")).toBeVisible();
  await expect(page.getByText(/fosforo 1748/)).toBeVisible();
  await expect(page.getByText(/El semáforo de FEDIAF no los ve/)).toBeVisible();
});

// ─── FIRMAR ─────────────────────────────────────────────────────────────────
//
// Una pauta firmada es la forma más difícil de retirar que tiene un menú de
// salir de aquí: un papel con un nombre y un número de colegiado. Lo que se
// vigila aquí es la pantalla; que el sello sirva se comprueba contra el motor
// (BLOQUE 42 de pruebas_completas.py).

test("firmar es un acto: hay que pulsar, y antes se ve con qué nombre sale", async ({ page, request }) => {
  // ⚠️ El modo profesional NO firma solo. Si firmara por estar encendido, el
  // veterinario acabaría con veinte pautas firmadas de las que hizo probando.
  await comoVeterinario(page, request);
  await page.getByRole("button", { name: /Añadir alimento/ }).click();
  await page.getByLabel("Buscar alimento").fill("pollo");
  await page.getByRole("button", { name: /Carne muscular de pollo/ }).click();
  await page.getByLabel("Gramos de Carne muscular de pollo").fill("700");

  // Nada firmado todavía.
  expect((await leer(request)).pautasFirmadas).toHaveLength(0);

  await page.getByRole("button", { name: /Firmar la pauta/ }).click();
  // Antes de firmar se ve QUIÉN firma.
  await expect(page.getByLabel("Nombre del firmante")).toBeVisible();
  await expect(page.getByText(/Nº de colegiado/)).toBeVisible();
  // Y sigue sin haber nada firmado hasta pulsar Firmar.
  expect((await leer(request)).pautasFirmadas).toHaveLength(0);

  await page.getByLabel("Nombre del firmante").fill("Elena Martín");
  await page.getByRole("button", { name: "Firmar", exact: true }).click();

  await expect(page.getByText("Pauta firmada")).toBeVisible();
  await expect(page.getByText(/sello abcdef0123456789/)).toBeVisible();

  const guardadas = (await leer(request)).pautasFirmadas;
  expect(guardadas).toHaveLength(1);
  // Se guarda el documento que SELLÓ LA API, no uno montado en la pantalla.
  expect(guardadas[0].sello).toBe("abcdef0123456789");
  expect(guardadas[0].documento.sello).toBe("abcdef0123456789");
  expect(guardadas[0].num_colegiado).toBe("COLVET-12345");
});

test("una ración a medias no se puede firmar", async ({ page, request }) => {
  await comoVeterinario(page, request);
  await page.getByRole("button", { name: /Añadir alimento/ }).click();
  await page.getByLabel("Buscar alimento").fill("pollo");
  await page.getByRole("button", { name: /Carne muscular de pollo/ }).click();
  // 100 g: el servidor de mentira contesta "rojo" por debajo de 500 g.
  await page.getByLabel("Gramos de Carne muscular de pollo").fill("100");

  const boton = page.getByRole("button", { name: /Firmar la pauta/ });
  await expect(boton).toBeDisabled();
  expect((await leer(request)).pautasFirmadas).toHaveLength(0);
});

test("y si la API dice que no, no se firma y se explica", async ({ page, request }) => {
  // La última palabra la tiene el motor, no la pantalla: aunque aquí se vea
  // verde, si al firmar la API dice que no, no se guarda nada.
  await comoVeterinario(page, request, { pautaNoSeFirma: true });
  await page.getByRole("button", { name: /Añadir alimento/ }).click();
  await page.getByLabel("Buscar alimento").fill("pollo");
  await page.getByRole("button", { name: /Carne muscular de pollo/ }).click();
  await page.getByLabel("Gramos de Carne muscular de pollo").fill("700");

  await page.getByRole("button", { name: /Firmar la pauta/ }).click();
  await page.getByLabel("Nombre del firmante").fill("Elena Martín");
  await page.getByRole("button", { name: "Firmar", exact: true }).click();

  await expect(page.getByText(/no se puede firmar/)).toBeVisible();
  await expect(page.getByText("Pauta firmada")).toHaveCount(0);
  expect((await leer(request)).pautasFirmadas).toHaveLength(0);
});

test("lo firmado queda en el historial del paciente, y no se edita", async ({ page, request }) => {
  // ⚠️ El historial es una LISTA de documentos, no un documento que se va
  // pisando. Es la única forma de poder mirar atrás y ver qué se pautó y
  // cuándo -- y por eso en la tabla de verdad no hay política de update ni
  // de delete: una pauta firmada no se edita, se firma otra.
  await comoVeterinario(page, request);
  await page.getByRole("button", { name: /Añadir alimento/ }).click();
  await page.getByLabel("Buscar alimento").fill("pollo");
  await page.getByRole("button", { name: /Carne muscular de pollo/ }).click();
  await page.getByLabel("Gramos de Carne muscular de pollo").fill("700");
  await page.getByRole("button", { name: /Firmar la pauta/ }).click();
  await page.getByLabel("Nombre del firmante").fill("Elena Martín");
  await page.getByRole("button", { name: "Firmar", exact: true }).click();
  await expect(page.getByText("Pauta firmada")).toBeVisible();

  await page.getByRole("button", { name: "Menú", exact: true }).last().click();
  await page.getByRole("dialog", { name: "Panel lateral" })
            .getByRole("button", { name: "Pautas firmadas", exact: true }).click();

  await expect(page.getByText(/Elena Martín · nº COLVET-12345/)).toBeVisible();
  await expect(page.getByText(/sello abcdef0123456789/)).toBeVisible();
  await expect(page.getByText(/Carne muscular de pollo/)).toBeVisible();
});

test("un tutor no ve las pautas firmadas por ningún lado", async ({ page, request }) => {
  // No es que no las tenga: es que un tutor no firma nada, así que la
  // entrada no significaría nada para él.
  await configurar(request, {
    rolProfesional: false, rolVerificado: false,
    perros: [PERRO_DE_PRUEBA], accesos: [], menus: [],
  });
  await page.goto("/");
  await page.getByPlaceholder("Email").fill(CUENTA_DE_PRUEBA.email);
  await page.getByPlaceholder("Contraseña").fill(CUENTA_DE_PRUEBA.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  // ⚠️ ÉSTE ES EL TEST DEL TUTOR, y espera SU pantalla. Un tutor no ve nunca
  // la «Ficha del paciente», así que esperarla aquí deja el test colgado un
  // minuto y lo tira -- pasó al cambiar las esperas en bloque el 8 de
  // septiembre. Las dos pantallas de llegada son distintas a propósito.
  await esperarLaFicha(page);
  await page.getByRole("button", { name: "Menú", exact: true }).last().click();
  await expect(page.getByRole("dialog", { name: "Panel lateral" })
                   .getByRole("button", { name: "Pautas firmadas" })).toHaveCount(0);
});

test("guardar no te manda a la pantalla del dueño: lo dice y te deja donde estabas", async ({ page, request }) => {
  // ⚠️ CASO REAL DE LA USUARIA (29 agosto): "cuando guardas la pauta te lleva
  // a una pantalla igual que el generador de menú del usuario, y eso no me
  // gusta... tienes ahí el editar, el cómo darlo... no tiene sentido, tiene
  // que ser profesional". Se queda donde está, con lo que acaba de formular
  // delante, y se le dice dónde ha quedado.
  await comoVeterinario(page, request);
  await page.getByRole("button", { name: /Añadir alimento/ }).click();
  await page.getByLabel("Buscar alimento").fill("pollo");
  await page.getByRole("button", { name: /Carne muscular de pollo/ }).click();
  await page.getByLabel("Gramos de Carne muscular de pollo").fill("700");
  await page.getByRole("button", { name: /Guardar la pauta/ }).click();

  await expect(page.getByText(/Guardada en los menús de/)).toBeVisible();
  // Y sigue en el formulador, no en la pantalla del dueño.
  await expect(page.getByText("Formular la ración")).toBeVisible();
  await expect(page.getByText(/Cómo se prepara|Plan de transición|Lista de la compra/)).toHaveCount(0);
});

test("el «cómo darlo» lo propone Rawku y lo puede cambiar entero", async ({ page, request }) => {
  // ⚠️ PEDIDO EXPRESO: "tiene que haber una sección de cómo darlo que
  // proponga Rawku, pero que él pueda modificar todo lo que quiera". Lo que
  // firma un colegiado no puede ser un texto que él no haya podido tocar.
  await comoVeterinario(page, request);
  await page.getByRole("button", { name: /Añadir alimento/ }).click();
  await page.getByLabel("Buscar alimento").fill("pollo");
  await page.getByRole("button", { name: /Carne muscular de pollo/ }).click();

  const campo = page.getByLabel("Cómo darlo");
  await expect(campo).toBeVisible();
  // Rawku propone: la indicación de la categoría del alimento que hay puesto.
  await expect(campo).toHaveValue(/Carne muscular/);
  // Y se puede reescribir entero.
  await campo.fill("Se sirve a temperatura ambiente, en dos tomas.");
  await expect(campo).toHaveValue("Se sirve a temperatura ambiente, en dos tomas.");
  // Con la puerta de vuelta, para no perder la propuesta por haberla tocado.
  await page.getByRole("button", { name: /Volver a la propuesta/ }).click();
  await expect(campo).toHaveValue(/Carne muscular/);
});

test("los menús de TODOS sus pacientes, y se pueden buscar", async ({ page, request }) => {
  // ⚠️ PEDIDO EXPRESO (29 agosto): "en lo de los menús tiene que haber una
  // opción de filtros, rollo filtrar por paciente, filtrar por nombre del
  // dueño, filtrar por raza".
  //
  // La pantalla de un dueño enseña los menús DEL perro en el que está,
  // porque un dueño entra ya dentro de su perro. Un veterinario entra a
  // buscar, y lo que busca puede ser de cualquiera de sus pacientes.
  const NALA = { ...PERRO_DE_PRUEBA, nombre: "Nala", raza: "Pastor Alemán",
                 tutor_nombre: "María López" };
  const CAIRO = { ...PERRO_DE_PRUEBA, id: "22222222-2222-4222-8222-222222222222",
                  nombre: "Cairo", raza: "Bulldog Francés", tutor_nombre: "Juan Pérez" };
  await configurar(request, {
    rolProfesional: true, rolVerificado: true,
    perros: [NALA, CAIRO],
    accesos: [{ perro_id: NALA.id, estado: "activo" },
              { perro_id: CAIRO.id, estado: "activo" }],
    menus: [
      { id: "m1", perro_id: NALA.id, creado_por: CUENTA_DE_PRUEBA.userId, modo: "formulado",
        der_real: 1200, created_at: "2026-08-28T10:00:00.000Z", menus_data: [] },
      { id: "m2", perro_id: CAIRO.id, creado_por: CUENTA_DE_PRUEBA.userId, modo: "formulado",
        der_real: 660, created_at: "2026-08-29T10:00:00.000Z", menus_data: [] },
    ],
  });
  await page.goto("/");
  await page.getByPlaceholder("Email").fill(CUENTA_DE_PRUEBA.email);
  await page.getByPlaceholder("Contraseña").fill(CUENTA_DE_PRUEBA.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await esperarElPaciente(page);
  await page.getByRole("button", { name: "Menú", exact: true }).last().click();
  await page.getByRole("dialog", { name: "Panel lateral" })
            .getByRole("button", { name: "Menús", exact: true }).click();

  // Las FILAS de la lista, no la burbuja de arriba (que también dice el
  // nombre del paciente abierto y haría pasar la prueba sin lista).
  // ⚠️ Desde el 7 de septiembre cada fila lleva su propio nombre
  // («Menú de Nala»): antes su nombre accesible era el texto entero de la
  // tarjeta, y «Nala» chocaba con la burbuja de la cabecera.
  const filaDe = (nombre) => page.getByRole("button", { name: `Menú de ${nombre}` });

  // Están los de los dos pacientes, no solo los del que está abierto.
  await expect(page.getByRole("heading", { name: /Los menús de tus pacientes/ })).toBeVisible();
  await expect(filaDe("Nala")).toBeVisible();
  await expect(filaDe("Cairo")).toBeVisible();

  // Y se busca por paciente, por tutor y por raza -- sin tildes.
  const buscador = page.getByLabel("Buscar menús");
  await buscador.fill("cairo");
  await expect(filaDe("Nala")).toHaveCount(0);
  await expect(filaDe("Cairo")).toBeVisible();
  await buscador.fill("María");
  await expect(filaDe("Nala")).toBeVisible();
  await expect(filaDe("Cairo")).toHaveCount(0);
  await buscador.fill("bulldog");
  await expect(filaDe("Cairo")).toBeVisible();
  await buscador.fill("pastor aleman");   // sin tilde, como se escribe en un móvil
  await expect(filaDe("Nala")).toBeVisible();
});

// ─── LO QUE LA FICHA RECOGE TIENE QUE LLEGAR TAMBIÉN DESDE AQUÍ ──────────────
//
// ⚠️ POR QUÉ EXISTE, y es una corrección (11 de septiembre de 2026)
//
// Elena, probándolo ella: «por eso te dije que todo lo tienes que probar dentro
// de la app con los usuarios que tienes para comprobar que funciona, y no lo
// has hecho en nada, ni con todo lo que hemos aplicado para el perfil de
// veterinario hoy ni para el de usuarios».
//
// Y el perfil de veterinario tenía el fallo entero: `formulador.jsx` no mandaba
// NI la actividad NI el nivel de premios en ninguna de sus llamadas a
// `/formular/*`. El generador del tutor sí los mandaba, porque el conversor de
// actividad vivía dentro de `App.jsx`; esta pantalla no puede importar de allí
// sin hacer un ciclo, así que se quedó sin ellos y nadie lo vio.
//
// QUÉ SE PERDÍA, que es lo que lo hace un fallo y no una omisión:
//   · Sin `premios_nivel`, al paciente al que su dueño le da un 20 % de las
//     calorías en premios se le formula la ración como si no tomara ninguno --
//     y esas calorías se suman POR ENCIMA de la ración que el veterinario FIRMA.
//   · Sin `actividad`, el motor tiene que deducirla del cociente DER/peso^0,75,
//     que confunde al Gran Danés (su cifra es POR RAZA, no por actividad).
//
// Es la misma familia que `premios-en-cada-peticion.spec.js` y
// `actividad-en-cada-peticion.spec.js`, que vigilaban los cinco cuerpos de
// App.jsx y no este, que es el SEXTO.
test.describe("los datos de la ficha llegan desde el formulador", () => {
  for (const [nivel, actividadGuardada, claveEsperada] of [
    ["mas_del_maximo", "trabajo", "trabajo"],
    ["ninguno", "baja", "sedentario"],
  ]) {
    test(`premios «${nivel}» y actividad «${actividadGuardada}» viajan a /formular`,
      async ({ page, request }) => {
        await comoVeterinario(page, request, {
          perros: [{ ...PERRO_DE_PRUEBA, premios_nivel: nivel, actividad: actividadGuardada }],
        });
        await page.getByRole("button", { name: /Autocompletar/ }).click();

        await expect.poll(async () => {
          const { peticionesFormular } = await leer(request);
          const u = peticionesFormular[peticionesFormular.length - 1];
          return { premios: u?.premios_nivel ?? null, actividad: u?.actividad ?? null };
        }, { message: "la pantalla del veterinario formula sin el nivel de premios o sin la " +
                      "actividad del paciente. La ración que va a FIRMAR está calculada con " +
                      "datos que la ficha sí tiene" })
          .toEqual({ premios: nivel, actividad: claveEsperada });
      });
  }
});

// ─── LA SEMANA DEL PACIENTE, PROBADA EN LA APP ───────────────────────────────
//
// ⚠️ POR QUÉ EXISTE, y es la segunda corrección del mismo día (11 de septiembre
// de 2026). Elena: «de la lista de cosas que teníamos que hacer hoy de
// veterinario no se han completado todas».
//
// El presupuesto semanal de seguridad crónica para el formulador se construyó
// hoy en TRES piezas, y la primera estaba desconectada:
//
//   1. `App.jsx` tenía que pasarle al formulador las raciones ya puestas
//      → NO LE PASABA NADA. El prop se quedaba en su `[]` por defecto.
//   2. `formulador.jsx` las manda como `raciones_ya_puestas`  ✔ hecho
//   3. El motor resta y se lo pasa al solver como restricción DURA  ✔ BLOQUE 92
//
// O sea: medido en el motor, funcionando en el motor, y en la app no llegaba
// ninguna ración. Esto lo vigila desde la app, que es donde faltaba.
test("las raciones ya puestas viajan al motor con sus días", async ({ page, request }) => {
  // Un menú que el PROFESIONAL ya formuló para este paciente, con sus días.
  // Es la forma exacta que guarda `onGuardar`: `menus_data[]` con `menu`,
  // `formulado_por_el_profesional` y `dias`.
  await comoVeterinario(page, request, {
    menus: [{
      id: "m-semana-1",
      perro_id: PERRO_DE_PRUEBA.id,
      nombre: "Ración de lunes a miércoles",
      created_at: "2026-09-10T10:00:00.000Z",
      menus_data: [{
        factible: true,
        formulado_por_el_profesional: true,
        dias: 3,
        menu: { "Carne muscular de pollo": 400, "Hueso carnoso de pollo": 140 },
      }],
    }],
  });

  await page.getByRole("button", { name: /Autocompletar/ }).click();

  await expect.poll(async () => {
    const { peticionesFormular } = await leer(request);
    const u = peticionesFormular[peticionesFormular.length - 1];
    return u?.raciones_ya_puestas || null;
  }, { message: "el formulador del veterinario formula SIN las raciones que ya hay puestas en la " +
                "semana. El presupuesto semanal de seguridad crónica está construido en el motor " +
                "y no se está usando: cada ración se calcula como si fuera la semana entera" })
    .toEqual([{ gramos: { "Carne muscular de pollo": 400, "Hueso carnoso de pollo": 140 }, dias: 3 }]);
});

// Y los días de ESTA ración, que es la otra mitad: sin ellos el servidor no
// sabe por cuánto multiplicar lo que se va a llevar del presupuesto.
test("los días que cubre esta ración viajan en cada llamada", async ({ page, request }) => {
  await comoVeterinario(page, request);
  await page.getByLabel("Días que cubre esta ración").fill("4");
  await page.getByRole("button", { name: /Autocompletar/ }).click();

  await expect.poll(async () => {
    const { peticionesFormular } = await leer(request);
    const u = peticionesFormular[peticionesFormular.length - 1];
    return u?.dias_de_esta_racion ?? null;
  }, { message: "los días que el veterinario ha dicho que cubre esta ración no llegan al motor" })
    .toBe(4);
});

// ─── LOS NUTRIENTES QUE SE PUEDEN FIJAR LOS ENUMERA EL MOTOR ────────────────
//
// ⚠️ POR QUÉ EXISTE (11 de septiembre de 2026). El panel «Tus objetivos» tenía
// OCHO nutrientes escritos a mano dentro de `formulador.jsx`. El motor acepta
// los 46 que verifica: la clave viaja tal cual y `_objetivos_dentro_de_fediaf`
// la busca en `verificar.MAPA`. O sea que los otros 38 no faltaban por el
// motor, faltaban porque esta pantalla decidía la lista -- que es justo lo que
// `GET /vocabulario` existe para impedir, y la cadena es FUENTE manda, MOTOR la
// implementa, APP la ofrece.
//
// SE SIEMBRAN NOMBRES INVENTADOS a propósito, como en `vocabulario.spec.js`:
// con los nombres de verdad, «la app lo ha leído del motor» y «la app está
// pintando sus ocho de respaldo» se ven EXACTAMENTE IGUAL en pantalla, y la
// prueba pasaría en verde con la petición entera comentada.
const OBJETIVOS_INVENTADOS = {
  objetivos_del_profesional: {
    de_donde: "inventado por tests/formulador.spec.js",
    cuantos: 3,
    nutrientes: [
      { clave: "proteina", nombre_del_requisito: "Proteína_total", unidad: "g",
        por: "1000 kcal", de_la_tabla_III_3b: true,
        dueno: null, veterinario: { titulo: "Zumbito total (g/1000 kcal)", detalle: null } },
      { clave: "selenio", nombre_del_requisito: "Selenio", unidad: "µg",
        por: "1000 kcal", de_la_tabla_III_3b: true,
        dueno: null, veterinario: { titulo: "Farfalio (µg/1000 kcal)", detalle: null } },
      { clave: "triptofano", nombre_del_requisito: "Triptofano", unidad: "g",
        por: "1000 kcal", de_la_tabla_III_3b: true,
        dueno: null, veterinario: { titulo: "Merluzina (g/1000 kcal)", detalle: null } },
    ],
  },
};

test("los nutrientes que se pueden fijar salen de /vocabulario, no de la app", async ({ page, request }) => {
  await comoVeterinario(page, request, { vocabulario: OBJETIVOS_INVENTADOS });

  await page.getByRole("button", { name: /Tus objetivos/ }).click();

  // La palabra inventada del motor, en pantalla. Si saliera «Proteína (g)» es
  // que se está pintando el respaldo con la petición hecha.
  await expect(page.getByText("Zumbito total (g/1000 kcal)")).toBeVisible();
  await expect(page.getByText("Merluzina (g/1000 kcal)")).toBeVisible();
  await expect(page.getByText("Proteína (g/1000 kcal)")).toHaveCount(0);

  // Y el recuento sale de la misma lista que se pinta, no de un número aparte.
  await expect(page.getByText("3 nutrientes · los que verifica el motor")).toBeVisible();
});

// El buscador: 46 filas de dos casillas no se recorren a ojo. Filtra lo que se
// PINTA y nada más -- lo ya fijado sigue viajando al motor aunque se esconda,
// que es lo contrario de lo que haría un filtro que tocara los datos.
test("el buscador de objetivos filtra el pintado y no lo fijado", async ({ page, request }) => {
  await comoVeterinario(page, request, { vocabulario: OBJETIVOS_INVENTADOS });
  await page.getByRole("button", { name: /Tus objetivos/ }).click();

  await page.getByLabel("Mínimo de Zumbito total (g/1000 kcal)").fill("90");
  await page.getByLabel("Buscar nutriente").fill("merluz");

  await expect(page.getByText("Zumbito total (g/1000 kcal)")).toHaveCount(0);
  await expect(page.getByText("Merluzina (g/1000 kcal)")).toBeVisible();

  await page.getByRole("button", { name: /Autocompletar/ }).click();
  await expect.poll(async () => {
    const { peticionesFormular } = await leer(request);
    const u = peticionesFormular[peticionesFormular.length - 1];
    return u?.objetivos_del_profesional || null;
  }, { message: "el objetivo que el buscador esconde ha dejado de viajar al motor. El filtro es " +
                "de pintado: esconder una fila no puede borrar lo que el profesional ya escribió" })
    .toEqual({ proteina: { min: 90 } });
});

// Y el respaldo, que tiene que seguir sirviendo: Render duerme a los 15 minutos
// y sin `/vocabulario` la pantalla no puede quedarse sin panel de objetivos.
test("sin /vocabulario se pintan los ocho de respaldo y no un hueco", async ({ page, request }) => {
  await comoVeterinario(page, request);   // sin sembrar vocabulario: la API da 404
  await page.getByRole("button", { name: /Tus objetivos/ }).click();

  await expect(page.getByText("Proteína (g/1000 kcal)")).toBeVisible();
  await expect(page.getByText("8 nutrientes · los que verifica el motor")).toBeVisible();
});
