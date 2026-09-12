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
// ⚠️ EL ESCALÓN DE EDAD ES EL DE FEDIAF, TABLA VII-6 (9 septiembre 2026).
//
//     1-2 años ........ 130 (125-140) kcal ME/kg BW^0,75
//     3-7 años ........ 110  (95-130)
//     > 7 años ........  95  (80-120)
//
// O sea +20 el joven y −15 el senior. Aquí ponía +15 y −7, de Thes 2014. La tabla
// de FEDIAF se había leído el 6 de septiembre y se apartó por ser «la de edad, no
// la de actividad», sin cruzar su escalón contra el nuestro: el −7 era un −6,4 %
// cuando FEDIAF dice −13,6 % y SACN5 cap.5 dice, aparte, que un perro de más de
// siete años necesita «10 to 20% less energy». Detalle en `der.py` del repo del
// motor y en `fediaf_tablas.json`.
//
// ⚠️ TIENE QUE SEGUIR SIENDO IDÉNTICO A `AJUSTE_EDAD` de `der.py`.
const AJUSTE_EDAD = { joven: 20, adulto: 0, senior: -15 };
// La banda de 1-2 años de la Tabla VII-6.
const ADULTO_JOVEN_HASTA_MESES = 24;
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

// ⚠️ Y LO DE ARRIBA DEJA DE SER LO PRIMERO QUE SE INTENTA (11 de septiembre de
//     2026, releyendo FEDIAF entera). «FEDIAF no cubre este caso» era falso.
//
// Su Tabla VII-8a publica la curva de crecimiento como CINCO ECUACIONES, por
// banda de peso adulto esperado y válidas «from weaning age (8 weeks) to 1
// year»:
//
//     % del peso adulto esperado = a x Ln(edad en semanas) − b
//
//     ≤ 7 kg        36,92 · Ln(semanas) − 43,57
//     > 7 - 15      36,86 · Ln(semanas) − 48,22
//     > 15 - 27,5   39,88 · Ln(semanas) − 60,70
//     > 27,5 - 47,5 36,96 · Ln(semanas) − 56,18
//     > 47,5        36,61 · Ln(semanas) − 62,39
//
// Eso da justo el dato que faltaba: con la edad y el peso de hoy se despeja el
// peso adulto esperado, y con él ya se puede usar la ecuación de Klein, que es
// la que usan todos los demás cachorros. Los dos escalones de SACN5 se quedan
// SOLO para lo que FEDIAF no cubre: por debajo de las 8 semanas y por encima
// del año, donde su ecuación pasa del 100 %.
//
// A quién afecta: al cachorro MESTIZO, que es el que llega sin peso adulto (los
// de raza lo traen de la tabla de razas). Hasta hoy recibía 3 x RER o 2 x RER
// según un único corte a los cuatro meses, que es mucho más grueso.
//
// ⚠️ ESTA TABLA HAY QUE LEERLA DEL PDF, NO DEL TEXTO EXTRAÍDO: sus cinco bandas
// y sus cinco ecuaciones salen en dos columnas cruzadas y el término
// independiente NO es monótono (>15-27,5 lleva −60,70 y >27,5-47,5 lleva
// −56,18), así que emparejarlas «de menor a mayor» las cruza. Las cinco de
// arriba están leídas del PDF por coordenadas.
//
// ⚠️ TIENE QUE SEGUIR SIENDO IDÉNTICO A `CURVA_FEDIAF_VII_8A` de `der.py`, y
// lo vigila el BLOQUE 96 allí y `der-contrato.spec.js` aquí.
const CURVA_FEDIAF_VII_8A = [
  [7.0, 36.92, 43.57],
  [15.0, 36.86, 48.22],
  [27.5, 39.88, 60.70],
  [47.5, 36.96, 56.18],
  [Infinity, 36.61, 62.39],
];
const CURVA_FEDIAF_MESES_MIN = 2.0;    // 8 semanas = 1,84 meses
const CURVA_FEDIAF_MESES_MAX = 12.0;   // «to 1 year», lo dice la propia tabla
const SEMANAS_POR_MES = 365.25 / 12.0 / 7.0;

// % del peso adulto que le toca a esa edad, o null fuera del rango de validez
// que la propia FEDIAF declara.
export function pctPesoAdultoFediaf(meses, pesoAdultoEstimado) {
  const m = Number(meses);
  if (!Number.isFinite(m) || m < CURVA_FEDIAF_MESES_MIN || m > CURVA_FEDIAF_MESES_MAX) return null;
  let a = 0, b = 0;
  for (const [tope, aa, bb] of CURVA_FEDIAF_VII_8A) {
    a = aa; b = bb;
    if (pesoAdultoEstimado <= tope) break;
  }
  const pct = (a * Math.log(m * SEMANAS_POR_MES) - b) / 100.0;
  // La ecuación es un ajuste: a los 12 meses un perro pequeño ya pasa del
  // 100 %. Nunca puede decir que pesa más de lo que va a pesar de adulto.
  return Math.min(Math.max(pct, 0.01), 1.0);
}

