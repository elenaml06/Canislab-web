// ─── Se puede usar Rawku sin cuenta, y al crearla no se pierde nada ──────────
//
// POR QUÉ EXISTE ESTE ARCHIVO
// Pedido expreso: "necesito poder entrar a la aplicación sin que me pidan
// iniciar sesión". Hasta ahora la primera pantalla era un muro: sin cuenta no
// se veía absolutamente nada.
//
// De las dos mitades del cambio, la que da miedo NO es entrar sin cuenta —
// eso se ve enseguida si se rompe. Es la otra: qué pasa el día que esa
// persona SÍ se registra, después de una semana usando la app.
//
// Si al registrarse la app se limita a mirar Supabase (vacío) y deja lo del
// navegador donde está, esa semana desaparece. Sin error, sin aviso, sin nada
// en pantalla: exactamente la familia de fallos de CLAUDE.md, la que encontró
// la usuaria con la fecha de nacimiento de Ruffo. Y aquí es peor, porque lo
// que se pierde no es un campo: es todo.
//
// Por eso el grueso de este archivo es la migración, campo por campo, con la
// misma lista que ficha-ida-y-vuelta.spec.js. Comprobado que falla si se
// rompe: quitando la llamada a migrarLocalACuenta, tres de estas pruebas se
// ponen en rojo.

import { test, expect } from "@playwright/test";
import { CUENTA_DE_PRUEBA, PERRO_DE_PRUEBA } from "./fake-supabase.js";

const SUPABASE_FALSO = "http://127.0.0.1:54321";

async function configurarBackend(request, opciones) {
  const res = await request.post(`${SUPABASE_FALSO}/__control`, { data: opciones });
  expect(res.ok()).toBeTruthy();
  return res.json();
}

// Un perro guardado SIN cuenta: la misma forma de fila que tendría en
// Supabase (eso es justo lo que permite migrarlo copiando), con un id local
// y un valor distintivo en cada campo — nada que pueda coincidir por
// casualidad con un valor por defecto.
const PERRO_LOCAL = {
  id: "local-abc123",
  user_id: "local",
  created_at: "2026-08-20T10:00:00.000Z",
  nombre: "Ruffo",
  peso_actual: 17.4,
  peso_adulto_esperado: 18,
  condicion_idx: 3,
  etapa: "senior",
  tamano: "Pequeño",
  sexo: "macho",
  castrado: true,
  actividad: "baja",
  raza: null,
  fecha_nacimiento: "2015-03-10",
  dieta_actual: "pienso",
  alergia_si: true,
  alergias: ["pollo"],
  otros_evitar_si: true,
  otros_evitar: ["cerdo"],
  categorias_excluidas_si: true,
  categorias_excluidas: ["Hueso carnoso"],
  patologia_si: false,
  patologias: [],
};

// Lo mismo que vigila ficha-ida-y-vuelta al guardar, aquí al migrar: si un
// campo se cae por el camino, el perro vuelve con el valor por defecto y come
// lo que no le toca.
const CAMPOS = [
  ["nombre",                  "es su nombre"],
  ["peso_actual",             "de aquí salen sus kcal"],
  ["fecha_nacimiento",        "de aquí sale la ETAPA, y de la etapa los 30 requisitos de FEDIAF"],
  ["castrado",                "cambia las kcal que necesita"],
  ["actividad",               "cambia las kcal que necesita"],
  ["condicion_idx",           "de aquí sale su peso ideal, y de ahí las kcal"],
  ["sexo",                    "un macho entero necesita más kcal"],
  ["tamano",                  "en un mestizo, de aquí sale su peso adulto esperado"],
  ["dieta_actual",            "de aquí sale si necesita transición desde el pienso"],
  ["alergia_si",              "una alergia puede ser médica"],
  ["alergias",                "una alergia puede ser médica"],
  ["otros_evitar_si",         "lo que la dueña no quiere darle"],
  ["otros_evitar",            "lo que la dueña no quiere darle"],
  ["categorias_excluidas_si", "un perro sin dientes no puede masticar hueso"],
  ["categorias_excluidas",    "un perro sin dientes no puede masticar hueso"],
  ["patologia_si",            "cambia los límites de seguridad"],
  ["patologias",              "cambia los límites de seguridad"],
];

