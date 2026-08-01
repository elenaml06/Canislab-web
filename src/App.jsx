import { useState, useMemo, useEffect } from "react";
import { AlertCircle, Award, Beef, Check, CheckCircle2, ChevronLeft, ChevronRight, Dog, Fish, Flame, Footprints, Hand, HeartPulse, Info, Lock, Moon, Pencil, Pill, Plus, Refrigerator, Salad, Scissors, Search, SlidersHorizontal, Sparkles, UtensilsCrossed, X, Zap } from "lucide-react";

const API_BASE = "https://canislab-api.onrender.com";

// Lista curada de candidatos por defecto para el modo Automatico -- la misma
// familia de alimentos que ya validamos que da un menu real y completo
const CANDIDATOS_AUTOMATICO_DEFECTO = [
  "Ternera con grasa", "Ternera solomillo sin grasa", "Conejo",
  "Cuello de ternera", "Costillas de ternera", "Costillas de cordero",
  "Corazón de vaca", "Riñón de ternera", "Pulmón de ternera",
  "Hígado de vaca",
  "Salmón", "Sardina", "Mejillón",
  "Calabaza", "Espinaca", "Zanahoria", "Manzana",
  "Semilla de lino", "Aceite de girasol", "Huevo de gallina entero",
  "Sonrisa de Diez Kelp",
];

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
  {"nombre":"Affenpinscher","tamano":"Toy","pesoMin":3,"pesoMax":6,"pesoMedio":4.5},
  {"nombre":"Akita Inu","tamano":"Grande","pesoMin":32,"pesoMax":45,"pesoMedio":38.5},
  {"nombre":"American Staffordshire Terrier","tamano":"Mediano","pesoMin":18,"pesoMax":34,"pesoMedio":26},
  {"nombre":"Beagle","tamano":"Pequeño","pesoMin":9,"pesoMax":15,"pesoMedio":12},
  {"nombre":"Bichón Maltés","tamano":"Toy","pesoMin":3,"pesoMax":4,"pesoMedio":3.5},
  {"nombre":"Border Collie","tamano":"Mediano","pesoMin":14,"pesoMax":20,"pesoMedio":17},
  {"nombre":"Bulldog Francés","tamano":"Pequeño","pesoMin":8,"pesoMax":14,"pesoMedio":11},
  {"nombre":"Chihuahua","tamano":"Toy","pesoMin":1.5,"pesoMax":3,"pesoMedio":2.3},
  {"nombre":"Cocker Spaniel Inglés","tamano":"Pequeño","pesoMin":12,"pesoMax":15,"pesoMedio":13.5},
  {"nombre":"Dogo Alemán","tamano":"Gigante","pesoMin":50,"pesoMax":90,"pesoMedio":70},
  {"nombre":"Golden Retriever","tamano":"Grande","pesoMin":25,"pesoMax":34,"pesoMedio":29.5},
  {"nombre":"Gran Danés","tamano":"Gigante","pesoMin":50,"pesoMax":90,"pesoMedio":70},
  {"nombre":"Labrador Retriever","tamano":"Grande","pesoMin":25,"pesoMax":36,"pesoMedio":30.5},
  {"nombre":"Mastín Español","tamano":"Gigante","pesoMin":50,"pesoMax":100,"pesoMedio":75},
  {"nombre":"Pastor Alemán","tamano":"Grande","pesoMin":22,"pesoMax":40,"pesoMedio":31},
  {"nombre":"Podenco Ibicenco","tamano":"Pequeño","pesoMin":9,"pesoMax":13,"pesoMedio":11},
  {"nombre":"Pomerania","tamano":"Toy","pesoMin":1.9,"pesoMax":3.5,"pesoMedio":2.7},
  {"nombre":"Rottweiler","tamano":"Grande","pesoMin":35,"pesoMax":60,"pesoMedio":47.5},
  {"nombre":"Shih Tzu","tamano":"Mini","pesoMin":4,"pesoMax":8,"pesoMedio":6},
  {"nombre":"Yorkshire Terrier","tamano":"Toy","pesoMin":2,"pesoMax":3.5,"pesoMedio":2.8},
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
    "Gallina": ["Gallina entera"],
    "Pato": ["Pato entero"],
    "Pavo": ["Pavo", "Pavo muslo con piel", "Pavo pechuga con piel", "Pavo pechuga sin piel"],
    "Pollo": ["Corazón de pollo", "Pollo ala con piel", "Pollo entero con piel", "Pollo muslo con piel", "Pollo pechuga con piel"],
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
    "Ternera": ["Costillas de ternera", "Cuello de ternera", "Pecho de ternera con hueso"],
    "Toro": ["Rabo de toro"],
  },
  "Vísceras": {
    "Buey": ["Lengua de buey"],
    "Cordero": ["Lengua de cordero", "Pulmón de cordero", "Riñón de cordero"],
    "Ternera": ["Lengua de ternera", "Pulmón de ternera", "Riñón de ternera"],
  },
  "Hígado": {
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
    "Multivitamínico": ["Dibaq Sense Multivitaminas BARF", "GRAU BARF KombiMix"],
    "Omega-3": ["Aceite de Salmón Natural Greatness", "AniForte Aceite de Salmón", "Brit Care Aceite de Salmón", "Oleum Canis Aceite de Salmón"],
    "Levadura de cerveza": ["GRAU Levadura de cerveza", "PAWS & PATCH Levadura de cerveza"],
    "Algas (Kelp)": ["AniForte Seaweed Meal", "Sonrisa de Diez Kelp"],
  },
};