// Despeja el peso adulto esperado desde lo que el perro pesa HOY y su edad. Se
// itera porque la banda de la tabla depende del peso adulto, que es justo lo
// que se busca: se parte de la media de la raza (o del doble del peso actual) y
// converge en dos o tres vueltas. Mismo método que `peso_adulto_desde_curva` en
// `der.py`.
//
// ⚠️ Y ESTA ES LA ÚNICA COPIA QUE QUEDA EN LA APP (11 de septiembre de 2026).
// Hasta hoy `App.jsx` tenía LA SUYA, con la tabla WALTHAM copiada «letra por
// letra» de la que había en `der.py` -- y era la que de verdad corría, porque
// App.jsx calcula `pesoAdultoEsperado` antes de llamar a `calcularDER` y se lo
// pasa ya hecho. O sea que aplicar la Tabla VII-8a solo aquí no habría cambiado
// NADA en la app: la habría dejado como código que parece aplicado y no lo
// está, que es la familia de fallos de siempre. Se vio probándolo dentro de la
// app con la cuenta de prueba, no leyendo el código.
//
// Fuera del rango de FEDIAF (8 semanas a 1 año) devuelve el peso de la raza si
// lo hay, y si no null: no se inventa nada.
export function pesoAdultoDesdeCurvaFediaf(pesoActualKg, meses,
                                           pesoMedioRaza = null,
                                           pesoMinRaza = null, pesoMaxRaza = null) {
  const p = Number(pesoActualKg);
  if (!p || p <= 0 || !meses) return pesoMedioRaza ?? null;

  // ⚠️ NO SE ITERA, y esa es la corrección de la noche del 11 de septiembre.
  // La Tabla VII-8a es una función A TROZOS, así que un bucle que parta de una
  // semilla puede tener MÁS DE UN PUNTO FIJO. Medido probándolo dentro de la
  // app con la cuenta de prueba: un mestizo de 30 kg a los 6 meses converge en
  // 52,6 kg partiendo del doble de su peso y en 46,6 partiendo de la media de
  // su tamaño. Los dos son autoconsistentes, así que `der.py` y la app daban
  // pesos adultos distintos para el mismo perro -- 209 kcal/día -- y cada lado
  // era coherente consigo mismo, que es por lo que ninguna prueba lo veía.
  //
  // Ahora se recorren las cinco bandas en orden y se coge la primera cuyo
  // resultado cae DENTRO de su propia banda: determinista, sin semilla, y es
  // la solución más pequeña, que es el lado prudente (menos peso adulto es más
  // fracción recorrida, y en Klein eso son menos kcal).
  let estimado = null, suelo = 0, candidato = null;
  for (const [tope] of CURVA_FEDIAF_VII_8A) {
    const pct = pctPesoAdultoFediaf(meses, tope);
    if (pct === null || pct <= 0) return pesoMedioRaza ?? null;
    candidato = p / pct;
    if (candidato > suelo && candidato <= tope) { estimado = candidato; break; }
    suelo = tope;
  }
  // Ninguna banda autoconsistente (el cachorro ya pesa más de lo que su curva
  // predice): se usa la última, la de los gigantes, y el recorte de la raza la
  // acota si se sabe.
  if (estimado === null) estimado = candidato;
  // No salirse de lo que la raza puede pesar: la estimación es una estimación.
  if (pesoMinRaza) estimado = Math.max(estimado, pesoMinRaza);
  if (pesoMaxRaza) estimado = Math.min(estimado, pesoMaxRaza);
  return Math.round(estimado * 10) / 10;
}

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
    // Si no viene el peso adulto (el cachorro MESTIZO), se despeja con la
    // Tabla VII-8a de FEDIAF y se usa la ecuación de Klein como todos los
    // demás. Los dos escalones de SACN5 quedan solo para lo que FEDIAF no
    // cubre: <8 semanas y >1 año. Ver `CURVA_FEDIAF_VII_8A`.
    let pAdulto = pesoAdultoKg;
    if (!(pAdulto > 0) && mesesEdad != null) {
      pAdulto = pesoAdultoDesdeCurvaFediaf(pesoActualKg, mesesEdad);
    }
    if (pAdulto > 0) {
      const frac = Math.min(pesoActualKg / pAdulto, 1.0);
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
    // ⚠️ EL GRUPO «joven» EXISTÍA Y NO SE USABA NUNCA (9 septiembre 2026).
    // `AJUSTE_EDAD` tenía una entrada `joven` y aquí solo se pasaba senior o
    // adulto: código muerto que PARECÍA aplicado. FEDIAF VII-6 da 130 kcal/kg^0,75
    // al perro de 1-2 años contra 110 al de 3-7, y la app sabe la fecha de
    // nacimiento. `mesesEdad` viene de `calcularEdad`; si no llega, se trata como
    // adulto, que es el lado prudente (menos kcal).
    const grupoEdad = etapa === "senior"
      ? "senior"
      : (Number.isFinite(mesesEdad) && mesesEdad < ADULTO_JOVEN_HASTA_MESES ? "joven" : "adulto");
    coef += AJUSTE_EDAD[grupoEdad];
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
