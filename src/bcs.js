// ─── LA CONDICIÓN CORPORAL, EN LOS DOS IDIOMAS ───────────────────────────────
//
// Lógica pura, sin React y sin red, como `rol.js`, `modo.js` y `der.js`.
//
// La misma cosa se pregunta de dos maneras según quién mire la pantalla:
//
//   · Al dueño, con cinco escalones y nombres cariñosos ("Rellenito").
//     Nadie que quiera a su perro va a decir en frío que su perro es un 7.
//   · Al veterinario, con el BCS de 9 puntos, que es la escala que usa y la
//     que aparece en la historia clínica. Pedido expreso: "para un
//     veterinario es mejor poner el BCS... no tiene que ser rollo te lo hago
//     divertido".
//
// Pero por dentro es UN SOLO NÚMERO y UNA SOLA FÓRMULA. Los cinco escalones
// del dueño son cinco valores del BCS (2, 4, 5, 7 y 9) y nada más: si cada
// pantalla calculara su peso objetivo por su cuenta, el mismo perro tendría
// dos objetivos y dos DER según quién abriera la ficha.
//
// ⚠️ POR QUÉ EL BCS SE GUARDA APARTE Y NO BASTA `condicion_idx`: son cinco
// escalones, así que un BCS 6 -- "por encima del ideal", el caso más común
// en consulta -- solo se puede guardar redondeándolo a 5 o a 7. Redondear la
// condición corporal cambia el peso objetivo un 10 %, y de ahí salen las
// kcal. En una ficha clínica eso no vale.

import { alLlegarVocabulario } from "./vocabulario.js";

export let BCS_NEUTRO = 5;          // el ideal: ni sobra ni falta
export const BCS_MINIMO = 1;
export const BCS_MAXIMO = 9;
// Cada punto por encima del ideal es aproximadamente un 10 % de peso de
// más. Es el mismo número que usa el motor en `verificar.peso_objetivo_
// desde_bcs`, y el mismo que ya usaba la app para los cinco escalones.
export let PCT_POR_PUNTO_BCS = 0.10;
// ⚠️ Y EL 9 VA APARTE, PORQUE LA RECTA SE QUEDA CORTA JUSTO AHÍ (9 de
// septiembre de 2026, y es la tercera copia de esta regla: las otras dos son
// `verificar.peso_objetivo_desde_bcs` y `der.peso_ideal_desde_condicion`, en la
// API).
//
// El Anexo 7.1 de FEDIAF trae la Tabla VII-2 entera, con la columna «% BW below
// or above BCS 5» para el perro. Puesta al lado del 10 % por punto:
//
//     BCS 1  -≥40 %      la recta: -40      ✓ (extremo bajo del rango)
//     BCS 2  -30 a 40 %             -30      ✓
//     BCS 3  -20 a 30 %             -20      ✓
//     BCS 4  -10 a 15 %             -10      ✓
//     BCS 5    0 %                    0      ✓
//     BCS 6  +10 a 15 %             +10      ✓
//     BCS 7  +20 a 30 %             +20      ✓
//     BCS 8  +30 a 45 %             +30      ✓
//     BCS 9  >45 %                  +40      ✗  ← el único que no cuadra
//
// O sea que la recta ES el extremo bajo de cada rango de FEDIAF -- el más
// conservador, el que menos exceso estima -- en ocho puntos de nueve. En el
// noveno la escala deja de ser lineal: FEDIAF dice MÁS del 45 % y la recta da
// 40. Se pasa a 45, que es la frontera de «>45 %» y sigue siendo el extremo
// bajo de lo que dice la fuente.
//
// ⚠️ ESTO CAMBIA EL PESO OBJETIVO DE FICHAS YA GUARDADAS, y a propósito: el
// escalón «Obeso» del dueño ES un BCS 9, así que un perro de 30 kg pasa de
// 21,43 a 20,69 kg de objetivo. Se acepta porque el número de antes no tenía
// fuente y este la tiene, y porque va al lado seguro (menos kcal para un perro
// obeso). Lo mismo se hizo el mismo día en las dos copias de la API.
export let EXCESO_BCS_9 = 0.45;   // FEDIAF 2025, Anexo 7.1, Tabla VII-2, «9. Grossly Obese»
export let BCS_ESCALA_SATURADA = 9;
// Un perro por debajo del ideal no se "sube" sin freno: el tope existe
// desde antes del BCS y se conserva tal cual para no cambiar en silencio el
// objetivo de las fichas que ya están guardadas.
export let TOPE_SUBIDA = 1.20;

