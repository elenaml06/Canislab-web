// ─── POR DÓNDE ENTRA UN VETERINARIO ──────────────────────────────────────────
//
// ⚠️ CASO REAL ENCONTRADO POR LA USUARIA (29 agosto), entrando con la cuenta
// de pruebas ya acreditada: «he entrado como veterinario y te manda a la
// misma pantalla primera que si entras como usuario».
//
// Era verdad, y son DOS fallos distintos con la misma cara:
//
//   1. Un veterinario SIN pacientes caía en el asistente de siempre, que le
//      preguntaba por «tu perro». Él no viene a apuntar a su perro: viene a
//      dar de alta a un paciente. Todo lo profesional que ya existía (la
//      lista, la ficha clínica, el interruptor) vivía un paso más adentro,
//      así que la primera pantalla no se distinguía en nada.
//
//   2. Y el perro con el que se abría la app se elegía SIN MIRAR EL MODO:
//      `perros[0]`, el primero de la cuenta. Un veterinario con su perro y
//      un paciente entraba dentro del que no toca, y encima ese perro no
//      salía en la lista de al lado. Las dos listas no se mezclaban; la
//      puerta de entrada sí.
//
// Ninguno de los dos da error ni se ve en un log: se ve entrando. Por eso
// esto mira la PANTALLA, y con los datos sirviéndose desde el Supabase de
// mentira, que es quien decide si la cuenta está acreditada.
import { test, expect } from "@playwright/test";
import { CUENTA_DE_PRUEBA, PERRO_DE_PRUEBA, SEGUNDO_PERRO_DE_PRUEBA } from "./fake-supabase.js";

const SUPABASE_FALSO = "http://127.0.0.1:54321";

// PERRO_DE_PRUEBA es "Nala" y SEGUNDO_PERRO_DE_PRUEBA es "Cairo".
const SU_PERRO = SEGUNDO_PERRO_DE_PRUEBA;          // Cairo, el del veterinario
const EL_PACIENTE = PERRO_DE_PRUEBA;               // Nala, la paciente

