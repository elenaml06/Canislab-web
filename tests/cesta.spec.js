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
  await page.getByRole("button", { name: /Hacer el menú de la semana/ }).click();
}

test.describe("la compra en pantalla", () => {
  test("con un perro, la compra sale al final de El menú", async ({ page, request }) => {
    await configurar(request, {
      retrasoPerrosMs: 50, perros: [{ ...PERRO_DE_PRUEBA, dieta_actual: "barf" }],
      menus: [], olvidarUltimoMenu: true,
    });
    await page.goto("/");
    await entrar(page);
    await page.getByRole("button", { name: /^Automático/ }).click();
    await page.getByRole("button", { name: /^(Generar|Hacer)/ }).click();

    await expect(page.getByText("La compra de la semana")).toBeVisible();
    // El menú de mentira da 90 g de calabacín al día; la semana son 630.
    // Con la versión vieja (un día) habría puesto 90.
    await expect(page.getByText("630 g")).toBeVisible();
    // Y va a su zona de la tienda, no en una lista plana.
    await expect(page.getByText("Frutería")).toBeVisible();
  });

  test("con dos perros, dice qué es solo de uno", async ({ page, request }) => {
    await configurar(request, {
      retrasoPerrosMs: 50, perros: [PERRO_DE_PRUEBA, SEGUNDO_PERRO_DE_PRUEBA],
      menus: [], olvidarUltimoMenu: true,
      casaCompraUnica: false, casaFalla: false,
    });
    await page.goto("/");
    await entrar(page);
    await page.getByRole("button", { name: /Los mismos alimentos para todos/ }).click();
    for (const nombre of [PERRO_DE_PRUEBA.nombre, SEGUNDO_PERRO_DE_PRUEBA.nombre]) {
      await page.getByRole("group", { name: `Qué come ${nombre}` })
                .getByRole("button", { name: "Pienso", exact: true }).click();
    }
    await page.getByRole("button", { name: /^Automático/ }).click();
    await page.getByRole("button", { name: "+" }).click();          // dos menús
    await page.getByRole("button", { name: /^(Generar|Elegir los ingredientes|Personalizar los)/ }).click();

    await expect(page.getByText("La compra de la semana")).toBeVisible();
    // La sardina solo la lleva el segundo perro.
    await expect(page.getByText(`solo ${SEGUNDO_PERRO_DE_PRUEBA.nombre}`)).toBeVisible();
    // Y la suma es de la SEMANA (los dos menús, 4 días + 3 días, los dos
    // perros): 4704 g. Con la versión vieja -- solo el primer menú, un día
    // -- eran 672 g.
    await expect(page.getByText("4,7 kg")).toBeVisible();
  });
});
