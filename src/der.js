// -*- coding: utf-8 -*-
//
// LAS KCAL DEL DÍA. Sacado de App.jsx el 26 de agosto, sin tocar ni una
// fórmula: estaba en medio de 8.000 líneas de pantallas, y es la pieza de
// lógica pura más importante que hay aquí -- de estas kcal salen los 30
// requisitos de FEDIAF que el motor tiene que cumplir.
//
// ⚠️ ESTO ESTÁ ESCRITO DOS VECES, y hay que saberlo antes de tocarlo: la
// misma fórmula, los mismos coeficientes y las mismas listas de razas
// viven también en `der.py`, en el repo de la API. Y LA QUE MANDA ES
// ESTA: la app calcula el DER aquí y lo manda al servidor en
// `der_objetivo`, así que el /der del servidor no lo llama nadie.
//
// Si las dos se separan, el usuario ve unas kcal en pantalla y el motor
// cumple los requisitos sobre otras. Ninguna de las dos da error, porque
// cada una por separado es coherente consigo misma.
//
// Contra eso está `der_casos.json`, el mismo archivo en los dos repos:
// 85 casos con sus kcal esperadas. `tests/der-contrato.spec.js` comprueba
// esta implementación contra ellos, y el BLOQUE 23 de las pruebas de la
// API comprueba la suya. Si tocas la fórmula aquí, esa prueba se cae y te
// obliga a mirar el otro lado. Si el cambio es a propósito, se regeneran
// los esperados y se copia el archivo A LOS DOS REPOS.


function interpolar(pesoKg, puntos) {
  if (pesoKg <= puntos[0][0]) return puntos[0][1];
  if (pesoKg >= puntos[puntos.length - 1][0]) return puntos[puntos.length - 1][1];
  for (let i = 0; i < puntos.length - 1; i++) {
    const [kg1, v1] = puntos[i];
    const [kg2, v2] = puntos[i + 1];
    if (pesoKg >= kg1 && pesoKg <= kg2) {
      const t = (pesoKg - kg1) / (kg2 - kg1);
      return v1 + t * (v2 - v1);
    }
  }
  return puntos[puntos.length - 1][1];
}

function finCrecimientoMeses(pesoAdultoKg) {
  return interpolar(pesoAdultoKg, [[5, 10], [10, 12], [25, 15], [45, 20], [70, 24]]);
}
function inicioSeniorAnios(pesoAdultoKg) {
  return interpolar(pesoAdultoKg, [[5, 10.5], [10, 10], [25, 8], [45, 7], [70, 5.5]]);
}
function pesoEsperado(mes, pesoAdultoKg) {
  const fin = finCrecimientoMeses(pesoAdultoKg);
  const k = 3 / fin;
  return Math.round(pesoAdultoKg * (1 - Math.exp(-k * mes)) * 10) / 10;
}

function determinarEtapa(edad, pesoAdultoKg) {
  if (!edad) return "adulto";
  if (edad.totalMeses < 4) return "cachorro_joven";
  const finCrecimiento = finCrecimientoMeses(pesoAdultoKg);
  if (edad.totalMeses < finCrecimiento) return "cachorro_crecimiento";
  const inicioSenior = inicioSeniorAnios(pesoAdultoKg);
  if (edad.anios >= inicioSenior) return "senior";
  return "adulto";
}


const ACTIVIDAD_KEY = ["sedentario", "normal", "activo", "muy_activo", "trabajo"];

const BASE_ACTIVIDAD = { sedentario: 95, normal: 110, activo: 125, muy_activo: 150, trabajo: 175 };
const AJUSTE_EDAD = { joven: 15, adulto: 0, senior: -7 };
const RAZAS_MAS_GASTO = new Set(["Jack Russell Terrier","Parson Russell Terrier",
  "Dálmata","Braco Húngaro (Vizsla)","Bearded Collie","Galgo Afgano",
  "Galgo Español","Boxer","Rhodesian Ridgeback","Flat Coated Retriever"]);
const RAZAS_MENOS_GASTO = new Set(["Dachshund Estándar","Dachshund Miniatura",
  "Lhasa Apso","Shih Tzu","West Highland White Terrier","Border Collie",
  "Collie de Pelo Largo","Airedale Terrier","American Staffordshire Terrier",
  "Golden Retriever"]);
const KLEIN_A = 1.063, KLEIN_B = 0.565, MJ_A_KCAL = 239.0;
const CRECIMIENTO = [[0.50, 210], [0.80, 175], [null, 140]];

function calcularDER(pesoActualKg, etapa, actividadIdx, esterilizado, opciones = {}) {
  if (!pesoActualKg || pesoActualKg <= 0) return null;
  const { pesoAdultoKg, pesoIdealKg, raza, nCachorros, semanaLactancia = 3,
          machoEntero = false, conOtrosPerros = false } = opciones;
  const enCrecimiento = etapa === "cachorro_joven" || etapa === "cachorro_crecimiento";

  let pesoCalculo = pesoActualKg, subirPorDelgadez = false;
  if (pesoIdealKg > 0 && !enCrecimiento) {
    const ratio = pesoActualKg / pesoIdealKg;
    if (ratio >= 1.10) return Math.round(70 * Math.pow(pesoIdealKg, 0.75));
    pesoCalculo = pesoIdealKg;
    if (ratio <= 0.90) subirPorDelgadez = true;
  }

  let der;
  if (enCrecimiento) {
    let coef;
    if (pesoAdultoKg > 0) {
      const frac = Math.min(pesoActualKg / pesoAdultoKg, 1.0);
      coef = Math.max((KLEIN_A - KLEIN_B * frac) * MJ_A_KCAL, 98.0);
    } else {
      coef = CRECIMIENTO[CRECIMIENTO.length - 1][1];
    }
    der = coef * Math.pow(pesoActualKg, 0.75);
  } else if (etapa === "gestante_temprana" || etapa === "gestante_tardia") {
    der = 132 * Math.pow(pesoCalculo, 0.75);
    if (etapa === "gestante_tardia") der += 26 * pesoCalculo;
  } else if (etapa === "lactante") {
    const n = nCachorros > 0 ? nCachorros : 4;
    const extra = n <= 4 ? 24 * n * pesoCalculo : (96 + 12 * (n - 4)) * pesoCalculo;
    const pesoSem = [0.75, 0.95, 1.1, 1.2][Math.min(Math.max(semanaLactancia, 1), 4) - 1];
    der = 145 * Math.pow(pesoCalculo, 0.75) + extra * pesoSem;
    der = Math.min(der, 6.0 * 70 * Math.pow(pesoCalculo, 0.75));
  } else {
    let coef = BASE_ACTIVIDAD[ACTIVIDAD_KEY[actividadIdx]] ?? BASE_ACTIVIDAD.normal;
    coef += AJUSTE_EDAD[etapa === "senior" ? "senior" : "adulto"];
    if (conOtrosPerros) coef += 10;
    if (machoEntero) coef += 10;
    if (RAZAS_MAS_GASTO.has(raza)) coef += 15;
    else if (RAZAS_MENOS_GASTO.has(raza)) coef -= 15;
    der = coef * Math.pow(pesoCalculo, 0.75);
  }
  if (subirPorDelgadez) der *= 1.20;
  return Math.round(der);
}

export { interpolar, finCrecimientoMeses, inicioSeniorAnios, pesoEsperado,
         determinarEtapa, calcularDER, ACTIVIDAD_KEY, RAZAS_MAS_GASTO,
         RAZAS_MENOS_GASTO };
