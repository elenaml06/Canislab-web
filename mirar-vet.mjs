// Recorre el flujo del veterinario y hace una captura de cada pantalla.
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const base = process.env.PLAYWRIGHT_BROWSERS_PATH;
let exe;
for (const d of fs.readdirSync(base)) {
  if (d.startsWith("chromium-")) {
    const c = path.join(base, d, "chrome-linux", "chrome");
    if (fs.existsSync(c)) { exe = c; break; }
  }
}
const SUPA = "http://127.0.0.1:54321";
const APP = "http://127.0.0.1:5178";
const OUT = "/tmp/claude-0/capturas";
fs.mkdirSync(OUT, { recursive: true });

const PACIENTE = {
  id: "11111111-1111-4111-8111-111111111111",
  nombre: "Nala", raza: "Pastor alemán", peso_actual: 24.5, tutor_nombre: "María López",
};

const navegador = await chromium.launch({ executablePath: exe });
const page = await navegador.newPage({ viewport: { width: 420, height: 900 } });

await fetch(`${SUPA}/__control`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    sinTablaAccesos: false, rolProfesional: true, rolVerificado: true,
    perros: [PACIENTE],
    accesos: [{ perro_id: PACIENTE.id, estado: "activo" }],
    menus: [],
  }),
});

let n = 0;
const foto = async (nombre) => {
  n += 1;
  await page.waitForTimeout(600);
  const f = `${OUT}/${String(n).padStart(2, "0")}-${nombre}.png`;
  await page.screenshot({ path: f, fullPage: true });
  console.log("→", f);
};

await page.goto(APP);
await page.getByPlaceholder("Email").fill("prueba.rawku@example.test");
await page.getByPlaceholder("Contraseña").fill("prueba-rawku-1234");
await page.getByRole("button", { name: "Entrar" }).click();
await page.getByText("Nombre y sexo").waitFor({ timeout: 20000 }).catch(() => {});
await foto("al-entrar-con-un-paciente");

// El panel lateral: qué se ofrece.
await page.getByRole("button", { name: "Menú", exact: true }).last().click();
await foto("panel-lateral");
await page.keyboard.press("Escape").catch(() => {});
await page.mouse.click(400, 20).catch(() => {});

// La ficha del paciente.
await page.getByRole("button", { name: "Menú", exact: true }).last().click();
await page.getByRole("dialog", { name: "Panel lateral" })
          .getByRole("button", { name: "Ficha del paciente", exact: true }).click();
await foto("ficha-del-paciente");

// Guardar la ficha: ¿a dónde lleva?
await page.getByRole("button", { name: /Guardar ficha/ }).click();
await foto("despues-de-guardar-la-ficha");

await navegador.close();