const MENU_LOCAL = {
  id: "local-menu1",
  user_id: "local",
  perro_id: PERRO_LOCAL.id,
  modo: "automatico",
  der_real: 640,
  etapa_label: "Senior",
  menus_data: [{ nombre: "Menú 1", items: [{ alimento: "Calabacín", gramos: 90 }] }],
  num_menus: 1,
  nombre: null,
  created_at: "2026-08-20T11:00:00.000Z",
};

// Deja el navegador como si ya se llevara días usando la app sin cuenta.
async function sembrarUsoSinCuenta(page, { perros = [PERRO_LOCAL], menus = [MENU_LOCAL], dentro = true } = {}) {
  await page.addInitScript(([p, m, d]) => {
    window.localStorage.setItem("rawku.local.sinCuenta", d ? "true" : "false");
    window.localStorage.setItem("rawku.local.perros", JSON.stringify(p));
    window.localStorage.setItem("rawku.local.menus", JSON.stringify(m));
  }, [perros, menus, dentro]);
}

test.describe("entrar sin cuenta", () => {
  test.beforeEach(async ({ request }) => {
    await configurarBackend(request, { retrasoPerrosMs: 50, sinPerro: true, menus: [] });
  });

  test("la primera pantalla ofrece pasar sin registrarse", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByPlaceholder("Email")).toBeVisible();

    const sinCuenta = page.getByRole("button", { name: /sin (crear )?cuenta/i });
    await expect(sinCuenta).toBeVisible();
    // Y dice lo que va a pasar de verdad, que es lo que nadie cuenta:
    // que los datos se quedan en este móvil.
    await expect(page.getByText(/se guardan en este móvil/i)).toBeVisible();

    await sinCuenta.click();
    // Ya no hay muro: ni email ni contraseña.
    await expect(page.getByPlaceholder("Email")).toHaveCount(0);
    await expect(page.getByPlaceholder("Contraseña")).toHaveCount(0);
  });

  test("recargar no devuelve al login", async ({ page }) => {
    // Si esto se rompe, "entrar sin cuenta" sólo vale para esa pestaña y
    // volver a abrir la app pide cuenta otra vez.
    await page.goto("/");
    await page.getByRole("button", { name: /sin (crear )?cuenta/i }).click();
    await expect(page.getByPlaceholder("Email")).toHaveCount(0);

    await page.reload();
    await expect(page.getByPlaceholder("Email")).toHaveCount(0);
  });

  test("el perro guardado sin cuenta sigue ahí al volver", async ({ page }) => {
    await sembrarUsoSinCuenta(page);
    await page.goto("/");
    await expect(page.getByPlaceholder("Email")).toHaveCount(0);
    await expect(page.getByText("Ruffo").first()).toBeVisible();
  });

  test("sin cuenta no se le piden los perros a Supabase", async ({ page }) => {
    // No es cosmético: sin sesión, ese GET vuelve vacío o con error, y la
    // app se creería que no hay perro teniendo uno delante.
    const peticiones = [];
    await page.route("**/rest/v1/perros*", (ruta) => {
      peticiones.push(ruta.request().url());
      return ruta.continue();
    });
    await sembrarUsoSinCuenta(page);
    await page.goto("/");
    await expect(page.getByText("Ruffo").first()).toBeVisible();
    expect(peticiones, "sin cuenta no se toca la tabla de perros").toEqual([]);
  });
});

