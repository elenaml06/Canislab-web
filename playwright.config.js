import { defineConfig, devices } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// El contenedor trae Chromium ya descargado, pero puede no coincidir con
// la build que espera esta versión de Playwright. Buscamos el binario que
// realmente hay para no tener que ejecutar `playwright install`.
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

const PUERTO_APP = 5178;
const PUERTO_SUPABASE = 54321;

export default defineConfig({
  testDir: "./tests",
  // Un bug de orden de carga puede "colar" por suerte una vez. Con esto,
  // si el test pasa por casualidad en vez de por corrección, se nota.
  repeatEach: Number(process.env.REPETIR || 1),
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  timeout: 60_000,
  expect: { timeout: 15_000 },

  use: {
    baseURL: `http://127.0.0.1:${PUERTO_APP}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // Chromium ya viene instalado en la imagen; no hay que descargar nada.
        launchOptions: CHROMIUM ? { executablePath: CHROMIUM } : {},
      },
    },
  ],

  webServer: [
    {
      command: "node tests/servidor-fake.js",
      port: PUERTO_SUPABASE,
      reuseExistingServer: !process.env.CI,
      stdout: "pipe",
      env: {
        PUERTO_FAKE_SUPABASE: String(PUERTO_SUPABASE),
        RETRASO_PERROS_MS: process.env.RETRASO_PERROS_MS || "400",
      },
    },
    {
      command: `npx vite --port ${PUERTO_APP} --strictPort`,
      port: PUERTO_APP,
      reuseExistingServer: !process.env.CI,
      env: {
        // La app de los tests apunta al Supabase de mentira, NUNCA al real.
        VITE_SUPABASE_URL: `http://127.0.0.1:${PUERTO_SUPABASE}`,
        VITE_SUPABASE_ANON_KEY: "clave-anon-de-mentira",
        // Sin DSN: los tests no mandan nada a Sentry.
        VITE_SENTRY_DSN: "",
      },
    },
  ],
});