// ⚠️ EL IDEAL DE FEDIAF ES UNA BANDA, 4 A 5, Y NO UN PUNTO (11 de septiembre
//     de 2026, releyendo FEDIAF entera).
//
// Hasta hoy el 5 era el único ideal, así que a un perro en BCS 4 se le SUBÍA el
// peso objetivo un 11 % -- y con él las kcal. FEDIAF dice dos veces lo
// contrario, en dos sitios distintos de la guía:
//
//   §7.1.3:   «The ideal BCS should therefore be between 4/9 and 5/9.»
//   §7.2.4.1: «it is recommended that dogs should be fed to maintain a body
//              condition score (BCS) between 4 and 5 on the 9-point BCS.»
//
// Y no es una frase suelta: las dos se apoyan en Kealy RD et al. (2002), el
// estudio de CATORCE años con labradores en el que la restricción alargó la
// vida mediana y retrasó la enfermedad crónica, con los perros restringidos
// «had a BCS of 4/9 to 5/9». Engordar a un perro que está en 4 va contra lo
// único que hay medido a catorce años.
//
// QUÉ CAMBIA:
//   · BCS 4 y 5  -> no se corrige nada. Ya está en la banda.
//   · BCS 6 a 9  -> igual que antes: el objetivo es el BCS 5.
//   · BCS 1 a 3  -> el objetivo pasa a ser el BCS **4**, no el 5: es el borde
//                   de la banda que le queda más cerca, y es el lado prudente
//                   (§7.2.3.2: «it may be better to start from a lower
//                   calculated MER and add as needed»).
//
// ⚠️ LO QUE **NO** CAMBIA es la Tabla VII-2: sus desvíos siguen midiéndose
// contra el BCS 5, que es lo que dice su propia cabecera. El 5 sigue siendo el
// cero de la regla; lo que deja de ser es el único destino.
//
// ⚠️ Y ESTO CAMBIA EL PESO OBJETIVO DE FICHAS YA GUARDADAS, a propósito y al
// lado seguro (menos kcal): un perro de 20 kg en BCS 3 pasa de 24,0 a 22,5 kg
// de objetivo, y uno en BCS 4 deja de tener corrección. Lo mismo se hizo el
// mismo día en las dos copias de la API (`verificar.BCS_IDEAL_MIN` y `der.py`).
export let BCS_IDEAL_MIN = 4;

// ─── Y LAS SEIS LAS MANDA EL MOTOR ───────────────────────────────────────────
//
// ⚠️ AÑADIDO EL 12 DE SEPTIEMBRE DE 2026, y no es orden: es un fallo que ya
// había pasado. Elena:
//
//     «te dije que la app no puede tener datos sueltos, todo le tiene que
//      llegar del motor»
//
// Las seis de arriba estaban escritas aquí y escritas en el motor, y las dos
// copias YA se habían separado: la prueba de punta a punta esperaba 21,43 kg
// para un perro de 30 kg con BCS 9 —la recta del 10 % por punto, 30/1,40— y el
// motor devuelve 20,69, que es el «>45 %» de la Tabla VII-2 de FEDIAF. El motor
// tenía razón; lo que se había quedado atrás era la copia. No se vio en tres
// días porque la única prueba que mira la costura app↔motor estaba en rojo por
// otra cosa (el CORS).
//
// Es el mismo fallo que las categorías, los niveles de actividad y los 46
// nutrientes del formulador. La cadena es FUENTE manda → MOTOR la implementa →
// APP la ofrece, y aquí faltaba el último tramo.
//
// LOS VALORES DE ARRIBA SE QUEDAN, pero como RESPALDO y no como verdad: la API
// de Render duerme a los 15 minutos, y quedarse sin poder estimar un peso
// porque el servidor tarda en despertar sería peor. En cuanto llega
// `/vocabulario`, mandan sus cifras. Que el respaldo no esté TAPANDO la
// petición lo comprueba `tests/bcs-del-motor.spec.js` sembrando valores
// inventados: con las cifras de verdad, leerlas del motor y pintarlas de
// memoria se ven exactamente igual.
alLlegarVocabulario((vocabulario) => {
  const cc = vocabulario?.condicion_corporal;
  if (!cc) return;
  const num = (x) => (typeof x === "number" && Number.isFinite(x) ? x : null);
  if (num(cc.ideal) !== null) BCS_NEUTRO = cc.ideal;
  if (num(cc.ideal_min) !== null) BCS_IDEAL_MIN = cc.ideal_min;
  if (num(cc.pct_por_punto) !== null) PCT_POR_PUNTO_BCS = cc.pct_por_punto;
  if (num(cc.escala_saturada) !== null) BCS_ESCALA_SATURADA = cc.escala_saturada;
  if (num(cc.exceso_en_escala_saturada) !== null) EXCESO_BCS_9 = cc.exceso_en_escala_saturada;
  if (num(cc.tope_correccion_al_alza) !== null) TOPE_SUBIDA = cc.tope_correccion_al_alza;
});

