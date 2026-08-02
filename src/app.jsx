import { useState, useMemo, useEffect } from "react";
import { AlertCircle, Award, Beef, Check, CheckCircle2, ChevronLeft, ChevronRight, ClipboardList, Dog, Fish, Flame, Footprints, Hand, Heart, HeartPulse, Info, Lock, Menu, Moon, Pencil, Pill, Plus, Refrigerator, Salad, Scissors, Search, SlidersHorizontal, Sparkles, TrendingUp, UtensilsCrossed, X, Zap } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const API_BASE = "https://canislab-api.onrender.com";

// Grupo amplio de candidatos "realistas" por categoria REAL (las mismas que
// usa Personalizar), para poder mezclar lo que el usuario elija con lo que
// se completa automaticamente. Los nutrientes que SOLO cubre un grupo
// concreto (Calcio=Hueso carnoso, Yodo=Pescados/Suplementos, VitaminaE=Extras)
// se marcan como esenciales -- si el usuario no puso nada ahi, se rellena solo.
const POOL_CANDIDATOS = {
  "Carne muscular": ["Ternera con grasa", "Ternera solomillo sin grasa", "Lomo de ternera con grasa", "Conejo", "Corazón de vaca", "Corazón de cordero", "Pollo pechuga con piel", "Pollo muslo con piel", "Corazón de pollo", "Pavo pechuga sin piel", "Pavo muslo con piel", "Pato (carne sin hueso)"],
  "Hueso carnoso": ["Costillas de ternera", "Pecho de ternera con hueso", "Costillas de cordero", "Cuello de cordero", "Espinazo de cordero", "Rabo de toro", "Carcasa de conejo", "Patas de conejo", "Cuello de pollo", "Carcasa de pollo", "Ala de pollo", "Cuello de pavo", "Ala de pavo", "Carcasa de pavo", "Cuello de pato"],
  "Vísceras": ["Riñón de ternera", "Pulmón de ternera", "Riñón de cordero", "Pulmón de cordero", "Lengua de ternera"],
  "Hígado": ["Hígado de vaca", "Hígado de conejo"],
  "Pescados y mariscos": ["Sardina", "Salmón", "Caballa", "Trucha", "Merluza", "Bacalao"],
  "Verduras y frutas": ["Calabaza", "Zanahoria", "Calabacín", "Judía verde", "Brócoli", "Espinaca", "Manzana", "Pera", "Plátano", "Arándano"],
  "Extras": ["Aceite de girasol", "Aceite de oliva", "Aceite de oliva virgen extra", "Huevo de gallina entero", "Semilla de lino"],
  // El multivitaminico va SIEMPRE: sin el, cubrir zinc/cobre/manganeso/yodo
  // con alimentos reales es practicamente imposible (probado: con multi 100%
  // de menus validos, sin multi 0%).
  "Suplementos comerciales": ["Homemadekun (multivitamínico completo)", "NEKTON Dog Easy-BARF (multivitamínico)", "Sonrisa de Diez Kelp", "AniForte Seaweed Meal", "GRAU Levadura de cerveza", "PAWS & PATCH Levadura de cerveza", "AniForte Aceite de Salmón", "Brit Care Aceite de Salmón", "Oleum Canis Aceite de Salmón", "Aceite de Salmón Natural Greatness", "GRAU Harina de Hueso", "LUPO NATURAL BARF Huesos en polvo", "Cáscara de huevo PAWS & PATCH", "Cáscara de huevo casera (en polvo)", "AniForte Beef Blood Powder", "NaturGreen Psyllium Bio"],
};
const CATEGORIAS_ESENCIALES = ["Hueso carnoso", "Pescados y mariscos", "Extras"]; // calcio, yodo, vitamina E

function elegirAleatorios(lista, n) {
  const copia = [...lista].sort(() => Math.random() - 0.5);
  return copia.slice(0, Math.min(n, copia.length));
}

// Misma logica que especies.py en el backend: "Cuello de pollo" -> Pollo,
// "Pavo pechuga con piel" -> Pavo
function especieDe(nombre) {
  if (nombre.includes(" de ")) {
    const resto = nombre.split(" de ")[1];
    const p = resto.split(" ")[0];
    return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
  }
  return nombre.split(" ")[0];
}

// Orden en el que se van rotando las proteinas base cuando el usuario pide
// varios menus. La gracia de pedir 3 menus es que el perro coma proteinas
// DISTINTAS, no tres variantes de lo mismo: antes cada menu se sorteaba por
// separado y casi siempre ganaba la misma carne.
const PROTEINAS_BASE = ["Ternera", "Pollo", "Conejo", "Cordero", "Pavo", "Pato"];

// Suplementos que hacen LO MISMO. Antes se metian siempre los dos unicos que
// habia en el pool y el usuario veia siempre el mismo producto, aunque en la
// base hay 16. Ahora se coge uno de cada grupo, rotando: dos marcas de
// multivitaminico cubren lo mismo, no hace falta usar siempre la misma.
const SUPLEMENTOS_EQUIVALENTES = {
  multivitaminico: ["Homemadekun (multivitamínico completo)", "NEKTON Dog Easy-BARF (multivitamínico)"],
  yodo: ["Sonrisa de Diez Kelp", "AniForte Seaweed Meal"],
};
// Nota: "Vaca" (corazon) y "Toro" (rabo) se consideran parte de Ternera a
// efectos de alergia, pero no se usan como especie base propia.

function especiesBaseDisponibles(especiesExcluidas) {
  const excl = new Set(Array.from(especiesExcluidas || []).map((e) => e.toLowerCase()));
  const disponibles = PROTEINAS_BASE.filter((e) => {
    if (excl.has(e.toLowerCase())) return false;
    // Solo hace falta que haya CARNE de esa especie. El hueso carnoso no
    // entra en la rotacion: al usuario le importa que cambie la carne, no
    // de que animal es el hueso.
    return POOL_CANDIDATOS["Carne muscular"].some((n) => especieDe(n) === e);
  });
  return disponibles.length > 0 ? disponibles : [null];
}

function generarCandidatosAleatorios(especieBase) {
  const elegidos = [];
  const esDe = (n) => !especieBase || especieDe(n) === especieBase;

  // --- CARNE: es lo que rota entre menus, y como mucho 3 cortes ---
  // Un menu con 4 carnes distintas es un lio de comprar y de preparar. Con
  // 2 de la especie base y 1 de apoyo hay variedad suficiente y el plato se
  // entiende de un vistazo.
  // MAXIMO 3 PROTEINAS EN TOTAL, y el pescado cuenta como una de ellas:
  // 2 carnes de la especie base + 1 pescado. Nada de carne "de apoyo" de otra
  // especie, que sumaba una cuarta proteina al plato.
  const carneBase = POOL_CANDIDATOS["Carne muscular"].filter(esDe);
  const carneResto = POOL_CANDIDATOS["Carne muscular"].filter((n) => !esDe(n));
  const deLaBase = elegirAleatorios(carneBase, 2);
  elegidos.push(...deLaBase);
  // si la especie base no tiene 2 cortes, se completa con otra para no
  // quedarse con una sola carne
  if (deLaBase.length < 2) elegidos.push(...elegirAleatorios(carneResto, 2 - deLaBase.length));

  // --- HUESO CARNOSO: NO entra en la rotacion de especie ---
  // Al usuario le importa que cambie la carne, no de que animal es el hueso.
  // Se eligen 2 libremente de los que haya disponibles.
  // "Pecho de ternera con hueso" es el mas rico en calcio (4200mg/100g) y se
  // garantiza siempre: sin el hay tiradas que se quedan sin solucion posible.
  elegidos.push("Pecho de ternera con hueso");
  elegidos.push(...elegirAleatorios(
    POOL_CANDIDATOS["Hueso carnoso"].filter((n) => n !== "Pecho de ternera con hueso"), 2));

  // --- el resto no depende de la especie base ---
  // Se le dan al motor POCOS candidatos por categoria a proposito. Con muchos
  // (antes: 4 visceras, 6 verduras, 4 pescados) el optimizador repartia entre
  // demasiados alimentos y salian cantidades ridiculas, tipo 5 g de muslo de
  // pavo. Con estos numeros, en el plato acaban saliendo ~2 carnes, 1-2
  // huesos, 1 viscera, 1 higado y 1-2 verduras, que es un menu que se puede
  // comprar y preparar de verdad. Comprobado: 100% de menus posibles.
  elegidos.push(...elegirAleatorios(POOL_CANDIDATOS["Vísceras"], 2));
  elegidos.push(...elegirAleatorios(POOL_CANDIDATOS["Hígado"], 1));
  elegidos.push(...elegirAleatorios(POOL_CANDIDATOS["Pescados y mariscos"], 1));
  elegidos.push(...elegirAleatorios(POOL_CANDIDATOS["Verduras y frutas"], 3));
  // "Aceite de girasol": 57g de linoleico y 56mg de vitE, muy por encima del
  // resto de aceites (11-18mg) -- garantizarlo evita quedarse corto en ambos
  elegidos.push("Aceite de girasol");
  elegidos.push(...elegirAleatorios(POOL_CANDIDATOS["Extras"].filter((n) => n !== "Aceite de girasol"), 1));
  // El multivitaminico va SIEMPRE (con el, el 100% de los menus salen
  // validos; sin el, el 0%), pero NO tiene por que ser siempre la misma
  // marca: se elige una de las equivalentes. Igual con la fuente de yodo.
  for (const opciones of Object.values(SUPLEMENTOS_EQUIVALENTES)) {
    elegidos.push(...elegirAleatorios(opciones, 1));
  }
  return [...new Set(elegidos)];
}

// Construye la lista de candidatos a mandar a la API SEGUN EL MODO real
// elegido -- antes esto siempre usaba la lista aleatoria generica, ignorando
// lo que el usuario hubiera elegido en Personalizar o metido en Aprovechar.
// Lo que el usuario ha elegido EXPRESAMENTE (no lo que rellena la app).
// Se le manda al motor como "forzar_presencia" para que no lo tire a 0 g:
// si alguien dice que tiene conejo en casa, el menu tiene que llevar conejo.
function eleccionesDelUsuario(modo, configPersonalizar, itemsAprovechar) {
  if (modo === "personalizar") {
    const e = [];
    for (const [cat, c] of Object.entries(configPersonalizar || {})) {
      if (c?.modo === "manual" && c.elegido?.length > 0) {
        e.push(...c.elegido.filter((a) => !a.startsWith("Todo: ")));
      }
    }
    return e;
  }
  if (modo === "aprovechar") {
    return (itemsAprovechar || []).map((it) => it.alimento).filter((a) => !a.startsWith("Todo: "));
  }
  return [];   // en Automatico no hay nada elegido a mano
}

function construirCandidatos(modo, configPersonalizar, itemsAprovechar, especieBase, holgado = false) {
  let elegidos;

  if (modo === "personalizar") {
    elegidos = [];
    for (const [cat, pool] of Object.entries(POOL_CANDIDATOS)) {
      const c = configPersonalizar[cat];
      if (!c) continue;
      if (c.modo === "manual" && c.elegido.length > 0) {
        elegidos.push(...c.elegido.map((a) => a.startsWith("Todo: ") ? null : a).filter(Boolean));
      } else if (c.modo === "no") {
        // el usuario ha dicho que NO quiere esta categoria
      } else {
        elegidos.push(...elegirAleatorios(pool, cat === "Carne muscular" || cat === "Hueso carnoso" || cat === "Verduras y frutas" ? 4 : 3));
      }
    }
  } else if (modo === "aprovechar") {
    elegidos = itemsAprovechar.map((it) => it.alimento).filter((a) => !a.startsWith("Todo: "));
  } else {
    elegidos = generarCandidatosAleatorios(especieBase);
  }

  // ===================================================================
  // COMPLETAR PARA QUE SIEMPRE HAYA SOLUCION POSIBLE
  // ===================================================================
  // Lo que elige el usuario se respeta siempre y se queda tal cual. Pero si
  // solo se le pasan al motor 3 o 4 alimentos sueltos, no hay forma humana
  // de cuadrar los 27 nutrientes y el usuario recibia un "no se encontro
  // combinacion posible" sin entender por que. Aqui se le añaden
  // alternativas de apoyo para que el calculo salga: el motor usara lo del
  // usuario y completara con lo que haga falta.
  const yaEsta = (n) => elegidos.includes(n);
  const categoriaDe = (n) => {
    for (const [cat, pool] of Object.entries(POOL_CANDIDATOS)) if (pool.includes(n)) return cat;
    return null;
  };
  const cuentaEnCategoria = (cat) => elegidos.filter((n) => categoriaDe(n) === cat).length;

  // Opciones que se le dan al motor por categoria. Son a la vez el minimo
  // para que el calculo cuadre y el maximo que rellena la app: con mas, el
  // optimizador repartia entre demasiados alimentos y salian cantidades
  // impracticables. Lo que el usuario haya elegido se respeta siempre.
  // Los MISMOS topes que en Automático, para que un menú se vea igual venga
  // de donde venga: máximo 3 proteínas contando el pescado (2 carnes + 1
  // pescado), 2 huesos, 1 víscera, 1 hígado y 2-3 verduras.
  const MINIMOS = holgado
    // Reintento: si con los topes normales no hay solución posible, se le dan
    // más opciones al motor antes de rendirse y decirle al usuario que no se
    // puede. Mejor un menú con una proteína de más que ningún menú.
    ? { "Carne muscular": 3, "Hueso carnoso": 3, "Vísceras": 2, "Hígado": 1,
        "Verduras y frutas": 4, "Pescados y mariscos": 2 }
    : { "Carne muscular": 2, "Hueso carnoso": 2, "Vísceras": 1, "Hígado": 1,
        "Verduras y frutas": 3, "Pescados y mariscos": 1 };
  for (const [cat, minimo] of Object.entries(MINIMOS)) {
    // si el usuario dijo explicitamente "no" a esta categoria, se respeta
    if (modo === "personalizar" && configPersonalizar?.[cat]?.modo === "no") continue;
    const faltan = minimo - cuentaEnCategoria(cat);
    if (faltan > 0) {
      elegidos.push(...elegirAleatorios(POOL_CANDIDATOS[cat].filter((n) => !yaEsta(n)), faltan));
    }
  }

  // El aceite de girasol y el multivitaminico van SIEMPRE en cualquier modo:
  // sin ellos el 0% de los menus sale valido (probado). No son "un alimento
  // mas" que el usuario elija, son lo que hace posible el calculo.
  if (!yaEsta("Aceite de girasol")) elegidos.push("Aceite de girasol");
  // uno de cada grupo de suplementos equivalentes, salvo que el usuario ya
  // haya elegido uno de ese grupo (entonces se respeta el suyo)
  for (const opciones of Object.values(SUPLEMENTOS_EQUIVALENTES)) {
    if (!opciones.some(yaEsta)) elegidos.push(...elegirAleatorios(opciones, 1));
  }
  // fuente de calcio garantizada
  if (!yaEsta("Pecho de ternera con hueso")) elegidos.push("Pecho de ternera con hueso");

  return [...new Set(elegidos)];
}

const ETAPA_A_SUFIJO_API = {
  cachorro_joven: "CachorroJoven",
  cachorro_crecimiento: "CachorroCrecimiento",
  adulto: "Adulto",
  senior: "Adulto", // FEDIAF no da perfil de nutrientes distinto para Senior
};

const VIOLETA = "#5A4088";
const ROSA = "#FF6F91";
const PAPEL = "#FBF7FC";
const TINTA = "#231539";
const MALVA = "#9A8CB8";
const VERDE = "#E4F2E9";
const VERDE_TEXTO = "#4E9E6F";
const fontDisplay = "Georgia, 'Times New Roman', serif";
const fontBody = "'DM Sans', system-ui, sans-serif";
const TOTAL_PASOS = 6;