const configurar = async (request, opciones) => {
  // `sinTablaAccesos: false` explícito: si un archivo anterior lo dejó
  // encendido, aquí no se reparte nada y estos tests fallan por un motivo
  // que no es el suyo. Pasó exactamente eso el día que se escribieron.
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

const elPerroDeAhora = async (page) =>
  (await page.getByRole("button", { name: /Perro actual/ }).first()
             .getAttribute("aria-label")) || "";

test("un veterinario sin pacientes entra por su lista, no por «tu perro»", async ({ page, request }) => {
  await configurar(request, {
    rolProfesional: true, rolVerificado: true,
    // Tiene su propio perro, y ningún paciente. Tener perro propio NO es
    // tener paciente: si esto se confundiera, entraría en su perro creyendo
    // que es un paciente.
    perros: [SU_PERRO],
    accesos: [],
    menus: [],
  });
  await entrar(page);

  await expect(page.getByRole("button", { name: /Dar de alta un paciente/ })).toBeVisible();
  // Y NO el asistente del dueño. Es la mitad del fallo que se arregla aquí:
  // no basta con que aparezca lo nuevo, tiene que desaparecer lo otro.
  await expect(page.getByPlaceholder("Nombre de tu perro")).toHaveCount(0);
});

test("y al darle de alta, el asistente pregunta por el paciente", async ({ page, request }) => {
  await configurar(request, {
    rolProfesional: true, rolVerificado: true,
    perros: [SU_PERRO], accesos: [], menus: [],
  });
  await entrar(page);
  await page.getByRole("button", { name: /Dar de alta un paciente/ }).click();
  await expect(page.getByPlaceholder("Nombre del paciente")).toBeVisible();
});

test("con pacientes, la app se abre DENTRO del paciente y no de su perro", async ({ page, request }) => {
  await configurar(request, {
    rolProfesional: true, rolVerificado: true,
    // El perro propio va PRIMERO en la lista a propósito: así, si alguien
    // vuelve a coger `perros[0]` sin mirar el modo, esta prueba lo caza.
    perros: [SU_PERRO, EL_PACIENTE],
    accesos: [{ perro_id: EL_PACIENTE.id, estado: "activo", origen: "creado_por_el_profesional" }],
    menus: [],
  });
  await entrar(page);
  await page.getByText("Nombre y sexo").waitFor();
  await expect.poll(() => elPerroDeAhora(page),
    { message: "se ha abierto el perro que no toca" }).toContain(EL_PACIENTE.nombre);
});

test("sin acreditar, todo sigue exactamente igual que antes", async ({ page, request }) => {
  // El otro lado del mismo arreglo: quien no es veterinario no puede notar
  // nada de esto. Mismos datos, sin acreditación.
  await configurar(request, {
    rolProfesional: false, rolVerificado: false,
    perros: [SU_PERRO, EL_PACIENTE],
    accesos: [],
    menus: [],
  });
  await entrar(page);
  await page.getByText("Nombre y sexo").waitFor();
  await expect(page.getByRole("button", { name: /Dar de alta un paciente/ })).toHaveCount(0);
  await expect.poll(() => elPerroDeAhora(page)).toContain(SU_PERRO.nombre);
});

test("la ficha del paciente cabe en UNA pantalla, y habla en clínico", async ({ page, request }) => {
  // ⚠️ PEDIDO EXPRESO (29 agosto): "un veterinario debería tener
  // prácticamente todo en la misma pantalla, no tener que ir pasando
  // pantallas, y lo de la pantalla de alergias y tal tiene que ser
  // profesional, no esos textos para el usuario".
  //
  // El asistente de seis pasos está pensado para quien hace esto UNA vez,
  // con su perro. Un veterinario lo hace varias veces al día con un animal
  // delante. Son dos trabajos distintos, no dos gustos distintos.
  await configurar(request, {
    rolProfesional: true, rolVerificado: true,
    perros: [], accesos: [], menus: [],
  });
  await entrar(page);
  await page.getByRole("button", { name: /Dar de alta un paciente/ }).click();

  // TODO en la misma pantalla: sin pulsar Continuar ni una vez.
  await expect(page.getByPlaceholder("Nombre del paciente")).toBeVisible();
  await expect(page.getByText("Peso y condición corporal")).toBeVisible();
  await expect(page.getByText("Alergias alimentarias confirmadas")).toBeVisible();
  await expect(page.getByText("Patologías diagnosticadas")).toBeVisible();
  await expect(page.getByPlaceholder("Nombre del tutor")).toBeVisible();

  // Y en el idioma de una consulta, no en el de un asistente.
  await expect(page.getByText("Rellenito")).toHaveCount(0);
  await expect(page.getByText("Muy gordete")).toHaveCount(0);
  await expect(page.getByText(/Piensa en un día normal/)).toHaveCount(0);
  await expect(page.getByText(/simplemente prefieres no dárselo/)).toHaveCount(0);
  await expect(page.getByText("Mantenimiento")).toBeVisible();
  await expect(page.getByText("Reposo / restricción")).toBeVisible();
});

test("y el BCS de 9 puntos decide el peso objetivo", async ({ page, request }) => {
  // Los cinco escalones del dueño son cinco valores sueltos de la escala
  // (2, 4, 5, 7 y 9), así que un BCS 6 -- el más común en consulta -- solo
  // cabe redondeándolo, y eso mueve el peso objetivo un 10 %. De ahí salen
  // las kcal.
  await configurar(request, {
    rolProfesional: true, rolVerificado: true,
    perros: [], accesos: [], menus: [],
  });
  await entrar(page);
  await page.getByRole("button", { name: /Dar de alta un paciente/ }).click();

  await expect(page.getByRole("button", { name: "BCS 6", exact: true })).toBeVisible();
  await page.getByRole("spinbutton").fill("30");
  await page.getByRole("button", { name: "BCS 6", exact: true }).click();
  // 30 kg con BCS 6 son 27,27 kg de objetivo; con el escalón redondeado
  // (un 7) habrían salido 25.
  await expect(page.getByText(/Peso objetivo estimado/)).toContainText("27.27");
  await expect(page.getByText(/Por encima del ideal/)).toBeVisible();
});

test("y sin lo imprescindible no deja guardar, diciendo qué falta", async ({ page, request }) => {
  // Un formulario largo se rellena a saltos, así que tiene que decir qué le
  // queda -- no dejar el botón apagado sin explicar por qué.
  await configurar(request, {
    rolProfesional: true, rolVerificado: true,
    perros: [], accesos: [], menus: [],
  });
  await entrar(page);
  await page.getByRole("button", { name: /Dar de alta un paciente/ }).click();
  await expect(page.getByText(/^Falta: /)).toContainText("nombre");
  await page.getByPlaceholder("Nombre del paciente").fill("Nala");
  await expect(page.getByText(/^Falta: /)).not.toContainText("nombre");
  await expect(page.getByText(/^Falta: /)).toContainText("BCS");
});
