// ─── Buscar «higado» tiene que encontrar «Hígado» ────────────────────────────
//
// POR QUÉ EXISTE (12 de septiembre de 2026). Elena, probando la pantalla del
// veterinario: «si se busca higado no aparece porque lleva tilde y no lo
// encuentra».
//
// ⚠️ Y LO QUE MÁS IMPORTA DE ESTO: el arreglo ya estaba escrito. `src/texto.js`
// se hizo el 29 de agosto por ESTE MISMO fallo, encontrado entonces en la app
// del dueño, y trae `contiene()`, que compara sin tildes por los dos lados y
// respeta la eñe. El formulador nació después y no lo usaba: escribía su propio
// `toLowerCase().includes()`.
//
// O sea que no hacía falta escribir nada nuevo, hacía falta USAR lo que había —
// y sin una prueba aquí, la próxima pantalla volverá a escribir su filtro.
import { test, expect } from "@playwright/test";
import { CUENTA_DE_PRUEBA, PERRO_DE_PRUEBA } from "./fake-supabase.js";
import { esperarElPaciente } from "./ayudas.js";

const SUPABASE_FALSO = "http://127.0.0.1:54321";

// Los cuatro que más se escriben sin tilde, y la eñe, que es la trampa: buscar
// «pina» tiene que encontrar «Piña», pero «año» y «ano» no pueden mezclarse.
const CATALOGO = {
  "Hígado": [{ nombre: "Hígado de pollo", kcal_100g: 120, especie: "Pollo" }],
  "Vísceras": [{ nombre: "Riñón de cordero", kcal_100g: 100, especie: "Cordero" },
               { nombre: "Corazón de ternera", kcal_100g: 110, especie: "Ternera" }],
  "Verduras y frutas": [{ nombre: "Plátano", kcal_100g: 90, especie: null }],
};

async function enElBuscador(page, request) {
  const res = await request.post(`${SUPABASE_FALSO}/__control`, { data: {
    rolProfesional: true, rolVerificado: true,
    perros: [PERRO_DE_PRUEBA],
    accesos: [{ perro_id: PERRO_DE_PRUEBA.id, estado: "activo" }],
    menus: [], catalogo: CATALOGO,
  } });
  expect(res.ok()).toBeTruthy();
  await page.goto("/");
  await page.getByPlaceholder("Email").fill(CUENTA_DE_PRUEBA.email);
  await page.getByPlaceholder("Contraseña").fill(CUENTA_DE_PRUEBA.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await esperarElPaciente(page);
  await page.getByRole("button", { name: "Menú", exact: true }).last().click();
  await page.getByRole("dialog", { name: "Panel lateral" })
            .getByRole("button", { name: "Menús", exact: true }).click();
  await page.getByRole("button", { name: /Hacer otro menú/ }).click();
  await expect(page.getByText("Formular la ración")).toBeVisible();
  await page.getByRole("button", { name: /Añadir alimento/ }).click();
}

const CASOS = [
  ["higado", "Hígado de pollo"],
  ["rinon", "Riñón de cordero"],
  ["riñon", "Riñón de cordero"],
  ["corazon", "Corazón de ternera"],
  ["platano", "Plátano"],
];

for (const [escrito, esperado] of CASOS) {
  test(`escribir «${escrito}» encuentra «${esperado}»`, async ({ page, request }) => {
    await enElBuscador(page, request);
    const caja = page.getByPlaceholder(/Buscar/i).first();
    await caja.fill(escrito);
    await expect(page.getByText(esperado).first(),
      `escribiendo «${escrito}» no sale «${esperado}». En un móvil poner la tilde cuesta una ` +
      `pulsación larga, así que quien la omite concluye que no lo tenemos. El ayudante que lo ` +
      `arregla es \`contiene()\` de src/texto.js, y existe desde el 29 de agosto`)
      .toBeVisible();
  });
}