// ⚠️ EL OTRO EXTREMO DE LA ESCALA, Y ES DE FEDIAF (9 de septiembre de 2026,
//     leyendo entera la §7.1.3, que estaba sin leer).
//
// El BCS 9 ya llevaba su salvedad: la escala se satura y el número es una cota
// inferior. La salvedad del extremo BAJO no estaba en ningún sitio, y FEDIAF la
// escribe con todas las letras en §7.1.3:
//
//   «scores at the lower end of the BCS are CONFOUNDED BY MUSCLE ATROPHY
//    (Baez J et al. 2007, Michel KE et al. 2011). Recently a 4-scale MUSCLE MASS
//    SCORING SYSTEM has been developed for evaluating muscle mass in critically
//    ill patients (Table VII-3).»
//
// Y añade el motivo de por qué esa parte de la escala está peor validada:
// «scores at the lower end of the scale being either absent or underrepresented»
// en los estudios que la construyeron, porque casi todos se hicieron para medir
// OBESIDAD.
//
// LO QUE ESTO CAMBIA AQUÍ, y por qué no es un cambio de fórmula: el peso objetivo
// sale del BCS suponiendo que lo que falta o sobra es GRASA. En un perro delgado
// puede no serlo -- puede ser músculo perdido --, y entonces el objetivo que
// calculamos apunta a un peso que no se recupera comiendo más. La fórmula no se
// toca porque FEDIAF no da otra: lo que da es una segunda escala (la Tabla VII-3,
// de 0 a 3, palpando espina, escápulas, cráneo y alas del ilion) que se mide
// PALPANDO y que esta app no pregunta. Así que lo honesto es decirlo, no
// corregirlo por nuestra cuenta.
export const BCS_CONFUNDIDO_POR_ATROFIA_HASTA = 3;
export const AVISO_ATROFIA_MUSCULAR =
  "en la parte baja de la escala el BCS se confunde con la pérdida de músculo, " +
  "así que este objetivo puede quedarse corto: si está delgado por haber perdido " +
  "masa muscular y no grasa, comer más no lo recupera solo (FEDIAF, Tabla VII-3)";

// Devuelve la salvedad que toca para un BCS, o null si no hay ninguna. Existe
// como función y no como texto suelto para que los dos sitios que pintan el peso
// objetivo digan LO MISMO: cuando esto era una cadena escrita a mano en cada
// pantalla, la de la ficha y la del alta acabaron distintas.
export function salvedadDelBcs(bcs) {
  // ⚠️ `bcs == null` ANTES de convertir, y por la MISMA razón que en
  // `pesoIdealDesdeBcs`: `Number(null)` es 0, que es finito y además está por
  // debajo del umbral de atrofia, así que "no hay BCS" salía como "BCS 0" y un
  // perro sin condición apuntada recibía el aviso de pérdida de músculo. Lo cazó
  // la prueba nada más escribirla -- que es la segunda vez que esta trampa
  // muerde en este mismo fichero.
  if (bcs === null || bcs === undefined || bcs === "") return null;
  const b = Number(bcs);
  if (!Number.isFinite(b)) return null;
  if (b >= BCS_ESCALA_SATURADA) return "cota inferior: la escala se satura en 9";
  if (b <= BCS_CONFUNDIDO_POR_ATROFIA_HASTA) return AVISO_ATROFIA_MUSCULAR;
  return null;
}

