// ─── LO QUE SE ENTREGA, Y CON QUÉ PROPORCIONES SE FORMULA ────────────────────
//
// Dos cosas pedidas el 8 de septiembre, las dos de la fase 1 de
// VETERINARIOS.md, y las dos con el mismo fondo: hasta hoy el veterinario
// podía formular pero no podía ni decidir cómo ni entregar el resultado.
//
//   1. EL PELDAÑO DE LA ESCALERA. «Poder elegirlo. Hoy se baja solo y se
//      avisa; un profesional quiere decidir si prefiere otro reparto antes
//      que soltar la proporción de hueso». Y en el formulador era peor que
//      eso: autocompletar NO recorría la escalera nunca, así que un
//      veterinario tenía MENOS margen que un tutor.
//
//   2. LA PAUTA EN PAPEL, con el logo de la clínica. Es el final del
//      trabajo: lo que se lleva el dueño a casa. Sin esto se formula aquí y
//      se copian los gramos a mano en la plantilla de siempre.
import { test, expect } from "@playwright/test";
import { CUENTA_DE_PRUEBA, PERRO_DE_PRUEBA } from "./fake-supabase.js";

const SUPABASE_FALSO = "http://127.0.0.1:54321";

const configurar = async (request, opciones) => {
  const res = await request.post(`${SUPABASE_FALSO}/__control`,
    { data: { sinTablaAccesos: false, olvidarFormular: true, ...opciones } });
  expect(res.ok()).toBeTruthy();
  return res.json();
};

// Leer no puede borrar: `configurar` limpia las peticiones, así que mirar
// con ella dejaría los contadores a cero. Mismo criterio que formulador.spec.
const leer = async (request) => {
  const res = await request.post(`${SUPABASE_FALSO}/__control`, { data: {} });
  expect(res.ok()).toBeTruthy();
  return res.json();
};

const PACIENTE = { ...PERRO_DE_PRUEBA, tutor_nombre: "María López",
                   tutor_contacto: "600 111 222" };

const comoVeterinario = async (page, request, extra = {}) => {
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
  await page.getByText("Nombre y sexo").waitFor();
};

const irAlFormulador = async (page) => {
  await page.getByRole("button", { name: "Menú", exact: true }).last().click();
  await page.getByRole("dialog", { name: "Panel lateral" })
            .getByRole("button", { name: "Menús", exact: true }).click();
  await page.getByRole("button", { name: /Hacer otro menú/ }).click();
  await expect(page.getByText("Formular la ración")).toBeVisible();
};

const abrirAjustes = async (page) => {
  await page.getByRole("button", { name: /Paciente actual/ }).last().click();
  await page.getByRole("button", { name: "Ajustes", exact: true }).click();
};

const ponerUnAlimento = async (page, gramos = "700") => {
  await page.getByRole("button", { name: /Añadir alimento/ }).click();
  await page.getByLabel("Buscar alimento").fill("pollo");
  await page.getByRole("button", { name: /Carne muscular de pollo/ }).click();
  await page.getByLabel("Gramos de Carne muscular de pollo").fill(gramos);
};


// ─── 1. EL PELDAÑO DE LA ESCALERA ───────────────────────────────────────────