test.describe("al crear la cuenta sube lo que ya había", () => {
  test.beforeEach(async ({ request }) => {
    // Cuenta recién creada: en Supabase no hay nada todavía.
    await configurarBackend(request, { retrasoPerrosMs: 50, sinPerro: true, menus: [] });
  });

  async function iniciarSesion(page) {
    await page.getByPlaceholder("Email").fill(CUENTA_DE_PRUEBA.email);
    await page.getByPlaceholder("Contraseña").fill(CUENTA_DE_PRUEBA.password);
    await page.getByRole("button", { name: "Entrar" }).click();
  }

  test("el perro sube entero, sin perder ni un campo", async ({ page, request }) => {
    // El momento exacto: se ha pulsado "crear cuenta" desde dentro, así que
    // la app ha salido del modo sin cuenta pero lo guardado sigue intacto.
    await sembrarUsoSinCuenta(page, { dentro: false });
    await page.goto("/");

    // Y se nota que hay algo que no se va a perder: el botón lo dice.
    await expect(page.getByRole("button", { name: /Seguir sin cuenta/i })).toBeVisible();

    await iniciarSesion(page);

    await expect.poll(async () => {
      const { perrosGuardados } = await configurarBackend(request, {});
      return perrosGuardados.map((p) => p.nombre);
    }, { timeout: 15000 }).toContain("Ruffo");

    const { perrosGuardados } = await configurarBackend(request, {});
    const subido = perrosGuardados.find((p) => p.nombre === "Ruffo");

    const perdidos = CAMPOS
      .filter(([campo]) => JSON.stringify(subido[campo]) !== JSON.stringify(PERRO_LOCAL[campo]))
      .map(([campo, porQue]) =>
        `${campo}: subió ${JSON.stringify(subido[campo])} en vez de ` +
        `${JSON.stringify(PERRO_LOCAL[campo])} — ${porQue}`);

    expect(perdidos, "campos que se pierden al pasar de sin cuenta a con cuenta").toEqual([]);
  });

  test("si la subida falla, NO se borra lo del navegador", async ({ page }) => {
    // La prueba que de verdad vigila el orden. La de abajo (que el
    // navegador acaba vacío) pasa igual se vacíe antes o después de subir
    // — comprobado saboteándolo — así que no basta.
    //
    // Aquí se rompe la subida a propósito: si vaciarLocal() estuviera al
    // principio de migrarLocalACuenta, el perro desaparecería de los dos
    // sitios a la vez y no quedaría copia en ninguna parte.
    await sembrarUsoSinCuenta(page, { dentro: false });
    await page.route("**/rest/v1/perros*", (ruta) =>
      ruta.request().method() === "POST"
        ? ruta.fulfill({ status: 500, contentType: "application/json", body: '{"message":"boom"}' })
        : ruta.continue());

    await page.goto("/");
    await iniciarSesion(page);
    await page.waitForTimeout(2500);

    const guardado = await page.evaluate(() =>
      JSON.parse(window.localStorage.getItem("rawku.local.perros") || "[]"));
    expect(guardado.map((p) => p.nombre),
      "la subida falló y aun así se borró el perro del navegador: no queda copia en ningún sitio")
      .toContain("Ruffo");
  });

  test("el navegador se vacía sólo DESPUÉS de haber subido", async ({ page }) => {
    // Si se vaciara antes y la subida fallara, no quedaría copia en ningún
    // sitio. Por eso vaciarLocal() va al final de migrarLocalACuenta.
    await sembrarUsoSinCuenta(page, { dentro: false });
    await page.goto("/");
    await iniciarSesion(page);

    await expect.poll(async () => {
      return page.evaluate(() => window.localStorage.getItem("rawku.local.perros"));
    }, { timeout: 15000 }).toBeNull();

    // y ya no queda marcado el modo sin cuenta
    expect(await page.evaluate(() => window.localStorage.getItem("rawku.local.sinCuenta")))
      .toBe("false");
  });

  test("si no había nada guardado, entrar con cuenta no inventa perros", async ({ page, request }) => {
    // El caso normal de quien nunca usó la app sin cuenta. La migración no
    // puede colar un perro fantasma.
    await page.goto("/");
    await iniciarSesion(page);
    await page.waitForTimeout(1500);
    const { perrosGuardados } = await configurarBackend(request, {});
    expect(perrosGuardados, "no había nada local: no debería haberse creado ningún perro").toEqual([]);
  });
});

