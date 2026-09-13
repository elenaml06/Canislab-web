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
  // ⚠️ DOS FICHEROS, Y EL SEGUNDO ES DEL 13 DE SEPTIEMBRE. `de-punta-a-punta`
  // comprueba que las dos mitades hablan del MISMO perro (la costura);
  // `todos-los-perros-contra-el-motor-real` comprueba que **todo perro que se
  // puede escribir en la ficha obtiene menú**, que es otra cosa y es la que
  // faltaba: el día que Cairo se quedó sin comer, esta configuración existía y
  // solo probaba UN perro.
  testMatch: /(de-punta-a-punta|todos-los-perros-contra-el-motor-real)\.spec\.js/,
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
      // ⚠️ NO SE REUTILIZA NUNCA (13 de septiembre de 2026). Con
      // `reuseExistingServer` puesto, un uvicorn levantado por una ejecucion
      // ANTERIOR se queda escuchando y Playwright se lo queda -- asi que la
      // prueba habla con el motor de HACE UN RATO, no con el del disco.
      //
      // Paso el mismo dia que se escribio esta bateria: se arreglo el fallo del
      // senior, se volvio a ejecutar, y siguio roja contra la API vieja. Es la
      // trampa del `.pyc` cacheado del CLAUDE.md con otra cara, y la peor clase
      // de fallo posible en una bateria: **afirma algo del motor que el codigo
      // no dice**. En la otra direccion taparia un arreglo o un destrozo.
      //
      // Levantar uno nuevo cuesta unos segundos. Mentir sale mucho mas caro.
      reuseExistingServer: false,
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
        // ⚠️ EL MISMO TIEMPO QUE PRODUCCIÓN, NI UNO MÁS (12 de septiembre de
        // 2026), y esto es la corrección de un fallo que costó caro.
        //
        // Aquí ponía 120000 con el motivo de que «el motor tarda de verdad».
        // Es verdad que tarda, pero la app REAL corta a los 45 s, así que esta
        // prueba -- la única que habla con el motor de verdad, la que existe
        // para cazar desacuerdos entre las dos mitades -- se estaba dando un
        // tiempo que el producto no se da. Y tapó exactamente eso: la semana
        // entera tarda 70,5 s en la API desplegada y NUNCA cabía en los 45 s
        // de la app, con la pantalla contándolo como si el perro no tuviera
        // menú posible. La usuaria lo vio en producción; la prueba, no.
        //
        // Una prueba no puede darse más margen que el producto. Si el motor
        // local tarda más que esto, es una señal, no un estorbo.
        VITE_TIMEOUT_API_MS: "45000",
        VITE_SENTRY_DSN: "",
      },
    },
  ],
});
