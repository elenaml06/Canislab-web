// ─── Lo que se le cuenta al dueño lo escribe el MOTOR ────────────────────────
//
// POR QUÉ EXISTE (18 de septiembre de 2026)
//
// Elena: «deberíamos tener una parte en la aplicación que sea información sobre
// los beneficios del BARF y qué es el BARF, los beneficios de la comida
// cocinada y qué es la comida cocinada, y luego la información de los
// alimentos, rollo: esto es la hostia para el pelo, esto es la hostia para el
// hígado. Esto no es para el veterinario, es solo para el usuario».
//
// ⚠️ Y ES LA REGLA 6 EN EL SITIO DONDE MÁS TIENTA SALTÁRSELA: son TEXTOS, y un
// texto parece inofensivo de copiar. No lo es, y aquí menos que en ningún otro
// sitio, porque «de qué es rico» cada alimento el motor lo DERIVA del catálogo
// vivo. Una copia en la app seguiría diciendo «el hígado es de los que más
// cobre llevan» el día que esa ficha cambie — y la pantalla se vería perfecta.
//
// ⚠️ SE SIEMBRAN PALABRAS INVENTADAS, que es lo único que distingue «la app lo
// ha leído del motor» de «la app está pintando DOCUMENTACION_MODOS_RESPALDO».
// Con las palabras de verdad las dos cosas se ven EXACTAMENTE IGUAL y esta
// prueba pasaría en verde con la petición a `/alimentos` entera comentada. Es
// la lección que este repo lleva escrita desde el 12 de septiembre.

import { test, expect } from "@playwright/test";
import { CUENTA_DE_PRUEBA, PERRO_DE_PRUEBA } from "./fake-supabase.js";
import { irAlGenerador } from "./ayudas.js";

const SUPABASE_FALSO = "http://127.0.0.1:54321";

const CRUDO_TITULO = "Que-es-el-fistrillo-crudo";
const CRUDO_QUE_ES = "El fistrillo crudo es dar zarangollo sin cocer, del motor";
const CRUDO_VENTAJA_T = "Zarangollo-fresquito";
const CRUDO_VENTAJA_X = "Porque el zarangollo trae su propia agua, dice el motor";
const CRUDO_OJO_T = "Cuidado-con-el-fistrillo";
const CRUDO_OJO_X = "El fistrillo crudo hay que manejarlo con cuidado, dice el motor";
const VET_SOLO = "REGISTRO-VETERINARIO-QUE-NO-DEBE-SALIR";

function catalogoConDocumentacion() {
  return {
    pantallas: [
      { clave: "carne", titulo: "Carne",
        grupos: { Pollo: [{ nombre: "Carne muscular de pollo", kcal_100g: 110 }] } },
    ],
    // El registro del dueño y el del veterinario, como en todo lo demás.
    documentacion: {
      modos: {
        crudo: {
          titulo: CRUDO_TITULO,
          que_es: CRUDO_QUE_ES,
          por_que: [{ titulo: CRUDO_VENTAJA_T, texto: CRUDO_VENTAJA_X }],
          a_tener_en_cuenta: [{ titulo: CRUDO_OJO_T, texto: CRUDO_OJO_X }],
          veterinario: { de_donde_sale: [{ afirmacion: VET_SOLO, fuente: VET_SOLO, cita: VET_SOLO }] },
        },
        cocinado: { titulo: "Que-es-el-puchero", que_es: "puchero del motor",
                    por_que: [], a_tener_en_cuenta: [] },
      },
      para_que_es_bueno: {},
    },
  };
}

async function configurarBackend(request, opciones) {
  const res = await request.post(`${SUPABASE_FALSO}/__control`, { data: opciones });
  expect(res.ok()).toBeTruthy();
  return res.json();
}

async function entrar(page) {
  await page.goto("/");
  await page.getByPlaceholder("Email").fill(CUENTA_DE_PRUEBA.email);
  await page.getByPlaceholder("Contraseña").fill(CUENTA_DE_PRUEBA.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await irAlGenerador(page);
}

test.describe("la documentación del dueño sale del motor", () => {
  test("el «qué es» de cada modo se pinta con las palabras que sirve el motor",
    async ({ page, request }) => {
      await configurarBackend(request, {
        retrasoPerrosMs: 50, perros: [{ ...PERRO_DE_PRUEBA, dieta_actual: "barf" }],
        menus: [], premium: true, catalogo: catalogoConDocumentacion(),
      });
      await entrar(page);

      // Va plegado: quien ya sabe lo que quiere no tiene que leer nada.
      await expect(page.getByText(CRUDO_QUE_ES),
        "el texto sale sin desplegar; tiene que estar plegado").toHaveCount(0);

      await page.getByRole("button", { name: CRUDO_TITULO }).click();

      for (const palabra of [CRUDO_QUE_ES, CRUDO_VENTAJA_T, CRUDO_VENTAJA_X,
                             CRUDO_OJO_T, CRUDO_OJO_X]) {
        await expect(page.getByText(palabra, { exact: false }),
          `no sale «${palabra}», que es lo que ha servido el motor. Si en su lugar sale el ` +
          `texto de siempre, la app está pintando DOCUMENTACION_MODOS_RESPALDO y la ` +
          `petición a /alimentos no se está usando — que en pantalla se ve idéntico`)
          .toHaveCount(1);
      }
    });

  // ⚠️ LA MITAD QUE DE VERDAD PROTEGE, y es la lección del BLOQUE 107 del motor:
  // limpiar el texto del dueño no puede significar que el técnico se cuele por
  // otro lado. Si el registro del veterinario apareciera aquí, el dueño leería
  // «SACN5 5ª ed., cap.32» en la pantalla de elegir qué le da de comer.
  test("el registro del veterinario NO entra en la pantalla del dueño",
    async ({ page, request }) => {
      await configurarBackend(request, {
        retrasoPerrosMs: 50, perros: [{ ...PERRO_DE_PRUEBA, dieta_actual: "barf" }],
        menus: [], premium: true, catalogo: catalogoConDocumentacion(),
      });
      await entrar(page);
      await page.getByRole("button", { name: CRUDO_TITULO }).click();
      await expect(page.getByText(VET_SOLO, { exact: false }),
        "el registro del veterinario sale en la pantalla del dueño").toHaveCount(0);
    });

  // Y las DOS mitades: contar solo las ventajas de una forma de dar de comer es
  // publicidad, no información. Si el motor sirve «a tener en cuenta», se pinta.
  test("se pintan las ventajas Y lo que hay que tener en cuenta",
    async ({ page, request }) => {
      await configurarBackend(request, {
        retrasoPerrosMs: 50, perros: [{ ...PERRO_DE_PRUEBA, dieta_actual: "barf" }],
        menus: [], premium: true, catalogo: catalogoConDocumentacion(),
      });
      await entrar(page);
      await page.getByRole("button", { name: CRUDO_TITULO }).click();
      await expect(page.getByText(CRUDO_VENTAJA_X, { exact: false })).toBeVisible();
      await expect(page.getByText(CRUDO_OJO_X, { exact: false }),
        "se pintan las ventajas y NO lo que hay que tener en cuenta. Contar solo una " +
        "mitad de una forma de dar de comer es publicidad").toBeVisible();
    });
});