test.describe("sin cuenta se puede tener más de un perro", () => {
  // ⚠️ AÑADIDO (24 agosto) — la pregunta era: "¿la burbuja de los perfiles
  // se ve sin tener cuenta?".
  //
  // Verla es lo fácil. Lo que puede fallar en silencio es lo otro: que
  // añadir el segundo perro parezca funcionar y no se guarde, porque sin
  // cuenta ese guardado va al navegador por un camino distinto
  // (almacen.js) del de Supabase. Sería la misma familia que el fallo de
  // la ficha que no se guardaba: sin error, sin aviso, y te enteras días
  // después.
  //
  // Por eso esto no mira la pantalla: mira lo GUARDADO.
  test.beforeEach(async ({ request }) => {
    await configurarBackend(request, { retrasoPerrosMs: 50, sinPerro: true, menus: [] });
  });

  test("la burbuja y el engranaje están, sin cuenta", async ({ page }) => {
    await sembrarUsoSinCuenta(page);
    await page.goto("/");

    await expect(page.getByRole("button", { name: /Perro actual: Ruffo/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Ajustes" })).toBeVisible();
  });

  test("el segundo perro se guarda de verdad en el móvil", async ({ page }) => {
    await sembrarUsoSinCuenta(page, { menus: [] });
    await page.goto("/");

    await page.getByRole("button", { name: /Perro actual: Ruffo/ }).click();
    await page.getByRole("dialog", { name: "Tus perros" })
              .getByRole("button", { name: /Añadir otro perro/ }).click();

    // El asistente de 6 pasos, igual que con cuenta.
    await page.getByText("1 / 6").waitFor();
    await page.getByPlaceholder("Nombre de tu perro").fill("Lola");
    await page.getByRole("button", { name: "Hembra", exact: true }).click();
    await page.getByRole("button", { name: "Continuar" }).click();
    await page.getByText("2 / 6").waitFor();
    await page.getByRole("button", { name: /Es mestizo/ }).click();
    await page.getByRole("button", { name: /^Mediano/ }).click();
    await page.getByRole("button", { name: "Continuar" }).click();
    await page.getByText("3 / 6").waitFor();
    await page.getByRole("button", { name: "Continuar" }).click();
    await page.getByText("4 / 6").waitFor();
    await page.getByPlaceholder("0").fill("20");
    await page.getByRole("button", { name: "Continuar" }).click();
    await page.getByText("5 / 6").waitFor();
    await page.getByRole("button", { name: "No", exact: true }).click();
    await page.getByRole("button", { name: "Continuar" }).click();
    await page.getByText("6 / 6").waitFor();
    const noes = page.getByRole("button", { name: "No", exact: true });
    for (let i = 0; i < 4; i++) await noes.nth(i).click();
    await page.getByRole("button", { name: "Terminar" }).click();

    // Entrar al generador es lo que dispara el guardado, igual que con
    // cuenta.
    await page.getByRole("button", { name: /ir al generador de menús|Hacer el menú de la semana/ }).click();

    await expect.poll(async () => page.evaluate(() =>
      JSON.parse(window.localStorage.getItem("rawku.local.perros") || "[]").map((p) => p.nombre)
    ), { timeout: 10000 }).toEqual(["Ruffo", "Lola"]);
  });

  test("y los dos salen en la burbuja al volver", async ({ page }) => {
    // Que estén guardados no basta: hay que poder llegar a ellos.
    await sembrarUsoSinCuenta(page, {
      perros: [PERRO_LOCAL, { ...PERRO_LOCAL, id: "local-2", nombre: "Lola" }],
      menus: [],
    });
    await page.goto("/");

    await page.getByRole("button", { name: /Perro actual/ }).click();
    const hoja = page.getByRole("dialog", { name: "Tus perros" });
    await expect(hoja.getByRole("button", { name: "Ruffo", exact: true })).toBeVisible();
    await expect(hoja.getByRole("button", { name: "Lola", exact: true })).toBeVisible();

    // Y se cambia de uno a otro sin cuenta ninguna.
    await hoja.getByRole("button", { name: "Lola", exact: true }).click();
    await expect(page.getByRole("button", { name: /Perro actual: Lola/ })).toBeVisible();
  });
});