const RAZAS = [
  // Pesos adultos según estándares FCI y clubes de raza (rango macho-hembra).
  // 'pesoMedio' es lo que usa el cálculo para estimar el peso adulto esperado
  // (y con él la etapa y la curva de crecimiento), así que tiene que ser
  // coherente con 'tamano'. Si la raza no está, el usuario elige el tamaño a mano.
  {"nombre": "Affenpinscher", "tamano": "Toy", "pesoMin": 3, "pesoMax": 6, "pesoMedio": 4.5},
  {"nombre": "Airedale Terrier", "tamano": "Mediano", "pesoMin": 19, "pesoMax": 25, "pesoMedio": 22.0},
  {"nombre": "Akita Americano", "tamano": "Gigante", "pesoMin": 32, "pesoMax": 59, "pesoMedio": 45.5},
  {"nombre": "Akita Inu", "tamano": "Grande", "pesoMin": 32, "pesoMax": 45, "pesoMedio": 38.5},
  {"nombre": "Alaskan Malamute", "tamano": "Grande", "pesoMin": 34, "pesoMax": 39, "pesoMedio": 36.5},
  {"nombre": "American Staffordshire Terrier", "tamano": "Mediano", "pesoMin": 18, "pesoMax": 34, "pesoMedio": 26.0},
  {"nombre": "Barbet", "tamano": "Mediano", "pesoMin": 14, "pesoMax": 28, "pesoMedio": 21.0},
  {"nombre": "Basenji", "tamano": "Pequeño", "pesoMin": 9.5, "pesoMax": 11, "pesoMedio": 10.2},
  {"nombre": "Basset Hound", "tamano": "Mediano", "pesoMin": 20, "pesoMax": 29, "pesoMedio": 24.5},
  {"nombre": "Beagle", "tamano": "Pequeño", "pesoMin": 9, "pesoMax": 15, "pesoMedio": 12.0},
  {"nombre": "Bearded Collie", "tamano": "Mediano", "pesoMin": 18, "pesoMax": 27, "pesoMedio": 22.5},
  {"nombre": "Beauceron", "tamano": "Grande", "pesoMin": 30, "pesoMax": 45, "pesoMedio": 37.5},
  {"nombre": "Bedlington Terrier", "tamano": "Pequeño", "pesoMin": 8, "pesoMax": 10, "pesoMedio": 9.0},
  {"nombre": "Bichón Frisé", "tamano": "Mini", "pesoMin": 5, "pesoMax": 8, "pesoMedio": 6.5},
  {"nombre": "Bichón Habanero", "tamano": "Mini", "pesoMin": 4.5, "pesoMax": 7.3, "pesoMedio": 5.9},
  {"nombre": "Bichón Maltés", "tamano": "Toy", "pesoMin": 3, "pesoMax": 4, "pesoMedio": 3.5},
  {"nombre": "Bobtail (Old English Sheepdog)", "tamano": "Grande", "pesoMin": 27, "pesoMax": 45, "pesoMedio": 36.0},
  {"nombre": "Border Collie", "tamano": "Mediano", "pesoMin": 14, "pesoMax": 20, "pesoMedio": 17.0},
  {"nombre": "Border Terrier", "tamano": "Mini", "pesoMin": 5.2, "pesoMax": 7.1, "pesoMedio": 6.2},
  {"nombre": "Borzoi", "tamano": "Grande", "pesoMin": 27, "pesoMax": 48, "pesoMedio": 37.5},
  {"nombre": "Boston Terrier", "tamano": "Pequeño", "pesoMin": 5, "pesoMax": 11, "pesoMedio": 8.0},
  {"nombre": "Boxer", "tamano": "Grande", "pesoMin": 25, "pesoMax": 32, "pesoMedio": 28.5},
  {"nombre": "Boyero de Berna", "tamano": "Grande", "pesoMin": 36, "pesoMax": 52, "pesoMedio": 44.0},
  {"nombre": "Boyero de Flandes", "tamano": "Grande", "pesoMin": 27, "pesoMax": 40, "pesoMedio": 33.5},
  {"nombre": "Braco Alemán de Pelo Corto", "tamano": "Mediano", "pesoMin": 20, "pesoMax": 32, "pesoMedio": 26.0},
  {"nombre": "Braco Húngaro (Vizsla)", "tamano": "Mediano", "pesoMin": 18, "pesoMax": 29, "pesoMedio": 23.5},
  {"nombre": "Bretón", "tamano": "Mediano", "pesoMin": 14, "pesoMax": 18, "pesoMedio": 16.0},
  {"nombre": "Bull Terrier", "tamano": "Grande", "pesoMin": 22, "pesoMax": 38, "pesoMedio": 30.0},
  {"nombre": "Bulldog Francés", "tamano": "Pequeño", "pesoMin": 8, "pesoMax": 14, "pesoMedio": 11.0},
  {"nombre": "Bulldog Inglés", "tamano": "Mediano", "pesoMin": 23, "pesoMax": 25, "pesoMedio": 24.0},
  {"nombre": "Bullmastiff", "tamano": "Gigante", "pesoMin": 41, "pesoMax": 59, "pesoMedio": 50.0},
  {"nombre": "Cairn Terrier", "tamano": "Mini", "pesoMin": 6, "pesoMax": 7.5, "pesoMedio": 6.8},
  {"nombre": "Cane Corso", "tamano": "Gigante", "pesoMin": 40, "pesoMax": 50, "pesoMedio": 45.0},
  {"nombre": "Caniche Enano", "tamano": "Mini", "pesoMin": 5, "pesoMax": 7, "pesoMedio": 6.0},
  {"nombre": "Caniche Mediano", "tamano": "Pequeño", "pesoMin": 9, "pesoMax": 13, "pesoMedio": 11.0},
  {"nombre": "Caniche Toy", "tamano": "Toy", "pesoMin": 2, "pesoMax": 4, "pesoMedio": 3.0},
  {"nombre": "Carlino (Pug)", "tamano": "Mini", "pesoMin": 6.3, "pesoMax": 8.1, "pesoMedio": 7.2},
  {"nombre": "Cavalier King Charles Spaniel", "tamano": "Mini", "pesoMin": 5.4, "pesoMax": 8.2, "pesoMedio": 6.8},
  {"nombre": "Chesapeake Bay Retriever", "tamano": "Grande", "pesoMin": 25, "pesoMax": 36, "pesoMedio": 30.5},
  {"nombre": "Chihuahua", "tamano": "Toy", "pesoMin": 1.5, "pesoMax": 3, "pesoMedio": 2.2},
  {"nombre": "Chow Chow", "tamano": "Mediano", "pesoMin": 20, "pesoMax": 32, "pesoMedio": 26.0},
  {"nombre": "Cocker Spaniel Americano", "tamano": "Pequeño", "pesoMin": 11, "pesoMax": 14, "pesoMedio": 12.5},
  {"nombre": "Cocker Spaniel Inglés", "tamano": "Pequeño", "pesoMin": 13, "pesoMax": 15, "pesoMedio": 14.0},
  {"nombre": "Collie de Pelo Largo", "tamano": "Mediano", "pesoMin": 18, "pesoMax": 30, "pesoMedio": 24.0},
  {"nombre": "Corgi Galés Cardigan", "tamano": "Pequeño", "pesoMin": 11, "pesoMax": 17, "pesoMedio": 14.0},
  {"nombre": "Corgi Galés Pembroke", "tamano": "Pequeño", "pesoMin": 10, "pesoMax": 14, "pesoMedio": 12.0},
  {"nombre": "Coton de Tuléar", "tamano": "Mini", "pesoMin": 4, "pesoMax": 6, "pesoMedio": 5.0},
  {"nombre": "Dachshund Estándar", "tamano": "Pequeño", "pesoMin": 7, "pesoMax": 9, "pesoMedio": 8.0},
  {"nombre": "Dachshund Miniatura", "tamano": "Toy", "pesoMin": 4, "pesoMax": 5, "pesoMedio": 4.5},
  {"nombre": "Deerhound", "tamano": "Grande", "pesoMin": 34, "pesoMax": 50, "pesoMedio": 42.0},
  {"nombre": "Dogo Argentino", "tamano": "Grande", "pesoMin": 35, "pesoMax": 45, "pesoMedio": 40.0},
  {"nombre": "Dogo de Burdeos", "tamano": "Gigante", "pesoMin": 45, "pesoMax": 65, "pesoMedio": 55.0},
  {"nombre": "Dálmata", "tamano": "Mediano", "pesoMin": 15, "pesoMax": 32, "pesoMedio": 23.5},
  {"nombre": "Dóberman", "tamano": "Grande", "pesoMin": 32, "pesoMax": 45, "pesoMedio": 38.5},
  {"nombre": "Fila Brasileño", "tamano": "Gigante", "pesoMin": 50, "pesoMax": 82, "pesoMedio": 66.0},
  {"nombre": "Flat Coated Retriever", "tamano": "Grande", "pesoMin": 25, "pesoMax": 36, "pesoMedio": 30.5},
  {"nombre": "Fox Terrier de Pelo Duro", "tamano": "Pequeño", "pesoMin": 7, "pesoMax": 9, "pesoMedio": 8.0},
  {"nombre": "Fox Terrier de Pelo Liso", "tamano": "Mini", "pesoMin": 6.8, "pesoMax": 8.6, "pesoMedio": 7.7},
  {"nombre": "Galgo Afgano", "tamano": "Mediano", "pesoMin": 23, "pesoMax": 27, "pesoMedio": 25.0},
  {"nombre": "Galgo Español", "tamano": "Mediano", "pesoMin": 20, "pesoMax": 30, "pesoMedio": 25.0},
  {"nombre": "Golden Retriever", "tamano": "Grande", "pesoMin": 25, "pesoMax": 34, "pesoMedio": 29.5},
  {"nombre": "Gran Danés", "tamano": "Gigante", "pesoMin": 45, "pesoMax": 90, "pesoMedio": 67.5},
  {"nombre": "Gran Pirineo", "tamano": "Gigante", "pesoMin": 39, "pesoMax": 73, "pesoMedio": 56.0},
  {"nombre": "Greyhound", "tamano": "Grande", "pesoMin": 27, "pesoMax": 40, "pesoMedio": 33.5},
  {"nombre": "Grifón de Bruselas", "tamano": "Toy", "pesoMin": 3.5, "pesoMax": 6, "pesoMedio": 4.8},
  {"nombre": "Husky Siberiano", "tamano": "Mediano", "pesoMin": 16, "pesoMax": 27, "pesoMedio": 21.5},
  {"nombre": "Jack Russell Terrier", "tamano": "Mini", "pesoMin": 6, "pesoMax": 8, "pesoMedio": 7.0},
  {"nombre": "Keeshond", "tamano": "Mediano", "pesoMin": 14, "pesoMax": 18, "pesoMedio": 16.0},
  {"nombre": "Kelpie Australiano", "tamano": "Mediano", "pesoMin": 14, "pesoMax": 20, "pesoMedio": 17.0},
  {"nombre": "Komondor", "tamano": "Gigante", "pesoMin": 36, "pesoMax": 61, "pesoMedio": 48.5},
  {"nombre": "Kuvasz", "tamano": "Grande", "pesoMin": 30, "pesoMax": 52, "pesoMedio": 41.0},
  {"nombre": "Labrador Retriever", "tamano": "Grande", "pesoMin": 25, "pesoMax": 36, "pesoMedio": 30.5},
  {"nombre": "Landseer", "tamano": "Gigante", "pesoMin": 50, "pesoMax": 75, "pesoMedio": 62.5},
  {"nombre": "Leonberger", "tamano": "Gigante", "pesoMin": 41, "pesoMax": 75, "pesoMedio": 58.0},
  {"nombre": "Lhasa Apso", "tamano": "Mini", "pesoMin": 5.4, "pesoMax": 8.2, "pesoMedio": 6.8},
  {"nombre": "Lobero Irlandés", "tamano": "Gigante", "pesoMin": 40, "pesoMax": 69, "pesoMedio": 54.5},
  {"nombre": "Mastín Español", "tamano": "Gigante", "pesoMin": 52, "pesoMax": 100, "pesoMedio": 76.0},
  {"nombre": "Mastín Inglés", "tamano": "Gigante", "pesoMin": 68, "pesoMax": 110, "pesoMedio": 89.0},
  {"nombre": "Mastín Napolitano", "tamano": "Gigante", "pesoMin": 50, "pesoMax": 70, "pesoMedio": 60.0},
  {"nombre": "Norfolk Terrier", "tamano": "Mini", "pesoMin": 5, "pesoMax": 5.4, "pesoMedio": 5.2},
  {"nombre": "Norwich Terrier", "tamano": "Mini", "pesoMin": 5, "pesoMax": 5.4, "pesoMedio": 5.2},
  {"nombre": "Papillón", "tamano": "Toy", "pesoMin": 3.5, "pesoMax": 4.5, "pesoMedio": 4.0},
  {"nombre": "Parson Russell Terrier", "tamano": "Mini", "pesoMin": 6, "pesoMax": 8, "pesoMedio": 7.0},
  {"nombre": "Pastor Alemán", "tamano": "Grande", "pesoMin": 22, "pesoMax": 40, "pesoMedio": 31.0},
  {"nombre": "Pastor Australiano", "tamano": "Mediano", "pesoMin": 16, "pesoMax": 32, "pesoMedio": 24.0},
  {"nombre": "Pastor Belga Groenendael", "tamano": "Mediano", "pesoMin": 20, "pesoMax": 30, "pesoMedio": 25.0},
  {"nombre": "Pastor Belga Malinois", "tamano": "Mediano", "pesoMin": 20, "pesoMax": 30, "pesoMedio": 25.0},
  {"nombre": "Pastor de Anatolia", "tamano": "Gigante", "pesoMin": 40, "pesoMax": 68, "pesoMedio": 54.0},
  {"nombre": "Pastor del Cáucaso", "tamano": "Gigante", "pesoMin": 45, "pesoMax": 100, "pesoMedio": 72.5},
  {"nombre": "Pequinés", "tamano": "Toy", "pesoMin": 3.2, "pesoMax": 6, "pesoMedio": 4.6},
  {"nombre": "Perro Chino con Cresta", "tamano": "Toy", "pesoMin": 3, "pesoMax": 6, "pesoMedio": 4.5},
  {"nombre": "Perro Lobo Checoslovaco", "tamano": "Mediano", "pesoMin": 20, "pesoMax": 26, "pesoMedio": 23.0},
  {"nombre": "Perro de Agua Español", "tamano": "Mediano", "pesoMin": 14, "pesoMax": 22, "pesoMedio": 18.0},
  {"nombre": "Perro de Agua Frisón", "tamano": "Mediano", "pesoMin": 18, "pesoMax": 25, "pesoMedio": 21.5},
  {"nombre": "Perro de Agua Irlandés", "tamano": "Mediano", "pesoMin": 20, "pesoMax": 29, "pesoMedio": 24.5},
  {"nombre": "Perro de Agua Portugués", "tamano": "Mediano", "pesoMin": 16, "pesoMax": 25, "pesoMedio": 20.5},
  {"nombre": "Perro de Montaña de los Apeninos", "tamano": "Grande", "pesoMin": 30, "pesoMax": 45, "pesoMedio": 37.5},
  {"nombre": "Perro de Montaña de los Pirineos", "tamano": "Gigante", "pesoMin": 40, "pesoMax": 60, "pesoMedio": 50.0},
  {"nombre": "Perro de Presa Canario", "tamano": "Gigante", "pesoMin": 40, "pesoMax": 65, "pesoMedio": 52.5},
  {"nombre": "Pinscher Miniatura", "tamano": "Mini", "pesoMin": 4, "pesoMax": 6, "pesoMedio": 5.0},
  {"nombre": "Podenco Andaluz", "tamano": "Mediano", "pesoMin": 16, "pesoMax": 33, "pesoMedio": 24.5},
  {"nombre": "Podenco Ibicenco", "tamano": "Mediano", "pesoMin": 20, "pesoMax": 29, "pesoMedio": 24.5},
  {"nombre": "Pointer Inglés", "tamano": "Mediano", "pesoMin": 20, "pesoMax": 30, "pesoMedio": 25.0},
  {"nombre": "Pomerania", "tamano": "Toy", "pesoMin": 1.9, "pesoMax": 3.5, "pesoMedio": 2.7},
  {"nombre": "Prague Ratter", "tamano": "Toy", "pesoMin": 1.5, "pesoMax": 3.6, "pesoMedio": 2.5},
  {"nombre": "Rhodesian Ridgeback", "tamano": "Grande", "pesoMin": 32, "pesoMax": 36, "pesoMedio": 34.0},
  {"nombre": "Rottweiler", "tamano": "Gigante", "pesoMin": 35, "pesoMax": 60, "pesoMedio": 47.5},
  {"nombre": "Saluki", "tamano": "Mediano", "pesoMin": 18, "pesoMax": 27, "pesoMedio": 22.5},
  {"nombre": "Samoyedo", "tamano": "Mediano", "pesoMin": 16, "pesoMax": 30, "pesoMedio": 23.0},
  {"nombre": "San Bernardo", "tamano": "Gigante", "pesoMin": 64, "pesoMax": 82, "pesoMedio": 73.0},
  {"nombre": "Schnauzer Estándar", "tamano": "Mediano", "pesoMin": 14, "pesoMax": 20, "pesoMedio": 17.0},
  {"nombre": "Schnauzer Miniatura", "tamano": "Mini", "pesoMin": 5, "pesoMax": 9, "pesoMedio": 7.0},
  {"nombre": "Scottish Terrier", "tamano": "Pequeño", "pesoMin": 8.5, "pesoMax": 10.4, "pesoMedio": 9.4},
  {"nombre": "Sealyham Terrier", "tamano": "Pequeño", "pesoMin": 8, "pesoMax": 9, "pesoMedio": 8.5},
  {"nombre": "Setter Gordon", "tamano": "Grande", "pesoMin": 20, "pesoMax": 36, "pesoMedio": 28.0},
  {"nombre": "Setter Inglés", "tamano": "Grande", "pesoMin": 20, "pesoMax": 36, "pesoMedio": 28.0},
  {"nombre": "Setter Irlandés Rojo", "tamano": "Grande", "pesoMin": 24, "pesoMax": 32, "pesoMedio": 28.0},
  {"nombre": "Shar Pei", "tamano": "Mediano", "pesoMin": 18, "pesoMax": 25, "pesoMedio": 21.5},
  {"nombre": "Shetland Sheepdog", "tamano": "Pequeño", "pesoMin": 6, "pesoMax": 12, "pesoMedio": 9.0},
  {"nombre": "Shiba Inu", "tamano": "Pequeño", "pesoMin": 8, "pesoMax": 11, "pesoMedio": 9.5},
  {"nombre": "Shih Tzu", "tamano": "Mini", "pesoMin": 4, "pesoMax": 7.2, "pesoMedio": 5.6},
  {"nombre": "Silky Terrier", "tamano": "Toy", "pesoMin": 3.5, "pesoMax": 4.5, "pesoMedio": 4.0},
  {"nombre": "Skye Terrier", "tamano": "Pequeño", "pesoMin": 11, "pesoMax": 18, "pesoMedio": 14.5},
  {"nombre": "Spitz Alemán Mediano", "tamano": "Pequeño", "pesoMin": 7, "pesoMax": 11, "pesoMedio": 9.0},
  {"nombre": "Springer Spaniel Inglés", "tamano": "Mediano", "pesoMin": 18, "pesoMax": 25, "pesoMedio": 21.5},
  {"nombre": "Staffordshire Bull Terrier", "tamano": "Pequeño", "pesoMin": 11, "pesoMax": 17, "pesoMedio": 14.0},
  {"nombre": "Terranova", "tamano": "Gigante", "pesoMin": 45, "pesoMax": 68, "pesoMedio": 56.5},
  {"nombre": "Terrier Negro Ruso", "tamano": "Gigante", "pesoMin": 36, "pesoMax": 60, "pesoMedio": 48.0},
  {"nombre": "Terrier Ruso", "tamano": "Toy", "pesoMin": 2, "pesoMax": 3, "pesoMedio": 2.5},
  {"nombre": "Terrier Tibetano", "tamano": "Pequeño", "pesoMin": 8, "pesoMax": 14, "pesoMedio": 11.0},
  {"nombre": "Toy Fox Terrier", "tamano": "Toy", "pesoMin": 1.5, "pesoMax": 3, "pesoMedio": 2.2},
  {"nombre": "Volpino Italiano", "tamano": "Toy", "pesoMin": 4, "pesoMax": 5, "pesoMedio": 4.5},
  {"nombre": "Weimaraner", "tamano": "Grande", "pesoMin": 25, "pesoMax": 40, "pesoMedio": 32.5},
  {"nombre": "West Highland White Terrier", "tamano": "Mini", "pesoMin": 6.8, "pesoMax": 9.1, "pesoMedio": 7.9},
  {"nombre": "Whippet", "tamano": "Pequeño", "pesoMin": 9, "pesoMax": 19, "pesoMedio": 14.0},
  {"nombre": "Yorkshire Terrier", "tamano": "Toy", "pesoMin": 2, "pesoMax": 3.2, "pesoMedio": 2.6},
];
const TAMANOS = ["Toy", "Mini", "Pequeño", "Mediano", "Grande", "Gigante"];
const MESES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
const CONDICIONES = [
  { label: "Muy delgado", detalle: "Costillas muy marcadas, sin nada de grasa" },
  { label: "Delgado", detalle: "Costillas se notan fácil al tacto" },
  { label: "Ideal", detalle: "Costillas se palpan, cintura visible desde arriba" },
  { label: "Sobrepeso", detalle: "Cuesta notar las costillas, poca cintura" },
  { label: "Obeso", detalle: "No se notan las costillas, sin cintura" },
];
const NIVELES = [
  { label: "Sedentario", detalle: "Paseos cortos, se mueve poco", Icono: Moon },
  { label: "Normal", detalle: "Paseos diarios de siempre", Icono: Footprints },
  { label: "Activo", detalle: "Paseos largos, juega bastante", Icono: Zap },
  { label: "Muy activo", detalle: "Corre, hace deporte, no para", Icono: Flame },
  { label: "Trabajo", detalle: "Pastoreo, guarda, o similar", Icono: Award },
];

const CATEGORIAS_ALIMENTO = {
  "Carne muscular": {
    "Conejo": ["Conejo"],
    "Cordero": ["Corazón de cordero"],
    "Gallina": ["Gallina (carne sin hueso)"],
    "Pato": ["Pato (carne sin hueso)"],
    "Pavo": ["Pavo", "Pavo muslo con piel", "Pavo pechuga con piel", "Pavo pechuga sin piel"],
    "Pollo": ["Corazón de pollo", "Pollo ala con piel (sin hueso)", "Pollo con piel (sin hueso)", "Pollo muslo con piel", "Pollo pechuga con piel"],
    "Ternera": ["Lomo de ternera con grasa", "Ternera con grasa", "Ternera solomillo sin grasa"],
    "Vaca": ["Corazón de vaca"],
  },
  "Pescados y mariscos": {
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
    "Langostinos": ["Langostinos"],
    "Lenguado": ["Lenguado"],
    "Lubina": ["Lubina"],
    "Mejillón": ["Mejillón"],
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
    "Codorniz": ["Codorniz entera"],
    "Conejo": ["Cabeza de conejo", "Carcasa de conejo", "Patas de conejo"],
    "Cordero": ["Costillas de cordero", "Cuello de cordero", "Espinazo de cordero"],
    "Pato": ["Cuello de pato"],
    "Pavo": ["Ala de pavo", "Carcasa de pavo", "Cuello de pavo"],
    "Pollo": ["Ala de pollo", "Carcasa de pollo", "Cuello de pollo"],
    "Ternera": ["Costillas de ternera", "Pecho de ternera con hueso"],
    "Toro": ["Rabo de toro"],
  },
  "Vísceras": {
    "Buey": ["Lengua de buey"],
    "Cordero": ["Lengua de cordero", "Pulmón de cordero", "Riñón de cordero"],
    "Ternera": ["Lengua de ternera", "Pulmón de ternera", "Riñón de ternera"],
  },
  "Hígado": {
    "Conejo": ["Hígado de conejo"],
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
    "Berro": ["Berro"],
    "Boniato": ["Boniato"],
    "Borraja": ["Borraja"],
    "Brecol": ["Brecol"],
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
    "Kiwi": ["Kiwi"],
    "Lechuga": ["Lechuga"],
    "Lombarda": ["Lombarda"],
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
  },
  "Suplementos comerciales": {
    "Calcio": ["Cáscara de huevo PAWS & PATCH", "Cáscara de huevo casera (en polvo)", "GRAU Harina de Hueso", "LUPO NATURAL BARF Huesos en polvo"],
    "Fibra": ["NaturGreen Psyllium Bio"],
    "Hierro": ["AniForte Beef Blood Powder"],
    "Multivitamínico": ["Homemadekun (multivitamínico completo)", "NEKTON Dog Easy-BARF (multivitamínico)"],
    "Omega-3": ["Aceite de Salmón Natural Greatness", "AniForte Aceite de Salmón", "Brit Care Aceite de Salmón", "Oleum Canis Aceite de Salmón"],
    "Levadura de cerveza": ["GRAU Levadura de cerveza", "PAWS & PATCH Levadura de cerveza"],
    "Algas (Kelp)": ["AniForte Seaweed Meal", "Sonrisa de Diez Kelp"],
  },
};

const INSTRUCCIONES_POR_CATEGORIA = {
  "Carne muscular": "Cruda. En trozos, no picada — la carne picada tarda más en congelarse del todo y eso aumenta el riesgo bacteriano.",
  "Vísceras": "Crudas, en trozos pequeños.",
  "Hígado": "Crudo, en trozos pequeños — se da en poca cantidad, no hace falta trocear más de la cuenta.",
  "Verduras y frutas": "Trituradas o muy cocidas — el perro no digiere bien la fibra vegetal cruda entera. Si hay manzana: quitar siempre las semillas y el corazón (contienen una pequeña cantidad de cianuro).",
  "Extras": "Los aceites y las semillas se añaden crudos al final, por encima de la comida. Cada alimento de esta categoría tiene además su propia indicación aquí abajo.",
  // ojo: antes "Hueso carnoso" y "Pescados y mariscos" estaban DUPLICADOS en
  // este objeto y la segunda entrada machacaba a la primera, asi que se
  // perdia el aviso de "crudo siempre, nunca cocinado". Ahora van fundidos.
  "Hueso carnoso": "Crudo SIEMPRE, nunca cocinado — cocinado se astilla y es peligroso. Entero o en trozos grandes, nunca troceado pequeño: el perro tiene que roerlo, no tragarlo. Que coma tranquilo y supervisado, sobre todo las primeras veces. Espera a las 14 semanas para los huesos más duros, y ve variando el tipo entre menús.",
  "Pescados y mariscos": "Puede darse crudo si se ha congelado antes (previene el anisakis). Los mariscos, SIEMPRE cocinados. No lo conviertas en la proteína principal de forma repetida: el pescado crudo lleva una enzima que destruye la Vitamina B1. Si usas atún u otro pescado grande, no más de 1 vez por semana — acumulan más mercurio que la sardina, la caballa o el boquerón.",
  "Suplementos comerciales": "Sigue la dosis del fabricante en el envase — no calcules a ojo.",
};

// Cómo dar CADA alimento en concreto. El texto de categoria se queda corto:
// a quien tiene un aceite de girasol delante no le sirve leer un aviso sobre
// el huevo y la salmonela. Cada alimento con particularidades propias tiene
// aqui su nota, y solo se muestra en ESE alimento.
const COMO_DAR_ALIMENTO = {
  // --- extras: cada uno tiene su cuento, no valen todos igual ---
  "Aceite de girasol": { pieza: "una cucharadita rasa son unos 5 g", como: "Crudo, añadido por encima justo antes de servir. Nunca lo calientes: pierde la vitamina E, que es justo para lo que está. Guárdalo cerrado y lejos de la luz." },
  "Aceite de oliva": { pieza: "una cucharadita rasa son unos 5 g", como: "Crudo, por encima al servir. No lo calientes." },
  "Aceite de oliva virgen extra": { pieza: "una cucharadita rasa son unos 5 g", como: "Crudo, por encima al servir. No lo calientes." },
  "Aceite de linaza": { pieza: "una cucharadita rasa son unos 5 g", como: "Crudo y muy fresco: se oxida rápido. Guárdalo en la nevera y gástalo en pocas semanas." },
  "Huevo de gallina entero": { pieza: "un huevo M pesa unos 55 g sin cáscara", como: "Mejor cocido que crudo, sobre todo en cachorros, por el riesgo de salmonela. Cocido puede darse entero, troceado sobre la comida." },
  "Huevo de codorniz": { pieza: "un huevo pesa unos 10 g", como: "Cocido. Por su tamaño, son fáciles de dosificar en perros pequeños." },
  "Huevo clara": { pieza: "la clara de un huevo M son unos 35 g", como: "SIEMPRE cocida. La clara cruda lleva avidina, que bloquea la absorción de biotina si se da con frecuencia." },
  "Huevo yema": { pieza: "una yema pesa unos 18 g", como: "Puede darse cruda si el huevo es fresco y de confianza. Es la parte más nutritiva del huevo." },
  "Semilla de lino": { pieza: "una cucharadita son unos 4 g", como: "SIEMPRE molida justo antes de dar. Entera pasa de largo sin digerirse y no aporta nada." },
  "Pipa de calabaza": { pieza: "una cucharadita son unos 5 g", como: "Molidas o muy trituradas, si no pasan enteras." },
  "Pipa de girasol": { pieza: "una cucharadita son unos 5 g", como: "Peladas y molidas." },
  "Semilla de sésamo": { pieza: "una cucharadita son unos 4 g", como: "Molido, si no pasa entero sin digerir." },
  "Yogur griego": { pieza: "una cucharada son unos 20 g", como: "Natural y sin azúcar ni edulcorantes. Empieza con poca cantidad: no todos los perros digieren bien la lactosa." },
  // --- huesos carnosos ---
  "Cuello de pollo": { pieza: "un cuello entero pesa unos 35-50 g", como: "Entero, sin trocear. Es de los más blandos: buen hueso para empezar. En perros muy tragones, dáselo semicongelado para que tenga que roerlo en vez de tragárselo de golpe." },
  "Carcasa de pollo": { pieza: "media carcasa son unos 150-200 g", como: "Partida por la mitad o en cuartos según el tamaño del perro. Lleva poca carne, así que suele ir acompañada de carne aparte." },
  "Ala de pollo": { pieza: "un ala entera pesa unos 90-100 g", como: "Entera, con la punta. Es el hueso más graso de los de pollo, ojo si el perro tiende a engordar." },
  "Cuello de pavo": { pieza: "un cuello entero pesa 300-500 g", como: "Casi siempre hay que partirlo: un tercio o medio cuello por toma según el perro. Es duro, mejor a partir de los 6 meses." },
  "Ala de pavo": { pieza: "un ala entera pesa 200-300 g", como: "Suele darse partida por la articulación. Bastante dura, no es un hueso para principiantes." },
  "Carcasa de pavo": { pieza: "una carcasa entera pesa 400-700 g", como: "Partida en trozos grandes. Igual que la de pollo, lleva poca carne." },
  "Cuello de pato": { pieza: "un cuello entero pesa 60-100 g", como: "Entero. Es más blando que el de pavo y muy bien aceptado." },
  "Codorniz entera": { pieza: "una codorniz entera pesa 130-180 g", como: "Entera, es presa completa. Ideal para perros medianos; en pequeños, partida por la mitad." },
  "Carcasa de conejo": { pieza: "media carcasa son unos 200-300 g", como: "En trozos grandes. Los huesos de conejo son finos y quebradizos: dáselos siempre crudos y vigila que roa, no que trague." },
  "Cabeza de conejo": { pieza: "una cabeza pesa 80-120 g", como: "Entera. Muy completa y muy entretenida para el perro, aunque impresione al principio." },
  "Patas de conejo": { pieza: "una pata pesa 40-70 g", como: "Enteras. Pequeñas y manejables, buenas para perros de tamaño mediano." },
  "Costillas de cordero": { pieza: "una costilla pesa 60-90 g", como: "De una en una, sin trocear. Es un hueso graso: no abuses si el perro tiene tendencia a la pancreatitis." },
  "Cuello de cordero": { pieza: "un cuello entero pesa 300-500 g", como: "Partido en rodajas por el carnicero. Ojo: el cuello puede llevar restos de tejido tiroideo, así que no lo repitas en todos los menús." },
  "Espinazo de cordero": { pieza: "un trozo de espinazo pesa 150-250 g", como: "En trozos grandes, tal como lo corte el carnicero. Bastante duro." },
  "Costillas de ternera": { pieza: "una costilla pesa 200-400 g", como: "De una en una. Son huesos grandes y duros: para perros con experiencia, y siempre supervisado. Si el perro es de morder fuerte, retíralo cuando quede solo el hueso pelado." },
  "Pecho de ternera con hueso": { pieza: "un trozo pesa 300-600 g", como: "En trozos grandes, que el perro tenga que trabajarlo. Es de los más ricos en calcio, por eso suele salir en cantidades pequeñas." },
  "Rabo de toro": { pieza: "una pieza de rabo pesa 150-250 g", como: "Por vértebras, tal como viene cortado. Duro pero muy carnoso, gusta mucho." },
};