// Los descriptores son los de la escala de 9 puntos (WSAVA/Laflamme), en
// palabras de consulta: lo que se palpa, lo que se ve desde arriba y lo que
// se ve de perfil. Sin adjetivos cariñosos: esta pantalla la lee un
// profesional.
export const ESCALA_BCS = [
  { n: 1, titulo: "Caquéctico",
    detalle: "Costillas, lumbares y pelvis visibles a distancia. Sin grasa palpable. Pérdida evidente de masa muscular." },
  { n: 2, titulo: "Muy delgado",
    detalle: "Costillas visibles sin grasa palpable. Prominencias óseas marcadas. Pérdida leve de masa muscular." },
  { n: 3, titulo: "Delgado",
    detalle: "Costillas palpables y visibles sin grasa que las cubra. Lumbares visibles. Cintura muy marcada." },
  // ⚠️ El 4 es IDEAL también: FEDIAF §7.1.3 y §7.2.4.1. Aquí ponía «Por debajo
  // del ideal», que es lo que decía la Tabla VII-2 midiendo contra el BCS 5 --
  // y eso sigue siendo verdad como desvío, pero no como juicio.
  { n: 4, titulo: "Ideal (extremo delgado)",
    detalle: "Costillas palpables con mínima grasa. Cintura evidente desde arriba y retracción abdominal marcada. Dentro de la banda ideal de FEDIAF, que es 4 a 5." },
  { n: 5, titulo: "Ideal",
    detalle: "Costillas palpables sin exceso de grasa. Cintura visible desde arriba. Abdomen retraído de perfil." },
  { n: 6, titulo: "Por encima del ideal",
    detalle: "Costillas palpables con ligero exceso de grasa. Cintura apreciable pero no marcada." },
  { n: 7, titulo: "Sobrepeso",
    detalle: "Costillas difíciles de palpar, cubiertas de grasa. Depósitos en lumbares y base de la cola. Cintura ausente o apenas visible." },
  { n: 8, titulo: "Obeso",
    detalle: "Costillas no palpables salvo con presión firme. Depósitos marcados en lumbares y base de la cola. Distensión abdominal." },
  { n: 9, titulo: "Obeso mórbido",
    detalle: "Depósitos masivos en tórax, columna y base de la cola. Sin cintura. Distensión abdominal evidente." },
];

// Los cinco escalones del dueño, en BCS.
//
// ⚠️ CORREGIDO (9 de septiembre de 2026) — LA CORRESPONDENCIA LA PUBLICA FEDIAF
// Y NO ERA LA NUESTRA.
//
// Aquí ponía `{0:2, 1:4, 2:5, 3:7, 4:9}`, que era criterio nuestro. Al leer
// entera la sección 7.1 de FEDIAF resulta que las Tablas VII-1 y VII-2 traen
// una **columna 2 de 5 puntos** al lado de la de 9, y su correspondencia es:
//
//     5 puntos    1     2     3     4     5
//     9 puntos    1     3     5     7     9
//
// En los tres escalones de arriba coincidíamos. En los dos de perro delgado
// éramos MENOS severas: nuestro escalón 0 iba a BCS 2 (−30 %) donde FEDIAF pone
// BCS 1 (−≥40 %), y el 1 iba a BCS 4 (−10 %) donde pone BCS 3 (−20 %). O sea que
// a un perro delgado le calculábamos un peso objetivo más bajo del que le toca,
// y de ahí salen menos kcal.
//
// Y no es una interpretación: es la columna que la propia guía imprime al lado
// de sus descriptores, adaptada de Laflamme 1995/1997. Lo vigila el BLOQUE 63.
export const BCS_DESDE_CONDICION = { 0: 1, 1: 3, 2: 5, 3: 7, 4: 9 };