const INSTRUCCIONES_POR_CATEGORIA = {
  "Carne muscular": "Cruda. En trozos, no picada — la carne picada tarda más en congelarse del todo y eso aumenta el riesgo bacteriano.",
  "Hueso carnoso": "Crudo SIEMPRE, nunca cocinado — un hueso cocinado se astilla y es peligroso. Entero o en trozos grandes, nunca troceado pequeño. Espera a las 14 semanas para huesos duros.",
  "Vísceras": "Crudas, en trozos pequeños.",
  "Hígado": "Crudo, en trozos pequeños — se da en poca cantidad, no hace falta trocear más de la cuenta.",
  "Pescados y mariscos": "El pescado puede darse crudo si se ha congelado antes (previene el anisakis). Los mariscos, SIEMPRE cocinados.",
  "Verduras y frutas": "Trituradas o muy cocidas — el perro no digiere bien la fibra vegetal cruda entera.",
  "Suplementos comerciales": "Sigue la dosis del fabricante en el envase — no calcules a ojo.",
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
  return "Extras";
}

function respuestaApiAMenu(data, derObjetivo) {
  // convierte {gramos: {alimento: gramos}} de la API al formato que espera VistaMenus
  const items = Object.entries(data.gramos).map(([alimento, gramos]) => {
    const categoria = categoriaDeAlimento(alimento);
    const Icono = (CATEGORIAS_ICONOS.find((c) => c.nombre === categoria) || {}).Icono || Beef;
    return { categoria, Icono, alimento, gramos, porque: null };
  });
  return [{ id: 1, nombre: "Menú 1", dias: 7, kcal: Math.round(derObjetivo), items }];
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

function calcularDER(pesoActualKg, etapa, actividadIdx, esterilizado) {
  if (!pesoActualKg || pesoActualKg <= 0) return null;
  const rer = 70 * Math.pow(pesoActualKg, 0.75);
  let multiplicador;
  if (MULTIPLICADOR_FIJO[etapa] !== undefined) {
    multiplicador = MULTIPLICADOR_FIJO[etapa];
  } else if (etapa === "senior") {
    multiplicador = MULTIPLICADOR_SENIOR[ACTIVIDAD_KEY[Math.min(actividadIdx, 2)]];
  } else {
    multiplicador = MULTIPLICADOR_ADULTO[ACTIVIDAD_KEY[actividadIdx]];
  }
  if (esterilizado === "si") multiplicador *= FACTOR_ESTERILIZADO;
  return Math.round(rer * multiplicador);
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
        <span className="text-[11px] tracking-[0.18em] upperca
