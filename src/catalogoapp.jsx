// ─── LA COPIA DEL CATÁLOGO QUE TIENE LA APP ────────────────────────────────
//
// ⚠️ ESTO ES UNA SEGUNDA LISTA. La de verdad es `alimentos_v3_final.json`,
// en el repo del motor. Esta existe porque la app necesita saber de qué
// categoría es cada alimento para darle la instrucción de preparación
// correcta, y esa relación no viaja en la respuesta de la API.
//
// Que las dos coincidan NO es automático: lo vigila
// `tests/catalogo-app-y-motor.spec.js`, que necesita los dos repos como
// hermanos. El 21 de agosto se añadieron tres alimentos al backend y esta
// lista no se enteró: un HÍGADO salía como "Extra" y se le daba la
// instrucción de los aceites. Sin ningún error por medio.
//
// Si tocas esta lista, esa prueba es la que te dice si te has dejado algo.

import { Beef, Fish, HeartPulse, Pill, Salad } from "lucide-react";

export function especieDe(nombre) {
  if (nombre.includes(" de ")) {
    const resto = nombre.split(" de ")[1];
    const p = resto.split(" ")[0];
    return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
  }
  return nombre.split(" ")[0];
}

// Qué bandera de "sí/no" acompaña a cada lista. En la ficha de una sola
// pantalla las listas SON la respuesta -- una lista vacía es "no tiene" --,
// pero el resto de la app lee estas banderas, así que se escriben solas para
// que la ficha no pueda decir dos cosas a la vez.
// Las seis categorías de comida del catálogo, tal como las nombra el motor.
// Si un nombre no coincide EXACTAMENTE, la exclusión no hace nada y el menú
// sale igual -- sin error y sin aviso. Por eso están escritas una sola vez.
export const CATEGORIAS_QUE_PUEDE_EXCLUIR = [
  { key: "Carne muscular", label: "Carne muscular" },
  { key: "Hueso carnoso", label: "Hueso carnoso" },
  { key: "Pescados y mariscos", label: "Pescados y mariscos" },
  { key: "Vísceras", label: "Vísceras" },
  { key: "Hígado", label: "Hígado" },
  { key: "Verduras y frutas", label: "Verduras y frutas" },
];

