// ─── La cesta de la compra ───────────────────────────────────────────────────
//
// QUÉ ESTABA ROTO
// Con un perro no había lista de la compra: la app decía lo de cada día y
// sumar los menús por sus días era cosa tuya. Con varios perros sí había,
// pero sumaba SOLO EL PRIMER MENÚ de cada uno. Si el segundo menú llevaba
// un alimento distinto -- que es justo para lo que sirve tener dos menús --
// ese alimento no salía en la compra. Te ibas a la tienda sin él.
//
// POR QUÉ ESTAS PRUEBAS SON DE LA FUNCIÓN Y NO DE LA PANTALLA
// El fallo de "solo el primer menú" no se ve mirando la pantalla: la lista
// aparece, está bien maquetada y los números son correctos... para un día.
// Lo que falla es la ARITMÉTICA, y eso se comprueba con números, no con
// capturas. Las de pantalla van abajo, y son solo las que la función no
// puede cubrir: que se pinte, y que lo de "de quién" salga donde toca.
//
// Es la misma familia de fallos de CLAUDE.md: sin error, sin aviso, y te
// enteras en la carnicería.

import { test, expect } from "@playwright/test";
import { cestaDeLaCompra, formatearCompra, deQuienEs, zonaDeCategoria } from "../src/cesta.js";

// Un catálogo mínimo: la función recibe el "de qué categoría es esto" desde
// fuera a propósito, así que aquí se le da uno de mentira y las pruebas no
// dependen del catálogo real de 77 alimentos.
const CATEGORIA = {
  "Conejo": "Carne muscular",
  "Pollo con piel (sin hueso)": "Carne muscular",
  "Espinazo de conejo": "Hueso carnoso",
  "Hígado de conejo": "Hígado",
  "Sardina": "Pescados y mariscos",
  "Zanahoria": "Verduras y frutas",
  "Sal común (cloruro sódico)": "Extras",
  "V-INTEGRA Cachorro": "Multivitamínico",
};
const categoriaDe = (n) => CATEGORIA[n] || "Extras";

// Todas las líneas de todas las zonas, aplanadas, para poder buscar una.
const todas = (cesta) => cesta.flatMap((z) => z.lineas);
const linea = (cesta, alimento) => todas(cesta).find((l) => l.alimento === alimento);

test.describe("la cesta suma la semana entera", () => {
  test("multiplica cada menú por SUS días, no por uno", () => {
    const cesta = cestaDeLaCompra([{
      nombre: "Rufo",
      menus: [{ dias: 4, gramos: { Conejo: 600 } }],
    }], categoriaDe);

    // 600 g al día durante 4 días. Antes esto daba 600.
    expect(linea(cesta, "Conejo").gramos).toBe(2400);
  });

  test("un alimento que solo está en el SEGUNDO menú no se pierde", () => {
    // Éste es el fallo tal cual: la versión vieja se quedaba con menus[0].
    const cesta = cestaDeLaCompra([{
      nombre: "Rufo",
      menus: [
        { dias: 4, gramos: { Conejo: 600 } },
        { dias: 3, gramos: { "Pollo con piel (sin hueso)": 500 } },
      ],
    }], categoriaDe);

    expect(linea(cesta, "Pollo con piel (sin hueso)")?.gramos).toBe(1500);
  });

  test("lo que se repite se suma, no se pisa", () => {
    const cesta = cestaDeLaCompra([{
      nombre: "Rufo",
      menus: [
        { dias: 4, gramos: { Zanahoria: 15 } },
        { dias: 3, gramos: { Zanahoria: 20 } },
      ],
    }], categoriaDe);

    expect(linea(cesta, "Zanahoria").gramos).toBe(4 * 15 + 3 * 20);
    expect(todas(cesta).filter((l) => l.alimento === "Zanahoria")).toHaveLength(1);
  });

  test("suma los perros entre sí", () => {
    const cesta = cestaDeLaCompra([
      { nombre: "Rufo", menus: [{ dias: 7, gramos: { Conejo: 300 } }] },
      { nombre: "Cairo", menus: [{ dias: 7, gramos: { Conejo: 500 } }] },
    ], categoriaDe);

    expect(linea(cesta, "Conejo").gramos).toBe(7 * 800);
    expect(linea(cesta, "Conejo").deQuien).toEqual(["Rufo", "Cairo"]);
  });

  test("un menú sin días declarados vale por uno, nunca por cero", () => {
    // Un cero silencioso borraría alimentos de la lista de la compra, que
    // es justo el fallo que esto viene a arreglar.
    const cesta = cestaDeLaCompra([{
      nombre: "Rufo", menus: [{ gramos: { Conejo: 600 } }],
    }], categoriaDe);

    expect(linea(cesta, "Conejo").gramos).toBe(600);
  });
});