const PATOLOGIAS = [
  { key: "renal", label: "Insuficiencia renal crónica", segura: true },
  { key: "pancreatitis", label: "Pancreatitis", segura: true },
  { key: "oxalato", label: "Cálculos de oxalato cálcico", segura: true },
  { key: "estruvita", label: "Cálculos de estruvita / cistina / urato", segura: false },
  { key: "hepatopatia", label: "Hepatopatía (enfermedad hepática)", segura: true },
  { key: "cardiopatia", label: "Cardiopatía", segura: true },
  { key: "diabetes", label: "Diabetes mellitus", segura: true },
  { key: "hipotiroidismo", label: "Hipotiroidismo", segura: true },
];

// --- Exclusion cruzando categorias, portado de /home/claude/backend/especies.py ---
// El bug real que se detecto: excluir "Pollo" en una categoria no lo quitaba
// de las demas (Carcasa de pollo en Hueso carnoso, Higado de pollo, etc.)
function especiesExcluidasDePerfil(perfil) {
  const especies = new Set();
  [...(perfil.alergias || []), ...(perfil.otrosEvitar || [])].forEach((item) => {
    if (item.alimento && item.alimento.startsWith("Todo: ")) {
      especies.add(item.alimento.replace("Todo: ", ""));
    }
  });
  return especies;
}

// Alimentos CONCRETOS que el usuario ha marcado para evitar (no la especie
// entera). Antes se perdian: `especiesExcluidasDePerfil` solo recogia los
// "Todo: X", asi que marcar "Higado de vaca" no servia de nada y el menu lo
// incluia igual.
function alimentosEvitadosDePerfil(perfil) {
  const nombres = new Set();
  [...(perfil?.alergias || []), ...(perfil?.otrosEvitar || [])].forEach((item) => {
    if (item.alimento && !item.alimento.startsWith("Todo: ")) nombres.add(item.alimento);
  });
  return nombres;
}

function filtrarCategoriasPorEspecies(categoriasAlimento, especiesExcluidas) {
  if (!especiesExcluidas || especiesExcluidas.size === 0) return categoriasAlimento;
  const resultado = {};
  for (const [categoria, especies] of Object.entries(categoriasAlimento)) {
    const especiesFiltradas = {};
    for (const [especie, alimentos] of Object.entries(especies)) {
      if (!especiesExcluidas.has(especie)) {
        especiesFiltradas[especie] = alimentos;
      }
    }
    if (Object.keys(especiesFiltradas).length > 0) {
      resultado[categoria] = especiesFiltradas;
    }
  }
  return resultado;
}

const MODOS = [
  { key: "automatico", Icono: Sparkles, titulo: "Automático", resumen: "El sistema decide todo",
    nota: "Genera los menús solo, rotando alimentos para cubrir todos los nutrientes. La forma más rápida." },
  { key: "aprovechar", Icono: Refrigerator, titulo: "Tengo cosas que aprovechar", resumen: "Dime qué tienes y lo reparto",
    nota: "Metes lo que tengas por casa y el sistema decide en qué días y cantidades encaja mejor." },
  { key: "personalizar", Icono: SlidersHorizontal, titulo: "Personalizar", resumen: "Eliges tú, menú por menú",
    nota: "Entras en cada categoría y decides el alimento. Lo que no toques, se calcula solo." },
];

const CATEGORIAS_ICONOS = [
  { nombre: "Carne muscular", Icono: Beef },
  { nombre: "Pescados y mariscos", Icono: Fish },
  { nombre: "Hueso carnoso", Icono: Beef },
  { nombre: "Vísceras", Icono: HeartPulse },
  { nombre: "Hígado", Icono: HeartPulse },
  { nombre: "Verduras y frutas", Icono: Salad },
  { nombre: "Extras", Icono: Pill },
  { nombre: "Suplementos comerciales", Icono: Pill },
];

function categoriaDeAlimento(nombreAlimento) {
  for (const [categoria, especies] of Object.entries(CATEGORIAS_ALIMENTO)) {
    for (const alimentos of Object.values(especies)) {
      if (alimentos.includes(nombreAlimento)) return categoria;
    }
  }
  // Red de seguridad: si un alimento esta en el POOL pero se olvido en
  // CATEGORIAS_ALIMENTO, antes caia en "Extras" y se ordenaba mal en pantalla
  // (un higado apareciendo entre los aceites). Se mira tambien el POOL.
  for (const [categoria, alimentos] of Object.entries(POOL_CANDIDATOS)) {
    if (alimentos.includes(nombreAlimento)) return categoria;
  }
  return "Extras";
}

function respuestaApiAMenu(respuestas, derObjetivo) {
  // convierte una o varias respuestas {gramos: {alimento: gramos}} de la API
  // al formato que espera VistaMenus. Los dias se reparten entre los menus.
  const lista = Array.isArray(respuestas) ? respuestas : [respuestas];
  const diasPorMenu = Math.max(1, Math.round(7 / lista.length));
  return lista.map((data, i) => {
    const items = Object.entries(data.gramos).map(([alimento, gramos]) => {
      const categoria = categoriaDeAlimento(alimento);
      const Icono = (CATEGORIAS_ICONOS.find((c) => c.nombre === categoria) || {}).Icono || Beef;
      return { categoria, Icono, alimento, gramos, porque: null };
    });
    return {
      id: i + 1,
      nombre: `Menú ${i + 1}`,
      dias: diasPorMenu,
      kcal: Math.round(derObjetivo),
      items,
    };
  });
}

const MENUS_EJEMPLO = [
  { id: 1, nombre: "Menú 1", dias: 3, kcal: 1120, items: [
    { categoria: "Carne muscular", Icono: Beef, alimento: "Pechuga de pavo sin piel", gramos: 520, porque: null },
    { categoria: "Hueso carnoso", Icono: Beef, alimento: "Cuello de pavo", gramos: 75, porque: null },
    { categoria: "Vísceras", Icono: HeartPulse, alimento: "Corazón de cordero", gramos: 38, porque: null },
    { categoria: "Hígado", Icono: HeartPulse, alimento: "Hígado de vaca", gramos: 38, porque: "cubre Vitamina B12 y Riboflavina" },
    { categoria: "Verduras y frutas", Icono: Salad, alimento: "Calabaza + Manzana", gramos: 75, porque: null },
  ]},
  { id: 2, nombre: "Menú 2", dias: 2, kcal: 1120, items: [
    { categoria: "Carne muscular", Icono: Beef, alimento: "Ternera con grasa", gramos: 490, porque: null },
    { categoria: "Hueso carnoso", Icono: Beef, alimento: "Costillas de ternera", gramos: 75, porque: null },
    { categoria: "Vísceras", Icono: HeartPulse, alimento: "Riñón de ternera", gramos: 38, porque: null },
    { categoria: "Hígado", Icono: HeartPulse, alimento: "Hígado de pollo", gramos: 45, porque: "cubre Folato" },
    { categoria: "Verduras y frutas", Icono: Salad, alimento: "Brócoli + Pera", gramos: 75, porque: null },
  ]},
  { id: 3, nombre: "Menú 3", dias: 2, kcal: 1120, items: [
    { categoria: "Pescados y mariscos", Icono: Beef, alimento: "Salmón", gramos: 480, porque: null },
    { categoria: "Hueso carnoso", Icono: Beef, alimento: "Alitas de pollo", gramos: 75, porque: null },
    { categoria: "Vísceras", Icono: HeartPulse, alimento: "Pulmón de cordero", gramos: 38, porque: null },
    { categoria: "Hígado", Icono: HeartPulse, alimento: "Hígado de vaca", gramos: 38, porque: "cubre Vitamina A" },
    { categoria: "Verduras y frutas", Icono: Salad, alimento: "Zanahoria + Plátano", gramos: 75, porque: null },
  ]},
];

function calcularEdad(dia, mesIdx, anio) {
  const nacimiento = new Date(anio, mesIdx, dia);
  const hoy = new Date();
  if (nacimiento > hoy) return null;
  let meses = (hoy.getFullYear() - nacimiento.getFullYear()) * 12 + (hoy.getMonth() - nacimiento.getMonth());
  let dias = hoy.getDate() - nacimiento.getDate();
  if (dias < 0) {
    meses -= 1;
    const mesAnterior = new Date(hoy.getFullYear(), hoy.getMonth(), 0);
    dias += mesAnterior.getDate();
  }
  return { anios: Math.floor(meses / 12), meses: meses % 12, dias, totalMeses: Math.floor(meses / 12) * 12 + (meses % 12) };
}

// --- Motor nutricional real, portado de /home/claude/backend/der.py ---
// Peso adulto tipico por categoria de tamaño, para cuando no hay raza concreta (mestizo)
const PESO_ADULTO_POR_TAMANO = { Toy: 3, Mini: 6, "Pequeño": 12, Mediano: 22, Grande: 32, Gigante: 55 };