export const CATEGORIAS_ALIMENTO = {
  "Carne muscular": {
    // ⚠️ CORREGIDO (5 agosto, madrugada) — segunda pasada: lengua y
    // pulmón TAMPOCO segregan, así que también van con la carne
    // muscular, no con las vísceras -- mismo motivo que la molleja y
    // el corazón. Vísceras se queda solo con riñón: no hay datos de
    // bazo ni páncreas para ampliarla.
    // ⚠️ CORREGIDO (5 agosto, madrugada): "Molleja de pollo", "Molleja
    // de pavo" y "Corazón de conejo" estaban en Vísceras -- corregido
    // a Carne muscular, igual que ya estaba el resto de corazones. En
    // alimentación cruda, lo que separa víscera de carne no es "es
    // tejido muscular o es un órgano", es si SEGREGA algo o no: ni el
    // corazón ni la molleja segregan, así que van con la carne.
    "Conejo": ["Conejo", "Corazón de conejo"],
    "Cordero": ["Corazón de cordero", "Lengua de cordero"],
    "Gallina": ["Gallina (carne sin hueso)"],
    "Pato": ["Pato (carne sin hueso)"],
    "Pavo": ["Corazón de pavo", "Molleja de pavo", "Pavo", "Pavo muslo con piel", "Pavo pechuga con piel", "Pavo pechuga sin piel"],
    "Pollo": ["Corazón de pollo", "Molleja de pollo", "Pollo ala con piel (sin hueso)", "Pollo con piel (sin hueso)", "Pollo muslo con piel", "Pollo muslo sin piel", "Pollo pechuga con piel", "Pollo pechuga sin piel"],
    "Ternera": ["Lomo de ternera con grasa", "Lengua de ternera", "Ternera con grasa", "Ternera solomillo sin grasa"],
    "Buey": ["Lengua de buey"],
    "Vaca": ["Corazón de vaca"],
  },
  "Pescados y mariscos": {
    // ⚠️ CORREGIDO (5 agosto, noche): Calamar/Gamba/Langostino(s)/
    // Mejillón/Pulpo/Sepia necesitan cocinarse siempre, así que el
    // AUTOMÁTICO no los usa nunca (se filtran de ACCESIBLES) -- pero
    // si el usuario los quiere elegir él mismo aquí, sabiendo que hay
    // que cocinarlos, puede.
    "Atún": ["Atún"],
    "Bacaladilla": ["Bacaladilla"],
    "Bacalao": ["Bacalao"],
    "Besugo": ["Besugo"],
    "Boquerón": ["Boquerón"],
    "Caballa": ["Caballa"],
    "Calamar": ["Calamar"],
    "Dorada": ["Dorada"],
    "Gamba": ["Gamba roja"],
    "Langostino": ["Langostino"],
    "Lenguado": ["Lenguado"],
    "Lubina": ["Lubina"],
    "Merluza": ["Merluza"],
    "Perca": ["Perca"],
    "Pescadilla": ["Pescadilla"],
    "Pulpo": ["Pulpo"],
    "Salmón": ["Salmón"],
    "Sardina": ["Sardina"],
    "Sepia": ["Sepia"],
    "Trucha": ["Trucha"],
  },
  "Hueso carnoso": {
    // ⚠️ CORREGIDO (5 agosto, noche) — tercera pasada: la usuaria ya
    // había pasado un estudio real (Köber et al. 2017, ESVCN) con datos
    // de laboratorio de Ca/P para varios huesos, incluido "Pecho de
    // ternera con hueso" -- se había quitado por error pensando que no
    // existía ningún dato, sin saber que ese estudio ya lo respaldaba.
    // Reconstruido con esos datos reales más micronutrientes estimados.
    "Conejo": ["Carcasa de conejo", "Espinazo de conejo"],
    "Cordero": ["Costillas de cordero"],
    "Pato": ["Carcasa de pato", "Cuello de pato"],
    "Pavo": ["Cuello de pavo"],
    "Pollo": ["Carcasa de pollo"],
    "Ternera": ["Pecho de ternera con hueso", "Cuello de ternera"],
    // ⚠️ QUITADA "Laringe de vacuno" DE AQUÍ (8 septiembre), y esto llevaba
    // roto en producción desde el 7. En el motor dejó de ser "Hueso carnoso"
    // ese día y pasó a "Extras": es cartílago, tiene 66 mg de calcio cuando
    // un hueso carnoso de verdad trae 1.250-1.810, y además está bloqueada
    // por tejido tiroideo, así que NUNCA puede aportar hueso a un menú.
    // Ofrecerla aquí es el fallo de la regla 5 del CLAUDE.md en estado puro:
    // elegirla no hacía nada y nadie se enteraba, porque el menú salía verde
    // igual. Baja a "Extras", que es donde vive ahora.
    // (Vaca se queda sin hueso carnoso propio, que es la verdad: los que hay
    // son de ternera -- pecho y cuello.)
  },
  "Vísceras": {
    // ⚠️ CORREGIDO (5 agosto, madrugada): el pulmón vuelve aquí -- a
    // diferencia de lengua/molleja/corazón (donde todas las fuentes
    // coinciden), es un caso genuinamente debatido en alimentación
    // cruda, se deja por prudencia.
    // ⚠️ AMPLIADO (5 agosto, madrugada) — investigación con múltiples
    // fuentes cruzadas (USDA principalmente): "Bazo de ternera" y
    // "Páncreas de ternera" pasaron a "de vaca" -- sus datos
    // originales eran de animal adulto, no de ternera lechal (el
    // hierro los delataba: 44.5mg es propio de vaca, no de ternera
    // joven). Se añadió una entrada NUEVA y genuina de ternera joven
    // aparte. Confirmado que NO hay datos fiables de bazo/páncreas de
    // pollo, pavo ni conejo -- no se han inventado esas especies.
    // Timo y cerebro dan variedad adicional con datos USDA reales.
    "Cordero": ["Pulmón de cordero", "Riñón de cordero", "Bazo de cordero"],
    "Ternera": ["Pulmón de ternera", "Riñón de ternera", "Timo de ternera", "Cerebro de ternera"],
    // ⚠️ AMPLIADO (8 septiembre) — LA MISMA HISTORIA DE AGOSTO, OTRA VEZ.
    // El comentario de arriba cuenta que "Bazo de ternera" y "Páncreas de
    // ternera" pasaron a "de vaca" porque sus datos eran de animal adulto.
    // Al timo, al pulmón y al cerebro se les pasó: seguían llamándose "de
    // ternera" con datos de VACA (coinciden celda a celda con los registros
    // de vaca de USDA, no con los de ternera). En el motor se han partido en
    // dos, cada especie con SUS datos, así que aquí entran las tres de vaca.
    // Y la diferencia no es un decimal: el timo de vaca tiene 236 kcal y
    // 20,35 g de grasa, el de ternera 101 y 3,07.
    "Vaca": ["Bazo de vaca", "Páncreas de vaca", "Timo de vaca",
             "Pulmón de vaca", "Cerebro de vaca"],
    // ⚠️ ELIMINADO (5 agosto, madrugada) — CASO REAL GRAVE, pedido
    // expreso: "Cerdo": ["Bazo de cerdo", "Páncreas de cerdo"] quitado
    // por completo -- riesgo real de enfermedad de Aujeszky
    // (pseudorrabia), prácticamente siempre mortal en perros y sin
    // cura. Sobrevive a la congelación, así que congelar no protege;
    // solo cocinar por encima de 60-71°C destruye el virus, y esta
    // app trabaja con comida cruda. Ver motor/accesibles.py para el
    // razonamiento completo.
  },
  "Hígado": {
    "Conejo": ["Hígado de conejo"],
    "Cordero": ["Hígado de cordero"],
    "Pato": ["Hígado de pato"],
    "Pavo": ["Hígado de pavo"],
    "Pollo": ["Hígado de pollo"],
    "Vaca": ["Hígado de vaca"],
  },
  "Verduras y frutas": {
    "Acelga": ["Acelga"],
    "Albahaca": ["Albahaca"],
    "Albaricoque": ["Albaricoque"],
    "Alcachofa": ["Alcachofa"],
    "Apio": ["Apio"],
    "Arándano": ["Arándano"],
    "Berenjena": ["Berenjena"],
    "Boniato": ["Boniato"],
    "Bruselas": ["Coles de Bruselas"],
    "Brócoli": ["Brócoli"],
    "Calabacín": ["Calabacín"],
    "Calabaza": ["Calabaza"],
    "Canónigos": ["Canónigos"],
    "Cardo": ["Cardo"],
    "Champiñón": ["Champiñón"],
    "Coco": ["Coco fresco"],
    "Col": ["Col lombarda", "Col rizada"],
    "Coliflor": ["Coliflor"],
    "Dátil": ["Dátil"],
    "Endibia": ["Endibia"],
    "Espinaca": ["Espinaca"],
    "Espárrago": ["Espárrago verde"],
    "Frambuesa": ["Frambuesa"],
    "Fresa": ["Fresa"],
    "Grelo": ["Grelo"],
    "Judía": ["Judía verde"],
    "Lechuga": ["Lechuga"],
    "Mandarina": ["Mandarina"],
    "Mango": ["Mango"],
    "Manzana": ["Manzana"],
    "Melón": ["Melón"],
    "Nabo": ["Nabo pelado"],
    "Naranja": ["Naranja"],
    "Pepino": ["Pepino"],
    "Pera": ["Pera"],
    "Pimiento": ["Pimiento rojo"],
    "Piña": ["Piña"],
    "Plátano": ["Plátano"],
    "Repollo": ["Repollo"],
    "Rucula": ["Rucula"],
    "Rábano": ["Rábano"],
    "Sandía": ["Sandía"],
    "Tomate": ["Tomate (puré)"],
    "Zanahoria": ["Zanahoria"],
  },
  "Extras": {
    "Huevo": ["Huevo clara", "Huevo de codorniz", "Huevo de gallina entero", "Huevo de pato", "Huevo de pato entero", "Huevo yema"],
    "Aceite": ["Aceite de cacahuete", "Aceite de coco", "Aceite de girasol", "Aceite de hígado de bacalao", "Aceite de linaza", "Aceite de oliva", "Aceite de oliva virgen extra", "Aceite de sésamo"],
    "Yogur": ["Yogur griego"],
    "Grasa": ["Grasa de pollo", "Manteca"],
    "Semillas": ["Pipa de calabaza", "Pipa de girasol", "Semilla de lino", "Semilla de sésamo"],
    "Sal": ["Sal común (cloruro sódico)"],
    // Bajó de "Hueso carnoso" el 8 de septiembre: en el motor es "Extras"
    // desde el 7 (es cartílago, no hueso, y está bloqueada por tejido
    // tiroideo). Ver el comentario en Hueso carnoso.
    "Cartílago": ["Laringe de vacuno"],
  },
  // ⚠️ CORREGIDO (5 agosto): el backend tiene 6 multivitamínicos y un
  // yoduro potásico que el frontend no conocía -- por eso "V-INTEGRA
  // Perro Adulto" (y cualquiera de los otros 3 que faltaban) caía en
  // "Extras" al no encontrarse aquí, aunque el motor SÍ lo usa de verdad.
  // ⚠️ QUITADOS (28 agosto) — SIETE ALIMENTOS QUE EL MOTOR YA NO TIENE.
  // El backend sacó del catálogo los testículos de cordero (aparecían en 2
  // de 24 menús automáticos, uno con 90 g), cinco suplementos cuyo dato no
  // se sostenía (dos harinas de hueso con un Ca:P imposible, dos aceites de
  // salmón con el omega-3 total metido en el ALA, y un kelp) y la borraja.
  // Aquí seguían ofreciéndose: al elegirlos, el menú los habría ignorado en
  // silencio. Lo pilló `tests/catalogo-app-y-motor.spec.js`, que compara
  // esta lista con el catálogo del motor -- pero solo corre si los dos
  // repos están juntos, así que llevaba días en rojo sin que se viera.
  "Suplementos comerciales": {
    "Calcio": ["Cáscara de huevo PAWS & PATCH", "Cáscara de huevo casera (en polvo)"],
    "Fibra": ["NaturGreen Psyllium Bio"],
    "Hierro": ["AniForte Beef Blood Powder"],
    "Multivitamínico": ["Homemadekun (multivitamínico completo)", "NEKTON Dog Easy-BARF (multivitamínico)", "napfcheck Novomineral proLEBER", "astoral MultiVital BARF", "V-INTEGRA Perro Adulto", "V-INTEGRA Cachorro", "V-INTEGRA Senior", "V-INTEGRA Epato", "V-INTEGRA Renal", "Nutratop Vitamínico-Mineral 7:1"],
    "Omega-3": ["Aceite de Salmón Natural Greatness", "AniForte Aceite de Salmón", "Oleum Canis Aceite de Salmón"],
    "Levadura de cerveza": ["GRAU Levadura de cerveza", "PAWS & PATCH Levadura de cerveza"],
    "Algas (Kelp)": ["AniForte Seaweed Meal"],
    "Yodo": ["Yoduro potásico (comprimidos 200 µg)"],
  },
};

export const CATEGORIAS_ICONOS = [
  { nombre: "Carne muscular", Icono: Beef },
  { nombre: "Pescados y mariscos", Icono: Fish },
  { nombre: "Hueso carnoso", Icono: Beef },
  { nombre: "Vísceras", Icono: HeartPulse },
  { nombre: "Hígado", Icono: HeartPulse },
  { nombre: "Verduras y frutas", Icono: Salad },
  { nombre: "Extras", Icono: Pill },
  { nombre: "Suplementos comerciales", Icono: Pill },
];

export function categoriaDeAlimento(nombreAlimento) {
  // ⚠️ SIMPLIFICADO (5 agosto, madrugada): el respaldo a POOL_CANDIDATOS
  // ya no hace falta -- se quitó del todo, CATEGORIAS_ALIMENTO ya cubre
  // el catálogo real completo, verificado alimento por alimento.
  for (const [categoria, especies] of Object.entries(CATEGORIAS_ALIMENTO)) {
    for (const alimentos of Object.values(especies)) {
      if (alimentos.includes(nombreAlimento)) return categoria;
    }
  }
  return "Extras";
}
