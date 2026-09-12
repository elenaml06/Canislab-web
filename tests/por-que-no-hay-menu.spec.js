// ─── Cuando no sale menú, la app dice QUÉ dijo el motor ──────────────────────
//
// ⚠️ CASO REAL ENCONTRADO POR LA USUARIA (12 de septiembre de 2026): «No hemos
// encontrado un menú que cumpla», con CUALQUIER perro, y desde el móvil no
// había manera de saber por qué.
//
// La app tenía el detalle y lo escondía: el motor manda con cada «no hay menú»
// los peldaños que intentó (`se_intento_relajando`) y, si el bloqueo es de una
// patología, el límite exacto con su cifra y su fuente
// (`choque_de_patologias`). Ese recuadro solo se pintaba en la pantalla de
// ÉXITO, así que desaparecía justo cuando hace falta.
//
// Esta prueba siembra una respuesta de «no factible» con esos dos campos y
// exige que la pantalla de error los enseñe. Con el panel quitado, falla.
import { test, expect } from "@playwright/test";
import { CUENTA_DE_PRUEBA, PERRO_DE_PRUEBA } from "./fake-supabase.js";
import { esperarLaFicha, irAlGenerador } from "./ayudas.js";

const SUPABASE_FALSO = "http://127.0.0.1:54321";

const SIN_MENU = {
  factible: false,
  motivo: "No hay ninguna ración que cumpla los límites de las patologías marcadas.",
  choque_de_patologias: [{
    patologia: "obesidad",
    nombre_patologia: "Obesidad / sobrepeso, adelgazamiento dirigido",
    nutriente: "grasa",
    nombre_nutriente: "grasa total",
    tipo: "tope",
    valor: 22.5,
    unidad: "g/1000 kcal",
    fuente: "SACN5 5ª ed., cap.27 «Obesity», Tabla 27-4",
    por_que: "Tabla 27-4, perros, adelgazamiento",
  }],
  se_intento_relajando: ["minimos_de_las_secundarias", "tope_maximo_de_visceras_higado_y_verdura"],
};

test("si no sale menú, la pantalla enseña el límite que bloquea y los peldaños probados",
     async ({ page, request }) => {
  const res = await request.post(`${SUPABASE_FALSO}/__control`, { data: {
    perros: [PERRO_DE_PRUEBA], menus: [], premium: true, respuestaMenu: SIN_MENU,
  } });
  expect(res.ok()).toBeTruthy();

  await page.goto("/");
  await page.getByPlaceholder("Email").fill(CUENTA_DE_PRUEBA.email);
  await page.getByPlaceholder("Contraseña").fill(CUENTA_DE_PRUEBA.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await esperarLaFicha(page);
  await irAlGenerador(page);
  // Los modos están apagados hasta contestar qué come ahora.
  await page.getByRole("button", { name: "Pienso", exact: true }).click();
  await page.getByRole("button", { name: /^Automático/ }).click();
  await page.getByRole("button", { name: /^(Generar|Hacer)/ }).click();

  await expect(page.getByText("No hemos encontrado un menú que cumpla")).toBeVisible({ timeout: 60000 });

  // El desplegable con lo que dijo el motor.
  await page.getByText("Qué dijo el motor").click();
  await expect(page.getByText(/Obesidad \/ sobrepeso/),
    "la pantalla no dice qué límite bloquea, que es lo único que permite arreglarlo")
    .toBeVisible();
  await expect(page.getByText(/22\.5 g\/1000 kcal|22,5 g\/1000 kcal/)).toBeVisible();
  await expect(page.getByText(/Se probó soltando:/),
    "no dice qué peldaños intentó el motor").toBeVisible();
});