test.describe("de quién es cada cosa", () => {
  test("con un solo perro no se dice de quién: sobra", () => {
    expect(deQuienEs(["Rufo"], 1)).toBeNull();
  });

  test("si es de todos, tampoco: taparía la línea que sí importa", () => {
    expect(deQuienEs(["Rufo", "Cairo"], 2)).toBeNull();
  });

  test("si es de uno solo de los dos, se dice", () => {
    expect(deQuienEs(["Cairo"], 2)).toBe("solo Cairo");
  });

  test("con tres perros, dos se enumeran en español", () => {
    expect(deQuienEs(["Cairo", "Lola"], 3)).toBe("solo Cairo y Lola");
  });

  test("la cesta apunta de quién es cada línea", () => {
    const cesta = cestaDeLaCompra([
      { nombre: "Rufo", menus: [{ dias: 7, gramos: { Conejo: 300 } }] },
      { nombre: "Cairo", menus: [{ dias: 7, gramos: { Conejo: 500, Sardina: 70 } }] },
    ], categoriaDe);

    expect(linea(cesta, "Sardina").deQuien).toEqual(["Cairo"]);
    expect(deQuienEs(linea(cesta, "Sardina").deQuien, 2)).toBe("solo Cairo");
  });
});

test.describe("por zonas de la tienda", () => {
  test("carne, hueso, víscera e hígado van al mismo mostrador", () => {
    expect(zonaDeCategoria("Carne muscular")).toBe("carniceria");
    expect(zonaDeCategoria("Hueso carnoso")).toBe("carniceria");
    expect(zonaDeCategoria("Vísceras")).toBe("carniceria");
    expect(zonaDeCategoria("Hígado")).toBe("carniceria");
  });

  test("los suplementos y los extras van juntos a despensa", () => {
    expect(zonaDeCategoria("Extras")).toBe("despensa");
    expect(zonaDeCategoria("Multivitamínico")).toBe("despensa");
    expect(zonaDeCategoria("Omega-3")).toBe("despensa");
  });

  test("una categoría que no conozcamos no desaparece: cae en despensa", () => {
    // Si mañana el catálogo trae una categoría nueva, la línea tiene que
    // seguir apareciendo en la lista aunque no sepamos dónde ponerla.
    expect(zonaDeCategoria("Categoría inventada")).toBe("despensa");
    const cesta = cestaDeLaCompra([{
      nombre: "Rufo", menus: [{ dias: 1, gramos: { Cosa: 10 } }],
    }], () => "Categoría inventada");
    expect(linea(cesta, "Cosa")).toBeTruthy();
  });

  test("una zona sin nada no se pinta", () => {
    const cesta = cestaDeLaCompra([{
      nombre: "Rufo", menus: [{ dias: 7, gramos: { Conejo: 600 } }],
    }], categoriaDe);
    expect(cesta.map((z) => z.clave)).toEqual(["carniceria"]);
  });
});

test.describe("las cantidades, como se piden en la tienda", () => {
  test("por encima del kilo, en kilos", () => {
    expect(formatearCompra(2478)).toBe("2,5 kg");
    expect(formatearCompra(1000)).toBe("1 kg");
  });

  test("por debajo del kilo, gramos enteros", () => {
    expect(formatearCompra(617.4)).toBe("617 g");
    expect(formatearCompra(15)).toBe("15 g");
  });

  test("lo muy pequeño lleva decimal: ahí sí importa", () => {
    expect(formatearCompra(4.41)).toBe("4,4 g");
    expect(formatearCompra(0.63)).toBe("0,6 g");
  });

  test("una traza no se convierte en cero", () => {
    // "0 g" en una lista de la compra significa "no lo compres", y sí hay
    // que comprarlo.
    expect(formatearCompra(0.02)).toBe("< 0,1 g");
  });

  test("cero es cero", () => {
    expect(formatearCompra(0)).toBe("0 g");
  });
});

// ─── Y que salga en pantalla ─────────────────────────────────────────────────
//
// Lo de arriba prueba la aritmética. Esto prueba lo único que la función no
// puede saber: que alguien la llame y la pinte. Son pocas a propósito -- una
// prueba de pantalla que repita las cuentas de arriba no añade nada y se
// rompe cada vez que se mueve un margen.

import { CUENTA_DE_PRUEBA, PERRO_DE_PRUEBA, SEGUNDO_PERRO_DE_PRUEBA } from "./fake-supabase.js";
import { irAlGenerador, pedirLosDeLaCasa } from "./ayudas.js";

const SUPABASE_FALSO = "http://127.0.0.1:54321";
const configurar = async (request, opciones) => {
  const res = await request.post(`${SUPABASE_FALSO}/__control`, { data: opciones });
  expect(res.ok()).toBeTruthy();
  return res.json();
};

