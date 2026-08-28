// ─── La única prueba que habla con la API DE VERDAD ──────────────────────────
//
// POR QUÉ EXISTE (28 de agosto). Hay 30 pruebas de navegador y **25 hablan con
// un servidor de mentira**. Eso está bien y tiene que seguir así: la mayoría
// comprueban qué hace la app ante una respuesta concreta, y para eso el falso
// es mejor -- es rápido, es determinista y puede fingir el fallo que quieras.
//
// Pero tiene un límite que no se ve: **una prueba contra un servidor falso no
// puede cazar jamás un desacuerdo entre la app y el servidor**, porque en la
// prueba el servidor lo escribe el mismo lado que la app. Y los dos fallos que
// más caros nos han salido son exactamente eso, un desacuerdo en la costura:
//
//   · el DER calculado dos veces, dando números distintos
//   · el peso sacado de donde no debía
//
// Los dos salieron VERDES en todas las pruebas de los dos lados, porque cada
// lado era coherente CONSIGO MISMO. Solo se ven poniendo a los dos a hablar.
//
// Esto levanta la API real (FastAPI + el motor MILP de verdad) y hace que la
// app le hable a ella. Supabase sigue siendo el de mentira A PROPÓSITO: lo que
// se quiere probar es la costura app↔motor, no la cuenta de nadie.
//
//     npx playwright test --config playwright.real.config.js
//
// Con la API en otro sitio:  RUTA_API=/ruta/a/Canislab-api npx playwright ...
//
// NO sustituye a las otras 30. Aquella familia de pruebas dice si la app se
// comporta; esta dice si las dos mitades hablan del mismo perro.

import { defineConfig, devices } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

function buscarChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!base || !fs.existsSync(base)) return undefined;
  for (const dir of fs.readdirSync(base)) {
    if (!dir.startsWith("chromium-")) continue;
    const candidato = path.join(base, dir, "chrome-linux", "chrome");
    if (fs.existsSync(candidato)) return candidato;
  }
  return undefined;
}

const CHROMIUM = buscarChromium();
const PUERTO_APP = 5179;          // distinto del de siempre: se pueden correr a la vez
const PUERTO_SUPABASE = 54322;
const PUERTO_API = 8012;

// Dónde está el repo de la API. Si no está, se dice CLARO y no se corre: una
// prueba que se salta sola cuando no encuentra al vecino no vigila nada -- es
// justo el error que ya cometimos con el contrato del DER.
const RUTA_API = process.env.RUTA_API || path.resolve("../Canislab-api");
if (!fs.existsSync(path.join(RUTA_API, "main.py"))) {
  throw new Error(
    `No encuentro la API en ${RUTA_API}. Esta prueba necesita el repo Canislab-api ` +
    `al lado, o la variable RUTA_API apuntando a él. No se salta sola a propósito.`
  );
}

export default defineConfig({
  testDir: "./tests",
  testMatch: /de-punta-a-punta\.spec\.js/,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  // El motor MILP tarda segundos de verdad, no milisegundos como el falso.
  timeout: 180_000,
  expect: { timeout: 60_000 },

  use: {
    baseURL: `http://127.0.0.1:${PUERTO_APP}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },

  projects: [{
    name: "de-verdad",
    use: {
      ...devices["Desktop Chrome"],
      launchOptions: CHROMIUM ? { executablePath: CHROMIUM } : {},
    },
  }],

  webServer: [
    {
      command: "node tests/servidor-fake.js",
      port: PUERTO_SUPABASE,
      reuseExistingServer: !process.env.CI,
      stdout: "pipe",
      env: { PUERTO_FAKE_SUPABASE: String(PUERTO_SUPABASE), RETRASO_PERROS_MS: "50" },
    },
    {
      // La API de verdad: FastAPI, el catálogo de verdad y el motor MILP.
      command: `python3 -m uvicorn main:app --host 127.0.0.1 --port ${PUERTO_API} --log-level warning`,
      cwd: RUTA_API,
      url: `http://127.0.0.1:${PUERTO_API}/verificar`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: "pipe",
      env: { PYTHONPATH: `${RUTA_API}:${path.join(RUTA_API, "motor")}` },
    },
    {
      command: `npx vite --port ${PUERTO_APP} --strictPort`,
      port: PUERTO_APP,
      reuseExistingServer: !process.env.CI,
      env: {
        VITE_SUPABASE_URL: `http://127.0.0.1:${PUERTO_SUPABASE}`,
        VITE_SUPABASE_ANON_KEY: "clave-anon-de-mentira",
        // LA DIFERENCIA CON playwright.config.js: aquí apunta a la API REAL.
        VITE_API_BASE: `http://127.0.0.1:${PUERTO_API}`,
        // El motor tarda de verdad; con 3 s no le daría tiempo ni a empezar.
        VITE_TIMEOUT_API_MS: "120000",
        VITE_SENTRY_DSN: "",
      },
    },
  ],
});
