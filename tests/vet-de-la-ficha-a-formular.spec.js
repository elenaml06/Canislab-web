// ─── DE LA FICHA A LA RACIÓN, SIN ESCALONES ─────────────────────────────────
//
// ⚠️ PEDIDO EXPRESO (8 de septiembre), y encontrado ABRIENDO LA APP, no
// leyendo el código: «cuando generas el perfil del perro te aparece igual que
// el modo usuario, o sea te aparecen todos los datos para poder modificarlos
// y lo de ir al generador de menús. Yo creo que eso debería estar ahí
// simplemente en esa pantalla, y que la siguiente pantalla sea directamente
// ir al generador de menús».
//
// Era verdad, y detrás había DOS fallos de navegación que no dan error y que
// solo se ven usando la app:
//
//   1. La pantalla «Perfil» del tutor se colaba en medio. Al guardar la ficha
//      -- y al ABRIR un paciente desde la lista -- salía el perro rosa, «Nala
//      necesita 1211 kilocalorías al día», «pésalo cada 2-3 semanas y ajusta
//      si lo ves más delgado o más gordo» y «Borrar a Nala de mi cuenta».
//      Una pantalla entera que repite lo que el veterinario acaba de
//      rellenar, para que su único botón útil sea ir al generador.
//
//   2. La ficha secuestraba la navegación. Con ella abierta `paso` valía 1, y
//      el render mira `paso` antes que `fase`: pulsar «Menús» o «Pacientes»
//      en el panel cambiaba la fase de verdad y seguías viendo la ficha. Sin
//      error, sin nada que mirar, el botón parecía muerto. Es el mismo fallo
//      que ya está escrito en `navegarDesdeElPanel` («navegabas bien y no lo
//      veías»), otra vez y en otro sitio.
//
// La raíz de los dos es la misma y por eso se arreglan juntos: en modo
// profesional `paso` no puede decidir qué se pinta. La ficha clínica ES toda
// la fase "onboarding", en una pantalla, y cualquier otra fase manda.
import { test, expect } from "@playwright/test";
import { CUENTA_DE_PRUEBA, PERRO_DE_PRUEBA } from "./fake-supabase.js";
import { esperarElPaciente, laFichaHaCargado } from "./ayudas.js";

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
};

const abrirElPanel = async (page) => {
  await page.getByRole("button", { name: "Menú", exact: true }).last().click();
  return page.getByRole("dialog", { name: "Panel lateral" });
};

// Los textos que delatan la pantalla del dueño. Se comprueban por lo que
// DICEN y no por el nombre de una función: son exactamente las frases que la
// usuaria leyó en pantalla y que a un veterinario no le tocan.
const laPantallaDelDueno = (page) => page.getByText(/pésalo cada 2-3 semanas/);


test("al abrir un paciente se entra en su ficha, no en la pantalla del dueño", async ({ page, request }) => {
  await entrarComoVeterinario(page, request);
  await esperarElPaciente(page);

  // Y las kcal, que vivían SOLO en la pantalla del dueño: si se hubiera
  // quitado esa pantalla sin traerlas, el veterinario se habría quedado sin
  // el número del que cuelga todo lo demás.
  await expect(page.getByText(/1211 kcal\/día/)).toBeVisible();
  await expect(page.getByText(/Adulto/).first()).toBeVisible();

  await expect(laPantallaDelDueno(page)).toHaveCount(0);
  await expect(page.getByText(/Borrar a Nala de mi cuenta/)).toHaveCount(0);
});

test("y la ficha no lleva el contador de seis pasos del asistente", async ({ page, request }) => {
  // Se pintaba «/ 6» con seis rayitas apagadas, prometiendo cinco pantallas
  // que no existen: la ficha del veterinario es UNA, que es justo lo que se
  // pidió el 29 de agosto.
  await entrarComoVeterinario(page, request);
  await esperarElPaciente(page);
  await expect(page.getByText(/^\d? ?\/ 6$/)).toHaveCount(0);
  await expect(page.getByText("Perfil nuevo")).toHaveCount(0);
});

test("guardar la ficha lleva DIRECTAMENTE a formular la ración", async ({ page, request }) => {
  await entrarComoVeterinario(page, request);
  await esperarElPaciente(page);

  await page.getByRole("button", { name: /Guardar y formular la ración/ }).click();

  // La pantalla siguiente es el formulador, con el caso en la cabecera.
  await expect(page.getByText("Formular la ración")).toBeVisible();
  await expect(page.getByText(/Nala · 1211 kcal\/día/)).toBeVisible();
  // Y NO la pantalla intermedia del dueño con su «Todo bien, ir al generador».
  await expect(page.getByText(/Todo bien, ir al generador/)).toHaveCount(0);
  await expect(laPantallaDelDueno(page)).toHaveCount(0);
});

test("desde la ficha se puede salir: el panel funciona", async ({ page, request }) => {
  // ⚠️ ESTA ES LA PRUEBA DEL SEGUNDO FALLO. Antes, estos dos clics cambiaban
  // `fase` de verdad y la pantalla no se movía: la ficha ganaba en el render
  // porque miraba `paso`. Un botón muerto sin error ninguno.
  await entrarComoVeterinario(page, request);
  await esperarElPaciente(page);

  let panel = await abrirElPanel(page);
  await panel.getByRole("button", { name: "Menús", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Los menús de/ })).toBeVisible();

  panel = await abrirElPanel(page);
  await panel.getByRole("button", { name: "Ficha del paciente", exact: true }).click();
  await esperarElPaciente(page);

  panel = await abrirElPanel(page);
  await panel.getByRole("button", { name: "Pacientes", exact: true }).click();
  await expect(page.getByRole("button", { name: /Dar de alta un paciente/ })).toBeVisible();
  // Y ni rastro del asistente del dueño, que es lo que se colaba aquí en
  // cuanto la ficha dejó de capturar `paso === 1`.
  await expect(page.getByText("Empecemos por")).toHaveCount(0);
});

test("dar de alta a otro paciente también acaba en el formulador", async ({ page, request }) => {
  await entrarComoVeterinario(page, request);
  await esperarElPaciente(page);

  const panel = await abrirElPanel(page);
  await panel.getByRole("button", { name: "Pacientes", exact: true }).click();
  await page.getByRole("button", { name: /Dar de alta un paciente/ }).click();

  // Ficha en blanco, y el botón dice que da de alta, no que "guarda".
  await expect(page.getByPlaceholder("Nombre del paciente")).toBeVisible();
  await expect(page.getByRole("button", { name: /Dar de alta y formular/ })).toBeVisible();
});

test("a un tutor no le cambia nada: sigue entrando en su perfil de siempre", async ({ page, request }) => {
  // El otro lado del mismo cambio, que es donde se rompen estas cosas. Su
  // pantalla de inicio, sus seis pasos y su botón siguen exactamente igual.
  await configurar(request, {
    rolProfesional: false, rolVerificado: false,
    perros: [PACIENTE], accesos: [], menus: [],
  });
  await page.goto("/");
  await page.getByPlaceholder("Email").fill(CUENTA_DE_PRUEBA.email);
  await page.getByPlaceholder("Contraseña").fill(CUENTA_DE_PRUEBA.password);
  await page.getByRole("button", { name: "Entrar" }).click();

  await laFichaHaCargado(page).waitFor();
  await expect(laPantallaDelDueno(page)).toBeVisible();
  await expect(page.getByRole("button", { name: /Guardar y formular la ración/ })).toHaveCount(0);
});