test("el veterinario elige con qué proporciones se completa la ración", async ({ page, request }) => {
  await comoVeterinario(page, request);
  await irAlFormulador(page);

  // De partida, las proporciones completas: la escalera no se baja sola
  // aquí, y menos sin decirlo.
  await expect(page.getByText("Proporciones BARF completas")).toBeVisible();

  await page.getByRole("button", { name: /Proporciones/ }).first().click();
  await expect(page.getByRole("button", { name: "Sin mínimo de vísceras, hígado y verdura" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sin tope de vísceras, hígado y verdura" })).toBeVisible();
  // Y dice lo que de verdad importa: que un peldaño no relaja la nutrición.
  await expect(page.getByText(/Los 43 requisitos de FEDIAF.*son idénticos en todos/s)).toBeVisible();
});

test("y el peldaño elegido LLEGA al motor, no se queda en la pantalla", async ({ page, request }) => {
  // ⚠️ ESTA ES LA PRUEBA DEL ARREGLO. Un selector que se pinta bonito y no
  // viaja en la petición es exactamente la familia de fallos de este
  // proyecto: no da error, se ve perfecto y no hace nada.
  await comoVeterinario(page, request);
  await irAlFormulador(page);
  await ponerUnAlimento(page);

  await page.getByRole("button", { name: /Proporciones/ }).first().click();
  await page.getByRole("button", { name: "Sin tope de vísceras, hígado y verdura" }).click();
  await page.getByRole("button", { name: /Autocompletar/ }).click();
  await expect(page.getByLabel("Gramos de Hueso carnoso de pollo")).toBeVisible();

  const peticiones = (await leer(request)).peticionesFormular
    .filter((p) => p.ruta === "/formular/autocompletar");
  expect(peticiones.length).toBeGreaterThan(0);
  expect(peticiones[peticiones.length - 1].peldano)
    .toBe("tope_maximo_de_visceras_higado_y_verdura");
});

test("y cambiar de peldaño es lo que hace que salga la ración", async ({ page, request }) => {
  // El caso real que motivó la escalera entera: la pancreatitis de 25 kg no
  // sale con las proporciones completas y sí soltando el techo de la verdura.
  // Aquí el servidor de mentira se comporta igual, para poder comprobar el
  // recorrido: no sale → se dice en qué peldaño no sale → se elige otro → sale.
  await comoVeterinario(page, request, { soloSaleEnElUltimoPeldano: true });
  await irAlFormulador(page);
  await ponerUnAlimento(page);

  await page.getByRole("button", { name: /Autocompletar/ }).click();
  // No sale, y NO se queda en "no existe": dice en qué peldaño no ha salido
  // y que queda escalera por debajo. Es la diferencia entre cerrar la
  // pantalla y probar lo siguiente.
  await expect(page.getByText(/proporciones BARF completas/)).toBeVisible();

  // El selector se abre solo: si la salida está ahí, no puede estar plegada.
  await page.getByRole("button", { name: "Sin tope de vísceras, hígado y verdura" }).click();
  await page.getByRole("button", { name: /Autocompletar/ }).click();
  await expect(page.getByLabel("Gramos de Hueso carnoso de pollo")).toBeVisible();
});

test("a un tutor no le aparece ningún selector de proporciones", async ({ page, request }) => {
  // El otro lado. La escalera del tutor sigue bajando sola y avisando: para
  // él esto no es una decisión, es un problema resuelto.
  await configurar(request, {
    rolProfesional: false, rolVerificado: false,
    perros: [PACIENTE], accesos: [], menus: [],
  });
  await page.goto("/");
  await page.getByPlaceholder("Email").fill(CUENTA_DE_PRUEBA.email);
  await page.getByPlaceholder("Contraseña").fill(CUENTA_DE_PRUEBA.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.getByText("Nombre y sexo").waitFor();
  await page.getByRole("button", { name: "Menú", exact: true }).last().click();
  await page.getByRole("dialog", { name: "Panel lateral" })
            .getByRole("button", { name: "Mis menús", exact: true }).click();
  await page.getByRole("button", { name: /Hacer otro menú/ }).click();

  await expect(page.getByText("Proporciones BARF completas")).toHaveCount(0);
});


// ─── 2. LA CLÍNICA Y LA PAUTA EN PAPEL ──────────────────────────────────────

test("los datos de la clínica se GUARDAN, no solo se pintan", async ({ page, request }) => {
  // ⚠️ Se comprueba lo guardado y no la pantalla. La ficha se pinta del
  // estado local: puede verse perfecta y estar guardada vacía, que es el
  // fallo que describe CLAUDE.md y que no encuentra la usuaria hasta días
  // después.
  await comoVeterinario(page, request);
  await abrirAjustes(page);

  await page.getByLabel("Nombre de la clínica").fill("Clínica Veterinaria Arganzuela");
  await page.getByLabel("Contacto de la clínica").fill("C/ Embajadores 12 · 910 000 000");
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(page.getByText(/Sale en la próxima pauta/)).toBeVisible();

  const guardado = (await leer(request)).clinica;
  expect(guardado.clinica_nombre).toBe("Clínica Veterinaria Arganzuela");
  expect(guardado.clinica_contacto).toBe("C/ Embajadores 12 · 910 000 000");
});

test("y si falta la migración se DICE, en vez de fingir que se ha guardado", async ({ page, request }) => {
  // Un botón de Guardar que parece funcionar y no guarda nada es peor que
  // uno que da error: el error se arregla, el silencio se descubre el día
  // que imprimes una pauta sin logo delante de un cliente.
  await comoVeterinario(page, request, { sinColumnasDeClinica: true });
  await abrirAjustes(page);
  await page.getByLabel("Nombre de la clínica").fill("Clínica de prueba");
  await page.getByRole("button", { name: "Guardar", exact: true }).click();

  await expect(page.getByText(/migracion-clinica\.sql/)).toBeVisible();
  await expect(page.getByText(/Sale en la próxima pauta/)).toHaveCount(0);
});

test("la pauta se imprime con la clínica, el paciente, la ración y el sello", async ({ page, request }) => {
  await comoVeterinario(page, request, {
    clinica: { clinica_nombre: "Clínica Veterinaria Arganzuela",
               clinica_contacto: "C/ Embajadores 12" },
  });
  await irAlFormulador(page);
  await ponerUnAlimento(page, "700");

  await page.getByRole("button", { name: /Firmar la pauta/ }).click();
  await page.getByLabel("Nombre del firmante").fill("Elena Martín");
  await page.getByRole("button", { name: "Firmar", exact: true }).click();
  await expect(page.getByText("Pauta firmada")).toBeVisible();

  // El final del trabajo, en el mismo sitio: firmar y no poder entregar
  // obligaba a salir a buscar la pauta recién hecha.
  await page.getByRole("button", { name: /Imprimir o guardar en PDF/ }).first().click();

  const papel = page.getByRole("button", { name: "Cerrar la vista de impresión" });
  await expect(papel).toBeVisible();
  // La clínica que firma.
  await expect(page.getByText("Clínica Veterinaria Arganzuela")).toBeVisible();
  await expect(page.getByText("C/ Embajadores 12")).toBeVisible();
  // El paciente y su tutor, congelados DENTRO del documento. `exact` porque
  // el nombre sale también en la línea de contexto de la cabecera: lo que se
  // comprueba aquí es el papel, no la pantalla de detrás.
  await expect(page.getByText("Nala", { exact: true })).toBeVisible();
  await expect(page.getByText(/Tutor: María López/)).toBeVisible();
  // La ración, con sus gramos. Se busca la CELDA de la tabla del papel y no
  // el texto suelto: el nombre del alimento está también en el formulador
  // que hay debajo, y comprobar ése pasaría con la tabla vacía.
  await expect(page.getByRole("cell", { name: "Carne muscular de pollo" })).toBeVisible();
  // Dos celdas con «700 g»: la del alimento y la del total. Con un solo
  // alimento coinciden, y que coincidan es lo correcto -- el total de una
  // ración de un alimento es ese alimento.
  await expect(page.getByRole("cell", { name: "700 g" })).toHaveCount(2);
  await expect(page.getByRole("cell", { name: "Total" })).toBeVisible();
  // Quién firma, y el sello con el que se puede comprobar el papel.
  // El firmante sale también en el recuadro de «Pauta firmada» que hay
  // debajo, así que se mira el bloque de firma del papel: el que lleva el
  // número de colegiado y la raya para el sello de la clínica.
  await expect(page.getByText(/Nº de colegiado COLVET-12345/)).toBeVisible();
  await expect(page.getByText("FIRMA Y SELLO")).toBeVisible();
  await expect(page.getByText("Elena Martín").last()).toBeVisible();
  // El sello, en el pie del papel: es lo que permite comprobar un año
  // después que este documento es el que se firmó.
  await expect(page.getByText(/Documento sellado abcdef0123456789/)).toBeVisible();
});

test("y también desde el historial, meses después", async ({ page, request }) => {
  // Es donde se vuelve cuando el tutor llama pidiendo otra copia. Y lo que
  // se imprime es el documento GUARDADO: la ficha del perro de hoy no pinta
  // nada aquí -- si pintara, el mismo papel diría cosas distintas según
  // cuándo lo imprimes, con la misma firma debajo.
  await comoVeterinario(page, request, {
    clinica: { clinica_nombre: "Clínica Veterinaria Arganzuela" },
  });
  await irAlFormulador(page);
  await ponerUnAlimento(page, "700");
  await page.getByRole("button", { name: /Firmar la pauta/ }).click();
  await page.getByLabel("Nombre del firmante").fill("Elena Martín");
  await page.getByRole("button", { name: "Firmar", exact: true }).click();
  await expect(page.getByText("Pauta firmada")).toBeVisible();

  await page.getByRole("button", { name: "Menú", exact: true }).last().click();
  await page.getByRole("dialog", { name: "Panel lateral" })
            .getByRole("button", { name: "Pautas firmadas", exact: true }).click();

  await page.getByRole("button", { name: /^Imprimir la pauta del/ }).first().click();
  await expect(page.getByRole("button", { name: "Cerrar la vista de impresión" })).toBeVisible();
  await expect(page.getByText("Clínica Veterinaria Arganzuela")).toBeVisible();
  await expect(page.getByText(/Nº de colegiado COLVET-12345/)).toBeVisible();
});