function interpolar(pesoKg, puntos) {
  // puntos: array ordenado de [kg, valor]. Interpolacion lineal continua (no tramos).
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

const MULTIPLICADOR_FIJO = { cachorro_joven: 3.0, cachorro_crecimiento: 2.0 };
const MULTIPLICADOR_ADULTO = { sedentario: 1.2, normal: 1.6, activo: 1.8, muy_activo: 2.0, trabajo: 3.0 };
const MULTIPLICADOR_SENIOR = { sedentario: 1.0, normal: 1.2, activo: 1.4 };
const FACTOR_ESTERILIZADO = 0.889;
const ACTIVIDAD_KEY = ["sedentario", "normal", "activo", "muy_activo", "trabajo"]; // indice del slider -> clave

// ===========================================================================
// CÁLCULO DE LAS KCAL DIARIAS — MÉTODO EUROPEO
// Réplica exacta de der.py. Fuentes: FEDIAF (crecimiento, gestación,
// lactancia) + estudio de la Univ. de Múnich sobre 586 perros europeos
// reales (adultos). Si se cambia aquí, hay que cambiar der.py IGUAL.
//
// Diferencia con el método americano: allí es RER x UN factor; aquí es un
// COEFICIENTE en kcal/kg^0.75 al que se le SUMAN ajustes. Por eso no se
// pueden apilar factores por error.
//
// La actividad NO se usa en cachorros, gestación ni lactancia: en esas
// etapas manda el crecimiento o la leche, no cuánto pasea.
// ===========================================================================
// Tabla VII-6 de FEDIAF. Bases 95 y 110 confirmadas en el texto oficial; el
// resto via reproduccion de UK Pet Food. La media medida en 586 perros de
// compania (Thes 2014) fue 98, justo entre 95 y 110.
const BASE_ACTIVIDAD = { sedentario: 95, normal: 110, activo: 125, muy_activo: 150, trabajo: 175 };
// Thes et al. 2014: jóvenes 100 kcal/kg^0.75 vs mayores de 7 años 93 -> -7
const AJUSTE_EDAD = { joven: 15, adulto: 0, senior: -7 };
// Razas con gasto por encima / por debajo de la media. LISTA EXACTA de
// Thes et al. (2014), "Metabolizable energy intake of client owned adult dogs",
// J Anim Physiol Anim Nutr (LMU München, cátedra Kienzle): 586 perros de
// compañía reales. Media 98 kcal/kg^0.75; estas razas 113 y 82 -> ±15.
// La app no tiene Kleiner Münsterländer, Sloughi, English Foxhound ni Löwchen.
const RAZAS_MAS_GASTO = new Set(["Jack Russell Terrier","Parson Russell Terrier",
  "Dálmata","Braco Húngaro (Vizsla)","Bearded Collie","Galgo Afgano",
  "Galgo Español","Boxer","Rhodesian Ridgeback","Flat Coated Retriever"]);
// OJO: el Border Collie está en la lista de MENOS gasto, aunque sorprenda.
// Y "Collies" en la tesis excluye expresamente al Bearded Collie.
const RAZAS_MENOS_GASTO = new Set(["Dachshund Estándar","Dachshund Miniatura",
  "Lhasa Apso","Shih Tzu","West Highland White Terrier","Border Collie",
  "Collie de Pelo Largo","Airedale Terrier","American Staffordshire Terrier",
  "Golden Retriever"]);
// Crecimiento (FEDIAF): por % del peso ADULTO esperado, no por edad
// CRECIMIENTO: ecuacion de Klein et al. (2019), grupo de Kienzle (Munich),
// medida en 493 cachorros de compania reales. Curva continua, sin los saltos
// de los 3 escalones de FEDIAF. ME(MJ) = (1.063 - 0.565 x frac) x peso^0.75
const KLEIN_A = 1.063, KLEIN_B = 0.565, MJ_A_KCAL = 239.0;
const CRECIMIENTO = [[0.50, 210], [0.80, 175], [null, 140]];  // respaldo
// Condicion corporal (5 niveles de la app) -> escala validada de 9 puntos
const BCS_DESDE_CONDICION = { 0: 2, 1: 4, 2: 5, 3: 7, 4: 9 };
function pesoIdealDesdeCondicion(pesoActualKg, condicionIdx) {
  if (!pesoActualKg || pesoActualKg <= 0) return null;
  const bcs = BCS_DESDE_CONDICION[condicionIdx];
  if (bcs === undefined) return null;
  const desvio = (bcs - 5) * 0.10;
  let ideal = pesoActualKg / (1 + desvio);
  // Tope al alza: no perseguir de golpe un objetivo >20% por encima
  if (ideal > pesoActualKg * 1.20) ideal = pesoActualKg * 1.20;
  return Math.round(ideal * 100) / 100;
}

function calcularDER(pesoActualKg, etapa, actividadIdx, esterilizado, opciones = {}) {
  if (!pesoActualKg || pesoActualKg <= 0) return null;
  const { pesoAdultoKg, pesoIdealKg, raza, nCachorros, semanaLactancia = 3,
          machoEntero = false, conOtrosPerros = false } = opciones;
  const enCrecimiento = etapa === "cachorro_joven" || etapa === "cachorro_crecimiento";

  // El peso ideal manda: con sobrepeso se baja al reposo, pase lo que pase
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
      coef = CRECIMIENTO[CRECIMIENTO.length - 1][1];   // sin peso adulto, prudente
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
    // Tope de seguridad: el extra escala con el peso vivo y en perros grandes
    // se dispara. La tabla clinica no pasa de x6 del RER ni con 9 cachorros.
    // Igual que en der.py.
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
function SiluetaDesdeArriba({ tuck, color }) {
  const pellizco = 30 - tuck * 16;
  return (
    <svg width="150" height="70" viewBox="0 0 150 70" fill="none">
      <path d="M8,35 C 2,32 1,26 5,22" stroke={color} strokeWidth="7" strokeLinecap="round" fill="none" />
      <path
        d={`M18,35 C 18,20 30,14 45,14 C 55,14 60,${pellizco} 75,${pellizco} C 90,${pellizco} 95,14 105,14 C 120,14 132,20 132,35 C 132,50 120,56 105,56 C 95,56 90,${70 - pellizco} 75,${70 - pellizco} C 60,${70 - pellizco} 55,56 45,56 C 30,56 18,50 18,35 Z`}
        fill={color}
      />
      <ellipse cx="128" cy="16" rx="7" ry="10" fill={color} transform="rotate(-25 128 16)" />
      <ellipse cx="128" cy="54" rx="7" ry="10" fill={color} transform="rotate(25 128 54)" />
      <circle cx="132" cy="35" r="15" fill={color} />
      <ellipse cx="148" cy="35" rx="7" ry="6" fill={color} />
    </svg>
  );
}

function Cabecera({ paso, titulo }) {
  return (
    <div style={{ background: VIOLETA }} className="w-full px-6 pt-8 pb-7">
      <div className="flex items-center justify-between mb-5">
        <span className="text-[11px] tracking-[0.18em] uppercase" style={{ color: MALVA, fontFamily: "monospace" }}>
          Perfil nuevo
        </span>
        <span className="text-[11px] tracking-[0.18em] uppercase" style={{ color: MALVA, fontFamily: "monospace" }}>
          {paso} / {TOTAL_PASOS}
        </span>
      </div>
      <div className="flex gap-1.5 mb-7">
        {Array.from({ length: TOTAL_PASOS }).map((_, i) => (
          <div key={i} className="h-[3px] flex-1 rounded-full" style={{ background: i <= paso - 1 ? ROSA : "rgba(255,255,255,0.16)" }} />
        ))}
      </div>
      <h1 className="text-3xl leading-tight" style={{ color: "#FFFFFF", fontFamily: fontDisplay, fontWeight: 500 }}>
        {titulo}
      </h1>
    </div>
  );
}

function Curvita() {
  return (
    <div className="flex items-end justify-center opacity-[0.5] pb-3">
      <svg width="180" height="34" viewBox="0 0 180 34" fill="none">
        <path d="M0 30 C 30 28, 45 16, 70 13 S 120 5, 180 2" stroke={ROSA} strokeWidth="2" strokeLinecap="round" fill="none" />
        <circle cx="180" cy="2" r="3" fill={ROSA} />
      </svg>
    </div>
  );
}

function BotonContinuar({ activo, onClick, texto = "Continuar" }) {
  return (
    <button
      onClick={onClick}
      disabled={!activo}
      className="w-full py-4 rounded-2xl text-base transition-all"
      style={{
        background: activo ? ROSA : "#EDE6F5",
        color: activo ? "#FFFFFF" : "#B6ABC9",
        fontFamily: fontBody,
        fontWeight: 700,
      }}
    >
      {texto}
    </button>
  );
}

function BotonAtras({ onClick, texto = "Atrás" }) {
  return (
    <button onClick={onClick} className="flex items-center gap-1 text-sm mb-4" style={{ color: MALVA, fontFamily: fontBody }}>
      <ChevronLeft size={16} /> {texto}
    </button>
  );
}

function VistaMenus({ menus, onVolver, modo, alimentosEvitados, patologias, nombrePerro, necesitaTransicion, dietaActual, categoriasDisponibles, perfil, derReal, etapaLabel, etapaCalculada, especiesExcluidas, pesoAdultoEsperado, edad, set }) {
  const [tabActiva, setTabActiva] = useState(menus[0].id);
  const [menuLateralAbierto, setMenuLateralAbierto] = useState(false);
  const [selectorMascotaAbierto, setSelectorMascotaAbierto] = useState(false);
  const [seccionActiva, setSeccionActiva] = useState(null);
  // Confirmar la semana NO bloquea nada: es solo dejar constancia de que el
  // plan esta revisado. El usuario puede seguir editando cuando quiera.
  const [semanaConfirmada, setSemanaConfirmada] = useState(false);
  // --- modo analizador: el usuario mete lo que YA le da y le decimos que tal ---
  const [dietaAnalizar, setDietaAnalizar] = useState([]);   // [{categoria, alimento, gramos}]
  const [abiertoAnalizar, setAbiertoAnalizar] = useState(null);
  const [resultadoAnalisis, setResultadoAnalisis] = useState(null);
  const [analizando, setAnalizando] = useState(false);
  const [errorAnalisis, setErrorAnalisis] = useState(null);

  const analizarDietaActual = async () => {
    const conGramos = dietaAnalizar.filter((it) => Number(it.gramos) > 0);
    if (conGramos.length === 0) {
      setErrorAnalisis("Añade al menos un alimento y dinos cuántos gramos le das.");
      return;
    }
    setAnalizando(true); setErrorAnalisis(null); setResultadoAnalisis(null);
    const gramos_por_alimento = {};
    conGramos.forEach((it) => {
      gramos_por_alimento[it.alimento] = (gramos_por_alimento[it.alimento] || 0) + Number(it.gramos);
    });
    try {
      const resp = await fetch(`${API_BASE}/analizar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gramos_por_alimento,
          der_objetivo: derReal,
          // OJO: hay que traducir la clave. etapaCalculada usa el formato de
          // der.py ("cachorro_crecimiento") y el backend espera el de los
          // requisitos ("CachorroCrecimiento"). Mandarlo sin traducir hacia
          // que el analizador NO comprobara ningun nutriente y dijera que
          // todo estaba bien.
          etapa_requisitos: ETAPA_A_SUFIJO_API[etapaCalculada] || "Adulto",
        }),
      });
      const data = await resp.json();
      if (!data.ok) setErrorAnalisis(data.motivo || "No hemos podido analizar la dieta.");
      else setResultadoAnalisis(data);
    } catch (e) {
      setErrorAnalisis("No hemos podido conectar con el servidor. Inténtalo otra vez.");
    }
    setAnalizando(false);
  };
  const [nuevoPeso, setNuevoPeso] = useState("");
  const [porqueAbierto, setPorqueAbierto] = useState(null);
  const [comoAbierto, setComoAbierto] = useState(null);
  const [mostrarAyuda, setMostrarAyuda] = useState(true);
  const [infoNutrientes, setInfoNutrientes] = useState(false);
  const [suplementosPorMenu, setSuplementosPorMenu] = useState({});
  const [supAbierto, setSupAbierto] = useState(false);
  const [supTipoAbierto, setSupTipoAbierto] = useState(null);
  const [recienRecalculado, setRecienRecalculado] = useState(false);
  const [sobreescritosPorMenu, setSobreescritosPorMenu] = useState({});
  const [editorAbierto, setEditorAbierto] = useState(null); // { itemIdx, categoria, especie } | null
  const [recalculandoServidor, setRecalculandoServidor] = useState(false);
  const [gramosRealesPorMenu, setGramosRealesPorMenu] = useState({}); // { tabId: {alimento: gramos} } -- resultado REAL de la API tras cualquier edicion
  const [errorRecalculo, setErrorRecalculo] = useState(null);

  const menu = menus.find((m) => m.id === tabActiva);
  const idxActiva = menus.findIndex((m) => m.id === tabActiva);
  const viendoBloqueado = necesitaTransicion && idxActiva > 0;
  const suplementosMenu = suplementosPorMenu[tabActiva] || [];
  const gramosSuplementos = suplementosMenu.reduce((s, it) => s + it.gramos, 0);
  const totalBase = menu.items.reduce((s, it) => s + it.gramos, 0);
  const factor = totalBase > 0 ? Math.max(0, (totalBase - gramosSuplementos) / totalBase) : 1;
  const sobreescritos = sobreescritosPorMenu[tabActiva] || {};
  const gramosReales = gramosRealesPorMenu[tabActiva]; // {alimento: gramos} si ya se recalculo de verdad con el servidor
  const itemsBase = menu.items.map((it, idx) => {
    const alimentoActual = sobreescritos[idx] || it.alimento;
    const gramosDeVerdad = gramosReales ? gramosReales[alimentoActual] : undefined;
    // Al cambiar un alimento con el lápiz hay que RECALCULAR su categoría y su
    // icono. Antes, con "...it", la fila se quedaba con los del alimento
    // anterior: se vio una "Carcasa de pollo" etiquetada como VÍSCERAS, que
    // además hacía creer que el menú tenía vísceras cuando no las tenía.
    const cambiado = alimentoActual !== it.alimento;
    const categoriaActual = cambiado ? categoriaDeAlimento(alimentoActual) : it.categoria;
    const IconoActual = cambiado
      ? ((CATEGORIAS_ICONOS.find((x) => x.nombre === categoriaActual) || {}).Icono || Beef)
      : it.Icono;
    return {
      ...it,
      alimento: alimentoActual,
      categoria: categoriaActual,
      Icono: IconoActual,
      gramos: gramosDeVerdad !== undefined ? gramosDeVerdad : Math.max(5, Math.round(it.gramos * factor)),
    };
  }).filter((it) => gramosReales ? gramosReales[it.alimento] !== undefined : true); // si ya recalculamos con la API, solo mostrar lo que la API diga que sigue teniendo gramos > 0
  // Orden fijo en pantalla: primero la carne, luego el hueso, después las
  // vísceras y el hígado, las verduras y frutas, y al final los suplementos.
  // Antes salían en el orden que devolvía el motor (por gramos), que no se
  // corresponde con cómo uno prepara la comida.
  const ETIQUETA_MODO = {
    automatico: "AUTOMÁTICO",
    personalizar: "PERSONALIZADO",
    aprovechar: "CON LO QUE TENÍAS",
  };
  const ORDEN_CATEGORIAS = [
    "Carne muscular", "Pescados y mariscos", "Hueso carnoso",
    "Vísceras", "Hígado", "Verduras y frutas", "Extras",
    "Suplementos comerciales", "Multivitamínico", "Yodo", "Calcio",
    "Omega-3", "Vitamina B", "Hierro", "Fibra",
  ];
  const itemsMostrados = [...itemsBase, ...suplementosMenu].sort((a, b) => {
    const ia = ORDEN_CATEGORIAS.indexOf(a.categoria);
    const ib = ORDEN_CATEGORIAS.indexOf(b.categoria);
    if (ia !== ib) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    return b.gramos - a.gramos;   // dentro de la categoría, de más a menos
  });
  // ---- PREPARACION POR LOTES (perros pequeños) ----
  // Un perro de 2 kg come ~150 kcal al dia: repartidas entre 10 alimentos
  // salen cantidades de 3-5 g que no hay balanza domestica que pese. La
  // solucion que usa la gente de verdad no es cambiar la dieta, es PREPARAR
  // PARA VARIOS DIAS y repartir. Los gramos diarios siguen siendo los
  // correctos; solo se muestran multiplicados para que se puedan pesar.
  const menorGramo = itemsBase.length
    ? Math.min(...itemsBase.filter((it) => it.gramos > 0).map((it) => it.gramos))
    : 99;
  // se busca el nº de días que hace que hasta lo más pequeño llegue a 10 g,
  // con un tope de 7 (más de una semana no se conserva bien en nevera)
  const diasLote = menorGramo >= 10 ? 1 : Math.min(7, Math.ceil(10 / Math.max(menorGramo, 0.5)));
  const [verPorLote, setVerPorLote] = useState(false);
  const multiplicador = verPorLote ? diasLote : 1;

  // Se redondea a 1 decimal: sumar flotantes daba cosas como
  // "868.8000000000001g" en pantalla
  const totalGramos = Math.round(itemsMostrados.reduce((s, it) => s + it.gramos, 0) * multiplicador * 10) / 10;

  const nombresActualesDelMenu = () => menu.items.map((it, idx) => sobreescritos[idx] || it.alimento);
  const etapaSufijoApi = ETAPA_A_SUFIJO_API[etapaCalculada] || "Adulto";

  const llamarRecalculo = async (endpoint, cuerpoExtra) => {
    setRecalculandoServidor(true);
    setErrorRecalculo(null);
    try {
      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          der_objetivo: menu.kcal,
          etapa_requisitos: etapaSufijoApi,
          especies_excluidas: Array.from(especiesExcluidas || []),
          nombres_excluidos: Array.from(alimentosEvitados || []),
          // el peso hace falta para las dosis maximas de los suplementos
          // comerciales (el fabricante las da por kilos, no por calorias)
          peso_perro_kg: perfil?.pesoActual ? Number(perfil.pesoActual) : null,
          ...cuerpoExtra,
        }),
      });
      const data = await res.json();
      if (data.factible) {
        setGramosRealesPorMenu((prev) => ({ ...prev, [tabActiva]: data.gramos }));
      } else {
        setErrorRecalculo(data.motivo || "No se pudo recalcular con esta combinación.");
      }
    } catch (err) {
      setErrorRecalculo("No se ha podido conectar con el servidor para recalcular.");
    } finally {
      setRecalculandoServidor(false);
    }
  };

  const anadirSuplemento = (tipo, producto) => {
    setSuplementosPorMenu((prev) => ({
      ...prev,
      [tabActiva]: [...(prev[tabActiva] || []), { categoria: "Suplementos comerciales", alimento: producto, gramos: 3, Icono: Pill }],
    }));
    setSupAbierto(false);
    setSupTipoAbierto(null);
    llamarRecalculo("/menu/anadir", { menu_actual: nombresActualesDelMenu(), alimento: producto });
    setRecienRecalculado(true);
    setTimeout(() => setRecienRecalculado(false), 2500);
  };

  const quitarSuplemento = (idx) => {
    const producto = suplementosMenu[idx]?.alimento;
    setSuplementosPorMenu((prev) => ({
      ...prev,
      [tabActiva]: (prev[tabActiva] || []).filter((_, i) => i !== idx),
    }));
    if (producto) llamarRecalculo("/menu/quitar", { menu_actual: [...nombresActualesDelMenu(), producto], alimento: producto });
    setRecienRecalculado(true);
    setTimeout(() => setRecienRecalculado(false), 2500);
  };

  const cambiarAlimento = (itemIdx, alimentoNuevo) => {
    const alimentoViejo = menu.items[itemIdx].alimento;
    setSobreescritosPorMenu((prev) => ({
      ...prev,
      [tabActiva]: { ...(prev[tabActiva] || {}), [itemIdx]: alimentoNuevo },
    }));
    setEditorAbierto(null);
    llamarRecalculo("/menu/cambiar", { menu_actual: nombresActualesDelMenu(), alimento_viejo: alimentoViejo, alimento_nuevo: alimentoNuevo });
  };

  return (
    <div className="min-h-screen w-full flex flex-col" style={{ background: PAPEL }}>
      <Fuentes />
      <div style={{ background: VIOLETA }} className="w-full px-6 pt-8 pb-6">
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => setMenuLateralAbierto(true)}>
            <Menu size={22} style={{ color: "#FFFFFF" }} />
          </button>
          <p className="text-sm" style={{ color: "#FFFFFF", fontFamily: fontDisplay }}>CANISLAB</p>
          <button
            onClick={() => setSelectorMascotaAbierto(true)}
            className="w-9 h-9 rounded-full flex items-center justify-center"
            style={{ background: ROSA }}
          >
            <Dog size={16} style={{ color: "#FFFFFF" }} />
          </button>
        </div>
        <button onClick={onVolver} className="text-xs mb-2" style={{ color: MALVA, fontFamily: fontBody }}>
          ← Cambiar modo
        </button>
        <p className="text-[11px] tracking-[0.18em] uppercase mb-2" style={{ color: MALVA, fontFamily: "monospace" }}>
          Semana de {nombrePerro}
        </p>
        <h1 className="text-3xl leading-tight mb-5" style={{ color: "#FFFFFF", fontFamily: fontDisplay, fontWeight: 500 }}>
          {/* "Tus 1 menú" quedaba fatal: en singular va "Tu menú" */}
          {menus.length === 1 ? "Tu menú" : `Tus ${menus.length} menús`}
        </h1>
        {menus.length > 1 && (
          <div className="flex gap-2">
            {menus.map((m, idx) => {
              const activo = m.id === tabActiva;
              const bloqueado = necesitaTransicion && idx > 0;
              return (
                <button
                  key={m.id}
                  onClick={() => { setTabActiva(m.id); setPorqueAbierto(null); }}
                  className="flex-1 py-2.5 rounded-xl text-center"
                  style={{
                    background: bloqueado ? (activo ? "rgba(255,111,145,0.28)" : "rgba(255,255,255,0.06)") : activo ? ROSA : "rgba(255,255,255,0.1)",
                    color: bloqueado ? (activo ? "#FFFFFF" : "rgba(255,255,255,0.5)") : activo ? "#FFFFFF" : "#D8CFEC",
                    fontFamily: fontDisplay,
                    fontSize: 14,
                  }}
                >
                  {bloqueado ? (
                    <>
                      <div className="flex items-center justify-center gap-1">
                        <Lock size={11} />
                        <span>{m.nombre}</span>
                      </div>
                      <span className="block text-[10px] mt-0.5" style={{ fontFamily: "monospace" }}>semana {idx + 1}</span>
                    </>
                  ) : (
                    <>
                      {m.nombre}
                      <span className="block text-[10px] mt-0.5" style={{ fontFamily: "monospace", opacity: 0.85 }}>{m.dias} {m.dias === 1 ? "día" : "días"}</span>
                    </>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex-1 px-6 pt-6 pb-6 flex flex-col">
        {necesitaTransicion && (
          <div className="rounded-xl p-3 mb-3" style={{ background: "#F0ECF7" }}>
            <p className="text-sm mb-2" style={{ color: TINTA, fontFamily: fontBody, fontWeight: 600 }}>
              Plan de transición ({dietaActual === "pienso" ? "pienso" : "comida cocinada"} → BARF)
            </p>
            <div className="flex flex-col gap-1">
              {[
                { dias: "Días 1-3", barf: 25 },
                { dias: "Días 4-6", barf: 50 },
                { dias: "Días 7-9", barf: 75 },
                { dias: "Día 10 en adelante", barf: 100 },
              ].map((tramo, i) => (
                <div key={i} className="flex items-center justify-between text-xs" style={{ fontFamily: fontBody, color: TINTA }}>
                  <span>{tramo.dias}</span>
                  <span style={{ fontFamily: "monospace", color: VIOLETA, fontWeight: 700 }}>
                    {tramo.barf}% BARF / {100 - tramo.barf}% {dietaActual === "pienso" ? "pienso" : "cocinado"}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-xs mt-2" style={{ color: MALVA, fontFamily: fontBody }}>
              Dáselo en tomas separadas, no mezclado en el mismo plato — se digieren a ritmos distintos.
            </p>
          </div>
        )}
        {necesitaTransicion && menus.length > 1 && (
          <div className="rounded-xl p-3 mb-4 flex gap-2 items-start" style={{ background: "#F0ECF7" }}>
            <Lock size={14} style={{ color: VIOLETA, flexShrink: 0, marginTop: 2 }} />
            <p className="text-xs" style={{ color: TINTA, fontFamily: fontBody }}>
              Empiezas solo con el Menú 1 toda la semana. La semana que viene se cambia por completo al Menú 2
              (no se mezclan), y así con cada uno — hasta que {nombrePerro} haya probado todos por separado.
              Solo entonces empiezan a rotar de verdad entre ellos.
            </p>
          </div>
        )}
        {viendoBloqueado && (
          <div className="rounded-xl p-3 mb-4 flex gap-2 items-start" style={{ background: "#FFF7E8" }}>
            <Info size={14} style={{ color: "#B8860B", flexShrink: 0, marginTop: 2 }} />
            <p className="text-xs" style={{ color: TINTA, fontFamily: fontBody }}>
              Vista previa — {nombrePerro} todavía no come esto. Se activará en la semana {idxActiva + 1}.
            </p>
          </div>
        )}
        {recalculandoServidor && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl mb-3" style={{ background: "#F0ECF7" }}>
            <Dog size={13} style={{ color: VIOLETA, flexShrink: 0 }} />
            <p className="text-xs" style={{ color: TINTA, fontFamily: fontBody }}>Recalculando gramos con el servidor...</p>
          </div>
        )}
        {errorRecalculo && !recalculandoServidor && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl mb-3" style={{ background: "#FFE8EC" }}>
            <AlertCircle size={13} style={{ color: ROSA, flexShrink: 0 }} />
            <p className="text-xs" style={{ color: TINTA, fontFamily: fontBody }}>{errorRecalculo}</p>
          </div>
        )}
        <div className="flex gap-3 mb-4">
          <div className="flex-1 rounded-2xl p-4 text-center" style={{ background: "#FFFFFF", border: "1.5px solid #E3DAF0" }}>
            <p style={{ color: VIOLETA, fontFamily: fontDisplay, fontSize: 22 }}>{totalGramos}g</p>
            <p className="text-[10px] tracking-[0.1em] uppercase mt-0.5" style={{ color: MALVA, fontFamily: "monospace" }}>ración total</p>
          </div>
          <div className="flex-1 rounded-2xl p-4 text-center" style={{ background: "#FFFFFF", border: "1.5px solid #E3DAF0" }}>
            <p style={{ color: VIOLETA, fontFamily: fontDisplay, fontSize: 22 }}>{menu.kcal}</p>
            <p className="text-[10px] tracking-[0.1em] uppercase mt-0.5" style={{ color: MALVA, fontFamily: "monospace" }}>kcal / día</p>
          </div>
          <div className="flex-1 rounded-2xl p-4 text-center flex flex-col items-center justify-center" style={{ background: VERDE }}>
            <div className="flex items-center gap-1">
              <CheckCircle2 size={18} style={{ color: VERDE_TEXTO }} />
              <button onClick={() => setInfoNutrientes(!infoNutrientes)}><Info size={13} style={{ color: VERDE_TEXTO, opacity: 0.6 }} /></button>
            </div>
            <p className="text-[10px] tracking-[0.1em] uppercase mt-1" style={{ color: VERDE_TEXTO, fontFamily: "monospace" }}>27/27 OK</p>
          </div>
        </div>

        {mostrarAyuda && (
          <div className="rounded-xl p-3 mb-4" style={{ background: PAPEL, border: "1px solid #EDE6F5" }}>
            <div className="flex items-center gap-3 text-xs" style={{ color: MALVA, fontFamily: fontBody }}>
              <span className="flex items-center gap-1"><Pencil size={13} style={{ color: "#B6ABC9" }} /> cambiar un alimento</span>
              <span className="flex items-center gap-1"><UtensilsCrossed size={13} style={{ color: "#B6ABC9" }} /> cómo darlo</span>
            </div>
          </div>
        )}

        {infoNutrientes && (
          <div className="rounded-xl p-3 mb-4 flex gap-2 items-start" style={{ background: VERDE }}>
            <Info size={14} style={{ color: VERDE_TEXTO, flexShrink: 0, marginTop: 2 }} />
            <p className="text-xs" style={{ color: TINTA, fontFamily: fontBody }}>
              FEDIAF exige revisar 27 nutrientes distintos para que una dieta esté completa. Este menú los cumple todos.
            </p>
          </div>
        )}

        <div className="flex flex-col gap-2 mb-3">
          {/* AVISO VETERINARIO. Va SIEMPRE, no solo con patología: este menú
            es una propuesta calculada, no una prescripción. Con patología el
            aviso se refuerza y cambia de color, porque ahí no es opcional. */}
        {(patologias || []).length > 0 ? (
          <div className="rounded-xl p-3 mb-3 flex gap-2 items-start"
               style={{ background: "#FFF4F6", border: `1.5px solid ${ROSA}` }}>
            <AlertCircle size={15} style={{ color: ROSA, flexShrink: 0, marginTop: 2 }} />
            <div>
              <p className="text-sm mb-1" style={{ color: TINTA, fontFamily: fontBody, fontWeight: 700 }}>
                Este menú TIENE que aprobarlo tu veterinario
              </p>
              <p className="text-xs" style={{ color: TINTA, fontFamily: fontBody }}>
                {nombrePerro} tiene una condición diagnosticada. Hemos ajustado el menú en
                esa dirección, pero son ajustes orientativos: la cantidad exacta depende del
                estadio y de sus analíticas, y eso solo puede pautarlo un veterinario.
                Enséñale este menú antes de empezar y ve revisándolo con él.
              </p>
            </div>
          </div>
        ) : (
          <div className="rounded-xl p-3 mb-3 flex gap-2 items-start" style={{ background: "#F0ECF7" }}>
            <Info size={14} style={{ color: VIOLETA, flexShrink: 0, marginTop: 2 }} />
            <p className="text-xs" style={{ color: TINTA, fontFamily: fontBody }}>
              Este menú es una propuesta calculada sobre los requisitos FEDIAF, no una
              prescripción. Antes de cambiarle la alimentación a {nombrePerro},
              enséñaselo a tu veterinario — y consúltale también si notas cualquier cambio
              en su digestión, su peso o su ánimo.
            </p>
          </div>
        )}
        {diasLote > 1 && (
          <div className="rounded-xl p-3 mb-3" style={{ background: "#F0ECF7" }}>
            <p className="text-sm mb-1" style={{ color: TINTA, fontFamily: fontBody, fontWeight: 600 }}>
              {nombrePerro} es pequeño: mejor preparar para varios días
            </p>
            <p className="text-xs mb-2.5" style={{ color: MALVA, fontFamily: fontBody }}>
              Con su ración diaria algunos alimentos salen a 3 o 4 gramos, que no hay
              balanza de cocina que pese bien. Prepara la mezcla para {diasLote} días,
              guárdala en la nevera y dale {Math.round(100 / diasLote)}% cada día.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setVerPorLote(false)}
                className="flex-1 py-2 rounded-lg text-xs"
                style={{ background: verPorLote ? "transparent" : VIOLETA,
                         color: verPorLote ? VIOLETA : "#FFFFFF",
                         border: `1.5px solid ${VIOLETA}`, fontFamily: fontBody, fontWeight: 600 }}
              >
                Ver 1 día
              </button>
              <button
                onClick={() => setVerPorLote(true)}
                className="flex-1 py-2 rounded-lg text-xs"
                style={{ background: verPorLote ? VIOLETA : "transparent",
                         color: verPorLote ? "#FFFFFF" : VIOLETA,
                         border: `1.5px solid ${VIOLETA}`, fontFamily: fontBody, fontWeight: 600 }}
              >
                Ver {diasLote} días
              </button>
            </div>
          </div>
        )}
        {itemsMostrados.map((item, i) => {
            const Icono = item.Icono;
            return (
              <div key={i} className="rounded-2xl p-4" style={{ background: "#FFFFFF", border: "1.5px solid #E3DAF0" }}>
                <div className="flex items-center gap-3">
                  <div className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: PAPEL }}>
                    <Icono size={18} strokeWidth={1.6} style={{ color: VIOLETA }} />
                  </div>
                  <div className="flex-1">
                    <p className="text-[10px] tracking-[0.1em] uppercase" style={{ color: MALVA, fontFamily: "monospace" }}>{item.categoria}</p>
                    <p style={{ color: TINTA, fontFamily: fontDisplay, fontSize: 16 }}>{item.alimento}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span style={{ color: VIOLETA, fontFamily: fontDisplay, fontSize: 17 }}>{Math.round(item.gramos * multiplicador * 10) / 10}g</span>
                    {item.porque && (
                      <button onClick={() => { setPorqueAbierto(porqueAbierto === i ? null : i); setEditorAbierto(null); setComoAbierto(null); }}>
                        <Info size={16} style={{ color: porqueAbierto === i ? ROSA : "#C9BEDD" }} />
                      </button>
                    )}
                    {i < itemsBase.length && (categoriasDisponibles || CATEGORIAS_ALIMENTO)[item.categoria] && (
                      <button onClick={() => {
                          setEditorAbierto(editorAbierto && editorAbierto.itemIdx === i ? null : { itemIdx: i, categoria: item.categoria, especie: null });
                          setPorqueAbierto(null);
                          setComoAbierto(null);
                        }}>
                        <Pencil size={15} style={{ color: editorAbierto && editorAbierto.itemIdx === i ? ROSA : "#C9BEDD" }} />
                      </button>
                    )}
                    {INSTRUCCIONES_POR_CATEGORIA[item.categoria] && (
                      <button onClick={() => { setComoAbierto(comoAbierto === i ? null : i); setPorqueAbierto(null); setEditorAbierto(null); }}>
                        <UtensilsCrossed size={15} style={{ color: comoAbierto === i ? ROSA : "#C9BEDD" }} />
                      </button>
                    )}
                    {/* Quitar suplementos se retiro a proposito: el usuario
                        solo modifica, no elimina. Si quiere un menu a su
                        medida, para eso esta el modo Personalizar. */}
                  </div>
                </div>
                {editorAbierto && editorAbierto.itemIdx === i && !editorAbierto.especie && (
                  <div className="mt-3 pt-3" style={{ borderTop: "1px solid #F0ECF7" }}>
                    <p className="text-xs mb-2" style={{ color: MALVA, fontFamily: "monospace" }}>CAMBIAR POR</p>
                    <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto">
                      {Object.keys((categoriasDisponibles || CATEGORIAS_ALIMENTO)[editorAbierto.categoria]).map((especie) => {
                        const opciones = (categoriasDisponibles || CATEGORIAS_ALIMENTO)[editorAbierto.categoria][especie];
                        return (
                          <button key={especie} onClick={() => {
                              if (opciones.length === 1) cambiarAlimento(i, opciones[0]);
                              else setEditorAbierto({ ...editorAbierto, especie });
                            }}
                            className="text-left px-3 py-2 rounded-lg text-sm" style={{ color: TINTA, fontFamily: fontBody, background: PAPEL }}>
                            {especie}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                {editorAbierto && editorAbierto.itemIdx === i && editorAbierto.especie && (
                  <div className="mt-3 pt-3" style={{ borderTop: "1px solid #F0ECF7" }}>
                    <p className="text-xs mb-2" style={{ color: MALVA, fontFamily: "monospace" }}>{editorAbierto.especie.toUpperCase()}</p>
                    <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto">
                      {(categoriasDisponibles || CATEGORIAS_ALIMENTO)[editorAbierto.categoria][editorAbierto.especie].map((alimento) => (
                        <button key={alimento} onClick={() => cambiarAlimento(i, alimento)}
                          className="text-left px-3 py-2 rounded-lg text-sm" style={{ color: TINTA, fontFamily: fontBody, background: PAPEL }}>
                          {alimento}
                        </button>
                      ))}
                    </div>
                    <button onClick={() => setEditorAbierto({ ...editorAbierto, especie: null })} className="text-xs mt-2" style={{ color: MALVA, fontFamily: fontBody }}>← Otra especie</button>
                  </div>
                )}
                {item.porque && porqueAbierto === i && (
                  <div className="mt-3 pt-3 flex gap-2 items-start" style={{ borderTop: "1px solid #F0ECF7" }}>
                    <Info size={14} style={{ color: ROSA, flexShrink: 0, marginTop: 2 }} />
                    <p className="text-xs" style={{ color: MALVA, fontFamily: fontBody }}>Hoy toca más de esto porque {item.porque}.</p>
                  </div>
                )}
                {comoAbierto === i && (
                  <div className="mt-3 pt-3" style={{ borderTop: "1px solid #F0ECF7" }}>
                    <div className="flex gap-2 items-start">
                      <UtensilsCrossed size={14} style={{ color: VIOLETA, flexShrink: 0, marginTop: 2 }} />
                      <p className="text-xs" style={{ color: TINTA, fontFamily: fontBody }}>{INSTRUCCIONES_POR_CATEGORIA[item.categoria]}</p>
                    </div>
                    {COMO_DAR_ALIMENTO[item.alimento] && (
                      <div className="mt-2.5 p-2.5 rounded-xl" style={{ background: PAPEL }}>
                        <p className="text-[10px] tracking-[0.1em] uppercase mb-1" style={{ color: MALVA, fontFamily: "monospace" }}>
                          Este alimento en concreto
                        </p>
                        <p className="text-xs mb-1" style={{ color: TINTA, fontFamily: fontBody }}>
                          {COMO_DAR_ALIMENTO[item.alimento].como}
                        </p>
                        <p className="text-xs" style={{ color: MALVA, fontFamily: fontBody }}>
                          Como referencia, {COMO_DAR_ALIMENTO[item.alimento].pieza} — con los {Math.round(item.gramos * 10) / 10} g de hoy te haces una idea de cuánto es.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {recienRecalculado && (
          <div className="rounded-xl p-3 mb-4 flex gap-2 items-center" style={{ background: VERDE }}>
            <CheckCircle2 size={14} style={{ color: VERDE_TEXTO, flexShrink: 0 }} />
            <p className="text-xs" style={{ color: TINTA, fontFamily: fontBody }}>
              Hemos recalculado los gramos y los nutrientes de todo el menú para que siga cuadrando.
            </p>
          </div>
        )}

        {!supAbierto && (
          <button
            onClick={() => setSupAbierto(true)}
            className="flex items-center gap-1.5 px-4 py-3 rounded-xl text-sm mb-6"
            style={{ background: "#FFFFFF", border: "1.5px dashed #C9BEDD", color: VIOLETA, fontFamily: fontBody }}
          >
            <Plus size={15} /> Añadir suplemento
          </button>
        )}

        {supAbierto && !supTipoAbierto && (
          <div className="rounded-xl p-3 mb-6" style={{ background: "#FFFFFF", border: "1.5px solid #E3DAF0" }}>
            <p className="text-xs mb-2" style={{ color: MALVA, fontFamily: "monospace" }}>TIPO DE SUPLEMENTO</p>
            <div className="flex flex-col gap-1.5 max-h-56 overflow-y-auto">
              {Object.keys(CATEGORIAS_ALIMENTO["Suplementos comerciales"]).map((tipo) => (
                <button key={tipo} onClick={() => setSupTipoAbierto(tipo)}
                  className="text-left px-3 py-2 rounded-lg text-sm" style={{ color: TINTA, fontFamily: fontBody, background: PAPEL }}>
                  {tipo}
                </button>
              ))}
            </div>
            <button onClick={() => setSupAbierto(false)} className="text-xs mt-2" style={{ color: MALVA, fontFamily: fontBody }}>Cancelar</button>
          </div>
        )}

        {supAbierto && supTipoAbierto && (
          <div className="rounded-xl p-3 mb-6" style={{ background: "#FFFFFF", border: "1.5px solid #E3DAF0" }}>
            <p className="text-xs mb-2" style={{ color: MALVA, fontFamily: "monospace" }}>{supTipoAbierto.toUpperCase()}</p>
            <div className="flex flex-col gap-1.5 max-h-56 overflow-y-auto">
              {CATEGORIAS_ALIMENTO["Suplementos comerciales"][supTipoAbierto].map((producto) => (
                <button key={producto} onClick={() => anadirSuplemento(supTipoAbierto, producto)}
                  className="text-left px-3 py-2 rounded-lg text-sm" style={{ color: TINTA, fontFamily: fontBody, background: PAPEL }}>
                  {producto}
                </button>
              ))}
            </div>
            <button onClick={() => setSupTipoAbierto(null)} className="text-xs mt-2" style={{ color: MALVA, fontFamily: fontBody }}>← Otra categoría</button>
          </div>
        )}

        <div className="flex-1" />
        <Curvita />
        <button
          onClick={() => setSemanaConfirmada(true)}
          className="w-full py-4 rounded-2xl text-base"
          style={{ background: ROSA, color: "#FFFFFF", fontFamily: fontBody, fontWeight: 700 }}
        >
          Confirmar semana
        </button>
      </div>

      {/* SELECTOR RAPIDO DE MASCOTA */}
      {selectorMascotaAbierto && (
        <div className="fixed inset-0 z-50 flex items-start justify-end" style={{ background: "rgba(35,21,57,0.4)" }} onClick={() => setSelectorMascotaAbierto(false)}>
          <div className="mt-16 mr-6 w-64 rounded-2xl p-3" style={{ background: "#FFFFFF" }} onClick={(e) => e.stopPropagation()}>
            <p className="text-[10px] tracking-[0.1em] uppercase mb-2 px-2" style={{ color: MALVA, fontFamily: "monospace" }}>Tus mascotas</p>
            <div className="w-full flex items-center gap-3 p-2 rounded-xl mb-1" style={{ background: "#F0ECF7" }}>
              <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: VIOLETA }}>
                <Dog size={16} style={{ color: ROSA }} />
              </div>
              <div className="flex-1 text-left">
                <p style={{ color: TINTA, fontFamily: fontDisplay, fontSize: 15 }}>{nombrePerro}</p>
              </div>
              <div className="w-2 h-2 rounded-full" style={{ background: ROSA }} />
            </div>
            <button className="w-full flex items-center gap-2 p-2 rounded-xl mt-1" style={{ color: VIOLETA, fontFamily: fontBody, fontWeight: 700 }}>
              <Plus size={16} /> Añadir mascota
            </button>
          </div>
        </div>
      )}

      {/* MENU LATERAL DE HAMBURGUESA */}
      {menuLateralAbierto && (
        // z-[60]: por encima de las secciones (z-50), si no quedaria tapado
        // al abrirlo desde dentro de Perfil o Evolucion
        <div className="fixed inset-0 z-[60] flex" style={{ background: "rgba(35,21,57,0.4)" }} onClick={() => setMenuLateralAbierto(false)}>
          <div className="w-[78%] max-w-xs h-full flex flex-col" style={{ background: "#FFFFFF" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ background: VIOLETA }} className="px-6 pt-10 pb-6 flex items-center justify-between">
              <div>
                <p className="text-xl" style={{ color: "#FFFFFF", fontFamily: fontDisplay }}>{nombrePerro}</p>
                <p className="text-xs" style={{ color: MALVA, fontFamily: fontBody }}>{etapaLabel}</p>
              </div>
              <button onClick={() => setMenuLateralAbierto(false)}><X size={22} style={{ color: "#FFFFFF" }} /></button>
            </div>
            <div className="flex-1 px-3 pt-4">
              {[
                { key: "perfil", Icono: Dog, label: `Perfil de ${nombrePerro}` },
                { key: "evolucion", Icono: TrendingUp, label: "Evolución y crecimiento" },
                { key: "menus", Icono: ClipboardList, label: "Mis menús" },
                { key: "analizar", Icono: Search, label: "Analizar la dieta actual" },
                { key: "porque", Icono: Heart, label: "Por qué CANISLAB" },
              ].map((op) => {
                const Icono = op.Icono;
                return (
                  <button key={op.key} onClick={() => { setSeccionActiva(op.key); setMenuLateralAbierto(false); }} className="w-full flex items-center gap-3 px-3 py-3.5 rounded-xl">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: PAPEL }}>
                      <Icono size={17} strokeWidth={1.6} style={{ color: VIOLETA }} />
                    </div>
                    <span className="flex-1 text-left" style={{ color: TINTA, fontFamily: fontDisplay, fontSize: 16 }}>{op.label}</span>
                    <ChevronRight size={16} style={{ color: "#C9BEDD" }} />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* PERFIL */}
      {seccionActiva === "perfil" && (
        <div className="fixed inset-0 z-50 flex flex-col px-6 pt-10 pb-8 overflow-y-auto" style={{ background: PAPEL }}>
          <div className="flex items-center justify-between mb-6">
            <button onClick={() => setSeccionActiva(null)} className="text-sm text-left" style={{ color: MALVA, fontFamily: fontBody }}>← Volver a los menús</button>
            {/* La hamburguesa tambien aqui dentro: antes, estando en Perfil
                habia que volver atras para poder ir a Evolucion. */}
            <button onClick={() => setMenuLateralAbierto(true)} className="p-1">
              <Menu size={20} style={{ color: VIOLETA }} />
            </button>
          </div>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: VIOLETA }}>
              <Dog size={26} style={{ color: ROSA }} />
            </div>
            <div>
              <p className="text-2xl" style={{ color: TINTA, fontFamily: fontDisplay }}>{nombrePerro}</p>
              <p className="text-xs" style={{ color: MALVA, fontFamily: fontBody }}>{perfil?.raza?.nombre || "Raza no especificada"}</p>
            </div>
          </div>
          {[
            { label: "Peso actual", valor: `${perfil?.pesoActual || "-"}kg` },
            { label: "Etapa actual", valor: etapaLabel },
            { label: "Actividad", valor: ["Sedentario", "Normal", "Activo", "Muy activo", "Trabajo"][perfil?.actividadIdx] || "Normal" },
            { label: "Esterilizado", valor: perfil?.esterilizado === "si" ? "Sí" : "No" },
            { label: "Alergias", valor: (perfil?.alergias || []).map((a) => a.alimento.replace("Todo: ", "")).join(", ") || "Ninguna" },
          ].map((campo) => (
            <div key={campo.label} className="flex items-center justify-between py-3" style={{ borderBottom: "1px solid #F0ECF7" }}>
              <span className="text-sm" style={{ color: MALVA, fontFamily: fontBody }}>{campo.label}</span>
              <span style={{ color: TINTA, fontFamily: fontDisplay, fontSize: 15 }}>{campo.valor}</span>
            </div>
          ))}
        </div>
      )}

      {/* EVOLUCION Y CRECIMIENTO */}
      {seccionActiva === "evolucion" && (
        <div className="fixed inset-0 z-50 flex flex-col px-6 pt-10 pb-8 overflow-y-auto" style={{ background: PAPEL }}>
          <div className="flex items-center justify-between mb-6">
            <button onClick={() => setSeccionActiva(null)} className="text-sm text-left" style={{ color: MALVA, fontFamily: fontBody }}>← Volver a los menús</button>
            {/* La hamburguesa tambien aqui dentro: antes, estando en Perfil
                habia que volver atras para poder ir a Evolucion. */}
            <button onClick={() => setMenuLateralAbierto(true)} className="p-1">
              <Menu size={20} style={{ color: VIOLETA }} />
            </button>
          </div>
          <p className="text-2xl mb-1" style={{ color: TINTA, fontFamily: fontDisplay }}>Evolución de {nombrePerro}</p>
          <p className="text-xs mb-6" style={{ color: MALVA, fontFamily: fontBody }}>Peso esperado vs. peso real registrado</p>
          <div className="rounded-2xl p-4 mb-5" style={{ background: "#FFFFFF", border: "1.5px solid #E3DAF0" }}>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={Array.from({ length: 12 }, (_, i) => ({
                mes: i + 1,
                esperado: pesoEsperado(i + 1, pesoAdultoEsperado),
                real: i + 1 === (edad?.totalMeses || 0) ? Number(perfil?.pesoActual) : null,
              }))}>
                <CartesianGrid stroke="#F0ECF7" />
                <XAxis dataKey="mes" tick={{ fontSize: 11, fill: MALVA }} />
                <YAxis tick={{ fontSize: 11, fill: MALVA }} unit="kg" />
                <Tooltip />
                <Line type="monotone" dataKey="esperado" stroke="#D8CFEC" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="real" stroke={ROSA} strokeWidth={2} dot={{ r: 4, fill: ROSA }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="rounded-2xl p-4 mb-5" style={{ background: "#FFFFFF", border: "1.5px solid #E3DAF0" }}>
            <p style={{ color: VIOLETA, fontFamily: fontDisplay, fontSize: 28 }}>{perfil?.pesoActual}kg</p>
            <p className="text-xs mt-1" style={{ color: MALVA, fontFamily: fontBody }}>Necesidad calculada con este peso: <b style={{ color: TINTA }}>{derReal}kcal/día</b></p>
            {/* Bermingham 2014 (metaanalisis, 713 perros): la desviacion tipica
                del gasto real es del 38%. Ninguna formula acierta con un perro
                concreto; el ajuste se hace pesando. Hay que decirlo. */}
            <p className="text-xs mt-2 leading-snug" style={{ color: MALVA, fontFamily: fontBody }}>
              Es un <b style={{ color: TINTA }}>punto de partida</b>. Dos perros iguales
              pueden necesitar hasta un 38% más o menos. Pésalo cada 2-3 semanas y ajusta
              la cantidad según cómo lo veas.
            </p>
          </div>
          <div className="flex gap-2 mb-2">
            <input type="number" inputMode="decimal" value={nuevoPeso} onChange={(e) => setNuevoPeso(e.target.value)} placeholder="ej. 18.5"
              className="flex-1 text-lg py-3 px-4 rounded-xl outline-none" style={{ background: "#FFFFFF", border: "1.5px solid #E3DAF0", color: TINTA, fontFamily: fontDisplay }} />
            <button onClick={() => { if (Number(nuevoPeso) > 0) { set("pesoActual", nuevoPeso); setNuevoPeso(""); } }}
              className="px-5 rounded-xl" style={{ background: ROSA, color: "#FFFFFF", fontFamily: fontBody, fontWeight: 700 }}>Guardar</button>
          </div>
          <p className="text-xs" style={{ color: MALVA, fontFamily: fontBody }}>Al guardar, este pasa a ser el peso actual — las kcal se recalculan solas.</p>
        </div>
      )}

      {/* MIS MENUS */}
      {seccionActiva === "menus" && (
        <div className="fixed inset-0 z-50 flex flex-col px-6 pt-10 pb-8" style={{ background: PAPEL }}>
          <div className="flex items-center justify-between mb-6">
            <button onClick={() => setSeccionActiva(null)} className="text-sm text-left" style={{ color: MALVA, fontFamily: fontBody }}>← Volver a los menús</button>
            {/* La hamburguesa tambien aqui dentro: antes, estando en Perfil
                habia que volver atras para poder ir a Evolucion. */}
            <button onClick={() => setMenuLateralAbierto(true)} className="p-1">
              <Menu size={20} style={{ color: VIOLETA }} />
            </button>
          </div>
          <p className="text-2xl mb-4" style={{ color: TINTA, fontFamily: fontDisplay }}>Mis menús</p>
          <div className="flex flex-col gap-2">
            {menus.map((m) => (
              <button key={m.id} onClick={() => { setTabActiva(m.id); setSeccionActiva(null); }} className="flex items-center gap-3 p-4 rounded-2xl text-left" style={{ background: "#FFFFFF", border: "1.5px solid #E3DAF0" }}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: VIOLETA }}>
                  <ClipboardList size={16} style={{ color: ROSA }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p style={{ color: TINTA, fontFamily: fontDisplay, fontSize: 16 }}>{m.nombre} · {m.kcal}kcal</p>
                  {/* De que tipo es este menu: automatico, personalizado o
                      hecho con lo que el usuario ya tenia */}
                  <p className="text-[10px] tracking-[0.1em] uppercase mt-0.5" style={{ color: MALVA, fontFamily: "monospace" }}>
                    {ETIQUETA_MODO[modo] || "AUTOMÁTICO"}
                  </p>
                </div>
                <ChevronRight size={16} style={{ color: "#C9BEDD" }} />
              </button>
            ))}

            {/* Crear otro menu: el perro ya esta configurado, asi que se va
                directo a elegir el tipo, sin repetir el onboarding */}
            <button
              onClick={() => { setSeccionActiva(null); onVolver(); }}
              className="flex items-center gap-3 p-4 rounded-2xl text-left mt-1"
              style={{ background: "transparent", border: "1.5px dashed #C9BEDD" }}
            >
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: PAPEL }}>
                <Plus size={17} style={{ color: VIOLETA }} />
              </div>
              <div className="flex-1 min-w-0">
                <p style={{ color: VIOLETA, fontFamily: fontDisplay, fontSize: 16 }}>Crear otro menú</p>
                <p className="text-xs" style={{ color: MALVA, fontFamily: fontBody }}>
                  Automático, personalizado o con lo que tengas en casa
                </p>
              </div>
              <ChevronRight size={16} style={{ color: "#C9BEDD" }} />
            </button>
          </div>
        </div>
      )}

      {/* POR QUE CANISLAB */}
      {seccionActiva === "porque" && (
        <div className="fixed inset-0 z-50 flex flex-col px-6 pt-10 pb-8 overflow-y-auto" style={{ background: PAPEL }}>
          <div className="flex items-center justify-between mb-6">
            <button onClick={() => setSeccionActiva(null)} className="text-sm text-left" style={{ color: MALVA, fontFamily: fontBody }}>← Volver a los menús</button>
            {/* La hamburguesa tambien aqui dentro: antes, estando en Perfil
                habia que volver atras para poder ir a Evolucion. */}
            <button onClick={() => setMenuLateralAbierto(true)} className="p-1">
              <Menu size={20} style={{ color: VIOLETA }} />
            </button>
          </div>
          <p className="text-2xl mb-5" style={{ color: TINTA, fontFamily: fontDisplay }}>Por qué CANISLAB</p>
          <p className="text-sm leading-relaxed mb-4" style={{ color: TINTA, fontFamily: fontBody }}>
            Cuando decidí alimentar a mi perro con BARF, mi mayor preocupación era hacerlo bien. Quería ofrecerle
            una alimentación natural, pero también tener la seguridad de que estaba recibiendo todos los nutrientes
            que necesitaba.
          </p>
          <p className="text-sm leading-relaxed mb-4" style={{ color: TINTA, fontFamily: fontBody }}>
            Al investigar descubrí que la mayoría de recomendaciones se basaban en un porcentaje del peso del perro
            según su edad o etapa de crecimiento. Pero surgió una duda: si cada menú tiene una composición y un
            aporte energético diferente, ¿por qué todos iban a necesitar la misma cantidad?
          </p>
          <p className="text-sm leading-relaxed" style={{ color: TINTA, fontFamily: fontBody }}>
            Así nació CANISLAB: una herramienta creada para calcular la ración de forma más precisa, teniendo en
            cuenta las necesidades reales de cada perro y la composición de cada menú. Porque alimentar de forma
            natural también debería ser alimentar con conocimiento.
          </p>
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl mt-4" style={{ background: "#F0ECF7" }}>
            <Heart size={14} style={{ color: VIOLETA, flexShrink: 0 }} />
            <p className="text-xs" style={{ color: TINTA, fontFamily: fontBody }}>Basado en las tablas de FEDIAF, la autoridad europea de nutrición canina.</p>
          </div>
        </div>
      )}

      {seccionActiva === "analizar" && (
        <div className="fixed inset-0 z-50 flex flex-col px-6 pt-10 pb-8 overflow-y-auto" style={{ background: PAPEL }}>
          <button onClick={() => { setSeccionActiva(null); setResultadoAnalisis(null); setErrorAnalisis(null); }} className="text-sm mb-6 text-left" style={{ color: MALVA, fontFamily: fontBody }}>← Volver</button>
          <p className="text-2xl mb-2" style={{ color: TINTA, fontFamily: fontDisplay }}>Analizar la dieta actual</p>
          <p className="text-sm leading-relaxed mb-5" style={{ color: MALVA, fontFamily: fontBody }}>
            Dinos qué le estás dando a {nombrePerro} ahora mismo y cuántos gramos de cada cosa.
            Lo comparamos con lo que necesita y te decimos qué está bien y qué no.
          </p>

          <div className="px-4 py-3 rounded-xl mb-5" style={{ background: "#F0ECF7" }}>
            <p className="text-xs" style={{ color: TINTA, fontFamily: fontBody }}>
              Usamos el perfil de {nombrePerro}: {etapaLabel}, {derReal} kcal al día.
            </p>
          </div>

          <SelectorAlimentos
            lista={dietaAnalizar}
            onAnadir={(it) => setDietaAnalizar((prev) => [...prev, { ...it, gramos: "" }])}
            onQuitar={(idx) => setDietaAnalizar((prev) => prev.filter((_, i) => i !== idx))}
            idGrupo="analizar"
            estadoAbierto={abiertoAnalizar}
            setEstadoAbierto={setAbiertoAnalizar}
            categorias={categoriasDisponibles}
          />

          {dietaAnalizar.length > 0 && (
            <div className="mt-4 mb-5">
              <p className="text-xs mb-2" style={{ color: MALVA, fontFamily: fontMono, letterSpacing: "0.08em" }}>GRAMOS AL DÍA DE CADA UNO</p>
              {dietaAnalizar.map((it, idx) => (
                <div key={idx} className="flex items-center gap-3 mb-2 px-3 py-2.5 rounded-xl" style={{ background: "#FFFFFF", border: "1.5px solid #E3DAF0" }}>
                  <span className="flex-1 text-sm" style={{ color: TINTA, fontFamily: fontBody }}>{it.alimento}</span>
                  <input
                    type="number" inputMode="numeric" min="0" placeholder="0"
                    value={it.gramos}
                    onChange={(e) => setDietaAnalizar((prev) => prev.map((x, i) => i === idx ? { ...x, gramos: e.target.value } : x))}
                    className="w-20 text-right text-sm px-2 py-1.5 rounded-lg"
                    style={{ border: "1.5px solid #E3DAF0", color: VIOLETA, fontFamily: fontMono }}
                  />
                  <span className="text-xs" style={{ color: MALVA, fontFamily: fontBody }}>g</span>
                </div>
              ))}
              <p className="text-xs mt-2" style={{ color: MALVA, fontFamily: fontBody }}>
                Total: {dietaAnalizar.reduce((s, i) => s + (Number(i.gramos) || 0), 0)} g al día
              </p>
            </div>
          )}

          <button
            onClick={analizarDietaActual}
            disabled={analizando}
            className="w-full py-3.5 rounded-xl text-sm mb-4"
            style={{ background: analizando ? MALVA : ROSA, color: "#FFFFFF", fontFamily: fontBody }}
          >
            {analizando ? "Analizando…" : "Analizar esta dieta"}
          </button>

          {errorAnalisis && (
            <div className="flex items-start gap-2 px-4 py-3 rounded-xl mb-4" style={{ background: "#FFF0F3" }}>
              <AlertCircle size={15} style={{ color: ROSA, flexShrink: 0, marginTop: 1 }} />
              <p className="text-xs" style={{ color: TINTA, fontFamily: fontBody }}>{errorAnalisis}</p>
            </div>
          )}

          {resultadoAnalisis && (
            <div className="mb-4">
              <div className="px-4 py-4 rounded-2xl mb-4" style={{ background: VIOLETA }}>
                <p className="text-base leading-snug" style={{ color: "#FFFFFF", fontFamily: fontDisplay }}>
                  {resultadoAnalisis.veredicto}
                </p>
              </div>

              <div className="px-4 py-3.5 rounded-xl mb-3" style={{ background: "#FFFFFF", border: "1.5px solid #E3DAF0" }}>
                <p className="text-xs mb-1" style={{ color: MALVA, fontFamily: fontMono, letterSpacing: "0.08em" }}>ENERGÍA</p>
                <p className="text-sm leading-relaxed" style={{ color: TINTA, fontFamily: fontBody }}>
                  {resultadoAnalisis.energia.texto}
                </p>
                <p className="text-xs mt-1.5" style={{ color: MALVA, fontFamily: fontBody }}>
                  Aporta {resultadoAnalisis.energia.aporta_kcal} kcal · necesita {resultadoAnalisis.energia.necesita_kcal} kcal
                </p>
              </div>

              {resultadoAnalisis.sobran.length > 0 && (
                <div className="px-4 py-3.5 rounded-xl mb-3" style={{ background: "#FFF0F3", border: "1.5px solid #FFD5DE" }}>
                  <p className="text-xs mb-2" style={{ color: ROSA, fontFamily: fontMono, letterSpacing: "0.08em" }}>SE PASA DE LO RECOMENDADO</p>
                  {resultadoAnalisis.sobran.map((s) => (
                    <div key={s.nutriente} className="mb-2.5">
                      <p className="text-sm" style={{ color: TINTA, fontFamily: fontBody }}>
                        {s.nutriente}: {s.del_maximo_pct}% del máximo
                      </p>
                      {s.por_que_importa && (
                        <p className="text-xs mt-0.5 leading-relaxed" style={{ color: "#7A6A88", fontFamily: fontBody }}>{s.por_que_importa}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {resultadoAnalisis.faltan.length > 0 && (
                <div className="px-4 py-3.5 rounded-xl mb-3" style={{ background: "#FFFFFF", border: "1.5px solid #E3DAF0" }}>
                  <p className="text-xs mb-2" style={{ color: MALVA, fontFamily: fontMono, letterSpacing: "0.08em" }}>LE FALTA ({resultadoAnalisis.faltan.length})</p>
                  {resultadoAnalisis.faltan.map((f) => (
                    <div key={f.nutriente} className="mb-2.5">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full" style={{ background: "#EDE7F3" }}>
                          <div className="h-full rounded-full" style={{ width: `${Math.min(100, f.cubre_pct)}%`, background: ROSA }} />
                        </div>
                        <span className="text-xs w-10 text-right" style={{ color: ROSA, fontFamily: fontMono }}>{f.cubre_pct}%</span>
                      </div>
                      <p className="text-sm mt-1" style={{ color: TINTA, fontFamily: fontBody }}>{f.nutriente}</p>
                      {f.de_donde && (
                        <p className="text-xs leading-relaxed" style={{ color: "#7A6A88", fontFamily: fontBody }}>Suele venir de {f.de_donde}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div className="px-4 py-3.5 rounded-xl mb-3" style={{ background: "#FFFFFF", border: "1.5px solid #E3DAF0" }}>
                <p className="text-xs mb-2" style={{ color: MALVA, fontFamily: fontMono, letterSpacing: "0.08em" }}>CÓMO REPARTE LOS GRAMOS</p>
                {resultadoAnalisis.reparto.map((r) => (
                  <div key={r.categoria} className="flex items-center justify-between mb-1">
                    <span className="text-sm" style={{ color: TINTA, fontFamily: fontBody }}>{r.categoria}</span>
                    <span className="text-xs" style={{ color: MALVA, fontFamily: fontMono }}>{r.gramos} g · {r.pct}%</span>
                  </div>
                ))}
                {resultadoAnalisis.calcio_fosforo.ratio && (
                  <p className="text-xs mt-2.5" style={{ color: resultadoAnalisis.calcio_fosforo.correcto ? "#5A9367" : ROSA, fontFamily: fontBody }}>
                    Calcio:fósforo {resultadoAnalisis.calcio_fosforo.ratio}:1 — {resultadoAnalisis.calcio_fosforo.correcto ? "dentro de lo recomendado" : "fuera de lo recomendado"} ({resultadoAnalisis.calcio_fosforo.referencia})
                  </p>
                )}
              </div>

              <p className="text-xs mb-3" style={{ color: MALVA, fontFamily: fontBody }}>
                {resultadoAnalisis.correctos} de {resultadoAnalisis.total_comprobados} nutrientes están correctos.
              </p>

              <div className="flex items-start gap-2 px-4 py-3 rounded-xl" style={{ background: "#F0ECF7" }}>
                <Info size={14} style={{ color: VIOLETA, flexShrink: 0, marginTop: 1 }} />
                <p className="text-xs leading-relaxed" style={{ color: TINTA, fontFamily: fontBody }}>{resultadoAnalisis.aviso}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* PANTALLA DE CONFIRMACION — tras pulsar "Confirmar semana" */}
      {semanaConfirmada && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center px-6 text-center overflow-y-auto" style={{ background: PAPEL }}>
          <div className="w-16 h-16 rounded-full flex items-center justify-center mb-5" style={{ background: VIOLETA }}>
            <Dog size={30} strokeWidth={1.4} style={{ color: ROSA }} />
          </div>
          <p className="text-2xl mb-1" style={{ color: VIOLETA, fontFamily: fontDisplay, fontWeight: 600 }}>
            ¡Todo listo!
          </p>
          <p className="text-sm mb-2" style={{ color: MALVA, fontFamily: fontBody }}>
            Hemos guardado la semana de {nombrePerro}
          </p>
          <p className="text-xs mb-7 max-w-xs" style={{ color: MALVA, fontFamily: fontBody }}>
            Puedes seguir cambiando lo que quieras cuando quieras: los gramos se recalculan solos.
          </p>

          <div className="flex flex-col gap-2 w-full max-w-sm">
            <button
              onClick={() => setSemanaConfirmada(false)}
              className="flex items-center gap-3 p-4 rounded-2xl text-left"
              style={{ background: "#FFFFFF", border: "1.5px solid #E3DAF0" }}
            >
              <div className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: PAPEL }}>
                <ClipboardList size={18} strokeWidth={1.6} style={{ color: VIOLETA }} />
              </div>
              <span className="flex-1" style={{ color: TINTA, fontFamily: fontDisplay, fontSize: 16 }}>
                Volver a los menús
              </span>
              <ChevronRight size={18} style={{ color: "#C9BEDD" }} />
            </button>

            <button
              onClick={() => { setSemanaConfirmada(false); setSeccionActiva("perfil"); }}
              className="flex items-center gap-3 p-4 rounded-2xl text-left"
              style={{ background: "#FFFFFF", border: "1.5px solid #E3DAF0" }}
            >
              <div className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: PAPEL }}>
                <Dog size={18} strokeWidth={1.6} style={{ color: VIOLETA }} />
              </div>
              <span className="flex-1" style={{ color: TINTA, fontFamily: fontDisplay, fontSize: 16 }}>
                Ver el perfil de {nombrePerro}
              </span>
              <ChevronRight size={18} style={{ color: "#C9BEDD" }} />
            </button>

            <button
              onClick={() => { setSemanaConfirmada(false); setSeccionActiva("analizar"); }}
              className="flex items-center gap-3 p-4 rounded-2xl text-left"
              style={{ background: "#FFFFFF", border: "1.5px solid #E3DAF0" }}
            >
              <div className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: PAPEL }}>
                <Search size={18} strokeWidth={1.6} style={{ color: VIOLETA }} />
              </div>
              <span className="flex-1" style={{ color: TINTA, fontFamily: fontDisplay, fontSize: 16 }}>
                Analizar otra dieta
              </span>
              <ChevronRight size={18} style={{ color: "#C9BEDD" }} />
            </button>
          </div>

          <div className="mt-8">
            <svg width="180" height="34" viewBox="0 0 180 34" fill="none">
              <path d="M0 30 C 30 28, 45 16, 70 13 S 120 5, 180 2" stroke={ROSA} strokeWidth="2" strokeLinecap="round" fill="none" />
              <circle cx="180" cy="2" r="3" fill={ROSA} />
            </svg>
          </div>
        </div>
      )}
    </div>
  );
}

function BotonPrincipal({ activo, onClick, texto }) {
  return (
    <button
      onClick={onClick}
      disabled={!activo}
      className="w-full py-4 rounded-2xl text-base transition-all"
      style={{ background: activo ? ROSA : "#EDE6F5", color: activo ? "#FFFFFF" : "#B6ABC9", fontFamily: fontBody, fontWeight: 700 }}
    >
      {texto}
    </button>
  );
}

export default function CanislabOnboarding() {
  const [paso, setPaso] = useState(1);
  const [perfil, setPerfil] = useState({
    nombre: "",
    sexo: null,
    modoRaza: null,
    raza: null,
    tamanoManual: null,
    dia: 15,
    mesIdx: 1,
    anio: 2026,
    pesoActual: "",
    condicionIdx: 2,
    condicionTocado: true,
    actividadIdx: 1,
    actividadTocado: true,
    esterilizado: null,
    alergiaSi: null,
    alergias: [],
    otrosEvitarSi: null,
    otrosEvitar: [],
    patologiaSi: null,
    patologias: [],
  });
  const [categoriaAbierta, setCategoriaAbierta] = useState(null);
  const [busqueda, setBusqueda] = useState("");

  const [fase, setFase] = useState("onboarding"); // onboarding | generador
  const [menuReal, setMenuReal] = useState(null);
  const [menuCargando, setMenuCargando] = useState(false);
  const [menuError, setMenuError] = useState(null);
  const [necesitaVeterinario, setNecesitaVeterinario] = useState(false);
  const [menuDespertando, setMenuDespertando] = useState(false);
  const [dietaActual, setDietaActual] = useState(null);
  const [modo, setModo] = useState(null);
  const [pantalla, setPantalla] = useState("elegir"); // elegir | cuantos | resultado | aprovechar-input | personalizar

  const [numMenus, setNumMenus] = useState(3);

  const [itemsAprovechar, setItemsAprovechar] = useState([]);
  const [estadoAbiertoAprovechar, setEstadoAbiertoAprovechar] = useState(null);

  const [configPersonalizar, setConfigPersonalizar] = useState(
    Object.fromEntries(CATEGORIAS_ICONOS.map((c) => [c.nombre, { modo: c.nombre === "Suplementos comerciales" ? "no" : "auto", elegido: [] }]))
  );
  const [estadoAbiertoPersonalizar, setEstadoAbiertoPersonalizar] = useState(null);

  const irAModo = (m) => {
    setModo(m);
    if (m === "automatico") setPantalla("cuantos");
    if (m === "aprovechar") setPantalla("aprovechar-input");
    if (m === "personalizar") setPantalla("personalizar");
  };

  const volverAElegir = () => {
    setModo(null);
    setPantalla("elegir");
  };

  

  const set = (campo, valor) => setPerfil((p) => ({ ...p, [campo]: valor }));
  const siguiente = () => setPaso((p) => Math.min(TOTAL_PASOS + 1, p + 1));
  const atras = () => setPaso((p) => Math.max(1, p - 1));

  const resultadosRaza = useMemo(() => {
    if (!busqueda.trim()) return [];
    const q = busqueda.trim().toLowerCase();
    // con 136 razas, 6 resultados se quedaban muy cortos al buscar
    return RAZAS.filter((r) => r.nombre.toLowerCase().includes(q)).slice(0, 12);
  }, [busqueda]);

  const edad = useMemo(() => calcularEdad(perfil.dia, perfil.mesIdx, perfil.anio), [perfil.dia, perfil.mesIdx, perfil.anio]);
  const nombreMostrar = perfil.nombre.trim() || "tu perro";

  const especiesExcluidas = useMemo(() => especiesExcluidasDePerfil(perfil), [perfil.alergias, perfil.otrosEvitar]);
  const alimentosEvitados = useMemo(() => alimentosEvitadosDePerfil(perfil), [perfil.alergias, perfil.otrosEvitar]);
  const categoriasDisponibles = useMemo(
    () => filtrarCategoriasPorEspecies(CATEGORIAS_ALIMENTO, especiesExcluidas),
    [especiesExcluidas]
  );

  const pesoAdultoEsperado = perfil.raza?.pesoMedio || PESO_ADULTO_POR_TAMANO[perfil.tamanoManual] || 25;
  const etapaCalculada = useMemo(() => determinarEtapa(edad, pesoAdultoEsperado), [edad, pesoAdultoEsperado]);
  const ETAPA_LABEL = { cachorro_joven: "Cachorro muy joven", cachorro_crecimiento: "Cachorro en crecimiento", adulto: "Adulto", senior: "Senior" };
  const etapaLabel = ETAPA_LABEL[etapaCalculada] || "Adulto";
  const derReal = useMemo(
    () => calcularDER(Number(perfil.pesoActual), etapaCalculada, perfil.actividadIdx,
        perfil.esterilizado, {
          pesoAdultoKg: pesoAdultoEsperado,
          pesoIdealKg: pesoIdealDesdeCondicion(Number(perfil.pesoActual), perfil.condicionIdx),
          raza: perfil.raza?.nombre,
          machoEntero: perfil.sexo === "macho" && perfil.esterilizado !== "si",
        }),
    // OJO: el metodo europeo usa el peso adulto esperado (decide el tramo de
    // crecimiento), la raza (+-15 kcal/kg^0.75) y el sexo (macho entero +10).
    // Si no estan aqui, cambiar la raza NO recalcularia las kcal.
    [perfil.pesoActual, etapaCalculada, perfil.actividadIdx, perfil.esterilizado,
     pesoAdultoEsperado, perfil.raza?.nombre, perfil.sexo, perfil.condicionIdx]
  );

  // Llamada real a la API cuando estamos en la pantalla de resultado
  useEffect(() => {
    if (!(fase === "generador" && pantalla === "resultado" && derReal)) return;
    let cancelado = false;
    setMenuCargando(true);
    setMenuError(null);
    setNecesitaVeterinario(false);
    setMenuDespertando(false);

    // Se pide UN menu por cada uno que haya elegido el usuario. Cada llamada
    // usa su propia tirada de candidatos, asi los menus salen distintos entre
    // si (antes solo se pedia uno y numMenus se ignoraba).
    const pedirMenu = (especieBase, holgado = false) =>
      fetch(`${API_BASE}/menu`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombres_alimentos: construirCandidatos(modo, configPersonalizar, itemsAprovechar, especieBase, holgado),
          der_objetivo: derReal,
          etapa_requisitos: ETAPA_A_SUFIJO_API[etapaCalculada] || "Adulto",
          especies_excluidas: Array.from(especiesExcluidas),
          peso_perro_kg: perfil?.pesoActual ? Number(perfil.pesoActual) : null,
          forzar_presencia: eleccionesDelUsuario(modo, configPersonalizar, itemsAprovechar),
          nombres_excluidos: Array.from(alimentosEvitados),
          // Las patologias ajustan el menu (fosforo en renal, grasa en
          // pancreatitis...) y en las que dependen de analiticas impiden
          // generarlo. Se recogian en el perfil pero no llegaban al motor.
          patologias: perfil?.patologias || [],
          // activa el tope de calcio de raza grande en cachorros: en ellos el
          // exceso de calcio causa osteocondrosis y no lo pueden regular
          peso_adulto_esperado_kg: pesoAdultoEsperado || null,
        }),
      }).then((res) => res.json());

    // Cada menu gira en torno a una proteina base DISTINTA (ternera, pollo,
    // conejo...). Antes cada menu se sorteaba por separado y casi siempre
    // ganaba la misma carne, asi que pedir 3 menus daba 3 versiones de lo
    // mismo. En modo Automatico se rota; en Personalizar y Aprovechar manda
    // lo que el usuario haya elegido, asi que no se toca.
    let ultimaRespuesta = null;
    const pedirTodos = async () => {
      const especies = modo === "automatico" ? especiesBaseDisponibles(especiesExcluidas) : [null];
      // "Cuántos menús" solo se pregunta en Automático. En Personalizar y en
      // Aprovechar el usuario ya ha dicho qué quiere en ESE menú concreto, no
      // tiene sentido devolverle 3 variantes de lo mismo.
      const cuantos = modo === "automatico" ? numMenus : 1;
      const resultados = [];
      for (let i = 0; i < cuantos; i++) {
        const especieBase = especies[i % especies.length];
        let data = await pedirMenu(especieBase);
        // si con esa proteina concreta no cuadra, se reintenta sin restringir
        if (!data.factible && especieBase) data = await pedirMenu(null);
        // y si aun asi no sale, se le dan mas opciones al motor antes de
        // decirle al usuario que no se puede
        if (!data.factible) data = await pedirMenu(null, true);
        if (data.factible) resultados.push(data);
        else ultimaRespuesta = data;
      }
      return resultados;
    };

    const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    (async () => {
      const MAX_INTENTOS = 6; // ~60 segundos en total, lo que Render avisa que puede tardar en despertar
      for (let intento = 1; intento <= MAX_INTENTOS; intento++) {
        if (cancelado) return;
        try {
          const resultados = await pedirTodos();
          if (cancelado) return;
          if (resultados.length > 0) {
            setMenuReal(resultados);
          } else if (ultimaRespuesta?.requiere_veterinario) {
            // Cálculos de estruvita/cistina/urato: dependen del pH de la orina
            // y de analíticas que la app no ve. No es un fallo del cálculo, es
            // que aquí NO se debe generar un menú automático.
            setMenuError(ultimaRespuesta.motivo);
            setNecesitaVeterinario(true);
          } else {
            setMenuError("No se encontró una combinación posible con estos alimentos.");
          }
          setMenuCargando(false);
          return;
        } catch (err) {
          if (intento === MAX_INTENTOS) {
            if (!cancelado) {
              setMenuError(
                "No se ha podido conectar con el servidor. Comprueba tu conexión e inténtalo de nuevo en un momento."
              );
              setMenuCargando(false);
            }
            return;
          }
          setMenuDespertando(true);
          await esperar(10000); // el servidor gratuito puede tardar hasta ~50s en despertar
        }
      }
    })();

    return () => {
      cancelado = true;
    };
  }, [fase, pantalla, derReal, etapaCalculada, especiesExcluidas, modo, configPersonalizar, itemsAprovechar, numMenus, perfil, alimentosEvitados]);

  // ---------- PASO 1: Nombre + Sexo ----------
  if (paso === 1) {
    const puedeContinuar = perfil.nombre.trim().length > 0 && perfil.sexo !== null;
    return (
      <div className="min-h-screen w-full flex flex-col" style={{ background: PAPEL }}>
        <Fuentes />
        <Cabecera paso={1} titulo={<>Empecemos por<br />lo esencial.</>} />
        <div className="flex-1 px-6 pt-8 pb-6 flex flex-col">
          <div className="mb-8">
            <Etiqueta>Nombre del perro</Etiqueta>
            <input
              type="text"
              value={perfil.nombre}
              onChange={(e) => set("nombre", e.target.value)}
              placeholder="Nombre de tu perro"
              className="w-full text-2xl pb-3 outline-none bg-transparent"
              style={{ color: TINTA, fontFamily: fontDisplay, borderBottom: `2px solid ${perfil.nombre ? VIOLETA : "#E3DAF0"}` }}
            />
          </div>
          <div className="mb-6">
            <Etiqueta>Sexo</Etiqueta>
            <div className="grid grid-cols-2 gap-3">
              {[{ key: "macho", label: "Macho" }, { key: "hembra", label: "Hembra" }].map((op) => {
                const activo = perfil.sexo === op.key;
                return (
                  <button
                    key={op.key}
                    onClick={() => set("sexo", op.key)}
                    className="flex flex-col items-center justify-center gap-2 py-6 rounded-2xl transition-all"
                    style={{ background: activo ? VIOLETA : "#FFFFFF", border: `1.5px solid ${activo ? VIOLETA : "#E3DAF0"}` }}
                  >
                    <Dog size={26} strokeWidth={1.6} style={{ color: activo ? ROSA : "#C4B8DC" }} />
                    <span style={{ color: activo ? "#FFFFFF" : TINTA, fontFamily: fontDisplay }}>{op.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex-1" />
          <Curvita />
          <BotonContinuar activo={puedeContinuar} onClick={siguiente} />
          <button onClick={siguiente} className="text-xs text-center mt-3" style={{ color: "#D8CFEC", fontFamily: fontBody }}>Saltar (modo prueba)</button>
        </div>
      </div>
    );
  }

  // ---------- PASO 2: Raza/tamaño ----------
  if (paso === 2) {
    const puedeContinuar = (perfil.modoRaza === "raza" && perfil.raza) || (perfil.modoRaza === "sin_raza" && perfil.tamanoManual);
    return (
      <div className="min-h-screen w-full flex flex-col" style={{ background: PAPEL }}>
        <Fuentes />
        <Cabecera paso={2} titulo="¿De qué raza es?" />
        <div className="flex-1 px-6 pt-8 pb-6 flex flex-col">
          <BotonAtras onClick={atras} />

          {perfil.modoRaza === null && (
            <div className="flex flex-col gap-3">
              <button onClick={() => set("modoRaza", "raza")} className="text-left p-5 rounded-2xl" style={{ background: "#FFFFFF", border: "1.5px solid #E3DAF0" }}>
                <p style={{ color: TINTA, fontFamily: fontDisplay, fontSize: 18 }}>Sé la raza</p>
                <p className="text-sm mt-1" style={{ color: MALVA, fontFamily: fontBody }}>Busca la raza y rellenamos tamaño y peso esperado por ti</p>
              </button>
              <button onClick={() => set("modoRaza", "sin_raza")} className="text-left p-5 rounded-2xl" style={{ background: "#FFFFFF", border: "1.5px solid #E3DAF0" }}>
                <p style={{ color: TINTA, fontFamily: fontDisplay, fontSize: 18 }}>Es mestizo / no lo sé</p>
                <p className="text-sm mt-1" style={{ color: MALVA, fontFamily: fontBody }}>Elige directamente el tamaño que tendrá o tiene de adulto</p>
              </button>
            </div>
          )}

          {perfil.modoRaza === "raza" && !perfil.raza && (
            <div>
              <div className="relative mb-3">
                <Search size={18} style={{ position: "absolute", left: 14, top: 15, color: MALVA }} />
                <input
                  autoFocus
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Escribe la raza..."
                  className="w-full text-base py-3.5 pl-11 pr-4 rounded-xl outline-none"
                  style={{ background: "#FFFFFF", border: "1.5px solid #E3DAF0", color: TINTA, fontFamily: fontBody }}
                />
              </div>
              <div className="flex flex-col gap-2">
                {resultadosRaza.map((r) => (
                  <button key={r.nombre} onClick={() => set("raza", r)} className="text-left px-4 py-3 rounded-xl flex items-center justify-between" style={{ background: "#FFFFFF", border: "1.5px solid #E3DAF0" }}>
                    <span style={{ color: TINTA, fontFamily: fontDisplay }}>{r.nombre}</span>
                    <span className="text-xs" style={{ color: MALVA, fontFamily: "monospace" }}>{r.tamano} · ~{r.pesoMedio}kg</span>
                  </button>
                ))}
                {busqueda.trim() && resultadosRaza.length === 0 && (
                  <p className="text-sm text-center py-4" style={{ color: MALVA, fontFamily: fontBody }}>
                    No la encontramos.{" "}
                    <button onClick={() => set("modoRaza", "sin_raza")} style={{ color: ROSA, fontWeight: 700 }}>Elegir tamaño a mano</button>
                  </p>
                )}
              </div>
              <button onClick={() => set("modoRaza", null)} className="text-sm mt-4" style={{ color: MALVA, fontFamily: fontBody }}>← Volver</button>
            </div>
          )}

          {perfil.modoRaza === "raza" && perfil.raza && (
            <div>
              <div className="p-5 rounded-2xl mb-6" style={{ background: VIOLETA }}>
                <div className="flex items-center gap-2 mb-2">
                  <Check size={18} style={{ color: ROSA }} />
                  <span style={{ color: "#FFFFFF", fontFamily: fontDisplay, fontSize: 19 }}>{perfil.raza.nombre}</span>
                </div>
                <p className="text-sm" style={{ color: MALVA, fontFamily: fontBody }}>
                  Tamaño <b style={{ color: "#FFFFFF" }}>{perfil.raza.tamano}</b> · peso adulto esperado{" "}
                  <b style={{ color: "#FFFFFF" }}>{perfil.raza.pesoMin}–{perfil.raza.pesoMax}kg</b>
                </p>
              </div>
              <button onClick={() => { set("raza", null); setBusqueda(""); }} className="text-sm" style={{ color: MALVA, fontFamily: fontBody }}>← Cambiar raza</button>
            </div>
          )}

          {perfil.modoRaza === "sin_raza" && (
            <div>
              <p className="text-sm mb-4" style={{ color: MALVA, fontFamily: fontBody }}>¿Qué tamaño tiene o tendrá de adulto?</p>
              <div className="grid grid-cols-2 gap-3 mb-4">
                {TAMANOS.map((t) => {
                  const activo = perfil.tamanoManual === t;
                  return (
                    <button key={t} onClick={() => set("tamanoManual", t)} className="py-4 rounded-xl text-center transition-all"
                      style={{ background: activo ? VIOLETA : "#FFFFFF", border: `1.5px solid ${activo ? VIOLETA : "#E3DAF0"}`, color: activo ? "#FFFFFF" : TINTA, fontFamily: fontDisplay }}>
                      {t}
                    </button>
                  );
                })}
              </div>
              <button onClick={() => set("modoRaza", null)} className="text-sm" style={{ color: MALVA, fontFamily: fontBody }}>← Volver</button>
            </div>
          )}

          <div className="flex-1" />
          {perfil.modoRaza && <Curvita />}
          {perfil.modoRaza && <BotonContinuar activo={puedeContinuar} onClick={siguiente} />}
          <button onClick={siguiente} className="text-xs text-center mt-3" style={{ color: "#D8CFEC", fontFamily: fontBody }}>Saltar (modo prueba)</button>
        </div>
      </div>
    );
  }

  // ---------- PASO 3: Fecha de nacimiento ----------
  if (paso === 3) {
    const dias = Array.from({ length: 31 }, (_, i) => i + 1);
    const anioActual = new Date().getFullYear();
    const anios = Array.from({ length: 25 }, (_, i) => anioActual - i);
    return (
      <div className="min-h-screen w-full flex flex-col" style={{ background: PAPEL }}>
        <Fuentes />
        <Cabecera paso={3} titulo="¿Cuándo nació?" />
        <div className="flex-1 px-6 pt-8 pb-6 flex flex-col">
          <BotonAtras onClick={atras} />
          <div className="flex justify-center gap-2 mb-6">
            <Rueda valores={dias} valor={perfil.dia} onChange={(v) => set("dia", v)} ancho={56} />
            <Rueda valores={MESES} valor={MESES[perfil.mesIdx]} onChange={(m) => set("mesIdx", MESES.indexOf(m))} ancho={120} />
            <Rueda valores={anios} valor={perfil.anio} onChange={(v) => set("anio", v)} ancho={72} />
          </div>
          <div className="rounded-2xl p-4 mb-6 text-center" style={{ background: "#FFFFFF", border: "1.5px solid #E3DAF0" }}>
            {edad ? (
              <p style={{ color: TINTA, fontFamily: fontBody }}>
                {nombreMostrar} tiene{" "}
                <span style={{ color: VIOLETA, fontWeight: 700 }}>
                  {edad.anios > 0 && `${edad.anios} ${edad.anios === 1 ? "año" : "años"} `}
                  {edad.meses > 0 && `${edad.meses} ${edad.meses === 1 ? "mes" : "meses"} `}
                  {edad.anios === 0 && `${edad.dias} ${edad.dias === 1 ? "día" : "días"}`}
                </span>
              </p>
            ) : (
              <p style={{ color: ROSA, fontFamily: fontBody, fontSize: 14 }}>Esa fecha todavía no ha llegado</p>
            )}
          </div>
          <div className="flex-1" />
          <Curvita />
          <BotonContinuar activo={!!edad} onClick={siguiente} />
          <button onClick={siguiente} className="text-xs text-center mt-3" style={{ color: "#D8CFEC", fontFamily: fontBody }}>Saltar (modo prueba)</button>
        </div>
      </div>
    );
  }

  // ---------- PASO 4: Peso + Condición corporal ----------
  if (paso === 4) {
    const puedeContinuar = perfil.pesoActual && Number(perfil.pesoActual) > 0 && perfil.condicionTocado;
    const actual = CONDICIONES[perfil.condicionIdx];
    const tuck = perfil.condicionIdx / 4;
    return (
      <div className="min-h-screen w-full flex flex-col" style={{ background: PAPEL }}>
        <Fuentes />
        <Cabecera paso={4} titulo={<>¿Cómo está<br />{nombreMostrar} ahora?</>} />
        <div className="flex-1 px-6 pt-8 pb-6 flex flex-col">
          <BotonAtras onClick={atras} />
          <div className="mb-8">
            <Etiqueta>Peso actual</Etiqueta>
            <div className="flex items-baseline gap-2">
              <input
                type="number" inputMode="decimal" value={perfil.pesoActual}
                onChange={(e) => set("pesoActual", e.target.value)}
                placeholder="0"
                className="text-3xl pb-2 outline-none bg-transparent w-28"
                style={{ color: TINTA, fontFamily: fontDisplay, borderBottom: `2px solid ${perfil.pesoActual ? VIOLETA : "#E3DAF0"}` }}
              />
              <span style={{ color: MALVA, fontFamily: fontBody }}>kg</span>
            </div>
          </div>
          <Etiqueta>Condición corporal</Etiqueta>
          <p className="text-xs mb-6" style={{ color: MALVA, fontFamily: fontBody }}>
            Desliza hasta la silueta que más se parezca a {nombreMostrar} visto desde el lateral
          </p>
          <div className="rounded-2xl p-6 mb-3" style={{ background: "#FFFFFF", border: "1.5px solid #E3DAF0" }}>
            <p className="text-center text-[10px] tracking-[0.12em] uppercase mb-3" style={{ color: MALVA, fontFamily: "monospace" }}>Visto desde arriba</p>
            <div className="flex justify-center mb-5">
              <SiluetaDesdeArriba tuck={tuck} color={perfil.condicionTocado ? VIOLETA : "#C9BEDD"} />
            </div>
            <input
              type="range" className="cnl-slider mb-3" min={0} max={4} step={1} value={perfil.condicionIdx}
              onChange={(e) => { set("condicionIdx", Number(e.target.value)); set("condicionTocado", true); }}
            />
            <Puntitos total={5} activo={perfil.condicionIdx} tocado={perfil.condicionTocado} />
            <p className="text-center" style={{ color: TINTA, fontFamily: fontDisplay, fontSize: 18 }}>{actual.label}</p>
            <p className="text-center text-xs mt-1" style={{ color: MALVA, fontFamily: fontBody }}>{actual.detalle}</p>
          </div>
          <div className="flex-1" />
          <Curvita />
          <BotonContinuar activo={puedeContinuar} onClick={siguiente} />
          <button onClick={siguiente} className="text-xs text-center mt-3" style={{ color: "#D8CFEC", fontFamily: fontBody }}>Saltar (modo prueba)</button>
        </div>
      </div>
    );
  }

  // ---------- PASO 5: Actividad + Esterilizado ----------
  if (paso === 5) {
    const puedeContinuar = perfil.actividadTocado && perfil.esterilizado !== null;
    const actual = NIVELES[perfil.actividadIdx];
    const Icono = actual.Icono;
    return (
      <div className="min-h-screen w-full flex flex-col" style={{ background: PAPEL }}>
        <Fuentes />
        <Cabecera paso={5} titulo={<>{nombreMostrar}, en su<br />día a día</>} />
        <div className="flex-1 px-6 pt-8 pb-6 flex flex-col">
          <BotonAtras onClick={atras} />

          <Etiqueta>Nivel de actividad</Etiqueta>
          <p className="text-xs mb-4" style={{ color: MALVA, fontFamily: fontBody }}>Piensa en un día normal, no en sus mejores días</p>
          <div className="rounded-2xl p-6 mb-6" style={{ background: "#FFFFFF", border: "1.5px solid #E3DAF0" }}>
            <div className="flex justify-center mb-5">
              <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: perfil.actividadTocado ? VIOLETA : "#EDE6F5" }}>
                <Icono size={28} strokeWidth={1.5} style={{ color: perfil.actividadTocado ? ROSA : "#B6ABC9" }} />
              </div>
            </div>
            <input
              type="range" className="cnl-slider mb-3" min={0} max={4} step={1} value={perfil.actividadIdx}
              onChange={(e) => { set("actividadIdx", Number(e.target.value)); set("actividadTocado", true); }}
            />
            <Puntitos total={5} activo={perfil.actividadIdx} tocado={perfil.actividadTocado} />
            <p className="text-center" style={{ color: TINTA, fontFamily: fontDisplay, fontSize: 17 }}>{actual.label}</p>
            <p className="text-center text-xs mt-1" style={{ color: MALVA, fontFamily: fontBody }}>{actual.detalle}</p>
          </div>

          <Etiqueta>¿Está esterilizado/a?</Etiqueta>
          <div className="grid grid-cols-2 gap-3 mb-2">
            {[{ key: "no", label: "No" }, { key: "si", label: "Sí" }].map((op) => {
              const activo = perfil.esterilizado === op.key;
              return (
                <button key={op.key} onClick={() => set("esterilizado", op.key)}
                  className="flex flex-col items-center justify-center gap-2 py-5 rounded-2xl transition-all"
                  style={{ background: activo ? VIOLETA : "#FFFFFF", border: `1.5px solid ${activo ? VIOLETA : "#E3DAF0"}` }}>
                  <Scissors size={20} strokeWidth={1.6} style={{ color: activo ? ROSA : "#C4B8DC" }} />
                  <span style={{ color: activo ? "#FFFFFF" : TINTA, fontFamily: fontDisplay }}>{op.label}</span>
                </button>
              );
            })}
          </div>

          <div className="flex-1" />
          <Curvita />
          <BotonContinuar activo={puedeContinuar} onClick={siguiente} />
          <button onClick={siguiente} className="text-xs text-center mt-3" style={{ color: "#D8CFEC", fontFamily: fontBody }}>Saltar (modo prueba)</button>
        </div>
      </div>
    );
  }

  // ---------- PASO 6: Alergias + Otros a evitar + Patologías ----------
  if (paso === 6) {
    const puedeContinuar =
      perfil.alergiaSi !== null &&
      (perfil.alergiaSi === "no" || perfil.alergias.length > 0) &&
      perfil.otrosEvitarSi !== null &&
      (perfil.otrosEvitarSi === "no" || perfil.otrosEvitar.length > 0) &&
      perfil.patologiaSi !== null &&
      (perfil.patologiaSi === "no" || perfil.patologias.length > 0);

    const anadir = (campo, item) => {
      set(campo, [...perfil[campo], item]);
      setCategoriaAbierta(null);
    };
    const quitar = (campo, idx) => {
      set(campo, perfil[campo].filter((_, i) => i !== idx));
    };

    return (
      <div className="min-h-screen w-full flex flex-col" style={{ background: PAPEL }}>
        <Fuentes />
        <Cabecera paso={6} titulo={<>Última cosa<br />sobre {nombreMostrar}</>} />
        <div className="flex-1 px-6 pt-8 pb-6 flex flex-col">
          <BotonAtras onClick={atras} />

          {/* ALERGIAS */}
          <Etiqueta>¿Tiene alguna alergia alimentaria confirmada?</Etiqueta>
          <SiNoToggle valor={perfil.alergiaSi} onChange={(v) => { set("alergiaSi", v); if (v === "no") set("alergias", []); }} />
          {perfil.alergiaSi === "si" && (
            <SelectorAlimentos
              lista={perfil.alergias}
              onAnadir={(item) => anadir("alergias", item)}
              onQuitar={(idx) => quitar("alergias", idx)}
              idGrupo="alergias"
              estadoAbierto={categoriaAbierta}
              setEstadoAbierto={setCategoriaAbierta}
            />
          )}

          {/* OTROS A EVITAR */}
          <div className="mt-7">
            <Etiqueta>¿Algo más que prefieras evitar, sin ser alergia?</Etiqueta>
            <p className="text-xs mb-3" style={{ color: MALVA, fontFamily: fontBody }}>
              Por ejemplo si algo le sienta raro, o simplemente prefieres no dárselo
            </p>
            <SiNoToggle valor={perfil.otrosEvitarSi} onChange={(v) => { set("otrosEvitarSi", v); if (v === "no") set("otrosEvitar", []); }} />
            {perfil.otrosEvitarSi === "si" && (
              <SelectorAlimentos
                lista={perfil.otrosEvitar}
                onAnadir={(item) => anadir("otrosEvitar", item)}
                onQuitar={(idx) => quitar("otrosEvitar", idx)}
                idGrupo="otros"
                estadoAbierto={categoriaAbierta}
                setEstadoAbierto={setCategoriaAbierta}
              />
            )}
          </div>

          {/* PATOLOGIAS */}
          <div className="mt-7 mb-4">
            <Etiqueta>¿Tiene alguna patología diagnosticada?</Etiqueta>
            <SiNoToggle valor={perfil.patologiaSi} onChange={(v) => { set("patologiaSi", v); if (v === "no") set("patologias", []); }} />
            {perfil.patologiaSi === "si" && (
              <div className="flex flex-col gap-2 mt-3">
                {PATOLOGIAS.map((p) => {
                  const activo = perfil.patologias.includes(p.key);
                  return (
                    <button
                      key={p.key}
                      onClick={() => {
                        if (activo) set("patologias", perfil.patologias.filter((k) => k !== p.key));
                        else set("patologias", [...perfil.patologias, p.key]);
                      }}
                      className="flex items-center justify-between px-4 py-3 rounded-xl text-left"
                      style={{ background: activo ? VIOLETA : "#FFFFFF", border: `1.5px solid ${activo ? VIOLETA : "#E3DAF0"}` }}
                    >
                      <span style={{ color: activo ? "#FFFFFF" : TINTA, fontFamily: fontDisplay, fontSize: 15 }}>{p.label}</span>
                      {activo && <Check size={16} style={{ color: ROSA }} />}
                    </button>
                  );
                })}
                {perfil.patologias.some((k) => PATOLOGIAS.find((p) => p.key === k && !p.segura)) && (
                  <div className="flex gap-2 items-start p-3 rounded-xl mt-1" style={{ background: "#FFF0F3" }}>
                    <AlertCircle size={16} style={{ color: ROSA, flexShrink: 0, marginTop: 2 }} />
                    <p className="text-xs" style={{ color: TINTA, fontFamily: fontBody }}>
                      Esta condición depende de analíticas que la app no puede ver — te pondremos en contacto con
                      la guía para hablar con tu veterinario en vez de generar una dieta automática.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex-1" />
          <Curvita />
          <BotonContinuar activo={puedeContinuar} onClick={siguiente} texto="Terminar" />
          <button onClick={siguiente} className="text-xs text-center mt-3" style={{ color: "#D8CFEC", fontFamily: fontBody }}>Saltar (modo prueba)</button>
        </div>
      </div>
    );
  }

  // ---------- FIN ONBOARDING: resumen ----------
  if (fase === "onboarding") {
  const filas = [
    {
      paso: 1,
      Icono: Dog,
      titulo: "Nombre y sexo",
      valor: `${perfil.nombre || "—"} · ${perfil.sexo === "macho" ? "Macho" : perfil.sexo === "hembra" ? "Hembra" : "—"}`,
    },
    {
      paso: 2,
      Icono: Search,
      titulo: "Raza y tamaño",
      valor: perfil.raza?.nombre || perfil.tamanoManual || "—",
    },
    {
      paso: 3,
      Icono: Info,
      titulo: "Fecha de nacimiento",
      valor: edad ? `${edad.anios} años, ${edad.meses} meses` : "—",
    },
    {
      paso: 4,
      Icono: Scissors,
      titulo: "Peso y condición",
      valor: `${perfil.pesoActual || "—"}kg · ${CONDICIONES[perfil.condicionIdx].label}`,
    },
    {
      paso: 5,
      Icono: Zap,
      titulo: "Actividad y esterilización",
      valor: `${NIVELES[perfil.actividadIdx].label} · Esterilizado: ${perfil.esterilizado === "si" ? "Sí" : perfil.esterilizado === "no" ? "No" : "—"}`,
    },
    {
      paso: 6,
      Icono: AlertCircle,
      titulo: "Alergias y patologías",
      valor:
        [
          perfil.alergias.length ? `Alergia: ${perfil.alergias.map((a) => a.alimento).join(", ")}` : null,
          perfil.otrosEvitar.length ? `Evitar: ${perfil.otrosEvitar.map((a) => a.alimento).join(", ")}` : null,
          perfil.patologias.length ? `Patologías: ${perfil.patologias.map((k) => PATOLOGIAS.find((p) => p.key === k).label).join(", ")}` : null,
        ]
          .filter(Boolean)
          .join(" · ") || "Nada que destacar",
    },
  ];

  return (
    <div className="min-h-screen w-full flex flex-col" style={{ background: PAPEL }}>
      <Fuentes />
      <div style={{ background: VIOLETA }} className="w-full px-6 pt-10 pb-8 text-center">
        <Dog size={36} strokeWidth={1.4} style={{ color: ROSA, margin: "0 auto" }} />
        <p className="text-2xl mt-4" style={{ color: "#FFFFFF", fontFamily: fontDisplay, fontWeight: 500 }}>
          ¡Listo, {nombreMostrar}!
        </p>
        <p className="text-xs mt-1" style={{ color: MALVA, fontFamily: fontBody }}>
          Revisa que todo esté bien — toca el lápiz para cambiar algo
        </p>
      </div>

      <div className="flex-1 px-6 pt-6 pb-6 flex flex-col">
        <div className="flex flex-col gap-2 mb-6">
          {filas.map((f) => {
            const Icono = f.Icono;
            return (
              <div key={f.paso} className="flex items-center gap-3 p-4 rounded-2xl" style={{ background: "#FFFFFF", border: "1.5px solid #E3DAF0" }}>
                <div className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: PAPEL }}>
                  <Icono size={18} strokeWidth={1.6} style={{ color: VIOLETA }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] tracking-[0.1em] uppercase" style={{ color: MALVA, fontFamily: "monospace" }}>{f.titulo}</p>
                  <p className="truncate" style={{ color: TINTA, fontFamily: fontBody, fontSize: 14 }}>{f.valor}</p>
                </div>
                <button
                  onClick={() => setPaso(f.paso)}
                  className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center"
                  style={{ background: PAPEL }}
                >
                  <Pencil size={14} style={{ color: VIOLETA }} />
                </button>
              </div>
            );
          })}
        </div>

        {/* Las kcal que sale de todo lo anterior. Es EL numero del que cuelga
            todo lo demas (las cantidades de cada alimento salen de aqui), asi
            que merece verse antes de generar nada. El aviso de variabilidad
            va pegado: Bermingham 2014 midio una desviacion tipica del 38%. */}
        {derReal ? (
          <div className="rounded-2xl p-5 mb-6 text-center" style={{ background: VIOLETA }}>
            <p className="text-[10px] tracking-[0.18em] uppercase mb-2" style={{ color: MALVA, fontFamily: "monospace" }}>
              Su necesidad diaria
            </p>
            <p style={{ color: "#FFFFFF", fontFamily: fontDisplay, fontSize: 15, lineHeight: 1.4 }}>
              {nombreMostrar} necesita
            </p>
            <p style={{ color: ROSA, fontFamily: fontDisplay, fontSize: 42, fontWeight: 500, lineHeight: 1.15 }}>
              {derReal}
            </p>
            <p style={{ color: "#FFFFFF", fontFamily: fontDisplay, fontSize: 15 }}>
              kilocalorías al día
            </p>
            <p className="text-[11px] mt-3 leading-snug" style={{ color: MALVA, fontFamily: fontBody }}>
              {etapaLabel} · {NIVELES[perfil.actividadIdx].label.toLowerCase()}
              {perfil.raza?.nombre ? ` · ${perfil.raza.nombre}` : ""}
            </p>
            <div className="mt-4 pt-3" style={{ borderTop: "1px solid rgba(255,255,255,0.18)" }}>
              <p className="text-[11px] leading-snug" style={{ color: MALVA, fontFamily: fontBody }}>
                Es un punto de partida calculado con su peso, edad y actividad.
                Dos perros iguales pueden necesitar hasta un 38% más o menos,
                así que <b style={{ color: "#FFFFFF" }}>pésalo cada 2-3 semanas</b> y
                ajusta si lo ves más delgado o más gordo.
              </p>
            </div>
          </div>
        ) : null}

        <div className="flex-1" />
        <Curvita />
        <button
          onClick={() => setFase("generador")}
          className="w-full py-4 rounded-2xl text-base"
          style={{ background: ROSA, color: "#FFFFFF", fontFamily: fontBody, fontWeight: 700 }}
        >
          Todo bien, ir al generador de menús →
        </button>
      </div>
    </div>
  );
  }

// ---------- PANTALLA: elegir modo ----------
  if (fase === "generador" && pantalla === "elegir") {
    return (
      <div className="min-h-screen w-full flex flex-col" style={{ background: PAPEL }}>
        <Fuentes />
        <div style={{ background: VIOLETA }} className="w-full px-6 pt-10 pb-8">
          <p className="text-[11px] tracking-[0.18em] uppercase mb-3" style={{ color: MALVA, fontFamily: "monospace" }}>Menú semanal</p>
          <h1 className="text-3xl leading-tight mb-2" style={{ color: "#FFFFFF", fontFamily: fontDisplay, fontWeight: 500 }}>
            ¿Cómo quieres<br />hacer el menú de<br />{nombreMostrar}?
          </h1>
        </div>
        <div className="flex-1 px-6 pt-8 pb-6 flex flex-col">
          <p className="text-[11px] tracking-[0.14em] uppercase mb-2" style={{ color: MALVA, fontFamily: "monospace" }}>
            Antes de nada
          </p>
          <p className="text-sm mb-3" style={{ color: TINTA, fontFamily: fontBody }}>
            ¿Qué come {nombreMostrar} ahora mismo?
          </p>
          <div className="flex flex-wrap gap-2 mb-6">
            {[
              { key: "pienso", label: "Pienso" },
              { key: "barf_otra", label: "BARF" },
              { key: "cocinada", label: "Comida cocinada" },
            ].map((op) => {
              const activo = dietaActual === op.key;
              return (
                <button
                  key={op.key}
                  onClick={() => setDietaActual(op.key)}
                  className="py-3 px-4 rounded-xl text-center text-sm"
                  style={{ background: activo ? VIOLETA : "#FFFFFF", border: `1.5px solid ${activo ? VIOLETA : "#E3DAF0"}`, color: activo ? "#FFFFFF" : TINTA, fontFamily: fontBody, fontWeight: 600 }}
                >
                  {op.label}
                </button>
              );
            })}
          </div>
          {dietaActual && dietaActual !== "barf_otra" && (
            <div className="rounded-xl p-3 mb-6 flex gap-2 items-start" style={{ background: "#F0ECF7" }}>
              <Info size={14} style={{ color: VIOLETA, flexShrink: 0, marginTop: 2 }} />
              <p className="text-xs" style={{ color: TINTA, fontFamily: fontBody }}>
                Como viene de otra dieta, luego te sugerimos un plan de transición gradual en vez de cambiar de golpe.
              </p>
            </div>
          )}

          <div className="flex flex-col gap-3 mb-6">
            {MODOS.map((m) => {
              const Icono = m.Icono;
              return (
                <button
                  key={m.key}
                  onClick={() => { if (dietaActual) irAModo(m.key); }}
                  disabled={!dietaActual}
                  className="text-left rounded-2xl p-5 transition-all"
                  style={{ background: "#FFFFFF", border: "1.5px solid #E3DAF0", opacity: dietaActual ? 1 : 0.45 }}
                >
                  <div className="flex items-start gap-4">
                    <div className="shrink-0 w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: PAPEL }}>
                      <Icono size={22} strokeWidth={1.6} style={{ color: VIOLETA }} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <p style={{ color: TINTA, fontFamily: fontDisplay, fontSize: 18 }}>{m.titulo}</p>
                        <ChevronRight size={18} style={{ color: "#C9BEDD" }} />
                      </div>
                      <p className="text-sm mb-2" style={{ color: MALVA, fontFamily: fontBody, fontWeight: 500 }}>{m.resumen}</p>
                      <p className="text-xs leading-relaxed" style={{ color: "#A79ABF", fontFamily: fontBody }}>{m.nota}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
          {!dietaActual && (
            <p className="text-xs text-center -mt-4 mb-4" style={{ color: ROSA, fontFamily: fontBody }}>
              Elige primero qué come {nombreMostrar} ahora
            </p>
          )}
          <div className="flex-1" />
          <Curvita />
        </div>
      </div>
    );
  }

  

// ---------- PANTALLA: cuantos menus (automatico) ----------
  if (fase === "generador" && pantalla === "cuantos") {
    return (
      <div className="min-h-screen w-full flex flex-col" style={{ background: PAPEL }}>
        <Fuentes />
        <div style={{ background: VIOLETA }} className="w-full px-6 pt-10 pb-7">
          <BotonAtras onClick={volverAElegir} texto="Cambiar modo" />
          <p className="text-[11px] tracking-[0.18em] uppercase mb-2" style={{ color: MALVA, fontFamily: "monospace" }}>Menú semanal · automático</p>
          <h1 className="text-3xl leading-tight" style={{ color: "#FFFFFF", fontFamily: fontDisplay, fontWeight: 500 }}>¿Cuántos menús<br />distintos quieres?</h1>
        </div>
        <div className="flex-1 px-6 pt-8 pb-6 flex flex-col">
          <p className="text-sm mb-6" style={{ color: MALVA, fontFamily: fontBody }}>
            Más menús = más variedad, pero más preparación. Menos menús = más fácil de cocinar en lote.
          </p>
          <div className="rounded-2xl p-6 mb-6" style={{ background: "#FFFFFF", border: "1.5px solid #E3DAF0" }}>
            <div className="flex items-center justify-between">
              <button onClick={() => setNumMenus(Math.max(1, numMenus - 1))} className="w-11 h-11 rounded-full flex items-center justify-center text-xl" style={{ background: PAPEL, color: VIOLETA, fontFamily: fontDisplay }}>−</button>
              <div className="text-center">
                <p style={{ color: VIOLETA, fontFamily: fontDisplay, fontSize: 40, lineHeight: 1 }}>{numMenus}</p>
                <p className="text-[10px] tracking-[0.1em] uppercase mt-1" style={{ color: MALVA, fontFamily: "monospace" }}>{numMenus === 1 ? "menú" : "menús"}</p>
              </div>
              <button onClick={() => setNumMenus(Math.min(8, numMenus + 1))} className="w-11 h-11 rounded-full flex items-center justify-center text-xl" style={{ background: PAPEL, color: VIOLETA, fontFamily: fontDisplay }}>+</button>
            </div>
          </div>
          <p className="text-xs text-center mb-6" style={{ color: MALVA, fontFamily: fontBody }}>
            El sistema decide también qué día toca cada menú, según lo que lleve cada uno.
          </p>
          <div className="flex-1" />
          <Curvita />
          <BotonPrincipal activo={true} onClick={() => setPantalla("resultado")} texto={`Generar ${numMenus === 1 ? "el menú" : `los ${numMenus} menús`}`} />
        </div>
      </div>
    );
  }

  

// ---------- PANTALLA: resultado (automatico) ----------
  if (fase === "generador" && pantalla === "resultado") {
    if (menuCargando) {
      return (
        <div className="min-h-screen w-full flex flex-col items-center justify-center px-8 text-center" style={{ background: PAPEL }}>
          <Fuentes />
          <Dog size={36} strokeWidth={1.4} style={{ color: VIOLETA }} />
          <p className="mt-4" style={{ color: TINTA, fontFamily: fontDisplay, fontSize: 18 }}>
            {menuDespertando
              ? "Despertando el servidor..."
              // ojo: los menus que se generan de verdad son numMenus solo en
              // Automatico; en Personalizar y Aprovechar siempre es 1
              : `Calculando ${(modo === "automatico" ? numMenus : 1) === 1 ? "el menú" : `los ${modo === "automatico" ? numMenus : 1} menús`} de ${nombreMostrar}...`}
          </p>
          <p className="text-xs mt-2" style={{ color: MALVA, fontFamily: fontBody }}>
            {menuDespertando
              ? "Puede tardar hasta un minuto la primera vez tras un rato sin uso — ya casi está."
              : "Un momento..."}
          </p>
        </div>
      );
    }
    if (menuError) {
      return (
        <div className="min-h-screen w-full flex flex-col items-center justify-center px-8 text-center" style={{ background: PAPEL }}>
          <Fuentes />
          <AlertCircle size={36} strokeWidth={1.4} style={{ color: ROSA }} />
          <p className="mt-4 mb-2" style={{ color: TINTA, fontFamily: fontDisplay, fontSize: 18 }}>
            {necesitaVeterinario ? "Esto lo tiene que pautar tu veterinario" : "No se pudo calcular el menú"}
          </p>
          <p className="text-sm mb-6" style={{ color: MALVA, fontFamily: fontBody }}>{menuError}</p>
          <button
            onClick={() => setPantalla("elegir")}
            className="px-5 py-3 rounded-xl text-sm"
            style={{ background: VIOLETA, color: "#FFFFFF", fontFamily: fontBody, fontWeight: 700 }}
          >
            Volver
          </button>
        </div>
      );
    }
    const menus = menuReal ? respuestaApiAMenu(menuReal, derReal) : MENUS_EJEMPLO;
    return <VistaMenus menus={menus} onVolver={volverAElegir} modo={modo} alimentosEvitados={alimentosEvitados} patologias={perfil?.patologias || []} nombrePerro={nombreMostrar} necesitaTransicion={dietaActual === "pienso" || dietaActual === "cocinada"} dietaActual={dietaActual} categoriasDisponibles={categoriasDisponibles} perfil={perfil} derReal={derReal} etapaLabel={etapaLabel} etapaCalculada={etapaCalculada} especiesExcluidas={especiesExcluidas} pesoAdultoEsperado={pesoAdultoEsperado} edad={edad} set={set} />;
  }

  

// ---------- PANTALLA: aprovechar (input) ----------
  if (fase === "generador" && pantalla === "aprovechar-input") {
    const anadir = (item) => {
      setItemsAprovechar([...itemsAprovechar, item]);
      setEstadoAbiertoAprovechar(null);
    };
    const quitar = (idx) => setItemsAprovechar(itemsAprovechar.filter((_, i) => i !== idx));

    return (
      <div className="min-h-screen w-full flex flex-col" style={{ background: PAPEL }}>
        <Fuentes />
        <div style={{ background: VIOLETA }} className="w-full px-6 pt-10 pb-7">
          <BotonAtras onClick={volverAElegir} texto="Cambiar modo" />
          <p className="text-[11px] tracking-[0.18em] uppercase mb-2" style={{ color: MALVA, fontFamily: "monospace" }}>Menú semanal · aprovechar</p>
          <h1 className="text-3xl leading-tight" style={{ color: "#FFFFFF", fontFamily: fontDisplay, fontWeight: 500 }}>¿Qué tienes<br />por casa?</h1>
        </div>
        <div className="flex-1 px-6 pt-8 pb-6 flex flex-col">
          <p className="text-sm mb-6" style={{ color: MALVA, fontFamily: fontBody }}>
            Dinos qué te queda por gastar — repartimos el resto de la semana de {nombreMostrar} alrededor de esto.
          </p>
          <SelectorAlimentos
            lista={itemsAprovechar}
            onAnadir={anadir}
            onQuitar={quitar}
            idGrupo="aprovechar"
            estadoAbierto={estadoAbiertoAprovechar}
            setEstadoAbierto={setEstadoAbiertoAprovechar}
            categorias={categoriasDisponibles}
          />
          <div className="flex-1" />
          <Curvita />
          <BotonPrincipal
            activo={itemsAprovechar.length > 0}
            onClick={() => setPantalla("resultado")}
            texto={itemsAprovechar.length === 0 ? "Añade algo primero" : "Repartir esto en la semana"}
          />
        </div>
      </div>
    );
  }

  

// ---------- PANTALLA: personalizar ----------
  if (fase === "generador" && pantalla === "personalizar") {
    const setModoCat = (cat, m) => {
      setConfigPersonalizar((prev) => ({ ...prev, [cat]: { ...prev[cat], modo: m, elegido: (m === "auto" || m === "no") ? [] : prev[cat].elegido } }));
    };
    const elegirAlimento = (cat, alimento) => {
      setConfigPersonalizar((prev) => {
        const yaEstaba = prev[cat].elegido.includes(alimento);
        return { ...prev, [cat]: { ...prev[cat], elegido: yaEstaba ? prev[cat].elegido : [...prev[cat].elegido, alimento] } };
      });
      setEstadoAbiertoPersonalizar(null);
    };
    const quitarAlimento = (cat, idx) => {
      setConfigPersonalizar((prev) => ({ ...prev, [cat]: { ...prev[cat], elegido: prev[cat].elegido.filter((_, i) => i !== idx) } }));
    };
    const numManual = Object.values(configPersonalizar).filter((c) => c.modo === "manual" && c.elegido.length > 0).length;

    return (
      <div className="min-h-screen w-full flex flex-col" style={{ background: PAPEL }}>
        <Fuentes />
        <div style={{ background: VIOLETA }} className="w-full px-6 pt-10 pb-7">
          <BotonAtras onClick={volverAElegir} texto="Cambiar modo" />
          <p className="text-[11px] tracking-[0.18em] uppercase mb-2" style={{ color: MALVA, fontFamily: "monospace" }}>Menú 1 · personalizar</p>
          <h1 className="text-3xl leading-tight" style={{ color: "#FFFFFF", fontFamily: fontDisplay, fontWeight: 500 }}>A tu gusto,<br />categoría a categoría</h1>
        </div>
        <div className="flex-1 px-6 pt-8 pb-6 flex flex-col">
          <p className="text-sm mb-6" style={{ color: MALVA, fontFamily: fontBody }}>
            Lo que dejes en Automático, lo elige el sistema. Lo que pongas en Manual, tú eliges el alimento
            — la cantidad la calculamos nosotros para que cuadren los nutrientes de {nombreMostrar}.
          </p>
          <div className="flex flex-col gap-3 mb-6">
            {CATEGORIAS_ICONOS.map((cat) => {
              const c = configPersonalizar[cat.nombre];
              const Icono = cat.Icono;
              const categoriaAbierta = estadoAbiertoPersonalizar && estadoAbiertoPersonalizar.categoria === cat.nombre;
              const especieAbierta = categoriaAbierta ? estadoAbiertoPersonalizar.especie : null;
              return (
                <div key={cat.nombre} className="rounded-2xl p-4" style={{ background: "#FFFFFF", border: "1.5px solid #E3DAF0" }}>
                  <div className="flex items-center gap-3 mb-1">
                    <div className="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: PAPEL }}>
                      <Icono size={16} strokeWidth={1.6} style={{ color: VIOLETA }} />
                    </div>
                    <p className="flex-1" style={{ color: TINTA, fontFamily: fontDisplay, fontSize: 16 }}>{cat.nombre}</p>
                    {cat.nombre === "Suplementos comerciales" ? (
                      <div className="flex rounded-full p-0.5" style={{ background: PAPEL }}>
                        <button onClick={() => setModoCat(cat.nombre, "no")} className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs"
                          style={{ background: c.modo === "no" ? VIOLETA : "transparent", color: c.modo === "no" ? "#FFFFFF" : MALVA, fontFamily: fontBody, fontWeight: 600 }}>
                          No usar
                        </button>
                        <button onClick={() => setModoCat(cat.nombre, "manual")} className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs"
                          style={{ background: c.modo === "manual" ? VIOLETA : "transparent", color: c.modo === "manual" ? "#FFFFFF" : MALVA, fontFamily: fontBody, fontWeight: 600 }}>
                          <Hand size={11} /> Elegir uno
                        </button>
                      </div>
                    ) : (
                    <div className="flex rounded-full p-0.5" style={{ background: PAPEL }}>
                      <button onClick={() => setModoCat(cat.nombre, "auto")} className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs"
                        style={{ background: c.modo === "auto" ? VIOLETA : "transparent", color: c.modo === "auto" ? "#FFFFFF" : MALVA, fontFamily: fontBody, fontWeight: 600 }}>
                        <Sparkles size={11} /> Auto
                      </button>
                      <button onClick={() => setModoCat(cat.nombre, "manual")} className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs"
                        style={{ background: c.modo === "manual" ? VIOLETA : "transparent", color: c.modo === "manual" ? "#FFFFFF" : MALVA, fontFamily: fontBody, fontWeight: 600 }}>
                        <Hand size={11} /> Manual
                      </button>
                    </div>
                    )}
                  </div>
                  {c.modo === "manual" && (
                    <div className="mt-3 pl-12">
                      {c.elegido.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-2">
                          {c.elegido.map((alimento, idx) => (
                            <div key={idx} className="flex items-center gap-1.5 pl-3 pr-2 py-1.5 rounded-full" style={{ background: "#F0ECF7" }}>
                              <span className="text-xs" style={{ color: VIOLETA, fontFamily: fontBody, fontWeight: 600 }}>{alimento}</span>
                              <button onClick={() => quitarAlimento(cat.nombre, idx)}>
                                <X size={12} style={{ color: ROSA }} />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                      {!categoriaAbierta && (
                        <button onClick={() => setEstadoAbiertoPersonalizar({ categoria: cat.nombre, especie: null })}
                          className="px-3 py-2 rounded-lg text-sm" style={{ background: PAPEL, color: MALVA, fontFamily: fontBody, border: "1.5px dashed #C9BEDD" }}>
                          {c.elegido.length > 0 ? "+ Añadir otro" : "Elegir alimento"}
                        </button>
                      )}
                      {categoriaAbierta && !especieAbierta && (
                        <div className="rounded-xl p-3" style={{ background: PAPEL }}>
                          <p className="text-xs mb-2" style={{ color: MALVA, fontFamily: "monospace" }}>ESPECIE</p>
                          <div className="flex flex-col gap-1.5 max-h-56 overflow-y-auto">
                            {Object.keys(categoriasDisponibles[cat.nombre] || {}).map((especie) => {
                              const items = categoriasDisponibles[cat.nombre][especie];
                              return (
                                <button key={especie} onClick={() => {
                                    if (items.length === 1) elegirAlimento(cat.nombre, items[0]);
                                    else setEstadoAbiertoPersonalizar({ categoria: cat.nombre, especie });
                                  }}
                                  className="text-left px-3 py-2 rounded-lg text-sm flex items-center justify-between" style={{ color: TINTA, fontFamily: fontBody, background: "#FFFFFF" }}>
                                  <span>{especie}</span>
                                  {items.length > 1 && <span className="text-[10px]" style={{ color: MALVA, fontFamily: "monospace" }}>{items.length} tipos</span>}
                                </button>
                              );
                            })}
                          </div>
                          <button onClick={() => setEstadoAbiertoPersonalizar(null)} className="text-xs mt-2" style={{ color: MALVA, fontFamily: fontBody }}>Cancelar</button>
                        </div>
                      )}
                      {categoriaAbierta && especieAbierta && (
                        <div className="rounded-xl p-3" style={{ background: PAPEL }}>
                          <p className="text-xs mb-2" style={{ color: MALVA, fontFamily: "monospace" }}>{especieAbierta.toUpperCase()}</p>
                          <div className="flex flex-col gap-1.5 max-h-56 overflow-y-auto">
                            <button onClick={() => elegirAlimento(cat.nombre, `Todo: ${especieAbierta}`)}
                              className="text-left px-3 py-2 rounded-lg text-sm" style={{ color: VIOLETA, fontFamily: fontBody, fontWeight: 700, background: "#F0ECF7" }}>
                              Todo el/la {especieAbierta}
                            </button>
                            {categoriasDisponibles[cat.nombre][especieAbierta].map((alimento) => (
                              <button key={alimento} onClick={() => elegirAlimento(cat.nombre, alimento)}
                                className="text-left px-3 py-2 rounded-lg text-sm" style={{ color: TINTA, fontFamily: fontBody, background: "#FFFFFF" }}>
                                {alimento}
                              </button>
                            ))}
                          </div>
                          <button onClick={() => setEstadoAbiertoPersonalizar({ categoria: cat.nombre, especie: null })} className="text-xs mt-2" style={{ color: MALVA, fontFamily: fontBody }}>← Otra especie</button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="flex-1" />
          <p className="text-xs text-center mb-4" style={{ color: MALVA, fontFamily: fontBody }}>
            {numManual === 0 ? "Todo en automático por ahora" : `${numManual} ${numManual === 1 ? "categoría personalizada" : "categorías personalizadas"}`}
          </p>
          <Curvita />
          <BotonPrincipal activo={true} onClick={() => setPantalla("resultado")} texto="Generar este menú" />
        </div>
      </div>
    );
  }



  return null;
}

function Fuentes() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&display=swap');
      input[type=range].cnl-slider {
        -webkit-appearance: none; width: 100%; height: 4px;
        background: #E3DAF0; border-radius: 4px; outline: none;
      }
      input[type=range].cnl-slider::-webkit-slider-thumb {
        -webkit-appearance: none; width: 28px; height: 28px; border-radius: 50%;
        background: ${ROSA}; border: 3px solid #FFFFFF; box-shadow: 0 2px 6px rgba(90,64,136,0.35); cursor: pointer;
      }
      input[type=range].cnl-slider::-moz-range-thumb {
        width: 28px; height: 28px; border-radius: 50%;
        background: ${ROSA}; border: 3px solid #FFFFFF; box-shadow: 0 2px 6px rgba(90,64,136,0.35); cursor: pointer;
      }
    `}</style>
  );
}

function Etiqueta({ children }) {
  return (
    <label className="block text-[11px] tracking-[0.14em] uppercase mb-2" style={{ color: MALVA, fontFamily: "monospace" }}>
      {children}
    </label>
  );
}

function Puntitos({ total, activo, tocado }) {
  return (
    <div className="flex justify-between px-0.5 mb-4">
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} className="w-1.5 h-1.5 rounded-full" style={{ background: i === activo && tocado ? ROSA : "#D8CFEC" }} />
      ))}
    </div>
  );
}

