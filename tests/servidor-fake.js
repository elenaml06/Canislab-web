// Arranca el Supabase de mentira en un puerto fijo, para que lo levante
// Playwright (playwright.config.js → webServer) antes de los tests.
//
// Se puede ajustar con variables de entorno:
//   PUERTO_FAKE_SUPABASE   puerto (por defecto 54321)
//   RETRASO_PERROS_MS      cuánto tarda en responder GET /rest/v1/perros
//   SIN_PERRO=1            simula una cuenta recién creada, sin perro guardado

import { crearFakeSupabase } from "./fake-supabase.js";

const puerto = Number(process.env.PUERTO_FAKE_SUPABASE || 54321);
const retrasoPerrosMs = Number(process.env.RETRASO_PERROS_MS || 400);
const sinPerro = process.env.SIN_PERRO === "1";

const fake = crearFakeSupabase({
  retrasoPerrosMs,
  sinPerro,
  log: (linea) => console.log("[fake-supabase]", linea),
});

const url = await fake.escuchar(puerto);
console.log(
  `[fake-supabase] listo en ${url} ` +
  `(retrasoPerros=${retrasoPerrosMs}ms, sinPerro=${sinPerro})`
);

for (const senal of ["SIGINT", "SIGTERM"]) {
  process.on(senal, async () => { await fake.cerrar(); process.exit(0); });
}