async function entrar(page) {
  await page.getByPlaceholder("Email").fill(CUENTA_DE_PRUEBA.email);
  await page.getByPlaceholder("Contraseña").fill(CUENTA_DE_PRUEBA.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await irAlGenerador(page);
}

const abrirElPanel = async (page) => {
  await page.getByRole("button", { name: "Menú", exact: true }).click();
  await page.getByRole("button", { name: "La compra", exact: true }).click();
};

test.describe("la compra en pantalla", () => {
  // ⚠️ REESCRITO (24 agosto) — PEDIDO EXPRESO: "no quiero que la compra
  // aparezca en el menú, tiene que estar solo en el menú lateral".
  //
  // Al sacarla del menú aparece un fallo que antes no existía: si la
  // compra solo lee lo GUARDADO, acabas de generar un menú, todavía no le
  // has dado a guardar, y el panel te enseña la compra del menú ANTERIOR.
  // Números correctos, menú equivocado, y nada en pantalla que lo delate.
  // Por eso estas dos generan y NO guardan.
  test("no sale en el menú, y el panel usa el que acabas de hacer", async ({ page, request }) => {
    await configurar(request, {
      retrasoPerrosMs: 50, perros: [{ ...PERRO_DE_PRUEBA, dieta_actual: "barf" }],
      menus: [], olvidarUltimoMenu: true,      // NADA guardado, a propósito
    });
    await page.goto("/");
    await entrar(page);
    await page.getByRole("button", { name: /^Automático/ }).click();
    await page.getByRole("button", { name: /^(Generar|Hacer)/ }).click();

    // En el menú ya no está.
    await expect(page.getByText("La compra de la semana")).toHaveCount(0);

    await abrirElPanel(page);
    // Y sale del menú que tienes delante, sin haberlo guardado: el de
    // mentira da 90 g de calabacín al día, la semana son 630.
    await expect(page.getByText("630 g")).toBeVisible();
    await expect(page.getByText("Frutería")).toBeVisible();
    await expect(page.getByText(/menú que tienes en pantalla/)).toBeVisible();
  });

  test("con dos perros, el panel suma los dos y dice qué es de uno", async ({ page, request }) => {
    await configurar(request, {
      retrasoPerrosMs: 50, perros: [PERRO_DE_PRUEBA, SEGUNDO_PERRO_DE_PRUEBA],
      menus: [], olvidarUltimoMenu: true,
      casaCompraUnica: false, casaFalla: false,
    });
    await page.goto("/");
    await entrar(page);
    await pedirLosDeLaCasa(page);
    for (const nombre of [PERRO_DE_PRUEBA.nombre, SEGUNDO_PERRO_DE_PRUEBA.nombre]) {
      await page.getByRole("group", { name: `Qué come ${nombre}` })
                .getByRole("button", { name: "Pienso", exact: true }).click();
    }
    await page.getByRole("button", { name: /^Automático/ }).click();
    await page.getByRole("button", { name: "+" }).click();          // dos menús
    await page.getByRole("button", { name: /^(Generar|Elegir los ingredientes|Personalizar los)/ }).click();

    await expect(page.getByText("La compra de la semana")).toHaveCount(0);

    await abrirElPanel(page);
    // La sardina solo la lleva el segundo perro.
    await expect(page.getByText(`solo ${SEGUNDO_PERRO_DE_PRUEBA.nombre}`)).toBeVisible();
    // La semana de los dos, los dos menús (4 y 3 días): 4704 g.
    await expect(page.getByText("4,7 kg")).toBeVisible();
  });
});

// ─── EN LA TIENDA SE COMPRA CRUDO ────────────────────────────────────────────
//
// POR QUÉ EXISTE (18 de septiembre de 2026)
//
// Los gramos de un menú COCINADO son de comida YA COCINADA —la ficha lo declara
// y el aviso al comprar lo repite— pero en el mostrador se pide el peso CRUDO. Y
// la diferencia no es un redondeo: medida sobre las 69 fichas que se pesan
// cocidas, va de ×0,20 a ×1,99. Del pulpo hay que comprar el DOBLE de lo que
// dice el menú y de los copos de avena una QUINTA PARTE.
//
// Es exactamente la familia de fallos que esta lista vino a arreglar: sin
// error, sin aviso, y te enteras en la carnicería — solo que esta vez te
// enteras con la mitad de la comida del perro.
//
// ⚠️ Y LAS TRES MITADES QUE HAY QUE VIGILAR, no solo la cuenta:
//   · que convierta;
//   · que NO convierta lo que no tiene factor, y lo diga (inventarle el factor
//     de otro corte sería una cifra sin fuente en una lista de la compra);
//   · que el peso del PLATO se conserve, porque es lo que hay que enseñar al
//     lado — convertir en silencio sería tan malo como no convertir.
import { declararQueEsCocido } from "../src/cesta.js";

const FACTOR_DE_MENTIRA = {
  "Pulpo cocido": { factor: 1.99, aproximado: false },
  "Arroz cocido": { factor: 0.41, aproximado: false },
  "Cerdo cocido": { factor: 1.26, aproximado: true },
};
const factorDe = (n) => FACTOR_DE_MENTIRA[n] || null;
const categoriaCocida = (n) =>
  n.startsWith("Arroz") ? "Cereales y tubérculos"
  : n.startsWith("Pulpo") ? "Pescados y mariscos" : "Carne muscular";
const unaSemanaDe = (gramos) => [{ nombre: "Cairo", menus: [{ dias: 7, gramos }] }];

test.describe("en la tienda se compra crudo", () => {
  test.beforeEach(() => {
    declararQueEsCocido((n) => n.endsWith(" cocido") || n.endsWith(" cocida"));
  });

  test("los gramos del menú cocinado se convierten al peso que se pide en la tienda", () => {
    const cesta = cestaDeLaCompra(
      unaSemanaDe({ "Pulpo cocido": 100, "Arroz cocido": 100 }), categoriaCocida, factorDe);
    // 100 g/día × 7 días = 700 g en el plato
    expect(linea(cesta, "Pulpo cocido").gramos,
      "el pulpo pierde la mitad de su peso al cocerse: hay que comprar el DOBLE de lo que " +
      "dice el menú, y sin convertir la lista manda a por la mitad de la comida")
      .toBeCloseTo(700 * 1.99, 1);
    expect(linea(cesta, "Arroz cocido").gramos,
      "el arroz absorbe agua: se compra menos de la mitad de lo que pesa ya cocido")
      .toBeCloseTo(700 * 0.41, 1);
  });

  test("el peso del PLATO se conserva, porque es lo que hay que decir al lado", () => {
    const cesta = cestaDeLaCompra(unaSemanaDe({ "Pulpo cocido": 100 }), categoriaCocida, factorDe);
    const l = linea(cesta, "Pulpo cocido");
    expect(l.seCompraEnCrudo, "no se marca que es peso crudo").toBe(true);
    expect(l.gramosEnElPlato,
      "se ha perdido lo que pesa en el plato. Convertir EN SILENCIO es tan malo como no " +
      "convertir: quien mire el menú y la lista vería dos números para el mismo alimento")
      .toBeCloseTo(700, 1);
  });

  test("lo aproximado se marca como aproximado", () => {
    const cesta = cestaDeLaCompra(unaSemanaDe({ "Cerdo cocido": 100 }), categoriaCocida, factorDe);
    expect(linea(cesta, "Cerdo cocido").factorAproximado,
      "el factor del cerdo sale de una fila cruda que NO es la suya —su fila cocida es una " +
      "media de cortes— y eso tiene que poder decirse").toBe(true);
  });

  // ⚠️ LA QUE MÁS VALE: lo que el motor NO sabe convertir NO se convierte.
  test("una ficha cocida sin factor se queda igual y se marca para poder decirlo", () => {
    const cesta = cestaDeLaCompra(
      unaSemanaDe({ "Ternera cocida": 100 }), categoriaCocida, factorDe);
    const l = linea(cesta, "Ternera cocida");
    expect(l.gramos, "se le ha aplicado un factor que el motor no ha dado").toBeCloseTo(700, 1);
    expect(l.sinFactor,
      "no se marca que son gramos ya cocinados. Sin eso, la lista da el peso del plato como " +
      "si fuera el de la tienda y no lo dice").toBe(true);
  });

  // Y la simetría: en un menú CRUDO no se convierte nada.
  test("un menú crudo no se toca", () => {
    declararQueEsCocido(() => false);
    const cesta = cestaDeLaCompra(
      unaSemanaDe({ "Conejo": 100 }), () => "Carne muscular", () => null);
    const l = linea(cesta, "Conejo");
    expect(l.gramos).toBeCloseTo(700, 1);
    expect(l.seCompraEnCrudo, "un menú crudo no tiene nada que convertir").toBeFalsy();
    expect(l.sinFactor, "un alimento crudo no puede salir marcado como «gramos ya cocinados»").toBeFalsy();
  });

  test("los cereales y tubérculos se compran en la frutería, no en la despensa", () => {
    expect(zonaDeCategoria("Cereales y tubérculos"),
      "la categoría entró el 17 de septiembre y no estaba en ninguna zona, así que caía en " +
      "«Despensa» por el valor por omisión — el arroz y la patata entre los botes de vitaminas")
      .toBe("verduleria");
  });
});