function SiNoToggle({ valor, onChange }) {
  return (
    <div className="grid grid-cols-2 gap-3 mb-3">
      {[{ key: "no", label: "No" }, { key: "si", label: "Sí" }].map((op) => {
        const activo = valor === op.key;
        return (
          <button
            key={op.key}
            onClick={() => onChange(op.key)}
            className="py-3 rounded-xl text-center transition-all"
            style={{
              background: activo ? VIOLETA : "#FFFFFF",
              border: `1.5px solid ${activo ? VIOLETA : "#E3DAF0"}`,
              color: activo ? "#FFFFFF" : TINTA,
              fontFamily: fontDisplay,
            }}
          >
            {op.label}
          </button>
        );
      })}
    </div>
  );
}

function SelectorAlimentos({ lista, onAnadir, onQuitar, idGrupo, estadoAbierto, setEstadoAbierto, categorias }) {
  const CATS = categorias || CATEGORIAS_ALIMENTO;
  const abierto = estadoAbierto && estadoAbierto.grupo === idGrupo ? estadoAbierto : null;
  const especiesYaExcluidas = new Set(
    lista.filter((it) => it.alimento.startsWith("Todo: ")).map((it) => it.alimento.replace("Todo: ", ""))
  );

  const elegirEspecie = (categoria, especie) => {
    const items = CATS[categoria][especie];
    if (items.length === 1) {
      onAnadir({ categoria, alimento: items[0] });
    } else {
      setEstadoAbierto({ grupo: idGrupo, categoria, especie });
    }
  };

  return (
    <div className="mb-2">
      {lista.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {lista.map((item, idx) => (
            <div key={idx} className="flex items-center gap-1.5 pl-3 pr-2 py-1.5 rounded-full" style={{ background: VIOLETA }}>
              <span className="text-xs" style={{ color: "#FFFFFF", fontFamily: fontBody }}>{item.alimento}</span>
              <button onClick={() => onQuitar(idx)}>
                <X size={13} style={{ color: ROSA }} />
              </button>
            </div>
          ))}
        </div>
      )}

      {!abierto && (
        <button
          onClick={() => setEstadoAbierto({ grupo: idGrupo, categoria: null, especie: null })}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm"
          style={{ background: "#FFFFFF", border: "1.5px dashed #C9BEDD", color: VIOLETA, fontFamily: fontBody }}
        >
          <Plus size={15} /> Añadir alimento
        </button>
      )}

      {abierto && !abierto.categoria && (
        <div className="rounded-xl p-3" style={{ background: "#FFFFFF", border: "1.5px solid #E3DAF0" }}>
          <p className="text-xs mb-2" style={{ color: MALVA, fontFamily: "monospace" }}>ELIGE UNA CATEGORÍA</p>
          <div className="flex flex-col gap-1.5 max-h-64 overflow-y-auto">
            {Object.keys(CATS).map((cat) => (
              <button
                key={cat}
                onClick={() => setEstadoAbierto({ grupo: idGrupo, categoria: cat, especie: null })}
                className="text-left px-3 py-2 rounded-lg text-sm"
                style={{ color: TINTA, fontFamily: fontBody, background: PAPEL }}
              >
                {cat}
              </button>
            ))}
          </div>
          <button onClick={() => setEstadoAbierto(null)} className="text-xs mt-2" style={{ color: MALVA, fontFamily: fontBody }}>Cancelar</button>
        </div>
      )}

      {abierto && abierto.categoria && !abierto.especie && (
        <div className="rounded-xl p-3" style={{ background: "#FFFFFF", border: "1.5px solid #E3DAF0" }}>
          <p className="text-xs mb-2" style={{ color: MALVA, fontFamily: "monospace" }}>{abierto.categoria.toUpperCase()}</p>
          <div className="flex flex-col gap-1.5 max-h-64 overflow-y-auto">
            {Object.keys(CATS[abierto.categoria]).filter((especie) => !especiesYaExcluidas.has(especie)).map((especie) => {
              const n = CATS[abierto.categoria][especie].length;
              return (
                <button
                  key={especie}
                  onClick={() => elegirEspecie(abierto.categoria, especie)}
                  className="text-left px-3 py-2 rounded-lg text-sm flex items-center justify-between"
                  style={{ color: TINTA, fontFamily: fontBody, background: PAPEL }}
                >
                  <span>{especie}</span>
                  {n > 1 && <span className="text-[10px]" style={{ color: MALVA, fontFamily: "monospace" }}>{n} tipos</span>}
                </button>
              );
            })}
          </div>
          <button onClick={() => setEstadoAbierto({ grupo: idGrupo, categoria: null, especie: null })} className="text-xs mt-2" style={{ color: MALVA, fontFamily: fontBody }}>← Otra categoría</button>
        </div>
      )}

      {abierto && abierto.categoria && abierto.especie && (
        <div className="rounded-xl p-3" style={{ background: "#FFFFFF", border: "1.5px solid #E3DAF0" }}>
          <p className="text-xs mb-2" style={{ color: MALVA, fontFamily: "monospace" }}>{abierto.especie.toUpperCase()}</p>
          <div className="flex flex-col gap-1.5 max-h-64 overflow-y-auto">
            <button
              onClick={() => onAnadir({ categoria: abierto.categoria, alimento: `Todo: ${abierto.especie}` })}
              className="text-left px-3 py-2 rounded-lg text-sm"
              style={{ color: VIOLETA, fontFamily: fontBody, fontWeight: 700, background: "#F0ECF7" }}
            >
              Todo el/la {abierto.especie}
            </button>
            {CATS[abierto.categoria][abierto.especie].map((alimento) => (
              <button
                key={alimento}
                onClick={() => onAnadir({ categoria: abierto.categoria, alimento })}
                className="text-left px-3 py-2 rounded-lg text-sm"
                style={{ color: TINTA, fontFamily: fontBody, background: PAPEL }}
              >
                {alimento}
              </button>
            ))}
          </div>
          <button onClick={() => setEstadoAbierto({ grupo: idGrupo, categoria: abierto.categoria, especie: null })} className="text-xs mt-2" style={{ color: MALVA, fontFamily: fontBody }}>← Otra especie</button>
        </div>
      )}
    </div>
  );
}

