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
import { irAlGenerador } from "./ayudas.js";

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
  await page.getByText("Nombre y sexo").waitFor();   // el resumen del paciente
  await irAlFormulador(page);
};

// El camino al generador pasa por "Mis menús", igual que para un tutor.
async function irAlFormulador(page) {
  await page.getByRole("button", { name: "Menú", exact: true }).last().click();
  await page.getByRole("dialog", { name: "Panel lateral" })
            .getByRole("button", { name: "Mis menús", exact: true }).click();
  await page.getByRole("button", { name: /Hacer otro menú/ }).click();
  await expect(page.getByText("Formular la ración")).toBeVisible();
}

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
    perros: [{ ...PERRO_DE_PRUEBA, patologia_si: true, patologias: ["renal"] }],
  });
  await page.getByRole("button", { name: /Añadir alimento/ }).click();
  await page.getByLabel("Buscar alimento").fill("pollo");
  await page.getByRole("button", { name: /Carne muscular de pollo/ }).click();
  await page.getByLabel("Gramos de Carne muscular de pollo").fill("700");

  await expect(page.getByText("Topes por patología")).toBeVisible();
  await expect(page.getByText(/fosforo 1748/)).toBeVisible();
  await expect(page.getByText(/El semáforo de FEDIAF no los ve/)).toBeVisible();
});