// Y de vuelta: al BCS que ponga el veterinario le corresponde un escalón,
// para que la ficha siga entendiéndose desde el lado del dueño (una ficha
// clínica y una ficha de casa son la misma fila de la base). Se redondea al
// escalón más cercano A PROPÓSITO y sin perder nada: el BCS exacto se
// guarda aparte, y es el que manda para calcular.
export function condicionDesdeBcs(bcs) {
  const b = Number(bcs);
  if (!Number.isFinite(b)) return null;
  // Los cortes van con la correspondencia de FEDIAF (1-3-5-7-9): cada BCS cae
  // en el escalón cuyo valor tiene más cerca, y los empates (2, 4, 6, 8) van
  // al escalón MÁS SEVERO, que es el lado prudente en las dos direcciones --
  // un perro en 2 se trata como el 1 (más delgado de lo que dice), y uno en 6
  // como el 7 (más gordo).
  if (b <= 2) return 0;
  if (b <= 4) return 1;
  if (b === 5) return 2;
  if (b <= 7) return 3;
  return 4;
}

export function bcsDesdeCondicion(condicionIdx) {
  const v = BCS_DESDE_CONDICION[condicionIdx];
  return v === undefined ? null : v;
}

// EL PESO OBJETIVO, y es LA fórmula: la usan los dos idiomas.
//
// Se DIVIDE, no se resta: el exceso está medido sobre el peso ideal, no
// sobre el actual. Un perro de 30 kg con BCS 7 tiene un 20 % de más sobre su
// ideal, así que su ideal son 30/1,2 = 25, no 30 - 20 % = 24.
export function pesoIdealDesdeBcs(pesoActualKg, bcs) {
  const peso = Number(pesoActualKg);
  // ⚠️ `bcs == null` ANTES DE convertir, y no es purismo: `Number(null)` es
  // 0, que es un número perfectamente finito, así que "no hay BCS" pasaba
  // por "BCS 0" y devolvía un objetivo -- un 66 % por encima del peso de
  // hoy, topado en +20 %. Un perro sin condición apuntada habría salido
  // como si estuviera esquelético. Lo cazó la prueba de bcs.spec.js.
  if (bcs === null || bcs === undefined || bcs === "") return null;
  const b = Number(bcs);
  if (!peso || peso <= 0 || !Number.isFinite(b)) return null;
  // El 9 va aparte: FEDIAF dice «>45 %» y la recta se queda en 40. Y sigue
  // siendo una COTA INFERIOR -- Broome et al. (2023) ven perros que «exceed the
  // description for score 9» --, no un número exacto.
  // Dentro de la banda ideal de FEDIAF (4 a 5) no hay nada que corregir, y
  // corregirlo sería moverlo de donde la fuente lo quiere. Ver `BCS_IDEAL_MIN`.
  if (b >= BCS_IDEAL_MIN && b <= BCS_NEUTRO) return Math.round(peso * 100) / 100;
  const desvio = b >= BCS_ESCALA_SATURADA
    ? EXCESO_BCS_9
    : (b - BCS_NEUTRO) * PCT_POR_PUNTO_BCS;
  // Esto da el peso que tendría en BCS 5, que es contra lo que la Tabla VII-2
  // mide todos sus desvíos.
  const pesoEnBcs5 = peso / (1 + desvio);
  // Y de ahí al BORDE de la banda ideal que le queda más cerca: el 5 si está
  // por encima, el 4 si está por debajo.
  const bcsObjetivo = b < BCS_IDEAL_MIN ? BCS_IDEAL_MIN : BCS_NEUTRO;
  let ideal = pesoEnBcs5 * (1 + (bcsObjetivo - BCS_NEUTRO) * PCT_POR_PUNTO_BCS);
  if (ideal > peso * TOPE_SUBIDA) ideal = peso * TOPE_SUBIDA;
  return Math.round(ideal * 100) / 100;
}

// El BCS que vale para calcular: el que puso el veterinario si lo hay, y si
// no el que sale de los cinco escalones del dueño. Nunca los dos a la vez, y
// nunca uno inventado.
export function bcsVigente(perfil) {
  if (!perfil) return null;
  const b = Number(perfil.bcs);
  if (Number.isFinite(b) && b >= BCS_MINIMO && b <= BCS_MAXIMO) return b;
  return bcsDesdeCondicion(perfil.condicionIdx);
}
