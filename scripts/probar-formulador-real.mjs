#!/usr/bin/env node
// ─── EL FORMULADOR, CONTRA LA API DE VERDAD ─────────────────────────────────
//
// POR QUÉ EXISTE, y es un caso real del 29 de agosto: la pantalla leía
// `ficha.dentro` y la API devuelve `ficha.dentro_de_rango`. En producción no
// se veía NI UNO de los nutrientes que cumplen -- solo los que fallan --, que
// es justo lo contrario de para lo que se añadió esa lista: de un menú verde
// no se podía enseñar nada.
//
// Y las pruebas pasaban. El Supabase de mentira devolvía el mismo nombre
// equivocado que leía el código, así que los dos lados se equivocaban igual y
// en verde. Un servidor falso solo comprueba lo que ya sabes.
//
// Esto habla con la API de VERDAD y comprueba lo único que un servidor de
// mentira no puede: que las claves que lee la pantalla existan de verdad, y
// que al agruparlas no se quede nada fuera.
//
//     node scripts/probar-formulador-real.mjs
//
// No necesita cuenta ni deja nada: son dos peticiones de cálculo.
import { agruparNutrientes, resumenDeLaFicha } from "../src/nutrientes.js";

if (process.env.HTTPS_PROXY || process.env.https_proxy) {
  try {
    const { ProxyAgent, setGlobalDispatcher } = await import("undici");
    setGlobalDispatcher(new ProxyAgent(process.env.HTTPS_PROXY || process.env.https_proxy));
  } catch { /* sin undici: si hay proxy, fallará al conectar y se dirá */ }
}

const API = process.env.API_BASE || "https://canislab-api.onrender.com";
const V = "\x1b[32m", R = "\x1b[31m", G = "\x1b[90m", F = "\x1b[0m";
let fallos = 0;
const comprobar = (ok, que, detalle = "") => {
  console.log(`${ok ? V + "  OK  " : R + " FALLA "}${F} ${que}${detalle ? `\n${G}        ${detalle}${F}` : ""}`);
  if (!ok) fallos++;
};

const pedir = async (ruta, cuerpo) => {
  const r = await fetch(`${API}${ruta}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cuerpo),
  });
  if (!r.ok) throw new Error(`${ruta} respondió ${r.status}`);
  return r.json();
};

const PACIENTE = {
  der_objetivo: 1100, etapa_requisitos: "Adulto", peso_perro_kg: 25,
};

try {
  console.log(`${G}Contra ${API}${F}\n`);

  console.log("── UNA RACIÓN A MEDIAS ──");
  const aMedias = await pedir("/formular/estado", {
    ...PACIENTE, gramos_por_alimento: { "Pollo muslo con piel": 300, "Zanahoria": 60 },
  });
  comprobar(aMedias.gramos_total === 360, "los gramos totales cuadran", `${aMedias.gramos_total} g`);
  comprobar(typeof aMedias.desvio_kcal_pct === "number", "viene el desvío de kcal",
            `${aMedias.desvio_kcal_pct} %`);
  comprobar(aMedias.ficha?.semaforo === "rojo", "media ración no sale verde",
            `semáforo ${aMedias.ficha?.semaforo}`);

  console.log("\n── LAS CLAVES QUE LEE LA PANTALLA ──");
  const completo = await pedir("/formular/autocompletar", {
    ...PACIENTE, gramos_por_alimento: { "Pollo muslo con piel": 300, "Zanahoria": 60 },
  });
  comprobar(completo.factible === true, "autocompletar da una ración",
            completo.motivo || "");
  const ficha = completo.estado?.ficha;
  comprobar(Boolean(ficha), "y viene con su ficha verificada");
  if (ficha) {
    // ⚠️ ÉSTA ES LA COMPROBACIÓN QUE HABRÍA CAZADO EL FALLO.
    comprobar(Array.isArray(ficha.dentro_de_rango) && ficha.dentro_de_rango.length > 0,
              "la lista de los que CUMPLEN llega con nombre y detalle",
              `dentro_de_rango: ${ficha.dentro_de_rango?.length ?? "no viene"}`);
    const conNumeros = (ficha.dentro_de_rango || []).filter(
      (f) => typeof f.tiene === "number" && (f.minimo !== undefined || f.maximo !== undefined));
    comprobar(conNumeros.length === (ficha.dentro_de_rango || []).length,
              "cada uno con su valor y su mínimo o su máximo",
              "sin eso, la ficha clínica es un recuento y no se puede firmar");

    const grupos = agruparNutrientes(ficha);
    const filas = grupos.reduce((a, g) => a + g.filas.length, 0);
    // ⚠️ EL ESPERADO SE CUENTA SOBRE EL JSON CRUDO, no con
    // `resumenDeLaFicha`. Con el fallo puesto -- leer `dentro` en vez de
    // `dentro_de_rango` -- las dos funciones se equivocaban IGUAL, así que
    // comparar una con otra daba verde: 0 = 0. Un cross-check tiene que
    // cruzar de verdad, y el otro lado es la respuesta tal como llega.
    const crudas = (ficha.faltan?.length || 0) + (ficha.se_pasa?.length || 0)
                 + (ficha.dentro_de_rango?.length || 0);
    comprobar(filas === crudas, "al agrupar no se pierde ninguna fila",
              `${filas} agrupadas de ${crudas} que manda la API`);
    const resumen = resumenDeLaFicha(ficha);
    comprobar(resumen.total === crudas, "y el resumen cuenta las mismas",
              `${resumen.total} contra ${crudas}`);
    const otros = grupos.find((g) => g.titulo === "Otros");
    comprobar(!otros, "y ninguna cae en «Otros»",
              otros ? `sin grupo: ${otros.filas.map((f) => f.nutriente).join(", ")}` : "");
    comprobar(filas >= 42, "están las 42 filas de la tabla (41 nutrientes + Ca:P)",
              `${filas} filas`);
  }
} catch (err) {
  comprobar(false, "el recorrido ha reventado", String(err?.message || err));
}

console.log(fallos === 0 ? `\n${V}El formulador habla el mismo idioma que la API.${F}`
                         : `\n${R}${fallos} fallo(s).${F}`);
process.exit(fallos === 0 ? 0 : 1);