function Rueda({ valores, valor, onChange, ancho = 72 }) {
  // Antes esto era solo un scroll con scroll-snap: en movil iba bien, pero en
  // ordenador las flechas del teclado no hacian nada y la rueda del raton
  // pasaba varios valores de golpe, con lo que acertar uno era una lucha.
  // Ahora va por indice, con flechas visibles, teclado y rueda paso a paso.
  const alturaItem = 40;
  const idx = Math.max(0, valores.indexOf(valor));

  const mover = (delta) => {
    const nuevo = Math.max(0, Math.min(valores.length - 1, idx + delta));
    if (nuevo !== idx) onChange(valores[nuevo]);
  };

  const Flecha = ({ dir }) => (
    <button
      type="button"
      onClick={() => mover(dir)}
      disabled={dir < 0 ? idx === 0 : idx === valores.length - 1}
      className="w-full flex items-center justify-center py-1"
      style={{ opacity: (dir < 0 ? idx === 0 : idx === valores.length - 1) ? 0.25 : 1, cursor: "pointer" }}
      aria-label={dir < 0 ? "Anterior" : "Siguiente"}
    >
      <ChevronRight size={15} style={{ color: VIOLETA, transform: dir < 0 ? "rotate(-90deg)" : "rotate(90deg)" }} />
    </button>
  );

  return (
    <div
      style={{ width: ancho, outline: "none" }}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "ArrowUp") { e.preventDefault(); mover(-1); }
        if (e.key === "ArrowDown") { e.preventDefault(); mover(1); }
      }}
      onWheel={(e) => { mover(e.deltaY > 0 ? 1 : -1); }}
    >
      <Flecha dir={-1} />
      <div style={{ position: "relative", height: alturaItem * 3, overflow: "hidden" }}>
        <div style={{ position: "absolute", top: alturaItem, left: 0, right: 0, height: alturaItem,
                      borderTop: `1.5px solid ${VIOLETA}`, borderBottom: `1.5px solid ${VIOLETA}`,
                      pointerEvents: "none", borderRadius: 8 }} />
        <div style={{ transform: `translateY(${(1 - idx) * alturaItem}px)`, transition: "transform 0.18s ease-out" }}>
          {valores.map((v, i) => (
            <div
              key={v}
              onClick={() => onChange(v)}
              style={{
                height: alturaItem, display: "flex", alignItems: "center", justifyContent: "center",
                fontFamily: fontDisplay,
                fontSize: i === idx ? 19 : 15,
                color: i === idx ? TINTA : "#C9BEDD",
                opacity: Math.abs(i - idx) > 1 ? 0 : 1,
                transition: "all 0.18s", cursor: "pointer",
              }}
            >
              {v}
            </div>
          ))}
        </div>
      </div>
      <Flecha dir={1} />
    </div>
  );
}
