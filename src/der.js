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
// 100 casos con sus kcal esperadas. `tests/der-contrato.spec.js` comprueba
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

// ⚠️ EL CORTE DE EARLY GROWTH ES EL DE FEDIAF: 14 SEMANAS (9 septiembre).
//
// Aquí ponía `edad.totalMeses < 4`, unas 17 semanas, y estaba escrito como
// «diferencia declarada con FEDIAF, y va al lado estricto»: tres semanas de
// más con los requisitos de cachorro joven, que son los más altos. Eso es
// inventarse un umbral pudiendo usar el de la fuente. FEDIAF 2025 titula las
// dos columnas de sus tablas de requisitos «Early Growth (< 14 weeks)» y
// «Late Growth (≥ 14 weeks)», así que el corte son 14 semanas y punto.
//
// Va en DÍAS y no en meses porque 14 semanas (98 días) caen a mitad del
// cuarto mes: con meses enteros no se puede expresar. `totalDias` lo pone
// `calcularEdad` en App.jsx.
const EARLY_GROWTH_DIAS = 98;   // 14 semanas x 7

function determinarEtapa(edad, pesoAdultoKg) {
  if (!edad) return "adulto";
  // Si falta `totalDias` (una ficha guardada antes de que existiera, o un
  // objeto construido a mano), se cae al corte viejo de 4 meses en vez de
  // comparar contra `undefined` -- que daría siempre false y mandaría a un
  // cachorro de dos meses a Late Growth, que pide MENOS. El respaldo es el
  // lado estricto a propósito: un fallo de datos no puede bajar requisitos.
  const dias = Number.isFinite(edad.totalDias)
    ? edad.totalDias
    : (edad.totalMeses < 4 ? 0 : EARLY_GROWTH_DIAS);
  if (dias < EARLY_GROWTH_DIAS) return "cachorro_joven";
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
// ⚠️ LAS DOS RAZAS CON CIFRA PROPIA DE FEDIAF (8 septiembre).
//
// Tabla VII-7 de FEDIAF 2025, sección «Breed specific differences», la misma
// tabla de la que salen los cinco escalones de actividad:
//     Great Danes     200 (200 - 250) kcal ME per kg BW^0.75
//     Newfoundlands   105 (80 - 132)
//
// Las dos están en la lista de 136 razas de la app y no se usaban. MEDIDO: un
// Gran Danés de 67,5 kg marcado como «normal» recibía 2590 kcal/día donde
// FEDIAF dice 4710 — el 55 %.
//
// ⚠️ LA CIFRA DE RAZA VA EN VEZ DEL NIVEL DE ACTIVIDAD. No es un suelo sobre
// el que se aplique la actividad, ni un ajuste que se sume. Lo dice la propia
// guía dos veces (leído entero el 9 de septiembre, al cerrar P-11):
//
//   · La frase que presenta la tabla: «Table VII-7 provides examples of daily
//     energy requirements of dogs at different activity levels, FOR SPECIFIC
//     BREEDS and for obese prone adults». Tres clases de fila en paralelo, la
//     misma columna y el mismo coeficiente: la fila de raza es ALTERNATIVA a
//     la de actividad, igual que «obese prone adults ≤90» lo es y no un
//     descuento sobre el 95 del sedentario.
//   · Y la sección 7.2.3.4 «Breed & type»: «Breed-specific needs probably
//     reflect differences in temperament, RESULTING IN HIGHER OR LOWER
//     ACTIVITY, as well as variation in stature or insulation capacity of
//     skin and hair coat». La diferencia de raza YA CONTIENE la de actividad;
//     sumar un nivel encima sería contarla dos veces.
//
// Lo único que sigue siendo interpretación nuestra es dónde caer DENTRO del
// rango publicado, porque FEDIAF da 200 (200-250) y 105 (80-132) y ninguna
// regla para colocarse. El valor central sustituye a la base de «normal», el
// nivel de actividad coloca dentro del rango moviendo su diferencia contra
// «normal», y el resultado se recorta al rango. Para el Gran Danés «en vez
// de» y «suelo» coinciden (200 es a la vez centro y extremo bajo); para el
// Terranova no, porque su rango abre a los dos lados: 90 sedentario, 132
// trabajo. Ese es el caso que separa las tres lecturas, y lo fija el contrato
// de `der_casos.json` y el BLOQUE 54 apartado 2-bis del repo del motor.
//
// ⚠️ TIENE QUE SEGUIR SIENDO IDÉNTICO A `RAZAS_CIFRA_FEDIAF` de `der.py`.
const RAZAS_CIFRA_FEDIAF = {
  "Gran Danés": [200.0, 200.0, 250.0],
  "Terranova":  [105.0,  80.0, 132.0],
};
const KLEIN_A = 1.063, KLEIN_B = 0.565, MJ_A_KCAL = 239.0;
// ⚠️ ERAN TRES ESCALONES Y SOLO SE USABA UNO (8 septiembre). Aquí había
// `[[0.50,210],[0.80,175],[null,140]]` y el código leía SIEMPRE el último, en
// los dos repos: un cachorro de dos meses sin peso adulto esperado recibía
// 140 (= 2 x RER), que es lo que SACN5 da para DESPUÉS de los cuatro meses.
//
// FEDIAF no cubre este caso — su ecuación de crecimiento necesita el peso
// adulto —, así que se tira de SACN5 (Tabla 5-2, parte 2 canina): «3 x RER
// from weaning until four months of age. At four months of age energy intake
// should be reduced to 2 x RER». Son dos escalones y cortan por EDAD.
const CRECIMIENTO_SACN5_MESES = 4.0;
const CRECIMIENTO_ANTES_4M = 210.0;   // 3 x RER
const CRECIMIENTO_DESDE_4M = 140.0;   // 2 x RER

function calcularDER(pesoActualKg, etapa, actividadIdx, esterilizado, opciones = {}) {
  if (!pesoActualKg || pesoActualKg <= 0) return null;
  const { pesoAdultoKg, pesoIdealKg, raza, nCachorros, semanaLactancia = 3,
          machoEntero = false, conOtrosPerros = false, mesesEdad } = opciones;
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
    } else if (mesesEdad != null && mesesEdad < CRECIMIENTO_SACN5_MESES) {
      coef = CRECIMIENTO_ANTES_4M;
    } else {
      coef = CRECIMIENTO_DESDE_4M;
    }
    der = coef * Math.pow(pesoActualKg, 0.75);
  } else if (etapa === "gestante_temprana" || etapa === "gestante_tardia") {
    der = 132 * Math.pow(pesoCalculo, 0.75);
    if (etapa === "gestante_tardia") der += 26 * pesoCalculo;
  } else if (etapa === "lactante") {
    const n = nCachorros > 0 ? nCachorros : 4;
    const extra = n <= 4 ? 24 * n * pesoCalculo : (96 + 12 * (n - 4)) * pesoCalculo;
    const pesoSem = [0.75, 0.95, 1.1, 1.2][Math.min(Math.max(semanaLactancia, 1), 4) - 1];
    // ⚠️ SIN TOPE (8 septiembre). Aquí había un `Math.min(der, 6.0 * RER)` que
    // no es de FEDIAF: FEDIAF (Tabla VII-8b) no pone ningún techo a esta
    // fórmula. El x6 salía de SACN5, donde NO es un techo general sino la
    // FILA de camadas de 9 o más cachorros. Recortaba hasta un 33 % (una
    // perra de 60 kg con 8 cachorros recibía 9054 kcal donde FEDIAF dice
    // 13.494). Ver `der.py`, que lleva el detalle.
    der = 145 * Math.pow(pesoCalculo, 0.75) + extra * pesoSem;
  } else {
    const propia = RAZAS_CIFRA_FEDIAF[raza];
    const base = BASE_ACTIVIDAD[ACTIVIDAD_KEY[actividadIdx]] ?? BASE_ACTIVIDAD.normal;
    let coef = propia ? propia[0] + (base - BASE_ACTIVIDAD.normal) : base;
    coef += AJUSTE_EDAD[etapa === "senior" ? "senior" : "adulto"];
    if (conOtrosPerros) coef += 10;
    if (machoEntero) coef += 10;
    if (propia) {
      // El ±15 de Thes 2014 no se aplica encima: estas dos razas ya tienen su
      // propia cifra medida. Y se recorta al rango que publica FEDIAF.
      coef = Math.max(propia[1], Math.min(propia[2], coef));
    } else if (RAZAS_MAS_GASTO.has(raza)) coef += 15;
    else if (RAZAS_MENOS_GASTO.has(raza)) coef -= 15;
    der = coef * Math.pow(pesoCalculo, 0.75);
  }
  if (subirPorDelgadez) der *= 1.20;
  return Math.round(der);
}

export { interpolar, finCrecimientoMeses, inicioSeniorAnios, pesoEsperado,
         determinarEtapa, calcularDER, ACTIVIDAD_KEY, RAZAS_MAS_GASTO,
         RAZAS_MENOS_GASTO, RAZAS_CIFRA_FEDIAF, EARLY_GROWTH_DIAS };
