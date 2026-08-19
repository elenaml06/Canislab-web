import { useState, useMemo, useEffect, useRef, Component } from "react";
import { AlertCircle, Award, Beef, Check, CheckCircle2, ChevronLeft, ChevronRight, ClipboardList, Dog, Fish, Flame, Footprints, Hand, Heart, HeartPulse, Info, Lock, Menu, Moon, Pencil, Pill, Plus, Salad, Scissors, Search, SlidersHorizontal, Sparkles, TrendingUp, UtensilsCrossed, X, Zap } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import Auth from "./auth";
import { onAuthChange, logout, guardarPerro, guardarMenu, esPremium } from "./supabase";
import Suscripcion from "./suscripcion";
import PremiumGate from "./premiumgate";

// ⚠️ AÑADIDO (5 agosto, madrugada) — CASO REAL: "pantalla en blanco al
// tocar el menú" reportado varias veces sin conseguir localizar la
// causa exacta en el código, revisándolo a mano. Motivo real
// encontrado: la app entera no tenía NINGUNA red de seguridad para
// errores de React -- cualquier fallo de JavaScript, en cualquier
// componente, durante el renderizado, tumba TODA la app a blanco, sin
// ningún mensaje, porque React así lo hace por diseño si nadie lo
// captura. Con esto, un fallo futuro (sea cual sea, no solo el de
// hoy) da un mensaje legible y un botón para recargar, en vez de un
// blanco total sin ninguna pista de qué ha pasado -- muy necesario
// para poder diagnosticar esto de verdad la próxima vez, en vez de
// seguir a ciegas.
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    // queda en la consola del navegador (F12 → Console) para poder
    // copiar el mensaje exacto si hace falta investigarlo más a fondo
    console.error("RAWKU — error atrapado:", error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ minHeight: "100vh", width: "100%", display: "flex", flexDirection: "column",
                      alignItems: "center", justifyContent: "center", padding: "32px 24px",
                      textAlign: "center", background: "#FBF7FC", fontFamily: "sans-serif" }}>
          <p style={{ color: "#231539", fontSize: 20, marginBottom: 8, fontWeight: 700 }}>
            Algo ha fallado
          </p>
          <p style={{ color: "#9A8CB8", fontSize: 13, marginBottom: 24, maxWidth: 320 }}>
            {String(this.state.error?.message || this.state.error)}
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{ background: "#5A4088", color: "#FFFFFF", fontWeight: 700, fontSize: 14,
                    padding: "12px 28px", borderRadius: 12, border: "none" }}
          >
            Recargar
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const API_BASE = "https://canislab-api.onrender.com";

function especieDe(nombre) {
  if (nombre.includes(" de ")) {
    const resto = nombre.split(" de ")[1];
    const p = resto.split(" ")[0];
    return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
  }
  return nombre.split(" ")[0];
}

// ⚠️ QUITADO (5 agosto, madrugada) — AUDITORÍA: "POOL_CANDIDATOS" y las
// dos funciones que lo usaban ("especiesBaseDisponibles",
// "generarCandidatosAleatorios") nunca se llamaban desde ningún sitio
// activo -- código muerto. Dependían de una lista con "fantasmas"
// (alimentos que no existen en el catálogo real, como "Cuello de
// pollo" o "Rabo de toro") que nunca se actualizó cuando el catálogo
// real cambió. Exactamente el mismo patrón que causó que "Lengua de
// ternera" cayera en Extras -- una segunda fuente de verdad
// desincronizada. Se quita del todo: categoriaDeAlimento() ya no
// necesita ningún respaldo, CATEGORIAS_ALIMENTO cubre el catálogo
// real completo, verificado alimento por alimento contra el backend.

// ⚠️ AÑADIDO (5 agosto, madrugada) — CASO REAL, pedido expreso: "me ha
// añadido Yoduro potásico a 0 gramos... ¿cómo puede añadir algo a 0
// gramos?" -- el backend permite valores muy pequeños a propósito (un
// suplemento como el yoduro potásico puede necesitarse en fracciones
// de gramo para cerrar el yodo exacto), pero al redondear a 1 decimal
// aquí, un valor real como 0.03g se mostraba literalmente como "0g" --
// visualmente parece que no se añade nada, cuando SÍ se está añadiendo
// una cantidad real, solo que diminuta. Bajar el redondeo del backend
// reintroduciría el problema que motivó bajarlo en su momento (perder
// del todo aportes reales y necesarios de suplementos concentrados) --
// la solución correcta es aquí: para cantidades tan pequeñas que
// redondearían a "0", mostrar "< 0,1 g" en vez de "0g", para dejar
// claro que sí hay algo, aunque sea una traza.
function formatearGramos(gramos) {
  const redondeado = Math.round(gramos * 10) / 10;
  if (redondeado === 0 && gramos > 0) return "< 0,1 g";
  return `${redondeado}g`;
}

// ⚠️ AÑADIDO (5 agosto, madrugada) — CASO REAL, pedido expreso: para un
// suplemento vendido en comprimidos, mostrar "0,1g" o "< 0,1 g" no
// sirve para nada -- nadie puede pesar eso en casa. Convierte los
// gramos reales a una fracción de comprimido PRACTICABLE (entero,
// medio, cuarto...) -- partir en trozos más pequeños que un cuarto no
// es realista, así que se redondea a la fracción practicable más
// cercana. Es el único alimento del catálogo vendido así (confirmado
// revisando el catálogo entero), de ahí que sea una función dedicada
// en vez de un sistema genérico de "peso por unidad" para todo el
// catálogo -- estaría sobredimensionado para un único caso real.
function formatearComprimidos(gramos, pesoComprimido) {
  const unidades = gramos / pesoComprimido;
  const fracciones = [0.25, 0.5, 0.75, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 8];
  let mejor = fracciones[0];
  let menorDiferencia = Math.abs(unidades - mejor);
  for (const f of fracciones) {
    const diferencia = Math.abs(unidades - f);
    if (diferencia < menorDiferencia) { mejor = f; menorDiferencia = diferencia; }
  }
  if (unidades > 8) return `${Math.round(unidades)} comprimidos`;
  const NOMBRES = { 0.25: "1/4 comprimido", 0.5: "medio comprimido", 0.75: "3/4 comprimido", 1: "1 comprimido" };
  return NOMBRES[mejor] || `${mejor} comprimidos`;
}

function eleccionesDelUsuario(modo, configPersonalizar) {
  if (modo === "personalizar") {
    const e = [];
    for (const [cat, c] of Object.entries(configPersonalizar || {})) {
      if (c?.modo === "manual" && c.elegido?.length > 0) {
        e.push(...c.elegido.filter((a) => !a.startsWith("Todo: ")));
      }
    }
    return e;
  }
  return [];
}

// ⚠️ AÑADIDO (5 agosto, noche): antes "Todo: Pollo" se descartaba sin más
// al construir la petición -- no forzaba nada, no hacía nada de verdad.
// Esto recoge esas selecciones y las traduce a {categoría: especie} para
// que el backend restrinja esa categoría concreta a esa especie, dejando
// que el motor elija libremente qué corte usar dentro de ella.
function restriccionesDeEspecie(modo, configPersonalizar) {
  const restricciones = {};
  if (modo === "personalizar") {
    for (const [cat, c] of Object.entries(configPersonalizar || {})) {
      if (c?.modo === "manual") {
        const todoEspecie = (c.elegido || []).find((a) => a.startsWith("Todo: "));
        if (todoEspecie) restricciones[cat] = todoEspecie.replace("Todo: ", "");
      }
    }
  }
  return restricciones;
}

// ⚠️ CORREGIDO (5 agosto, madrugada) — CASO REAL MUY GRAVE ENCONTRADO,
// pedido expreso ("hay que comparar según lo que necesita ese perro en
// esa etapa"): "senior" se convertía SIEMPRE en "Adulto" antes de
// mandarlo al servidor, en TODO el sistema (generación de menús Y
// analizador). El backend YA tenía lógica correcta y lista para
// "Senior" en los dos sitios que importan -- el multivitamínico
// específico "V-INTEGRA Senior" en vez del de adulto normal, y la
// proteína mínima más alta que FEDIAF recomienda para perros mayores
// (45 g/1000kcal en vez de 40) -- pero NUNCA se activaba, porque el
// valor "Senior" nunca llegaba de verdad: se perdía aquí mismo, en
// esta conversión. Ningún perro senior de la app había recibido el
// multivitamínico correcto hasta ahora. Ahora se manda "Senior" tal
// cual, dejando que el backend decida -- que es justo para lo que ya
// estaba preparado.
const ETAPA_A_SUFIJO_API = {
  cachorro_joven: "CachorroJoven",
  cachorro_crecimiento: "CachorroCrecimiento",
  adulto: "Adulto",
  senior: "Senior",
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
const fontMono = "monospace";
const TOTAL_PASOS = 6;

const RAZAS = [
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
  {"nombre": "Lebrel Italiano", "tamano": "Toy", "pesoMin": 3, "pesoMax": 5, "pesoMedio": 4},
  {"nombre": "Azawakh", "tamano": "Mediano", "pesoMin": 15, "pesoMax": 25, "pesoMedio": 20},
  {"nombre": "Sloughi (Lebrel Árabe)", "tamano": "Mediano", "pesoMin": 20, "pesoMax": 28, "pesoMedio": 24},
  {"nombre": "Galgo Húngaro (Magyar Agár)", "tamano": "Mediano", "pesoMin": 22, "pesoMax": 31, "pesoMedio": 26.5},
  {"nombre": "Lebrel Polaco (Chart Polski)", "tamano": "Grande", "pesoMin": 27, "pesoMax": 31, "pesoMedio": 29},
  {"nombre": "Boyero Australiano", "tamano": "Mediano", "pesoMin": 18, "pesoMax": 26, "pesoMedio": 22},
  {"nombre": "Briard (Pastor de Brie)", "tamano": "Grande", "pesoMin": 34, "pesoMax": 45, "pesoMedio": 39.5},
  {"nombre": "Pastor de Picardía", "tamano": "Mediano", "pesoMin": 23, "pesoMax": 32, "pesoMedio": 27.5},
  {"nombre": "Pastor de los Pirineos", "tamano": "Pequeño", "pesoMin": 7, "pesoMax": 15, "pesoMedio": 11},
  {"nombre": "Puli", "tamano": "Pequeño", "pesoMin": 10, "pesoMax": 15, "pesoMedio": 12.5},
  {"nombre": "Pumi", "tamano": "Pequeño", "pesoMin": 8, "pesoMax": 15, "pesoMedio": 11.5},
  {"nombre": "Mudi", "tamano": "Pequeño", "pesoMin": 8, "pesoMax": 13, "pesoMedio": 10.5},
  {"nombre": "Perro de Pastor Bergamasco", "tamano": "Grande", "pesoMin": 26, "pesoMax": 38, "pesoMedio": 32},
  {"nombre": "Pastor Maremmano-Abruzzés", "tamano": "Grande", "pesoMin": 30, "pesoMax": 45, "pesoMedio": 37.5},
  {"nombre": "Collie de Pelo Corto", "tamano": "Grande", "pesoMin": 18, "pesoMax": 30, "pesoMedio": 24},
  {"nombre": "Pastor Blanco Suizo", "tamano": "Grande", "pesoMin": 25, "pesoMax": 40, "pesoMedio": 32.5},
  {"nombre": "Pastor Catalán", "tamano": "Mediano", "pesoMin": 16, "pesoMax": 22, "pesoMedio": 19},
  {"nombre": "Pastor Polaco de Tierras Bajas", "tamano": "Mediano", "pesoMin": 14, "pesoMax": 23, "pesoMedio": 18.5},
  {"nombre": "Pastor Polaco de Podhale (Tatra)", "tamano": "Gigante", "pesoMin": 45, "pesoMax": 70, "pesoMedio": 57.5},
  {"nombre": "Perro de Pastor Portugués", "tamano": "Mediano", "pesoMin": 17, "pesoMax": 27, "pesoMedio": 22},
  {"nombre": "Tchuvatch Eslovaco", "tamano": "Grande", "pesoMin": 31, "pesoMax": 44, "pesoMedio": 37.5},
  {"nombre": "Perro Lobo de Saarloos", "tamano": "Grande", "pesoMin": 36, "pesoMax": 41, "pesoMedio": 38.5},
  {"nombre": "Schapendoes Neerlandés", "tamano": "Pequeño", "pesoMin": 12, "pesoMax": 20, "pesoMedio": 16},
  {"nombre": "Perro de Pastor Islandés", "tamano": "Pequeño", "pesoMin": 11, "pesoMax": 20, "pesoMedio": 15.5},
  {"nombre": "Pinscher Alemán", "tamano": "Mediano", "pesoMin": 14, "pesoMax": 20, "pesoMedio": 17},
  {"nombre": "Schnauzer Gigante", "tamano": "Grande", "pesoMin": 35, "pesoMax": 47, "pesoMedio": 41},
  {"nombre": "Mastín Tibetano", "tamano": "Gigante", "pesoMin": 34, "pesoMax": 72, "pesoMedio": 53},
  {"nombre": "Hovawart", "tamano": "Grande", "pesoMin": 25, "pesoMax": 40, "pesoMedio": 32.5},
  {"nombre": "Boerboel", "tamano": "Gigante", "pesoMin": 50, "pesoMax": 90, "pesoMedio": 70},
  {"nombre": "Tosa Inu", "tamano": "Gigante", "pesoMin": 35, "pesoMax": 90, "pesoMedio": 62.5},
  {"nombre": "Broholmer", "tamano": "Gigante", "pesoMin": 40, "pesoMax": 70, "pesoMedio": 55},
  {"nombre": "Ca de Bou (Dogo Mallorquín)", "tamano": "Grande", "pesoMin": 30, "pesoMax": 38, "pesoMedio": 34},
  {"nombre": "Alano Español", "tamano": "Grande", "pesoMin": 33, "pesoMax": 45, "pesoMedio": 39},
  {"nombre": "Perro Pastor de Kangal", "tamano": "Gigante", "pesoMin": 40, "pesoMax": 60, "pesoMedio": 50},
  {"nombre": "Perro de Pastor de Asia Central", "tamano": "Gigante", "pesoMin": 40, "pesoMax": 79, "pesoMedio": 59.5},
  {"nombre": "Perro de Pastor de Charplanina", "tamano": "Grande", "pesoMin": 25, "pesoMax": 45, "pesoMedio": 35},
  {"nombre": "Perro de Montaña de la Estrela", "tamano": "Gigante", "pesoMin": 30, "pesoMax": 50, "pesoMedio": 40},
  {"nombre": "Rafeiro do Alentejo", "tamano": "Gigante", "pesoMin": 35, "pesoMax": 60, "pesoMedio": 47.5},
  {"nombre": "Perro de Castro Laboreiro", "tamano": "Grande", "pesoMin": 20, "pesoMax": 40, "pesoMedio": 30},
  {"nombre": "Gran Boyero Suizo", "tamano": "Gigante", "pesoMin": 38.5, "pesoMax": 64, "pesoMedio": 51.2},
  {"nombre": "Boyero de Appenzell", "tamano": "Grande", "pesoMin": 22, "pesoMax": 32, "pesoMedio": 27},
  {"nombre": "Boyero de Entlebuch", "tamano": "Mediano", "pesoMin": 20, "pesoMax": 30, "pesoMedio": 25},
  {"nombre": "Pinscher Austríaco", "tamano": "Mediano", "pesoMin": 12, "pesoMax": 18, "pesoMedio": 15},
  {"nombre": "Continental Bulldog", "tamano": "Mediano", "pesoMin": 22, "pesoMax": 30, "pesoMedio": 26},
  {"nombre": "Kerry Blue Terrier", "tamano": "Mediano", "pesoMin": 15, "pesoMax": 18, "pesoMedio": 16.5},
  {"nombre": "Terrier Galés", "tamano": "Pequeño", "pesoMin": 9, "pesoMax": 10, "pesoMedio": 9.5},
  {"nombre": "Terrier Irlandés", "tamano": "Pequeño", "pesoMin": 11, "pesoMax": 12, "pesoMedio": 11.5},
  {"nombre": "Lakeland Terrier", "tamano": "Pequeño", "pesoMin": 7, "pesoMax": 8, "pesoMedio": 7.5},
  {"nombre": "Irish Soft Coated Wheaten Terrier", "tamano": "Mediano", "pesoMin": 16, "pesoMax": 20.5, "pesoMedio": 18.2},
  {"nombre": "Glen of Imaal Terrier", "tamano": "Pequeño", "pesoMin": 14, "pesoMax": 16, "pesoMedio": 15},
  {"nombre": "Dandie Dinmont Terrier", "tamano": "Pequeño", "pesoMin": 8, "pesoMax": 11, "pesoMedio": 9.5},
  {"nombre": "Cesky Terrier", "tamano": "Mini", "pesoMin": 6, "pesoMax": 10, "pesoMedio": 8},
  {"nombre": "Terrier de Caza Alemán (Jagdterrier)", "tamano": "Pequeño", "pesoMin": 7.5, "pesoMax": 10, "pesoMedio": 8.8},
  {"nombre": "Terrier Australiano", "tamano": "Mini", "pesoMin": 5, "pesoMax": 7, "pesoMedio": 6},
  {"nombre": "Bull Terrier Miniatura", "tamano": "Pequeño", "pesoMin": 5, "pesoMax": 18, "pesoMedio": 11.5},
  {"nombre": "American Pit Bull Terrier", "tamano": "Mediano", "pesoMin": 14, "pesoMax": 27, "pesoMedio": 20.5},
  {"nombre": "Manchester Terrier", "tamano": "Pequeño", "pesoMin": 5, "pesoMax": 10, "pesoMedio": 7.5},
  {"nombre": "Terrier Japonés", "tamano": "Mini", "pesoMin": 4, "pesoMax": 6, "pesoMedio": 5},
  {"nombre": "Eurasier", "tamano": "Mediano", "pesoMin": 18, "pesoMax": 32, "pesoMedio": 25},
  {"nombre": "Perro Cazador de Alces Noruego", "tamano": "Mediano", "pesoMin": 20, "pesoMax": 27, "pesoMedio": 23.5},
  {"nombre": "Spitz Finlandés", "tamano": "Pequeño", "pesoMin": 7, "pesoMax": 13, "pesoMedio": 10},
  {"nombre": "Buhund Noruego", "tamano": "Pequeño", "pesoMin": 12, "pesoMax": 18, "pesoMedio": 15},
  {"nombre": "Vallhund Sueco", "tamano": "Pequeño", "pesoMin": 11.5, "pesoMax": 16, "pesoMedio": 13.8},
  {"nombre": "Perro Finlandés de Laponia", "tamano": "Mediano", "pesoMin": 15, "pesoMax": 24, "pesoMedio": 19.5},
  {"nombre": "Spitz Japonés", "tamano": "Mini", "pesoMin": 5, "pesoMax": 10, "pesoMedio": 7.5},
  {"nombre": "Spitz Alemán Grande", "tamano": "Pequeño", "pesoMin": 17, "pesoMax": 20, "pesoMedio": 18.5},
  {"nombre": "Spitz Alemán Pequeño", "tamano": "Mini", "pesoMin": 5, "pesoMax": 10, "pesoMedio": 7.5},
  {"nombre": "Shikoku", "tamano": "Mediano", "pesoMin": 16, "pesoMax": 25, "pesoMedio": 20.5},
  {"nombre": "Kai Ken", "tamano": "Mediano", "pesoMin": 11, "pesoMax": 25, "pesoMedio": 18},
  {"nombre": "Kishu Ken", "tamano": "Mediano", "pesoMin": 13, "pesoMax": 27, "pesoMedio": 20},
  {"nombre": "Hokkaido", "tamano": "Mediano", "pesoMin": 20, "pesoMax": 30, "pesoMedio": 25},
  {"nombre": "Jindo Coreano", "tamano": "Mediano", "pesoMin": 15, "pesoMax": 23, "pesoMedio": 19},
  {"nombre": "Thai Ridgeback", "tamano": "Mediano", "pesoMin": 23, "pesoMax": 34, "pesoMedio": 28.5},
  {"nombre": "Faraón (Pharaoh Hound)", "tamano": "Mediano", "pesoMin": 18, "pesoMax": 27, "pesoMedio": 22.5},
  {"nombre": "Perro de Canaan", "tamano": "Mediano", "pesoMin": 15, "pesoMax": 25, "pesoMedio": 20},
  {"nombre": "Cirneco del Etna", "tamano": "Pequeño", "pesoMin": 8, "pesoMax": 12, "pesoMedio": 10},
  {"nombre": "Podenco Canario", "tamano": "Mediano", "pesoMin": 20, "pesoMax": 25, "pesoMedio": 22.5},
  {"nombre": "Xoloitzcuintle Estándar", "tamano": "Mediano", "pesoMin": 14, "pesoMax": 25, "pesoMedio": 19.5},
  {"nombre": "Sabueso de San Huberto (Bloodhound)", "tamano": "Grande", "pesoMin": 36, "pesoMax": 50, "pesoMedio": 43},
  {"nombre": "Foxhound Inglés", "tamano": "Grande", "pesoMin": 30, "pesoMax": 34, "pesoMedio": 32},
  {"nombre": "Foxhound Americano", "tamano": "Grande", "pesoMin": 29, "pesoMax": 34, "pesoMedio": 31.5},
  {"nombre": "Coonhound Negro y Fuego", "tamano": "Grande", "pesoMin": 25, "pesoMax": 36, "pesoMedio": 30.5},
  {"nombre": "Harrier", "tamano": "Mediano", "pesoMin": 22, "pesoMax": 27, "pesoMedio": 24.5},
  {"nombre": "Otterhound", "tamano": "Grande", "pesoMin": 30, "pesoMax": 52, "pesoMedio": 41},
  {"nombre": "Gran Basset Grifón Vendeano", "tamano": "Mediano", "pesoMin": 18, "pesoMax": 20, "pesoMedio": 19},
  {"nombre": "Pequeño Basset Grifón Vendeano", "tamano": "Pequeño", "pesoMin": 11, "pesoMax": 20, "pesoMedio": 15.5},
  {"nombre": "Sabueso Español", "tamano": "Mediano", "pesoMin": 20, "pesoMax": 25, "pesoMedio": 22.5},
  {"nombre": "Basset Azul de Gascuña", "tamano": "Mediano", "pesoMin": 16, "pesoMax": 20, "pesoMedio": 18},
  {"nombre": "Basset Artesiano de Normandía", "tamano": "Mediano", "pesoMin": 15, "pesoMax": 20, "pesoMedio": 17.5},
  {"nombre": "Braco Italiano", "tamano": "Grande", "pesoMin": 25, "pesoMax": 40, "pesoMedio": 32.5},
  {"nombre": "Spinone Italiano", "tamano": "Grande", "pesoMin": 28, "pesoMax": 39, "pesoMedio": 33.5},
  {"nombre": "Braco Alemán de Pelo Duro", "tamano": "Grande", "pesoMin": 20, "pesoMax": 32, "pesoMedio": 26},
  {"nombre": "Grifón Korthals (de Pelo Duro)", "tamano": "Mediano", "pesoMin": 16, "pesoMax": 32, "pesoMedio": 24},
  {"nombre": "Perdiguero de Burgos", "tamano": "Grande", "pesoMin": 25, "pesoMax": 30, "pesoMedio": 27.5},
  {"nombre": "Perdiguero Portugués", "tamano": "Mediano", "pesoMin": 16, "pesoMax": 27, "pesoMedio": 21.5},
  {"nombre": "Braco Húngaro de Pelo Duro", "tamano": "Mediano", "pesoMin": 20, "pesoMax": 30, "pesoMedio": 25},
  {"nombre": "Gran Münsterländer", "tamano": "Grande", "pesoMin": 25, "pesoMax": 32, "pesoMedio": 28.5},
  {"nombre": "Pequeño Münsterländer", "tamano": "Mediano", "pesoMin": 17, "pesoMax": 26, "pesoMedio": 21.5},
  {"nombre": "Stabyhoun", "tamano": "Mediano", "pesoMin": 18, "pesoMax": 27, "pesoMedio": 22.5},
  {"nombre": "Pudelpointer", "tamano": "Grande", "pesoMin": 25, "pesoMax": 31, "pesoMedio": 28},
  {"nombre": "Setter Irlandés Rojo y Blanco", "tamano": "Mediano", "pesoMin": 18, "pesoMax": 32, "pesoMedio": 25},
  {"nombre": "Clumber Spaniel", "tamano": "Grande", "pesoMin": 25, "pesoMax": 39, "pesoMedio": 32},
  {"nombre": "Sussex Spaniel", "tamano": "Mediano", "pesoMin": 20, "pesoMax": 23, "pesoMedio": 21.5},
  {"nombre": "Welsh Springer Spaniel", "tamano": "Mediano", "pesoMin": 16, "pesoMax": 25, "pesoMedio": 20.5},
  {"nombre": "Field Spaniel", "tamano": "Mediano", "pesoMin": 18, "pesoMax": 25, "pesoMedio": 21.5},
  {"nombre": "Retriever de Nueva Escocia", "tamano": "Mediano", "pesoMin": 17, "pesoMax": 23, "pesoMedio": 20},
  {"nombre": "Retriever de Pelo Rizado", "tamano": "Grande", "pesoMin": 32, "pesoMax": 45, "pesoMedio": 38.5},
  {"nombre": "Kooikerhondje", "tamano": "Pequeño", "pesoMin": 9, "pesoMax": 11, "pesoMedio": 10},
  {"nombre": "Lagotto Romagnolo", "tamano": "Pequeño", "pesoMin": 11, "pesoMax": 16, "pesoMedio": 13.5},
  {"nombre": "Perro de Agua Americano", "tamano": "Pequeño", "pesoMin": 11, "pesoMax": 20, "pesoMedio": 15.5},
  {"nombre": "Caniche Grande", "tamano": "Grande", "pesoMin": 20, "pesoMax": 32, "pesoMedio": 26},
  {"nombre": "Bichón Boloñés", "tamano": "Toy", "pesoMin": 2.5, "pesoMax": 4, "pesoMedio": 3.2},
  {"nombre": "Löwchen (Pequeño Perro León)", "tamano": "Mini", "pesoMin": 4, "pesoMax": 8, "pesoMedio": 6},
  {"nombre": "Petit Brabançon", "tamano": "Toy", "pesoMin": 3.5, "pesoMax": 6, "pesoMedio": 4.8},
  {"nombre": "Grifón Belga", "tamano": "Toy", "pesoMin": 3.5, "pesoMax": 6, "pesoMedio": 4.8},
  {"nombre": "King Charles Spaniel", "tamano": "Toy", "pesoMin": 3.6, "pesoMax": 6.4, "pesoMedio": 5},
  {"nombre": "Chin Japonés", "tamano": "Toy", "pesoMin": 1.8, "pesoMax": 3.5, "pesoMedio": 2.6},
  {"nombre": "Spaniel Tibetano", "tamano": "Mini", "pesoMin": 4, "pesoMax": 7, "pesoMedio": 5.5},
  {"nombre": "Kromfohrländer", "tamano": "Pequeño", "pesoMin": 9, "pesoMax": 16, "pesoMedio": 12.5},
];
const TAMANOS = ["Toy", "Mini", "Pequeño", "Mediano", "Grande", "Gigante"];
const MESES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
const CONDICIONES = [
  // ⚠️ CAMBIADO (5 agosto, madrugada) — pedido expreso, tras varias
  // rondas descartando alternativas (rellenito de amor, entrado en
  // carnes): nombres cariñosos, simétricos con el patrón "muy X / X"
  // que ya usan los dos primeros niveles.
  { label: "Muy flaquito", detalle: "Costillas muy marcadas, sin nada de grasa" },
  { label: "Flaquito", detalle: "Costillas se notan fácil al tacto" },
  { label: "Ideal", detalle: "Costillas se palpan, cintura visible desde arriba" },
  { label: "Rellenito", detalle: "Cuesta notar las costillas, poca cintura" },
  { label: "Muy gordete", detalle: "No se notan las costillas, sin cintura" },
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
    "Pavo": ["Molleja de pavo", "Pavo", "Pavo muslo con piel", "Pavo pechuga con piel", "Pavo pechuga sin piel"],
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
    "Vaca": ["Laringe de vacuno"],
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
    "Cordero": ["Pulmón de cordero", "Riñón de cordero", "Bazo de cordero", "Testículos de cordero"],
    "Ternera": ["Pulmón de ternera", "Riñón de ternera", "Timo de ternera", "Cerebro de ternera"],
    "Vaca": ["Bazo de vaca", "Páncreas de vaca"],
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
    "Borraja": ["Borraja"],
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
  },
  // ⚠️ CORREGIDO (5 agosto): el backend tiene 6 multivitamínicos y un
  // yoduro potásico que el frontend no conocía -- por eso "V-INTEGRA
  // Perro Adulto" (y cualquiera de los otros 3 que faltaban) caía en
  // "Extras" al no encontrarse aquí, aunque el motor SÍ lo usa de verdad.
  "Suplementos comerciales": {
    "Calcio": ["Cáscara de huevo PAWS & PATCH", "Cáscara de huevo casera (en polvo)", "GRAU Harina de Hueso", "LUPO NATURAL BARF Huesos en polvo"],
    "Fibra": ["NaturGreen Psyllium Bio"],
    "Hierro": ["AniForte Beef Blood Powder"],
    "Multivitamínico": ["Homemadekun (multivitamínico completo)", "NEKTON Dog Easy-BARF (multivitamínico)", "napfcheck Novomineral proLEBER", "astoral MultiVital BARF", "V-INTEGRA Perro Adulto", "V-INTEGRA Cachorro", "V-INTEGRA Senior", "V-INTEGRA Epato", "V-INTEGRA Renal", "Nutratop Vitamínico-Mineral 7:1"],
    "Omega-3": ["Aceite de Salmón Natural Greatness", "AniForte Aceite de Salmón", "Brit Care Aceite de Salmón", "Oleum Canis Aceite de Salmón", "Pets Purest Aceite de Salmón"],
    "Levadura de cerveza": ["GRAU Levadura de cerveza", "PAWS & PATCH Levadura de cerveza"],
    "Algas (Kelp)": ["AniForte Seaweed Meal", "Sonrisa de Diez Kelp"],
    "Yodo": ["Yoduro potásico (comprimidos 200 µg)"],
  },
};

const INSTRUCCIONES_POR_CATEGORIA = {
  "Carne muscular": "Cruda. En trozos, no picada — la carne picada tarda más en congelarse del todo y eso aumenta el riesgo bacteriano. Si la preparas con antelación, congélala al menos 1 semana a -18/-20°C antes de darla — es lo que recomienda ESCCAP (la referencia europea en parásitos de mascotas) para reducir el riesgo parasitario de verdad. Una vez descongelada, consúmela dentro de 3 días guardada en la nevera — pasado ese tiempo, mejor no dársela.",
  "Vísceras": "Crudas, en trozos pequeños. Igual que con la carne, si la preparas con antelación, al menos 1 semana congelada a -18/-20°C antes de darla. Una vez descongelada, dentro de 3 días.",
  "Hígado": "Crudo, en trozos pequeños — se da en poca cantidad, no hace falta trocear más de la cuenta. Al menos 1 semana congelado antes de darlo, si lo preparas con antelación. Una vez descongelado, dentro de 3 días.",
  "Verduras y frutas": "Cada una necesita algo distinto (triturar, cocer, quitar semillas...) — mira la indicación de este alimento en concreto, más abajo.",
  "Extras": "Aceites, semillas y huevo se añaden CRUDOS al final, por encima de la comida ya descongelada — nunca se congelan junto con el resto ni se cocinan (algunos, como el aceite de girasol o de linaza, pierden sus propiedades con el calor). Cada alimento de esta categoría tiene además su propia indicación aquí abajo.",
  "Hueso carnoso": "Crudo SIEMPRE, nunca cocinado — cocinado se astilla y es peligroso. Entero o en trozos grandes, nunca troceado pequeño: el perro tiene que roerlo, no tragarlo. Que coma tranquilo y supervisado, sobre todo las primeras veces. Espera a las 14 semanas para los huesos más duros, y ve variando el tipo entre menús. Si lo preparas con antelación, al menos 1 semana congelado a -18/-20°C. Una vez descongelado, dentro de 3 días.",
  "Pescados y mariscos": "Puede darse crudo si se ha congelado antes (previene el anisakis) — el pescado necesita más tiempo que la carne: al menos 2 semanas congelado a -18/-20°C. Una vez descongelado, dentro de 3 días — el pescado se estropea más rápido que la carne, así que si notas mal olor, descártalo antes. Los mariscos, SIEMPRE cocinados. Solo si se convierte en la proteína principal DE FORMA REPETIDA: el pescado crudo lleva una enzima que va destruyendo la Vitamina B1 poco a poco — con un uso normal, variando entre proteínas, no supone ningún problema. Si usas atún u otro pescado grande, no más de 1 vez por semana — acumulan más mercurio que la sardina, la caballa o el boquerón.",
  "Suplementos comerciales": "Los gramos que te damos aquí YA están calculados respetando el límite máximo seguro del fabricante para el peso de tu perro — no hace falta que sigas la dosis del envase por tu cuenta, dale la cantidad que te mostramos. Se añaden al final, junto con los extras, sobre la comida ya descongelada.",
};

const COMO_DAR_ALIMENTO = {
  // ⚠️ AÑADIDO (5 agosto, madrugada) — CASO REAL, pedido expreso: se
  // vende en comprimidos, no a granel -- pesoComprimido (0.25 g, según
  // la ficha del fabricante) permite convertir los gramos reales del
  // menú a "cuántos comprimidos" en vez de un peso que nadie puede
  // pesar en casa. esComprimido activa esa conversión especial en el
  // punto donde se muestra (ver formatearComprimidos).
  "Yoduro potásico (comprimidos 200 µg)": { pieza: "un comprimido pesa unos 0,25 g", como: "Se puede partir o disolver en agua para dosis más pequeñas.", esComprimido: true, pesoComprimido: 0.25 },
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
  "Cuello de pollo": { pieza: "un cuello entero pesa unos 35-50 g", como: "Entero, sin trocear. Es de los más blandos: buen hueso para empezar. En perros muy tragones, dáselo semicongelado para que tenga que roerlo en vez de tragárselo de golpe." },
  "Carcasa de pollo": { pieza: "incluye el espinazo — en España se compran como la misma pieza, no se venden por separado. Media carcasa son unos 150-200 g", como: "Partida por la mitad o en cuartos según el tamaño del perro. Lleva poca carne, así que suele ir acompañada de carne aparte." },
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

  // ⚠️ AÑADIDO (5 agosto, madrugada) — CASO REAL, pedido expreso: antes
  // TODA la categoría "Verduras y frutas" mostraba el mismo texto
  // genérico ("trituradas o muy cocidas... si hay manzana quitar
  // semillas"), aunque solo la manzana tenga semillas, y no todas
  // necesitan lo mismo. Cada una de las 46 verduras/frutas reales del
  // catálogo tiene aquí su propio aviso, solo con lo que a ESE
  // alimento en concreto le aplica de verdad.
  "Acelga": { como: "Muy troceada o cocida al vapor, nunca cruda entera — el perro no digiere bien la fibra vegetal cruda." },
  "Albahaca": { como: "Picada fina, en poca cantidad — se usa más como aromática que como verdura de base." },
  "Albaricoque": { pieza: "quita SIEMPRE el hueso entero", como: "Solo la pulpe madura, troceada. El hueso contiene amigdalina (libera cianuro) y además es un riesgo real de atragantamiento — nunca se lo des con el hueso." },
  "Alcachofa": { como: "Cocida, solo el corazón (la parte tierna) — las hojas duras no se digieren." },
  "Apio": { como: "Muy troceado o cocido — las fibras largas del tallo pueden costarle de tragar y digerir enteras." },
  "Arándano": { como: "Enteros o chafados, crudos — son pequeños y blandos, no hace falta cocerlos." },
  "Berenjena": { como: "SIEMPRE cocida, nunca cruda — cruda puede irritar el estómago por la solanina de la piel." },
  "Boniato": { como: "Cocido y en puré o troceado — crudo es duro y casi no se digiere. Pélalo si lo das cocido en trozos grandes." },
  "Borraja": { como: "No se recomienda dar en ninguna cantidad ni forma — contiene alcaloides tóxicos para el hígado (ver aviso de seguridad)." },
  "Brócoli": { como: "Cocido al vapor o muy troceado — crudo puede costarle de digerir y dar gases en cantidad." },
  "Calabacín": { como: "Cocido o muy rallado, con piel — es blando y se digiere bien así." },
  "Calabaza": { como: "Cocida y en puré — cruda es dura y casi no se digiere." },
  "Canónigos": { como: "Muy picados o triturados — son hojas finas, pero igualmente crudas cuesta digerirlas enteras." },
  "Cardo": { como: "Cocido — crudo es fibroso y duro de digerir." },
  "Champiñón": { como: "SOLO champiñón de cultivo comercial (nunca silvestre, por riesgo real de intoxicación). Cocido, troceado." },
  "Coco fresco": { pieza: "solo la pulpe blanca, nunca la cáscara ni el agua en exceso", como: "Pulpe fresca rallada o en trozos pequeños, cruda — en poca cantidad, es muy grasa." },
  "Col lombarda": { como: "Cocida o muy troceada — cruda en cantidad puede dar gases." },
  "Col rizada": { como: "Cocida o muy troceada — cruda en cantidad puede dar gases." },
  "Coles de Bruselas": { como: "Cocidas — crudas y en cantidad son de las que más gases dan." },
  "Coliflor": { como: "Cocida — cruda en cantidad puede dar gases." },
  "Dátil": { pieza: "quita SIEMPRE el hueso entero", como: "Solo la pulpe, troceada, en poca cantidad (es muy azucarado). El hueso es duro y alargado — riesgo real de atragantamiento u obstrucción." },
  "Endibia": { como: "Troceada, cruda — es una hoja tierna, se digiere razonablemente bien así." },
  "Espinaca": { como: "Cocida al vapor o muy troceada — cruda en cantidad puede interferir con la absorción de algunos minerales." },
  "Espárrago verde": { como: "Cocido y troceado — crudo es fibroso." },
  "Frambuesa": { como: "Enteras o chafadas, crudas — son pequeñas y blandas." },
  "Fresa": { como: "Troceada, cruda — quita el rabito verde." },
  "Grelo": { como: "Cocido — crudo en cantidad puede dar gases, y en hipotiroidismo hay que vigilar la cantidad (ver aviso de seguridad)." },
  "Judía verde": { como: "Cocida — cruda es dura y fibrosa." },
  "Lechuga": { como: "Troceada, cruda — aporta poco, pero no hay problema en darla así." },
  "Mandarina": { pieza: "quita las pepitas si tiene", como: "Solo la pulpe, sin piel ni pepitas — en trozos pequeños, cruda." },
  "Mango": { pieza: "quita SIEMPRE el hueso entero", como: "Solo la pulpe madura, sin piel, troceada. El hueso es grande y duro — riesgo real de atragantamiento u obstrucción." },
  "Manzana": { pieza: "quita SIEMPRE las semillas y el corazón", como: "Troceada, cruda, sin piel si el perro tiene el estómago sensible. Las semillas y el corazón contienen una pequeña cantidad de cianuro." },
  "Melón": { pieza: "sin piel ni pepitas", como: "Pulpe troceada, cruda — la piel es dura y no se digiere." },
  "Nabo pelado": { como: "Cocido y troceado — crudo es duro, y en hipotiroidismo hay que vigilar la cantidad (ver aviso de seguridad)." },
  "Naranja": { pieza: "quita las pepitas si tiene", como: "Solo la pulpe, sin piel ni pepitas — en trozos pequeños, cruda." },
  "Pepino": { como: "Troceado, crudo, con piel — se digiere bien así, no hace falta cocerlo." },
  "Pera": { pieza: "quita SIEMPRE las semillas y el corazón", como: "Troceada, cruda. Las semillas y el corazón contienen una pequeña cantidad de cianuro, igual que en la manzana." },
  "Pimiento rojo": { pieza: "quita siempre las semillas y el tallo", como: "Solo maduro (rojo, nunca verde), sin semillas, cocido o muy troceado." },
  "Piña": { pieza: "sin piel ni corazón duro", como: "Pulpe troceada, cruda, en poca cantidad — la piel es dura y no se digiere." },
  "Plátano": { como: "Troceado o chafado, crudo, sin piel — en poca cantidad, es azucarado." },
  "Repollo": { como: "Cocido o muy troceado — crudo en cantidad puede dar gases." },
  "Rucula": { como: "Troceada, cruda — es una hoja tierna, se digiere razonablemente bien así." },
  "Rábano": { como: "Troceado o rallado, crudo, en poca cantidad — tiene sabor fuerte, no a todos los perros les gusta." },
  "Sandía": { pieza: "sin pepitas ni piel", como: "Pulpe troceada, cruda — quita la piel dura y las pepitas grandes si las tiene." },
  "Tomate (puré)": { como: "SOLO maduro (nunca verde ni la planta) — el tomate verde contiene solanina, tóxica. Ya viene en puré, se añade directamente." },
  "Zanahoria": { como: "Rallada o muy troceada, cruda — con piel, bien lavada." },
};


const PATOLOGIAS = [
  { key: "renal", label: "Insuficiencia renal crónica", segura: true },
  { key: "pancreatitis", label: "Pancreatitis", segura: true },
  { key: "oxalato", label: "Cálculos de oxalato cálcico", segura: true },
  // ⚠️ AÑADIDO (5 agosto, madrugada) — pedido expreso: el aviso de "esto
  // lo tiene que ver un veterinario" tenía que saltar al elegir la
  // patología y pulsar continuar, no después de navegar hasta la
  // generación del menú. Se guarda aquí el mismo texto que ya usa el
  // backend, para poder mostrarlo de inmediato sin ni siquiera llamar
  // al servidor -- ya se sabe en el cliente que no va a funcionar.
  { key: "estruvita", label: "Cálculos de estruvita / cistina / urato", segura: false,
    aviso: "Estos cálculos dependen del pH de la orina y de analíticas que la app no puede ver. Una dieta mal ajustada aquí puede empeorarlos, así que no generamos menú automático: necesitas una dieta pautada por tu veterinario." },
  { key: "hepatopatia", label: "Hepatopatía (enfermedad hepática)", segura: true },
  { key: "cardiopatia", label: "Cardiopatía", segura: true },
  { key: "diabetes", label: "Diabetes mellitus", segura: true },
  { key: "hipotiroidismo", label: "Hipotiroidismo", segura: true },
  // ⚠️ AÑADIDO (5 agosto, madrugada) — pedido expreso: si el perro tiene
  // una patología que no está en esta lista, antes no había ninguna
  // opción -- la persona podía quedarse con la duda de si su caso
  // necesitaba también adaptar la dieta, sin ninguna forma de decirlo.
  // Se trata igual que "estruvita" (segura: false): NO genera una
  // dieta automática fingiendo haberla ajustado (el motor no tiene
  // ninguna regla real para una patología que no conoce) -- en vez de
  // eso, dispara el mismo aviso de "esto lo tiene que valorar tu
  // veterinario", para que el caso se estudie de verdad, en vez de
  // dar una falsa sensación de que ya está cubierto.
  { key: "otra", label: "Otra patología / no está en esta lista", segura: false,
    aviso: "Esta condición no está entre las que este sistema sabe ajustar automáticamente todavía, así que no generamos un menú que podría no estar realmente adaptado a lo que necesita: mejor que un veterinario valore su caso en concreto y paute la dieta." },
];

function especiesExcluidasDePerfil(perfil) {
  const especies = new Set();
  [...(perfil.alergias || []), ...(perfil.otrosEvitar || [])].forEach((item) => {
    if (item.alimento && item.alimento.startsWith("Todo: ")) {
      especies.add(item.alimento.replace("Todo: ", ""));
    }
  });
  return especies;
}

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

// ⚠️ AÑADIDO (5 agosto, madrugada): extraído de respuestaApiAMenu para
// poder reutilizar el MISMO reparto de días en el aviso semanal de
// tiaminasa -- una sola fuente de verdad, no dos copias que puedan
// desincronizarse.
function repartirDiasSemana(n) {
  const base = Math.floor(7 / n);
  const resto = 7 % n;
  return Array.from({ length: n }, (_, i) => base + (i < resto ? 1 : 0));
}

// ⚠️ CONECTADO al motor nuevo (5 agosto): /menu/v2 devuelve UNA respuesta
// con la clave "menu" (no "gramos" como el /menu viejo, y no un array). Se
// adapta aqui para que VistaMenus siga recibiendo el mismo formato de
// siempre (lista de menus con items), sin tocar VistaMenus.
function respuestaApiAMenu(respuestas, derObjetivo) {
  const lista = Array.isArray(respuestas) ? respuestas : [respuestas];
  // ⚠️ CORREGIDO (5 agosto, madrugada) — FALLO GRAVE ENCONTRADO, caso
  // real reportado: con 2 menús, Math.round(7/2) = Math.round(3.5) = 4
  // se aplicaba a AMBOS por igual -- 4 + 4 = 8 días en una semana de 7.
  // El mismo problema con cualquier N que no divida 7 exacto. Ahora se
  // reparte de verdad: base = 7 dividido entero entre N, y el resto
  // (lo que sobra de la división) se reparte de uno en uno entre los
  // primeros menús -- así la suma da siempre exactamente 7, sea cual
  // sea N. Con N=2: [4, 3]. Con N=3: [3, 2, 2]. Con N=4: [2, 2, 2, 1].
  const diasPorMenuArr = repartirDiasSemana(lista.length);
  return lista.map((data, i) => {
    const gramosPorAlimento = data.menu || data.gramos || {};
    const items = Object.entries(gramosPorAlimento).map(([alimento, gramos]) => {
      const categoria = categoriaDeAlimento(alimento);
      const Icono = (CATEGORIAS_ICONOS.find((c) => c.nombre === categoria) || {}).Icono || Beef;
      return { categoria, Icono, alimento, gramos, porque: null };
    });
    return {
      id: i + 1,
      nombre: `Menú ${i + 1}`,
      dias: diasPorMenuArr[i],
      kcal: Math.round(derObjetivo),
      items,
      // ⚠️ AÑADIDO (5 agosto): antes el "27/27 OK" era texto fijo, sin
      // ningún dato real detrás. Ahora se lleva la ficha de verdad que
      // devuelve /menu/v2 (semáforo, correctos, total) para mostrarla.
      ficha: data.ficha || null,
      // ⚠️ AÑADIDO (5 agosto, madrugada) — AUDITORÍA: el servidor YA
      // calculaba estos avisos de seguridad (tiaminasa, clara de huevo
      // sola, hígado en exceso, patologías...) en cada respuesta, pero
      // nunca se leían aquí -- se perdían sin que nadie los viera.
      problemasSeguridad: data.problemas_seguridad || [],
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

const PESO_ADULTO_POR_TAMANO = { Toy: 3, Mini: 6, "Pequeño": 12, Mediano: 22, Grande: 32, Gigante: 55 };
// ⚠️ AÑADIDO (5 agosto, madrugada) — pedido expreso: al elegir "mestizo
// / no lo sé", el usuario tiene que elegir un tamaño a ciegas sin saber
// qué kilos representa cada palabra. Rangos calculados de verdad a
// partir de las razas del propio catálogo (RAZAS, arriba) -- el mínimo
// y máximo real de pesoMin/pesoMax entre todas las razas de cada
// tamaño, no una cifra inventada. Es normal que se solapen un poco
// entre tamaños vecinos (hay razas en el límite que podrían encajar en
// cualquiera de los dos) -- no hace falta una frontera exacta, solo una
// referencia para elegir el que mejor describa al perro.
const RANGO_PESO_POR_TAMANO = {
  Toy: "1,5-6kg", Mini: "4-9kg", "Pequeño": "5-19kg",
  Mediano: "14-34kg", Grande: "20-52kg", Gigante: "32-110kg",
};

// ⚠️ AÑADIDO (5 agosto, noche) — FALLO GRAVE ENCONTRADO: el peso adulto
// esperado de un cachorro se calculaba SIEMPRE con la media fija de su
// raza (perfil.raza?.pesoMedio), nunca con la curva de crecimiento real
// del propio cachorro (edad + peso actual) -- aunque esa lógica YA
// estaba implementada, correcta, en el servidor (der.py), nunca se
// replicó aquí ni se llamaba al servidor para usarla. Caso real: Cairo
// con 5 meses y 18kg apunta a 34kg de adulto según su propia curva, no
// a los 26kg de la media de su raza -- 192 kcal/día de diferencia,
// confirmado. Esto es la MISMA tabla y misma lógica que CURVA_CRECIMIENTO
// y peso_adulto_desde_curva() en der.py, letra por letra.
const CURVA_CRECIMIENTO = {
  2: [0.35, 0.30, 0.25, 0.20, 0.15],
  3: [0.50, 0.45, 0.40, 0.32, 0.25],
  4: [0.65, 0.58, 0.52, 0.44, 0.35],
  5: [0.75, 0.68, 0.60, 0.50, 0.40],
  6: [0.80, 0.75, 0.65, 0.55, 0.45],
  7: [0.85, 0.80, 0.72, 0.62, 0.52],
  8: [0.90, 0.85, 0.78, 0.68, 0.58],
  9: [0.94, 0.90, 0.84, 0.74, 0.64],
  10: [0.97, 0.93, 0.88, 0.80, 0.70],
  11: [0.99, 0.96, 0.92, 0.85, 0.75],
  12: [1.00, 0.98, 0.95, 0.89, 0.80],
  15: [1.00, 1.00, 0.99, 0.95, 0.88],
  18: [1.00, 1.00, 1.00, 0.99, 0.94],
  24: [1.00, 1.00, 1.00, 1.00, 1.00],
};
function columnaTamano(pesoAdultoEstimado) {
  if (pesoAdultoEstimado < 5) return 0;
  if (pesoAdultoEstimado < 10) return 1;
  if (pesoAdultoEstimado < 25) return 2;
  if (pesoAdultoEstimado < 45) return 3;
  return 4;
}
function pesoAdultoDesdeCurva(pesoActualKg, meses, pesoMedioRaza, pesoMinRaza, pesoMaxRaza) {
  if (!pesoActualKg || pesoActualKg <= 0 || !meses) return pesoMedioRaza;
  if (meses >= 24) return pesoActualKg; // ya es adulto

  const edades = Object.keys(CURVA_CRECIMIENTO).map(Number).sort((a, b) => a - b);
  let estimado = pesoMedioRaza || pesoActualKg * 2;

  for (let i = 0; i < 4; i++) {
    const col = columnaTamano(estimado);
    const antes = Math.max(...edades.filter((e) => e <= meses), edades[0]);
    const despues = Math.min(...edades.filter((e) => e >= meses), edades[edades.length - 1]);
    const p1 = CURVA_CRECIMIENTO[antes][col];
    const p2 = CURVA_CRECIMIENTO[despues][col];
    const pct = despues === antes ? p1 : p1 + (p2 - p1) * (meses - antes) / (despues - antes);
    if (pct <= 0) return estimado;
    const nuevo = pesoActualKg / pct;
    if (Math.abs(nuevo - estimado) < 0.2) { estimado = nuevo; break; }
    estimado = nuevo;
  }
  if (pesoMinRaza) estimado = Math.max(estimado, pesoMinRaza);
  if (pesoMaxRaza) estimado = Math.min(estimado, pesoMaxRaza);
  return Math.round(estimado * 10) / 10;
}

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

const MULTIPLICADOR_FIJO = { cachorro_joven: 3.0, cachorro_crecimiento: 2.0 };
const MULTIPLICADOR_ADULTO = { sedentario: 1.2, normal: 1.6, activo: 1.8, muy_activo: 2.0, trabajo: 3.0 };
const MULTIPLICADOR_SENIOR = { sedentario: 1.0, normal: 1.2, activo: 1.4 };
const FACTOR_ESTERILIZADO = 0.889;
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
const BCS_DESDE_CONDICION = { 0: 2, 1: 4, 2: 5, 3: 7, 4: 9 };
function pesoIdealDesdeCondicion(pesoActualKg, condicionIdx) {
  if (!pesoActualKg || pesoActualKg <= 0) return null;
  const bcs = BCS_DESDE_CONDICION[condicionIdx];
  if (bcs === undefined) return null;
  const desvio = (bcs - 5) * 0.10;
  let ideal = pesoActualKg / (1 + desvio);
  if (ideal > pesoActualKg * 1.20) ideal = pesoActualKg * 1.20;
  return Math.round(ideal * 100) / 100;
}

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

function Cabecera({ paso, titulo, onAbrirMenu }) {
  return (
    <div style={{ background: VIOLETA }} className="w-full px-6 pt-8 pb-7">
      <div className="flex items-center justify-between mb-5">
        {/* ⚠️ CORREGIDO (5 agosto, madrugada) — pedido expreso: el menú
            va SIEMPRE a la izquierda ahora, sin excepción en ninguna
            pantalla -- antes estaba a la derecha aquí. */}
        <div className="flex items-center gap-3">
          {onAbrirMenu && <BotonMenu onClick={onAbrirMenu} color="#FFFFFF" className="p-0.5" />}
          <span className="text-[11px] tracking-[0.18em] uppercase" style={{ color: MALVA, fontFamily: "monospace" }}>
            Perfil nuevo
          </span>
        </div>
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

function VistaMenus({ menus, onVolver, modo, alimentosEvitados, patologias, nombrePerro, necesitaTransicion, dietaActual, categoriasDisponibles, perfil, derReal, etapaLabel, etapaCalculada, especiesExcluidas, pesoAdultoEsperado, edad, set, setFase, avisoNoForzado, diagnosticoPersonalizar, avisoExtraEspecie, premium, onMostrarSuscripcion, onRegenerarConAlimentos }) {
  const [tabActiva, setTabActiva] = useState(menus[0].id);
  // ⚠️ AÑADIDO (5 agosto, madrugada): estado LOCAL para poder cerrar
  // este aviso -- se inicializa a partir de la prop, pero una vez
  // cerrado no debe volver a aparecer solo porque el componente se
  // vuelva a renderizar.
  const [avisoNoForzadoVisible, setAvisoNoForzadoVisible] = useState(avisoNoForzado);
  // ⚠️ AÑADIDO (5 agosto, madrugada): mismo patrón que avisoNoForzado --
  // estado local para poder cerrarlo.
  const [avisoExtraEspecieVisible, setAvisoExtraEspecieVisible] = useState(avisoExtraEspecie);
  const [menuLateralAbierto, setMenuLateralAbierto] = useState(false);
  // ⚠️ QUITADO (5 agosto, madrugada): el selector de mascotas no hacía
  // nada funcional (ni siquiera "Añadir mascota" tenía onClick), y tras
  // quitar el único botón que lo abría (para poner el menú siempre en
  // el mismo sitio), se quedaba sin ninguna forma de acceder -- código
  // muerto. Se retoma el día que exista de verdad la gestión de varias
  // mascotas.
  const [seccionActiva, setSeccionActiva] = useState(null);
  const [semanaConfirmada, setSemanaConfirmada] = useState(false);
  const [dietaAnalizar, setDietaAnalizar] = useState([]);
  const [abiertoAnalizar, setAbiertoAnalizar] = useState(null);
  const [resultadoAnalisis, setResultadoAnalisis] = useState(null);
  const [analizando, setAnalizando] = useState(false);
  const [errorAnalisis, setErrorAnalisis] = useState(null);
  // ⚠️ AÑADIDO (5 agosto, madrugada) — pedido expreso: algunas dietas
  // comerciales dan el reparto en % ("70% pollo"), no en gramos. Con
  // porcentaje, hace falta el total de gramos/día para poder convertir
  // cada % a gramos reales -- el resto del análisis sigue funcionando
  // en gramos por dentro, solo cambia cómo se introduce.
  // ⚠️ AÑADIDO (5 agosto, madrugada) — pedido expreso: no siempre se
  // analiza la dieta DEL perro configurado en la app -- puede ser la
  // de otro perro (el de una prima, por ejemplo), sin querer crear un
  // perfil nuevo permanente solo para eso. Con esto, "otroPerroDatos"
  // guarda un perfil puntual (peso, etapa, edad si es cachorro) que
  // solo vive mientras se hace este análisis -- nunca se guarda como
  // mascota nueva. Si es null, se usa el perro normal de la app.
  const [analizandoParaOtro, setAnalizandoParaOtro] = useState(false);
  const [otroPerroDatos, setOtroPerroDatos] = useState({ peso: "", etapa: "adulto", meses: "", pesoAdulto: "" });
  const [modoEntradaAnalizar, setModoEntradaAnalizar] = useState("gramos");
  const [totalGramosDiaPorcentaje, setTotalGramosDiaPorcentaje] = useState("");
  // ⚠️ AÑADIDO (5 agosto, madrugada) — pedido expreso: mostrar cuántas
  // kcal aporta lo que se va metiendo, comparado con lo que el perro
  // necesita, ANTES de pulsar "Analizar" -- no solo después. Para eso
  // hace falta la energía por 100g de cada alimento; se trae del
  // catálogo real (mismo dato que usa el servidor), no se inventa
  // ninguna cifra de "gramos esperados al día" genérica, porque eso
  // depende mucho de qué alimentos se elijan (el pato tiene el doble
  // de kcal/100g que la pechuga de pollo, por ejemplo).
  const [energiaAlimentos, setEnergiaAlimentos] = useState({});
  useEffect(() => {
    if (seccionActiva !== "analizar" || Object.keys(energiaAlimentos).length > 0) return;
    fetch(`${API_BASE}/alimentos`)
      .then((res) => res.json())
      .then((data) => {
        const mapa = {};
        for (const lista of Object.values(data)) {
          for (const a of lista) mapa[a.nombre] = a.kcal_100g;
        }
        setEnergiaAlimentos(mapa);
      })
      .catch(() => {}); // si falla, simplemente no se muestra la comparación de kcal
  }, [seccionActiva]);

  // ⚠️ AÑADIDO (5 agosto, madrugada): el DER que se usa para ESTE
  // análisis -- el del perro de la app, o el calculado al vuelo para
  // "otro perro" si se eligió esa opción. Se reutiliza calcularDER,
  // la misma función que usa el resto de la app, con actividad
  // "normal" por defecto (no se pregunta, para mantener el formulario
  // rápido, tal como se pidió).
  const derParaAnalisis = useMemo(() => {
    if (!analizandoParaOtro) return derReal;
    const peso = Number(otroPerroDatos.peso);
    if (!peso || peso <= 0) return null;
    const opciones = { pesoAdultoKg: Number(otroPerroDatos.pesoAdulto) || undefined };
    return calcularDER(peso, otroPerroDatos.etapa, 1, false, opciones);
  }, [analizandoParaOtro, otroPerroDatos, derReal]);

  const analizarDietaActual = async () => {
    // ⚠️ AÑADIDO (5 agosto, madrugada): si se está analizando para
    // "otro perro" y aún no se ha calculado su DER (falta el peso),
    // no tiene sentido seguir -- el servidor necesita ese número.
    if (analizandoParaOtro && !derParaAnalisis) {
      setErrorAnalisis("Dinos al menos el peso del perro para poder calcular lo que necesita.");
      return;
    }
    const conValor = dietaAnalizar.filter((it) => Number(it.gramos) > 0);
    if (conValor.length === 0) {
      setErrorAnalisis(modoEntradaAnalizar === "porcentaje"
        ? "Añade al menos un alimento y dinos qué porcentaje es."
        : "Añade al menos un alimento y dinos cuántos gramos le das.");
      return;
    }
    // ⚠️ AÑADIDO (5 agosto, madrugada): si el modo es porcentaje, hace
    // falta el total de gramos/día para convertir cada % a gramos
    // reales antes de mandar nada al servidor -- el servidor solo
    // entiende gramos, el porcentaje es puramente de entrada.
    if (modoEntradaAnalizar === "porcentaje") {
      const total = Number(totalGramosDiaPorcentaje);
      if (!total || total <= 0) {
        setErrorAnalisis("Dinos cuántos gramos en total le das al día, para poder calcular los porcentajes.");
        return;
      }
      const sumaPct = conValor.reduce((s, it) => s + Number(it.gramos), 0);
      if (Math.round(sumaPct) !== 100) {
        setErrorAnalisis(`Los porcentajes deberían sumar 100 (ahora mismo suman ${Math.round(sumaPct)}).`);
        return;
      }
    }
    setAnalizando(true); setErrorAnalisis(null); setResultadoAnalisis(null);
    const totalParaConvertir = Number(totalGramosDiaPorcentaje) || 0;
    const gramos_por_alimento = {};
    conValor.forEach((it) => {
      const gramosReales = modoEntradaAnalizar === "porcentaje"
        ? (Number(it.gramos) / 100) * totalParaConvertir
        : Number(it.gramos);
      gramos_por_alimento[it.alimento] = (gramos_por_alimento[it.alimento] || 0) + gramosReales;
    });
    try {
      const resp = await fetch(`${API_BASE}/analizar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gramos_por_alimento,
          der_objetivo: derParaAnalisis,
          etapa_requisitos: ETAPA_A_SUFIJO_API[analizandoParaOtro ? otroPerroDatos.etapa : etapaCalculada] || "Adulto",
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
  const [avisoPesoActualizado, setAvisoPesoActualizado] = useState(false);
  const [porqueAbierto, setPorqueAbierto] = useState(null);
  const [comoAbierto, setComoAbierto] = useState(null);
  const [mostrarAyuda, setMostrarAyuda] = useState(true);
  const [infoNutrientes, setInfoNutrientes] = useState(false);
  const [supAbierto, setSupAbierto] = useState(false);
  const [supTipoAbierto, setSupTipoAbierto] = useState(null);
  const [recienRecalculado, setRecienRecalculado] = useState(false);
  const [editorAbierto, setEditorAbierto] = useState(null);
  const [recalculandoServidor, setRecalculandoServidor] = useState(false);
  const [gramosRealesPorMenu, setGramosRealesPorMenu] = useState({});
  const [errorRecalculo, setErrorRecalculo] = useState(null);
  // ⚠️ AÑADIDO (5 agosto, madrugada): para el aviso de "tuvimos que
  // cambiar también X" cuando editar un alimento no se pudo hacer
  // manteniendo todo lo demás igual -- distinto de errorRecalculo
  // (que es cuando el cambio pedido no fue posible en absoluto).
  const [avisoRecalculo, setAvisoRecalculo] = useState(null);
  // ⚠️ AÑADIDO (5 agosto, madrugada) — pedido expreso: todos los avisos
  // que se quedan siempre visibles en pantalla deben poder cerrarse con
  // una X, para quien le moleste tenerlos ahí. Se reinician a visibles
  // cuando cambian los propios datos del aviso (por ejemplo, al
  // cambiar de pestaña de menú) -- si no, un aviso distinto y nuevo se
  // quedaría oculto para siempre solo porque el usuario cerró OTRO
  // aviso anterior.
  const [problemasSeguridadVisible, setProblemasSeguridadVisible] = useState(true);
  // ⚠️ AÑADIDO (5 agosto, madrugada) — pedido expreso: recordatorio
  // general de congelación/descongelación, visible arriba del todo en
  // la pantalla de menús, no solo enterrado dentro del texto de "cómo
  // dar" de cada categoría (donde antes solo se veía si se pulsaba a
  // ver el detalle del hueso carnoso en concreto).
  const [avisoCongelacionVisible, setAvisoCongelacionVisible] = useState(true);
  const [avisoPatologiaVisible, setAvisoPatologiaVisible] = useState(true);
  const [diagnosticoPersonalizarVisible, setDiagnosticoPersonalizarVisible] = useState(true);
  useEffect(() => { setDiagnosticoPersonalizarVisible(true); }, [JSON.stringify(diagnosticoPersonalizar)]);
  // ⚠️ AÑADIDO (5 agosto, madrugada) — CASO REAL: la usuaria sigue
  // viendo alimentos cambiar al editar solo uno, sin ningún aviso, con
  // el servidor ya confirmado al día. Para poder diagnosticar de
  // verdad (en vez de seguir especulando), esto guarda EXACTAMENTE lo
  // que se mandó al servidor y lo que se recibió en la ÚLTIMA edición
  // -- para compararlo directamente, en vez de fiarse de la memoria.
  const [ultimoDiagnosticoEdicion, setUltimoDiagnosticoEdicion] = useState(null);
  const [fichaPorMenu, setFichaPorMenu] = useState({});
  // ⚠️ AÑADIDO (5 agosto, madrugada) — AUDITORÍA: mismo patrón que
  // fichaPorMenu -- se actualiza tras cada edición, para que los avisos
  // de seguridad reflejen el menú ACTUAL, no el original sin editar.
  const [problemasSeguridadPorMenu, setProblemasSeguridadPorMenu] = useState({});

  const menu = menus.find((m) => m.id === tabActiva);
  const idxActiva = menus.findIndex((m) => m.id === tabActiva);
  const viendoBloqueado = necesitaTransicion && idxActiva > 0;
  const gramosReales = gramosRealesPorMenu[tabActiva];
  // ⚠️ CORREGIDO (5 agosto, madrugada) — FALLO GRAVE ENCONTRADO, caso
  // real reportado: al editar un alimento en cualquier modo, el
  // servidor recalcula el MENÚ ENTERO desde cero (no solo cambia el
  // alimento tocado) -- así que casi nunca coincide con la lista
  // visual original. Antes, esto recorría `menu.items` (la lista
  // VIEJA, con sus índices fijos) y para cada uno buscaba sus gramos
  // en `gramosReales` (el diccionario NUEVO) -- cualquier alimento
  // viejo que ya no estuviera en el menú nuevo se quedaba sin gramos
  // y el filtro final lo borraba de la pantalla. El resultado: se
  // veía solo la INTERSECCIÓN entre lo viejo y lo nuevo (unos pocos
  // alimentos por casualidad con el mismo nombre), nunca el menú
  // nuevo real y completo que el servidor sí había calculado bien --
  // de ahí los menús "rotos" de 4 alimentos y 60-400g que se
  // reportaron, aunque el servidor respondía correctamente. Ahora, si
  // hay un menú recalculado (gramosReales existe), la vista se
  // construye DIRECTAMENTE desde él -- todos sus alimentos, sean los
  // que sean -- en vez de intentar encajarlo en los huecos de la
  // lista vieja.
  const itemsBase = gramosReales
    ? Object.entries(gramosReales).map(([alimento, gramos]) => {
        const categoria = categoriaDeAlimento(alimento);
        const Icono = (CATEGORIAS_ICONOS.find((x) => x.nombre === categoria) || {}).Icono || Beef;
        return { alimento, categoria, Icono, gramos, porque: null };
      })
    : menu.items.map((it) => ({
        ...it,
        gramos: it.gramos,
      }));
  const ETIQUETA_MODO = {
    automatico: "AUTOMÁTICO",
    personalizar: "PERSONALIZADO",
  };
  const ORDEN_CATEGORIAS = [
    "Carne muscular", "Pescados y mariscos", "Hueso carnoso",
    "Vísceras", "Hígado", "Verduras y frutas", "Extras",
    "Suplementos comerciales", "Multivitamínico", "Yodo", "Calcio",
    "Omega-3", "Vitamina B", "Hierro", "Fibra",
  ];
  // ⚠️ CORREGIDO (5 agosto, madrugada): ya no hace falta concatenar
  // suplementosMenu aparte -- itemsBase (desde gramosReales, cuando
  // existe) ya incluye TODO lo que el servidor calculó, suplementos
  // incluidos. Concatenar una lista separada de "suplementos añadidos
  // a mano" los duplicaba en pantalla.
  const itemsMostrados = itemsBase.slice().sort((a, b) => {
    const ia = ORDEN_CATEGORIAS.indexOf(a.categoria);
    const ib = ORDEN_CATEGORIAS.indexOf(b.categoria);
    if (ia !== ib) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    return b.gramos - a.gramos;
  });
  // ⚠️ QUITADO (5 agosto, madrugada) — pedido expreso: "menorGramo" y
  // "diasMinimoNecesario" solo se usaban para el aviso de "Algunos
  // alimentos salen a pocos gramos..." que se ha quitado -- se
  // quitan también, ya no los usa nada.
  const [diasSeleccionados, setDiasSeleccionados] = useState(1);
  const multiplicador = diasSeleccionados;

  const totalGramos = Math.round(itemsMostrados.reduce((s, it) => s + it.gramos, 0) * multiplicador * 10) / 10;
  // ⚠️ AÑADIDO (5 agosto): se sube aquí para que tanto el badge de arriba
  // como la nota informativa de abajo usen el MISMO dato real, en vez de
  // que cada uno lo calculara (o no) por su cuenta.
  const ficha = fichaPorMenu[tabActiva] || menu.ficha;
  // ⚠️ AÑADIDO (5 agosto, madrugada) — AUDITORÍA: el servidor ya
  // calculaba estos avisos (tiaminasa, clara de huevo sola, hígado en
  // exceso, límites por patología...) en cada respuesta, y nunca se
  // mostraban en ningún sitio -- se perdían en silencio.
  const problemasSeguridad = problemasSeguridadPorMenu[tabActiva] || menu.problemasSeguridad || [];
  useEffect(() => { setProblemasSeguridadVisible(true); }, [JSON.stringify(problemasSeguridad)]);
  useEffect(() => { setAvisoPatologiaVisible(true); }, [JSON.stringify(patologias)]);

  // ⚠️ CORREGIDO (5 agosto, madrugada): mismo motivo que itemsBase --
  // si ya hay un menú recalculado, hay que decirle al servidor lo que
  // REALMENTE hay ahora (los alimentos nuevos que él mismo calculó),
  // no la lista original con sobreescrituras por índice. Si no, una
  // segunda edición seguida partía de datos ya desactualizados.
  const nombresActualesDelMenu = () =>
    gramosReales ? Object.keys(gramosReales) : menu.items.map((it) => it.alimento);
  const etapaSufijoApi = ETAPA_A_SUFIJO_API[etapaCalculada] || "Adulto";

  // ⚠️ CORREGIDO (5 agosto): antes esta función solo avisaba de un fallo
  // con un banner que era fácil no ver, y quien la llamaba (cambiarAlimento,
  // anadirSuplemento...) YA había cambiado el nombre/lista en pantalla ANTES
  // de saber si el cambio era válido -- así que si fallaba, el usuario veía
  // el nombre nuevo con los gramos viejos congelados, como si "no hiciera
  // nada". Ahora devuelve si funcionó o no, para que el cambio visual solo
  // se aplique DESPUÉS de confirmar que hay una combinación válida.
  const llamarRecalculo = async (endpoint, cuerpoExtra) => {
    setRecalculandoServidor(true);
    setErrorRecalculo(null);
    // ⚠️ AÑADIDO (5 agosto, madrugada): lo que HABÍA antes de mandar
    // esta petición, capturado ANTES de que nada cambie -- para poder
    // comparar contra lo que venga después.
    const antesDeVerdad = nombresActualesDelMenu();
    try {
      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          der_objetivo: menu.kcal,
          etapa_requisitos: etapaSufijoApi,
          especies_excluidas: Array.from(especiesExcluidas || []),
          nombres_excluidos: Array.from(alimentosEvitados || []),
          peso_perro_kg: perfil?.pesoActual ? Number(perfil.pesoActual) : null,
          // ⚠️ AÑADIDO (5 agosto, noche): sin esto, el tope de calcio de
          // razas grandes/gigantes en crecimiento se perdía al editar un
          // alimento -- solo se respetaba al generar el menú por primera vez.
          peso_adulto_esperado_kg: pesoAdultoEsperado || null,
          ...cuerpoExtra,
        }),
      });
      const data = await res.json();
      if (data.factible) {
        // ⚠️ AÑADIDO (5 agosto, madrugada): comparación real,
        // nombre por nombre, entre lo que había y lo que llegó --
        // no gramos, solo si el ALIMENTO en sí sigue estando o no.
        const despuesDeVerdad = Object.keys(data.gramos);
        const desaparecidos = antesDeVerdad.filter((n) => !despuesDeVerdad.includes(n));
        const nuevos = despuesDeVerdad.filter((n) => !antesDeVerdad.includes(n));
        setUltimoDiagnosticoEdicion({
          endpoint,
          // ⚠️ AÑADIDO (5 agosto, madrugada) — CASO REAL, pedido
          // expreso: este diagnóstico es una variable de estado
          // ÚNICA compartida por toda la vista, sin ninguna
          // información de a qué menú pertenece -- así que al editar
          // el Menú 2 y luego cambiar a la pestaña del Menú 1, el
          // mismo aviso seguía apareciendo ahí también, aunque no
          // tuviera nada que ver con ese menú. Se guarda de qué
          // pestaña viene, y más abajo solo se muestra si coincide
          // con la pestaña que se está viendo ahora mismo.
          deTab: tabActiva,
          mandado: { menu_actual: cuerpoExtra?.menu_actual || antesDeVerdad, ...cuerpoExtra },
          antes: antesDeVerdad,
          despues: despuesDeVerdad,
          desaparecidos,
          nuevos,
          avisoDelServidor: data.aviso || null,
        });
        setGramosRealesPorMenu((prev) => ({ ...prev, [tabActiva]: data.gramos }));
        setFichaPorMenu((prev) => ({ ...prev, [tabActiva]: data.ficha }));
        // ⚠️ AÑADIDO (5 agosto, madrugada) — AUDITORÍA: al editar un
        // alimento, los avisos de seguridad pueden cambiar (un cambio
        // puede resolver un problema, o crear uno nuevo) -- había que
        // refrescarlos igual que se refresca la ficha.
        setProblemasSeguridadPorMenu((prev) => ({ ...prev, [tabActiva]: data.problemas_seguridad || [] }));
        // ⚠️ AÑADIDO (5 agosto, madrugada): si el servidor tuvo que
        // cambiar otros alimentos además del pedido para que el cambio
        // fuera viable, lo dice aquí -- se muestra como aviso, no como
        // error (el cambio SÍ se aplicó).
        //
        // ⚠️ CORREGIDO (5 agosto, madrugada) — CASO REAL, pedido
        // expreso: mismo problema que ultimoDiagnosticoEdicion, este
        // aviso era una variable global sin saber de qué menú venía,
        // así que seguía apareciendo al cambiar de pestaña. Se guarda
        // junto con la pestaña de origen, para poder filtrar al
        // mostrarlo.
        setAvisoRecalculo(data.aviso ? { texto: data.aviso, deTab: tabActiva } : null);
        return true;
      } else {
        // ⚠️ CORREGIDO (5 agosto, madrugada) — mismo problema que
        // avisoRecalculo/ultimoDiagnosticoEdicion: se guarda de qué
        // pestaña viene, para no seguir mostrándolo al cambiar de menú.
        setErrorRecalculo({ texto: data.motivo || "No se pudo recalcular con esta combinación.", deTab: tabActiva });
        return false;
      }
    } catch (err) {
      setErrorRecalculo({ texto: "No se ha podido conectar con el servidor para recalcular.", deTab: tabActiva });
      return false;
    } finally {
      setRecalculandoServidor(false);
    }
  };

  // ⚠️ CORREGIDO (5 agosto, madrugada): ya no hace falta guardar el
  // suplemento añadido aparte -- llamarRecalculo ya actualiza
  // gramosReales con el menú completo (el producto añadido incluido),
  // así que guardarlo también en suplementosPorMenu lo duplicaba en
  // pantalla.
  const anadirSuplemento = async (tipo, producto) => {
    setSupAbierto(false);
    setSupTipoAbierto(null);
    const ok = await llamarRecalculo("/menu/anadir", { menu_actual: nombresActualesDelMenu(), alimento: producto });
    if (!ok) return;
    setRecienRecalculado(true);
    setTimeout(() => setRecienRecalculado(false), 2500);
  };

  // ⚠️ CORREGIDO (5 agosto, madrugada): recibe el NOMBRE del producto
  // directamente, no un índice sobre una lista que ya no existe.
  const quitarSuplemento = async (producto) => {
    const ok = await llamarRecalculo("/menu/quitar", { menu_actual: nombresActualesDelMenu(), alimento: producto });
    if (!ok) return;
    setRecienRecalculado(true);
    setTimeout(() => setRecienRecalculado(false), 2500);
  };

  // ⚠️ CORREGIDO (5 agosto, madrugada): recibe el NOMBRE del alimento
  // viejo directamente (ya no un índice que había que buscar en una
  // lista que podía no corresponder). "sobreescritosPorMenu" ya no
  // hace falta: itemsBase se construye directamente desde gramosReales
  // en cuanto existe, así que guardar overrides por índice aparte era
  // redundante -- y era, además, la fuente del fallo de fondo.
  const cambiarAlimento = async (alimentoViejo, alimentoNuevo) => {
    setEditorAbierto(null);
    await llamarRecalculo("/menu/cambiar", { menu_actual: nombresActualesDelMenu(), alimento_viejo: alimentoViejo, alimento_nuevo: alimentoNuevo });
  };

  return (
    <div className="cnl-pantalla-completa w-full flex flex-col" style={{ background: PAPEL }}>
      <Fuentes />
      <div style={{ background: VIOLETA }} className="w-full px-6 pt-8 pb-6">
        {/* ⚠️ CORREGIDO (5 agosto, madrugada) — pedido expreso: esta era
            la ÚNICA pantalla de toda la app con el menú a la IZQUIERDA
            -- en cualquier otro sitio está a la derecha. Esa
            inconsistencia era el problema real, no que faltara en
            ningún sitio. El menú va SIEMPRE a la izquierda -- y se
            quita de aquí la burbuja de mascota, que no hace nada
            funcional todavía (era solo una maqueta). */}
        <div className="flex items-center justify-between mb-4">
          <BotonMenu onClick={() => setMenuLateralAbierto(true)} color="#FFFFFF" className="p-1" />
          <p className="text-sm" style={{ color: "#FFFFFF", fontFamily: fontDisplay }}>Rawku</p>
        </div>
        {/* ⚠️ AÑADIDO (5 agosto, madrugada) — pedido expreso: una vez
            entrado en "tus menús" no había forma de volver a la
            verificación de datos del perro para corregir algo. Este
            mismo botón ya existía en las pantallas de antes de
            generar -- solo faltaba aquí, la pantalla final. */}
        <button onClick={() => setFase("onboarding")} className="text-xs mb-2" style={{ color: MALVA, fontFamily: fontBody }}>
          Editar perfil (alergias, exclusiones...)
        </button>
        <button onClick={onVolver} className="text-xs mb-2" style={{ color: MALVA, fontFamily: fontBody }}>
          ← Cambiar modo
        </button>
        <p className="text-[11px] tracking-[0.18em] uppercase mb-2" style={{ color: MALVA, fontFamily: "monospace" }}>
          Semana de {nombrePerro}
        </p>
        <h1 className="text-3xl leading-tight mb-5" style={{ color: "#FFFFFF", fontFamily: fontDisplay, fontWeight: 500 }}>
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
                      {/* ⚠️ CORREGIDO (5 agosto, madrugada) — CASO REAL:
                          esto decía "semana {idx+1}" mientras el menú
                          NO bloqueado, al lado, decía "{m.dias} días" --
                          dos formatos distintos para el mismo tipo de
                          dato, inconsistente. El candado ya deja claro
                          que está bloqueado; el subtexto debe decir lo
                          mismo en los dos casos. */}
                      <span className="block text-[10px] mt-0.5" style={{ fontFamily: "monospace" }}>{m.dias} {m.dias === 1 ? "día" : "días"}</span>
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
        {/* ⚠️ REORGANIZADO (5 agosto, madrugada) — pedido expreso: en
            pantallas anchas, el plan de transición y las tres tarjetas
            (ración/kcal/semáforo) van lado a lado, aprovechando el
            espacio -- en móvil siguen apiladas como antes, no hay sitio
            para ponerlas al lado. Si no hay transición, las tres
            tarjetas ocupan el ancho entero, como siempre hicieron. */}
        <div className={necesitaTransicion ? "flex flex-col md:flex-row gap-3 mb-3 md:items-stretch" : ""}>
        {necesitaTransicion && (
          <div className="rounded-xl p-3 md:flex-1" style={{ background: "#F0ECF7" }}>
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
        <div className={necesitaTransicion ? "md:flex-1" : "flex-1"}>
          <div className="flex gap-3 mb-3">
            <div className="flex-1 rounded-2xl p-4 text-center" style={{ background: "#FFFFFF", border: "1.5px solid #E3DAF0" }}>
              <p style={{ color: VIOLETA, fontFamily: fontDisplay, fontSize: 22 }}>{totalGramos}g</p>
              <p className="text-[10px] tracking-[0.1em] uppercase mt-0.5" style={{ color: MALVA, fontFamily: "monospace" }}>ración total</p>
            </div>
            <div className="flex-1 rounded-2xl p-4 text-center" style={{ background: "#FFFFFF", border: "1.5px solid #E3DAF0" }}>
              <p style={{ color: VIOLETA, fontFamily: fontDisplay, fontSize: 22 }}>{menu.kcal}</p>
              <p className="text-[10px] tracking-[0.1em] uppercase mt-0.5" style={{ color: MALVA, fontFamily: "monospace" }}>kcal / día</p>
            </div>
            {(() => {
              const COLORES = {
                verde: { fondo: VERDE, texto: VERDE_TEXTO },
                ambar: { fondo: "#FFF7E8", texto: "#B8860B" },
                rojo: { fondo: "#FFE8EC", texto: ROSA },
              };
              const col = COLORES[ficha?.semaforo] || COLORES.verde;
              return (
                <div className="flex-1 rounded-2xl p-4 text-center flex flex-col items-center justify-center" style={{ background: col.fondo }}>
                  <div className="flex items-center gap-1">
                    <CheckCircle2 size={18} style={{ color: col.texto }} />
                    <button onClick={() => setInfoNutrientes(!infoNutrientes)}><Info size={13} style={{ color: col.texto, opacity: 0.6 }} /></button>
                  </div>
                  <p className="text-[10px] tracking-[0.1em] uppercase mt-1" style={{ color: col.texto, fontFamily: "monospace" }}>
                    {ficha ? `${ficha.correctos}/${ficha.total} OK` : "sin verificar"}
                  </p>
                </div>
              );
            })()}
          </div>
        </div>
        </div>
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
        {/* ⚠️ CORREGIDO (5 agosto, noche): antes era un banner pequeño
            arriba del todo, que quedaba fuera de la vista si estabas
            haciendo scroll más abajo (justo donde se toca el lápiz de
            un alimento) -- fácil de no verlo nunca. Ahora es un aviso
            fijo, centrado, que se superpone a toda la pantalla mientras
            dura el recálculo -- imposible de perder de vista. */}
        {recalculandoServidor && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center px-6" style={{ background: "rgba(35,21,57,0.55)" }}>
            <div className="flex flex-col items-center gap-3 px-8 py-7 rounded-2xl" style={{ background: "#FFFFFF" }}>
              <Dog size={28} style={{ color: VIOLETA }} />
              <p className="text-sm text-center" style={{ color: TINTA, fontFamily: fontBody, fontWeight: 600 }}>
                Recalculando el menú...
              </p>
              <p className="text-xs text-center" style={{ color: MALVA, fontFamily: fontBody }}>
                Un momento, esto puede tardar unos segundos
              </p>
            </div>
          </div>
        )}
        {errorRecalculo && errorRecalculo.deTab === tabActiva && !recalculandoServidor && (
          // ⚠️ CORREGIDO (5 agosto, noche): antes esto era un banner fijo en
          // el flujo de la página, arriba del todo -- si estabas editando
          // un alimento más abajo en la lista, quedaba fuera de la vista y
          // era fácil no verlo nunca. Ahora es un aviso superpuesto,
          // centrado, igual de visible que el de "recalculando" -- con un
          // botón para cerrarlo, porque a diferencia de "recalculando"
          // este se queda abierto hasta que el usuario lo lea.
          <div className="fixed inset-0 z-[70] flex items-center justify-center px-6" style={{ background: "rgba(35,21,57,0.55)" }}>
            <div className="flex flex-col items-center gap-2 px-6 py-6 rounded-2xl max-w-sm" style={{ background: "#FFFFFF" }}>
              <AlertCircle size={28} style={{ color: ROSA, flexShrink: 0 }} />
              <p className="text-sm text-center" style={{ color: TINTA, fontFamily: fontBody, fontWeight: 700 }}>
                No se ha podido hacer ese cambio
              </p>
              <p className="text-xs text-center" style={{ color: TINTA, fontFamily: fontBody }}>{errorRecalculo?.texto}</p>
              <p className="text-xs text-center mb-2" style={{ color: MALVA, fontFamily: fontBody }}>
                El menú sigue tal como estaba — no se ha aplicado nada.
              </p>
              <button
                onClick={() => setErrorRecalculo(null)}
                className="px-6 py-2.5 rounded-xl text-sm w-full"
                style={{ background: VIOLETA, color: "#FFFFFF", fontFamily: fontBody, fontWeight: 700 }}
              >
                Entendido
              </button>
            </div>
          </div>
        )}
        {avisoRecalculo && avisoRecalculo.deTab === tabActiva && !recalculandoServidor && (
          // ⚠️ AÑADIDO (5 agosto, madrugada): aviso de "también tuvimos
          // que cambiar X" -- distinto del de error: el cambio SÍ se
          // aplicó, esto es información, no un fallo.
          <div className="fixed inset-0 z-[70] flex items-center justify-center px-6" style={{ background: "rgba(35,21,57,0.55)" }}>
            <div className="flex flex-col items-center gap-2 px-6 py-6 rounded-2xl max-w-sm" style={{ background: "#FFFFFF" }}>
              <Info size={28} style={{ color: VIOLETA, flexShrink: 0 }} />
              <p className="text-sm text-center" style={{ color: TINTA, fontFamily: fontBody, fontWeight: 700 }}>
                Cambio aplicado, con un ajuste más
              </p>
              <p className="text-xs text-center mb-2" style={{ color: TINTA, fontFamily: fontBody }}>{avisoRecalculo?.texto}</p>
              <button
                onClick={() => setAvisoRecalculo(null)}
                className="px-6 py-2.5 rounded-xl text-sm w-full"
                style={{ background: VIOLETA, color: "#FFFFFF", fontFamily: fontBody, fontWeight: 700 }}
              >
                Entendido
              </button>
            </div>
          </div>
        )}

        {/* ⚠️ AÑADIDO (5 agosto, madrugada) — CASO REAL SIN RESOLVER:
            panel de diagnóstico de la ÚLTIMA edición -- muestra
            exactamente qué se mandó al servidor y qué llegó de vuelta,
            comparado alimento por alimento. Se queda visible (no se
            cierra solo) para poder hacer una captura y compararlo.
            Rojo si algo desapareció SIN que el servidor avisara --
            eso sería el bug real que se está buscando. */}
        {ultimoDiagnosticoEdicion && ultimoDiagnosticoEdicion.deTab === tabActiva && (
          <div className="rounded-xl p-3 mb-4" style={{
            background: ultimoDiagnosticoEdicion.desaparecidos.length > 0 && !ultimoDiagnosticoEdicion.avisoDelServidor ? "#FFE8EC" : "#F0ECF7",
            border: ultimoDiagnosticoEdicion.desaparecidos.length > 0 && !ultimoDiagnosticoEdicion.avisoDelServidor ? `1.5px solid ${ROSA}` : "1px solid #E3DAF0",
          }}>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[11px] tracking-[0.1em] uppercase" style={{ color: VIOLETA, fontFamily: "monospace" }}>
                Diagnóstico: última edición ({ultimoDiagnosticoEdicion.endpoint})
              </p>
              <button onClick={() => setUltimoDiagnosticoEdicion(null)} className="text-xs" style={{ color: MALVA }}>✕</button>
            </div>
            <p className="text-xs mb-1" style={{ color: TINTA, fontFamily: fontBody }}>
              <b>Había antes ({ultimoDiagnosticoEdicion.antes.length}):</b> {ultimoDiagnosticoEdicion.antes.join(", ")}
            </p>
            <p className="text-xs mb-1" style={{ color: TINTA, fontFamily: fontBody }}>
              <b>Llegó después ({ultimoDiagnosticoEdicion.despues.length}):</b> {ultimoDiagnosticoEdicion.despues.join(", ")}
            </p>
            {ultimoDiagnosticoEdicion.desaparecidos.length > 0 && (
              <p className="text-xs mb-1" style={{ color: ROSA, fontFamily: fontBody, fontWeight: 700 }}>
                Desaparecieron: {ultimoDiagnosticoEdicion.desaparecidos.join(", ")}
              </p>
            )}
            {ultimoDiagnosticoEdicion.nuevos.length > 0 && (
              <p className="text-xs mb-1" style={{ color: "#B8860B", fontFamily: fontBody, fontWeight: 700 }}>
                Aparecieron nuevos: {ultimoDiagnosticoEdicion.nuevos.join(", ")}
              </p>
            )}
            <p className="text-xs" style={{ color: MALVA, fontFamily: fontBody }}>
              Aviso del servidor: {ultimoDiagnosticoEdicion.avisoDelServidor || "(ninguno)"}
            </p>
          </div>
        )}

        {/* ⚠️ AÑADIDO (5 agosto, madrugada) — pedido expreso: mismo
            diagnóstico que arriba, pero para Personalizar -- compara
            lo que se eligió a mano contra lo que salió de verdad en el
            menú final. Solo aparece si este menú vino de Personalizar
            (en automático no hay nada elegido a mano con qué comparar). */}
        {modo === "personalizar" && diagnosticoPersonalizar && diagnosticoPersonalizarVisible && (
          <div className="rounded-xl p-3 mb-4" style={{
            background: diagnosticoPersonalizar.noSalieron.length > 0 ? "#FFE8EC" : "#F0ECF7",
            border: diagnosticoPersonalizar.noSalieron.length > 0 ? `1.5px solid ${ROSA}` : "1px solid #E3DAF0",
          }}>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[11px] tracking-[0.1em] uppercase" style={{ color: VIOLETA, fontFamily: "monospace" }}>
                Diagnóstico: lo elegido a mano en Personalizar
              </p>
              <button onClick={() => setDiagnosticoPersonalizarVisible(false)} aria-label="Cerrar">
                <X size={14} style={{ color: VIOLETA }} />
              </button>
            </div>
            <p className="text-xs mb-1" style={{ color: TINTA, fontFamily: fontBody }}>
              <b>Elegiste ({diagnosticoPersonalizar.elegido.length}):</b> {diagnosticoPersonalizar.elegido.join(", ") || "(nada a mano)"}
            </p>
            <p className="text-xs mb-1" style={{ color: TINTA, fontFamily: fontBody }}>
              <b>Salió en el menú ({diagnosticoPersonalizar.salio.length}):</b> {diagnosticoPersonalizar.salio.join(", ")}
            </p>
            {diagnosticoPersonalizar.noSalieron.length > 0 ? (
              <p className="text-xs" style={{ color: ROSA, fontFamily: fontBody, fontWeight: 700 }}>
                No salieron: {diagnosticoPersonalizar.noSalieron.join(", ")}
              </p>
            ) : (
              <p className="text-xs" style={{ color: "#5A9367", fontFamily: fontBody }}>
                Todo lo que elegiste a mano está en el menú final.
              </p>
            )}
          </div>
        )}
        {avisoNoForzadoVisible && (
          // ⚠️ AÑADIDO (5 agosto, madrugada) — pedido expreso: cuando en
          // Personalizar no fue viable un menú con TODO lo elegido a
          // mano, el servidor ya lo decía (no_se_pudo_forzar) -- solo
          // faltaba mostrarlo. Mismo patrón visual que el aviso de
          // arriba, para que sea consistente.
          <div className="fixed inset-0 z-[70] flex items-center justify-center px-6" style={{ background: "rgba(35,21,57,0.55)" }}>
            <div className="flex flex-col items-center gap-2 px-6 py-6 rounded-2xl max-w-sm" style={{ background: "#FFFFFF" }}>
              <Info size={28} style={{ color: VIOLETA, flexShrink: 0 }} />
              <p className="text-sm text-center" style={{ color: TINTA, fontFamily: fontBody, fontWeight: 700 }}>
                No se pudo con todo lo elegido
              </p>
              <p className="text-xs text-center mb-2" style={{ color: TINTA, fontFamily: fontBody }}>
                Con lo que elegiste a mano no había una combinación viable, así que este menú se ha calculado libremente para que sí cumpla los 30 requisitos. Puedes revisarlo y cambiar lo que quieras.
              </p>
              <button
                onClick={() => setAvisoNoForzadoVisible(false)}
                className="px-6 py-2.5 rounded-xl text-sm w-full"
                style={{ background: VIOLETA, color: "#FFFFFF", fontFamily: fontBody, fontWeight: 700 }}
              >
                Entendido
              </button>
            </div>
          </div>
        )}

        {avisoExtraEspecieVisible && (
          // ⚠️ AÑADIDO (5 agosto, madrugada) — pedido expreso: distinto
          // del aviso de arriba (que es "nada de lo elegido se pudo
          // mantener") -- esto es "casi todo se mantuvo, pero hizo
          // falta añadir una especie más en carne/pescado/hueso".
          <div className="fixed inset-0 z-[70] flex items-center justify-center px-6" style={{ background: "rgba(35,21,57,0.55)" }}>
            <div className="flex flex-col items-center gap-2 px-6 py-6 rounded-2xl max-w-sm" style={{ background: "#FFFFFF" }}>
              <Info size={28} style={{ color: VIOLETA, flexShrink: 0 }} />
              <p className="text-sm text-center" style={{ color: TINTA, fontFamily: fontBody, fontWeight: 700 }}>
                Hizo falta añadir algo más
              </p>
              <p className="text-xs text-center mb-2" style={{ color: TINTA, fontFamily: fontBody }}>{avisoExtraEspecieVisible}</p>
              <button
                onClick={() => setAvisoExtraEspecieVisible(false)}
                className="px-6 py-2.5 rounded-xl text-sm w-full"
                style={{ background: VIOLETA, color: "#FFFFFF", fontFamily: fontBody, fontWeight: 700 }}
              >
                Entendido
              </button>
            </div>
          </div>
        )}

        {/* ⚠️ AÑADIDO (5 agosto, madrugada) — AUDITORÍA: avisos de
            seguridad reales (tiaminasa, clara de huevo sola, hígado en
            exceso, límites por patología...) -- el servidor los
            calculaba desde hace tiempo, y nunca se mostraban en ningún
            sitio. A diferencia del semáforo (que dice si faltan
            nutrientes), esto avisa de si HAY DEMASIADO de algo
            concreto -- son cosas distintas, y las dos importan. */}
        {avisoCongelacionVisible && (
          <div className="rounded-xl p-3 mb-4" style={{ background: "#F0ECF7", border: "1px solid #D9CDEE" }}>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5">
                <AlertCircle size={14} style={{ color: VIOLETA }} />
                <p className="text-[11px] tracking-[0.1em] uppercase" style={{ color: VIOLETA, fontFamily: "monospace" }}>
                  Congelación
                </p>
              </div>
              <button onClick={() => setAvisoCongelacionVisible(false)} aria-label="Cerrar">
                <X size={14} style={{ color: VIOLETA }} />
              </button>
            </div>
            <p className="text-xs leading-snug" style={{ color: TINTA, fontFamily: fontBody }}>
              Si preparas este menú con antelación: carne, vísceras e hígado <b>al menos 1 semana</b> congelados
              a -18/-20°C antes de dar; pescado, <b>al menos 2 semanas</b> (más riesgo de parásitos). Los
              suplementos, aceites, huevo y semillas se añaden CRUDOS al final, sobre la comida ya
              descongelada — nunca se congelan junto con el resto.
            </p>
          </div>
        )}
        {problemasSeguridad.length > 0 && problemasSeguridadVisible && (
          <div className="rounded-xl p-3 mb-4" style={{ background: "#FFF7E8", border: "1px solid #F5DFA8" }}>
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1.5">
                <AlertCircle size={14} style={{ color: "#B8860B" }} />
                <p className="text-[11px] tracking-[0.1em] uppercase" style={{ color: "#B8860B", fontFamily: "monospace" }}>
                  {problemasSeguridad.length === 1 ? "Un aviso de seguridad" : `${problemasSeguridad.length} avisos de seguridad`}
                </p>
              </div>
              <button onClick={() => setProblemasSeguridadVisible(false)} aria-label="Cerrar">
                <X size={14} style={{ color: "#B8860B" }} />
              </button>
            </div>
            <div className="flex flex-col gap-1.5">
              {problemasSeguridad.map((p, i) => (
                <p key={i} className="text-xs leading-snug" style={{ color: TINTA, fontFamily: fontBody }}>{p}</p>
              ))}
            </div>
          </div>
        )}

        {/* ⚠️ QUITADO (5 agosto, madrugada) — pedido expreso: el panel
            de avisos a nivel de toda la semana (frecuencia de
            tiaminasa/mercurio/vitD/yodo/selenio) se elimina -- el
            límite duro (restricción matemática en el motor) ya impide
            que se supere de verdad, así que el usuario no necesita ver
            este aviso informativo aparte. El límite en sí no se toca,
            sigue aplicándose siempre, se genere como se genere el menú. */}

        {infoNutrientes && (() => {
          // ⚠️ CORREGIDO (5 agosto): antes decía "FEDIAF exige revisar 27
          // nutrientes" y "los cumple todos" SIEMPRE, aunque el menú
          // estuviera en ámbar o rojo -- eso sería falso en esos casos.
          // Además, decir "FEDIAF exige 30" habría sido inexacto: la tabla
          // real de FEDIAF tiene más de 40 (incluye aminoácidos
          // individuales que no trackeamos, agrupados en la proteína
          // total). Se habla de "nutrientes clave" en vez de dar un
          // número que invite a preguntar "¿y los demás?".
          const COLORES = {
            verde: { fondo: VERDE, texto: VERDE_TEXTO },
            ambar: { fondo: "#FFF7E8", texto: "#B8860B" },
            rojo: { fondo: "#FFE8EC", texto: ROSA },
          };
          const col = COLORES[ficha?.semaforo] || COLORES.verde;
          const TEXTOS = {
            verde: `Comprobamos los nutrientes clave para que ${nombrePerro} crezca y se mantenga sano: minerales, vitaminas y grasas esenciales, siguiendo las tablas de FEDIAF. Este menú los cumple todos.`,
            ambar: `Comprobamos los nutrientes clave para que ${nombrePerro} crezca y se mantenga sano. Este menú cumple ${ficha?.correctos ?? "?"} de ${ficha?.total ?? "?"} — el resto están cerca del mínimo, pero no llegan del todo. Conviene revisarlo.`,
            rojo: `Comprobamos los nutrientes clave para que ${nombrePerro} crezca y se mantenga sano. Este menú se queda corto en varios. No deberías usarlo tal cual — vuelve a generarlo o edítalo.`,
          };
          return (
            <div className="rounded-xl p-3 mb-4 flex gap-2 items-start" style={{ background: col.fondo }}>
              <Info size={14} style={{ color: col.texto, flexShrink: 0, marginTop: 2 }} />
              <p className="text-xs" style={{ color: TINTA, fontFamily: fontBody }}>
                {TEXTOS[ficha?.semaforo] || TEXTOS.verde}
              </p>
            </div>
          );
        })()}

        <div className="flex flex-col gap-2 mb-3">
        {(patologias || []).length > 0 && avisoPatologiaVisible && (
          <div className="rounded-xl p-3 mb-3 flex gap-2 items-start"
               style={{ background: "#FFF4F6", border: `1.5px solid ${ROSA}` }}>
            <AlertCircle size={15} style={{ color: ROSA, flexShrink: 0, marginTop: 2 }} />
            <div className="flex-1">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm mb-1" style={{ color: TINTA, fontFamily: fontBody, fontWeight: 700 }}>
                  Este menú TIENE que aprobarlo tu veterinario
                </p>
                <button onClick={() => setAvisoPatologiaVisible(false)} aria-label="Cerrar" className="shrink-0">
                  <X size={14} style={{ color: ROSA }} />
                </button>
              </div>
              <p className="text-xs" style={{ color: TINTA, fontFamily: fontBody }}>
                {/* ⚠️ CAMBIADO (5 agosto, madrugada) — pedido expreso: el texto
                    anterior decía "la cantidad exacta depende del estadio y de sus
                    analíticas" -- "estadio" es jerga clínica que el usuario normal
                    no entiende, y el texto era idéntico para cualquier patología.
                    Ahora usa el nombre real de lo que tiene el perro y habla claro. */}
                {(() => {
                  const labels = patologias
                    .map((k) => PATOLOGIAS.find((p) => p.key === k)?.label)
                    .filter(Boolean);
                  const condicion = labels.length === 1
                    ? labels[0]
                    : labels.length === 2
                      ? `${labels[0]} y ${labels[1]}`
                      : `${labels.slice(0, -1).join(", ")} y ${labels[labels.length - 1]}`;
                  return `El menú de ${nombrePerro} está ajustado teniendo en cuenta ${condicion}. Son ajustes orientativos en la buena dirección, pero su veterinario es quien mejor puede valorar si encaja con su caso concreto — enséñale este menú antes de empezar.`;
                })()}
              </p>
            </div>
          </div>
        )}
        <div className="rounded-xl p-3 mb-3" style={{ background: "#F0ECF7" }}>
          <p className="text-sm mb-2.5" style={{ color: TINTA, fontFamily: fontBody, fontWeight: 600 }}>
            Preparar de golpe para
          </p>
          <div className="flex gap-2">
            {[
              { dias: 1, label: "1 día" },
              // ⚠️ CAMBIADO (5 agosto, madrugada) — CASO REAL, pedido
              // expreso: esto siempre decía "1 semana" (7 días fijos),
              // aunque este menú concreto solo cubra 2-6 días de la
              // rotación real -- preparar de golpe para 7 días cuando
              // el menú solo se va a dar 3 no tiene sentido. Ahora usa
              // los días reales de ESTE menú (menu.dias, ya calculado
              // correctamente más arriba con el reparto de la semana).
              // Si este menú solo cubre 1 día de la semana, la segunda
              // opción sería idéntica a la primera -- se omite, para no
              // mostrar dos botones redundantes.
              ...(menu.dias > 1
                ? [{ dias: menu.dias, label: menu.dias === 7 ? "1 semana" : `Toda la semana (${menu.dias} días)` }]
                : []),
            ].map((op) => {
              const activo = diasSeleccionados === op.dias;
              return (
                <button
                  key={op.dias}
                  onClick={() => setDiasSeleccionados(op.dias)}
                  className="flex-1 py-2 rounded-lg text-xs"
                  style={{ background: activo ? VIOLETA : "transparent",
                           color: activo ? "#FFFFFF" : VIOLETA,
                           border: `1.5px solid ${VIOLETA}`, fontFamily: fontBody, fontWeight: 600 }}
                >
                  {op.label}
                </button>
              );
            })}
          </div>
          {diasSeleccionados > 1 && (
            <p className="text-xs mt-2.5" style={{ color: MALVA, fontFamily: fontBody }}>
              Estos son los gramos totales para {diasSeleccionados} días de cada alimento — prepara
              la mezcla de golpe, guárdala en la nevera (o congelador si es para más de 2-3 días),
              y dale {Math.round(100 / diasSeleccionados)}% de esto cada día.
            </p>
          )}
        </div>

        {/* ⚠️ MOVIDO (5 agosto, madrugada) — pedido expreso: estaba
            arriba del todo, lejos del listado al que se refiere. Ahora
            va justo encima de los alimentos, debajo de "Preparar de
            golpe para". */}
        {mostrarAyuda && (
          <div className="rounded-xl p-3 mb-4" style={{ background: PAPEL, border: "1px solid #EDE6F5" }}>
            <div className="flex items-center gap-3 text-xs" style={{ color: MALVA, fontFamily: fontBody }}>
              <span className="flex items-center gap-1"><Pencil size={13} style={{ color: "#B6ABC9" }} /> cambiar un alimento</span>
              <span className="flex items-center gap-1"><UtensilsCrossed size={13} style={{ color: "#B6ABC9" }} /> cómo darlo</span>
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
                    <span style={{ color: VIOLETA, fontFamily: fontDisplay, fontSize: 17 }}>
                      {COMO_DAR_ALIMENTO[item.alimento]?.esComprimido
                        ? formatearComprimidos(item.gramos * multiplicador, COMO_DAR_ALIMENTO[item.alimento].pesoComprimido)
                        : formatearGramos(item.gramos * multiplicador)}
                    </span>
                    {item.porque && (
                      <button onClick={() => { setPorqueAbierto(porqueAbierto === i ? null : i); setEditorAbierto(null); setComoAbierto(null); }}>
                        <Info size={16} style={{ color: porqueAbierto === i ? ROSA : "#C9BEDD" }} />
                      </button>
                    )}
                    {/* ⚠️ CORREGIDO (5 agosto, madrugada): esta condición
                        distinguía "alimentos base" de "suplementos
                        añadidos a mano" cuando itemsMostrados los
                        concatenaba por separado -- ya no hace falta,
                        itemsMostrados es solo itemsBase, todo editable. */}
                    {(
                      <button onClick={() => {
                          // ⚠️ CORREGIDO (5 agosto): antes se abría ya con la
                          // categoría del alimento actual fijada, así que solo
                          // se podía cambiar dentro de la misma categoría (pez
                          // por pez, nunca pez por carne). Ahora se abre igual
                          // que "Añadir alimento": eligiendo categoría primero,
                          // libre entre las seis.
                          //
                          // ⚠️ CORREGIDO (5 agosto, madrugada) — FALLO GRAVE
                          // ENCONTRADO: esto usaba el índice "i" de la lista
                          // ORDENADA en pantalla (por categoría y gramos) para
                          // buscar luego en la lista SIN ordenar del servidor
                          // -- como el orden cambia constantemente, el índice
                          // nunca correspondía de forma fiable al mismo
                          // alimento. Ahora se identifica por su NOMBRE, que sí
                          // es estable (no puede haber dos alimentos iguales a
                          // la vez en el menú).
                          setEditorAbierto(editorAbierto && editorAbierto.alimentoViejo === item.alimento ? null : { alimentoViejo: item.alimento, categoria: null, especie: null });
                          setPorqueAbierto(null);
                          setComoAbierto(null);
                        }}>
                        <Pencil size={15} style={{ color: editorAbierto && editorAbierto.alimentoViejo === item.alimento ? ROSA : "#C9BEDD" }} />
                      </button>
                    )}
                    {INSTRUCCIONES_POR_CATEGORIA[item.categoria] && (
                      <button onClick={() => { setComoAbierto(comoAbierto === i ? null : i); setPorqueAbierto(null); setEditorAbierto(null); }}>
                        <UtensilsCrossed size={15} style={{ color: comoAbierto === i ? ROSA : "#C9BEDD" }} />
                      </button>
                    )}
                  </div>
                </div>
                {editorAbierto && editorAbierto.alimentoViejo === item.alimento && !editorAbierto.categoria && (
                  <div className="mt-3 pt-3" style={{ borderTop: "1px solid #F0ECF7" }}>
                    <p className="text-xs mb-2" style={{ color: MALVA, fontFamily: "monospace" }}>CAMBIAR A QUÉ CATEGORÍA</p>
                    <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto">
                      {Object.keys(categoriasDisponibles || CATEGORIAS_ALIMENTO).map((cat) => (
                        <button key={cat} onClick={() => setEditorAbierto({ ...editorAbierto, categoria: cat })}
                          className="text-left px-3 py-2 rounded-lg text-sm" style={{ color: TINTA, fontFamily: fontBody, background: PAPEL }}>
                          {cat}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {editorAbierto && editorAbierto.alimentoViejo === item.alimento && editorAbierto.categoria && !editorAbierto.especie && (
                  <div className="mt-3 pt-3" style={{ borderTop: "1px solid #F0ECF7" }}>
                    <p className="text-xs mb-2" style={{ color: MALVA, fontFamily: "monospace" }}>{editorAbierto.categoria.toUpperCase()}</p>
                    <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto">
                      {/* ⚠️ CORREGIDO (5 agosto, madrugada): si la especie
                          solo tiene 1 alimento dentro, pulsarla ya lo
                          aplica directamente -- antes siempre navegaba a
                          un submenú que, con 1 sola opción, era un clic
                          de más sin ningún sentido (caso real: "Pimiento"
                          → clic → solo "Pimiento rojo" dentro). */}
                      {Object.entries((categoriasDisponibles || CATEGORIAS_ALIMENTO)[editorAbierto.categoria]).map(([especie, alimentos]) => {
                        const unico = alimentos.length === 1;
                        return (
                          <button key={especie}
                            onClick={() => unico ? cambiarAlimento(editorAbierto.alimentoViejo, alimentos[0]) : setEditorAbierto({ ...editorAbierto, especie })}
                            className="text-left px-3 py-2 rounded-lg text-sm flex items-center justify-between" style={{ color: TINTA, fontFamily: fontBody, background: PAPEL }}>
                            <span>{unico ? alimentos[0] : especie}</span>
                            {/* ⚠️ CORREGIDO (5 agosto, madrugada) — CASO REAL: este era
                                el peor de los tres sitios con este problema -- aquí no
                                había NINGUNA diferencia visual entre "esto selecciona
                                directo" y "esto abre un paso más", los dos botones se
                                veían exactamente igual. Mismo indicador que en los
                                otros dos sitios. */}
                            {!unico && (
                              <span className="flex items-center gap-1 shrink-0" style={{ color: VIOLETA }}>
                                <span className="text-[11px] font-semibold" style={{ fontFamily: "monospace" }}>{alimentos.length} tipos</span>
                                <ChevronRight size={14} />
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                    <button onClick={() => setEditorAbierto({ ...editorAbierto, categoria: null })} className="text-xs mt-2" style={{ color: MALVA, fontFamily: fontBody }}>← Otra categoría</button>
                  </div>
                )}
                {editorAbierto && editorAbierto.alimentoViejo === item.alimento && editorAbierto.especie && (
                  <div className="mt-3 pt-3" style={{ borderTop: "1px solid #F0ECF7" }}>
                    <p className="text-xs mb-2" style={{ color: MALVA, fontFamily: "monospace" }}>{editorAbierto.especie.toUpperCase()}</p>
                    <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto">
                      {/* ⚠️ AÑADIDO (5 agosto, madrugada): "Todo el/la X"
                          recuperado aquí -- se había quitado del todo antes,
                          pero solo debía quitarse cuando la especie tiene 1
                          única opción (ahí es redundante). Con más de una,
                          hace falta para poder decir "cualquiera de estos
                          cortes vale" en vez de fijar uno exacto. */}
                      {(categoriasDisponibles || CATEGORIAS_ALIMENTO)[editorAbierto.categoria][editorAbierto.especie].length > 1 && (
                        <button onClick={() => cambiarAlimento(editorAbierto.alimentoViejo, `Todo: ${editorAbierto.especie}`)}
                          className="text-left px-3 py-2 rounded-lg text-sm" style={{ color: VIOLETA, fontFamily: fontBody, fontWeight: 700, background: "#F0ECF7" }}>
                          Todo el/la {editorAbierto.especie}
                        </button>
                      )}
                      {(categoriasDisponibles || CATEGORIAS_ALIMENTO)[editorAbierto.categoria][editorAbierto.especie].map((alimento) => (
                        <button key={alimento} onClick={() => cambiarAlimento(editorAbierto.alimentoViejo, alimento)}
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
                          {COMO_DAR_ALIMENTO[item.alimento].esComprimido
                            ? `${COMO_DAR_ALIMENTO[item.alimento].pieza} — se puede partir para dosis más pequeñas.`
                            : `Como referencia, ${COMO_DAR_ALIMENTO[item.alimento].pieza} — con los ${formatearGramos(item.gramos)} de hoy te haces una idea de cuánto es.`}
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
        {/* ⚠️ MOVIDO (5 agosto, madrugada) — pedido expreso: este texto
            estaba arriba del todo, compitiendo en importancia visual
            con avisos de verdad relevantes (nutrientes, seguridad). Va
            aquí abajo, en pequeño -- solo cuando no hay patología
            diagnosticada, porque en ese caso el aviso rojo de arriba ya
            cubre este mismo mensaje con más fuerza. */}
        {!((patologias || []).length > 0) && (
          <p className="text-[11px] text-center mb-3 px-2" style={{ color: MALVA, fontFamily: fontBody }}>
            Este menú es una propuesta calculada sobre los requisitos FEDIAF, no una
            prescripción. Antes de cambiarle la alimentación a {nombrePerro}, enséñaselo a tu
            veterinario — y consúltale también si notas cualquier cambio en su digestión, su
            peso o su ánimo.
          </p>
        )}
        <button
          onClick={() => setSemanaConfirmada(true)}
          className="w-full py-4 rounded-2xl text-base"
          style={{ background: ROSA, color: "#FFFFFF", fontFamily: fontBody, fontWeight: 700 }}
        >
          Confirmar semana
        </button>
      </div>


      {seccionActiva === "perfil" && (
        <div className="fixed inset-0 z-50 flex flex-col px-6 pt-10 pb-8 overflow-y-auto cnl-pantalla-scroll" style={{ background: PAPEL }}>
          <div className="flex items-center justify-between mb-6">
            <BotonMenu onClick={() => setMenuLateralAbierto(true)} color={VIOLETA} className="p-1" />
            <button onClick={() => setSeccionActiva(null)} className="text-sm text-left" style={{ color: MALVA, fontFamily: fontBody }}>← Volver a los menús</button>
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
            // ⚠️ AÑADIDO (5 agosto, madrugada) — pedido expreso: aquí solo
            // salían las alergias, nunca las exclusiones (cosas que se
            // evitan sin ser alergia) ni las patologías -- ambas SÍ
            // afectan al menú generado, tenían que estar visibles igual.
            { label: "Exclusiones", valor: (perfil?.otrosEvitar || []).map((a) => a.alimento.replace("Todo: ", "")).join(", ") || "Ninguna" },
            { label: "Patologías", valor: (perfil?.patologias || []).map((k) => PATOLOGIAS.find((p) => p.key === k)?.label || k).join(", ") || "Ninguna" },
          ].map((campo) => (
            <div key={campo.label} className="flex items-center justify-between py-3" style={{ borderBottom: "1px solid #F0ECF7" }}>
              <span className="text-sm" style={{ color: MALVA, fontFamily: fontBody }}>{campo.label}</span>
              <span style={{ color: TINTA, fontFamily: fontDisplay, fontSize: 15 }}>{campo.valor}</span>
            </div>
          ))}
          {/* ⚠️ AÑADIDO (5 agosto, madrugada) — pedido expreso: no había
              ninguna forma de editar el perfil desde aquí. */}
          <button
            onClick={() => setFase("onboarding")}
            className="w-full py-3 rounded-xl text-sm mt-6"
            style={{ background: VIOLETA, color: "#FFFFFF", fontFamily: fontBody, fontWeight: 700 }}
          >
            Editar perfil
          </button>
        </div>
      )}

      {seccionActiva === "evolucion" && (
        <div className="fixed inset-0 z-50 flex flex-col px-6 pt-10 pb-8 overflow-y-auto cnl-pantalla-scroll" style={{ background: PAPEL }}>
          <div className="flex items-center justify-between mb-6">
            <BotonMenu onClick={() => setMenuLateralAbierto(true)} color={VIOLETA} className="p-1" />
            <button onClick={() => setSeccionActiva(null)} className="text-sm text-left" style={{ color: MALVA, fontFamily: fontBody }}>← Volver a los menús</button>
          </div>
          <p className="text-2xl mb-1" style={{ color: TINTA, fontFamily: fontDisplay }}>Evolución de {nombrePerro}</p>
          <p className="text-xs mb-6" style={{ color: MALVA, fontFamily: fontBody }}>Peso esperado vs. peso real registrado</p>
          <PremiumGate
            premium={premium}
            onSuscribir={() => { setSeccionActiva(null); onMostrarSuscripcion(); }}
            titulo="Evolución y crecimiento"
            descripcion="Sigue el peso real de tu perro y compáralo con la curva de crecimiento esperada."
          >
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
            <p className="text-xs mt-2 leading-snug" style={{ color: MALVA, fontFamily: fontBody }}>
              Es un <b style={{ color: TINTA }}>punto de partida</b>. Dos perros iguales
              pueden necesitar hasta un 38% más o menos. Pésalo cada 2-3 semanas y ajusta
              la cantidad según cómo lo veas.
            </p>
          </div>
          <div className="flex gap-2 mb-2">
            <input type="number" inputMode="decimal" value={nuevoPeso} onChange={(e) => setNuevoPeso(e.target.value)} placeholder="ej. 18.5"
              className="flex-1 text-lg py-3 px-4 rounded-xl outline-none" style={{ background: "#FFFFFF", border: "1.5px solid #E3DAF0", color: TINTA, fontFamily: fontDisplay }} />
            <button onClick={() => {
              if (Number(nuevoPeso) > 0) {
                set("pesoActual", nuevoPeso);
                setNuevoPeso("");
                setAvisoPesoActualizado(true);
              }
            }}
              className="px-5 rounded-xl" style={{ background: ROSA, color: "#FFFFFF", fontFamily: fontBody, fontWeight: 700 }}>Guardar</button>
          </div>
          {avisoPesoActualizado ? (
            <div className="rounded-xl p-3 mb-2" style={{ background: "#F0EBF8", border: "1.5px solid #D8CFEC" }}>
              <p className="text-xs mb-2" style={{ color: TINTA, fontFamily: fontBody }}>
                ✅ Peso actualizado. Para que el menú refleje este cambio, regenera con los mismos ingredientes.
              </p>
              <button
                onClick={() => {
                  const alimentosActuales = (menus[0]?.items || []).map(i => i.alimento).filter(Boolean);
                  setAvisoPesoActualizado(false);
                  setSeccionActiva(null);
                  setMenuReal(null);
                  onRegenerarConAlimentos(alimentosActuales);
                }}
                className="w-full py-2 rounded-lg text-sm"
                style={{ background: VIOLETA, color: "#FFFFFF", fontFamily: fontBody, fontWeight: 700 }}
              >
                Regenerar menú adaptado al nuevo peso →
              </button>
            </div>
          ) : (
            <p className="text-xs" style={{ color: MALVA, fontFamily: fontBody }}>Al guardar, este pasa a ser el peso actual.</p>
          )}
          </PremiumGate>
        </div>
      )}

      {seccionActiva === "menus" && (
        <div className="fixed inset-0 z-50 flex flex-col px-6 pt-10 pb-8" style={{ background: PAPEL }}>
          <div className="flex items-center justify-between mb-6">
            <BotonMenu onClick={() => setMenuLateralAbierto(true)} color={VIOLETA} className="p-1" />
            <button onClick={() => setSeccionActiva(null)} className="text-sm text-left" style={{ color: MALVA, fontFamily: fontBody }}>← Volver a los menús</button>
          </div>
          <p className="text-2xl mb-4" style={{ color: TINTA, fontFamily: fontDisplay }}>Mis menús</p>
          <PremiumGate
            premium={premium}
            onSuscribir={() => { setSeccionActiva(null); onMostrarSuscripcion(); }}
            titulo="Historial de menús"
            descripcion="Guarda y recupera todos tus menús anteriores con Rawku Premium."
          >
            <div className="flex flex-col gap-2">
              {menus.map((m) => (
                <button key={m.id} onClick={() => { setTabActiva(m.id); setSeccionActiva(null); }} className="flex items-center gap-3 p-4 rounded-2xl text-left" style={{ background: "#FFFFFF", border: "1.5px solid #E3DAF0" }}>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: VIOLETA }}>
                    <ClipboardList size={16} style={{ color: ROSA }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p style={{ color: TINTA, fontFamily: fontDisplay, fontSize: 16 }}>{m.nombre} · {m.kcal}kcal</p>
                    <p className="text-[10px] tracking-[0.1em] uppercase mt-0.5" style={{ color: MALVA, fontFamily: "monospace" }}>
                      {ETIQUETA_MODO[modo] || "AUTOMÁTICO"}
                    </p>
                  </div>
                  <ChevronRight size={16} style={{ color: "#C9BEDD" }} />
                </button>
              ))}
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
                  <p className="text-xs" style={{ color: MALVA, fontFamily: fontBody }}>Automático o personalizado</p>
                </div>
                <ChevronRight size={16} style={{ color: "#C9BEDD" }} />
              </button>
            </div>
          </PremiumGate>
        </div>
      )}

      {seccionActiva === "porque" && (
        <div className="fixed inset-0 z-50 flex flex-col px-6 pt-10 pb-8 overflow-y-auto cnl-pantalla-scroll" style={{ background: PAPEL }}>
          <div className="flex items-center justify-between mb-6">
            <BotonMenu onClick={() => setMenuLateralAbierto(true)} color={VIOLETA} className="p-1" />
            <button onClick={() => setSeccionActiva(null)} className="text-sm text-left" style={{ color: MALVA, fontFamily: fontBody }}>← Volver a los menús</button>
          </div>
          <p className="text-2xl mb-5" style={{ color: TINTA, fontFamily: fontDisplay }}>Por qué Rawku</p>
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
            Así nació Rawku: una herramienta creada para calcular la ración de forma más precisa, teniendo en
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
        <div className="fixed inset-0 z-50 flex flex-col px-6 pt-10 pb-8 overflow-y-auto cnl-pantalla-scroll" style={{ background: PAPEL }}>
          <div className="flex items-center justify-between mb-6">
            <BotonMenu onClick={() => setMenuLateralAbierto(true)} color={VIOLETA} className="p-1" />
            <button onClick={() => { setSeccionActiva(null); setResultadoAnalisis(null); setErrorAnalisis(null); }} className="text-sm text-left" style={{ color: MALVA, fontFamily: fontBody }}>← Volver</button>
          </div>
          <PremiumGate
            premium={premium}
            onSuscribir={() => { setSeccionActiva(null); onMostrarSuscripcion(); }}
            titulo="Analizador nutricional"
            descripcion="Analiza en detalle los nutrientes de la dieta actual de tu perro."
          >
          <div>
          <p className="text-2xl mb-2" style={{ color: TINTA, fontFamily: fontDisplay }}>Analizar la dieta actual</p>
            </div>
          ) : (
          <div>
          <p className="text-2xl mb-2" style={{ color: TINTA, fontFamily: fontDisplay }}>Analizar la dieta actual</p>
          <p className="text-sm leading-relaxed mb-5" style={{ color: MALVA, fontFamily: fontBody }}>
            Dinos qué le estás dando ahora mismo y cuántos gramos de cada cosa.
            Lo comparamos con lo que necesita y te decimos qué está bien y qué no.
          </p>

          {/* ⚠️ AÑADIDO (5 agosto, madrugada) — pedido expreso: no
              siempre se analiza la dieta del perro configurado en la
              app -- puede ser la de otro perro, sin querer crear un
              perfil nuevo permanente solo para este análisis puntual. */}
          <div className="flex items-center gap-2 mb-3">
            <button
              onClick={() => setAnalizandoParaOtro(false)}
              className="flex-1 py-2 rounded-lg text-sm"
              style={{ background: !analizandoParaOtro ? VIOLETA : "#FFFFFF", color: !analizandoParaOtro ? "#FFFFFF" : MALVA, fontFamily: fontBody, fontWeight: 600, border: "1.5px solid #E3DAF0" }}
            >
              {nombrePerro}
            </button>
            <button
              onClick={() => setAnalizandoParaOtro(true)}
              className="flex-1 py-2 rounded-lg text-sm"
              style={{ background: analizandoParaOtro ? VIOLETA : "#FFFFFF", color: analizandoParaOtro ? "#FFFFFF" : MALVA, fontFamily: fontBody, fontWeight: 600, border: "1.5px solid #E3DAF0" }}
            >
              Otro perro
            </button>
          </div>

          {!analizandoParaOtro && (
            <div className="px-4 py-3 rounded-xl mb-5" style={{ background: "#F0ECF7" }}>
              <p className="text-xs" style={{ color: TINTA, fontFamily: fontBody }}>
                Usamos el perfil de {nombrePerro}: {etapaLabel}, {derParaAnalisis} kcal al día.
              </p>
            </div>
          )}
          {analizandoParaOtro && (
            <div className="px-4 py-3 rounded-xl mb-5 flex flex-col gap-2.5" style={{ background: "#F0ECF7" }}>
              <p className="text-xs" style={{ color: MALVA, fontFamily: fontBody }}>
                Solo para este análisis -- no se guarda como una mascota nueva.
              </p>
              <div className="flex gap-2">
                <div className="flex-1">
                  <p className="text-[11px] mb-1" style={{ color: MALVA, fontFamily: fontBody }}>Peso (kg)</p>
                  <input
                    type="number" inputMode="decimal" min="0" placeholder="18"
                    value={otroPerroDatos.peso}
                    onChange={(e) => setOtroPerroDatos((p) => ({ ...p, peso: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg text-sm"
                    style={{ border: "1.5px solid #E3DAF0", color: TINTA, fontFamily: fontMono }}
                  />
                </div>
                <div className="flex-1">
                  <p className="text-[11px] mb-1" style={{ color: MALVA, fontFamily: fontBody }}>Etapa</p>
                  <select
                    value={otroPerroDatos.etapa}
                    onChange={(e) => setOtroPerroDatos((p) => ({ ...p, etapa: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg text-sm"
                    style={{ border: "1.5px solid #E3DAF0", color: TINTA, fontFamily: fontBody }}
                  >
                    <option value="cachorro_joven">Cachorro (hasta 2 meses)</option>
                    <option value="cachorro_crecimiento">Cachorro (en crecimiento)</option>
                    <option value="adulto">Adulto</option>
                    <option value="senior">Senior</option>
                  </select>
                </div>
              </div>
              {(otroPerroDatos.etapa === "cachorro_joven" || otroPerroDatos.etapa === "cachorro_crecimiento") && (
                <div className="flex gap-2">
                  <div className="flex-1">
                    <p className="text-[11px] mb-1" style={{ color: MALVA, fontFamily: fontBody }}>Peso adulto esperado (kg)</p>
                    <input
                      type="number" inputMode="decimal" min="0" placeholder="30"
                      value={otroPerroDatos.pesoAdulto}
                      onChange={(e) => setOtroPerroDatos((p) => ({ ...p, pesoAdulto: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg text-sm"
                      style={{ border: "1.5px solid #E3DAF0", color: TINTA, fontFamily: fontMono }}
                    />
                  </div>
                </div>
              )}
              {derParaAnalisis ? (
                <p className="text-xs" style={{ color: TINTA, fontFamily: fontBody }}>
                  Necesita, aproximadamente, <b>{derParaAnalisis} kcal al día</b>.
                </p>
              ) : (
                <p className="text-xs" style={{ color: MALVA, fontFamily: fontBody }}>
                  Dinos al menos el peso para poder calcular lo que necesita.
                </p>
              )}
            </div>
          )}

          {/* ⚠️ AÑADIDO (5 agosto, madrugada) — pedido expreso: algunas
              dietas comerciales dan el reparto en % ("70% pollo"), no en
              gramos exactos. Con este toggle se puede introducir de
              cualquiera de las dos formas. */}
          <div className="flex items-center gap-2 mb-4">
            <button
              onClick={() => setModoEntradaAnalizar("gramos")}
              className="flex-1 py-2 rounded-lg text-sm"
              style={{ background: modoEntradaAnalizar === "gramos" ? VIOLETA : "#FFFFFF", color: modoEntradaAnalizar === "gramos" ? "#FFFFFF" : MALVA, fontFamily: fontBody, fontWeight: 600, border: "1.5px solid #E3DAF0" }}
            >
              En gramos
            </button>
            <button
              onClick={() => setModoEntradaAnalizar("porcentaje")}
              className="flex-1 py-2 rounded-lg text-sm"
              style={{ background: modoEntradaAnalizar === "porcentaje" ? VIOLETA : "#FFFFFF", color: modoEntradaAnalizar === "porcentaje" ? "#FFFFFF" : MALVA, fontFamily: fontBody, fontWeight: 600, border: "1.5px solid #E3DAF0" }}
            >
              En porcentaje
            </button>
          </div>
          {modoEntradaAnalizar === "porcentaje" && (
            <div className="mb-5">
              <p className="text-xs mb-1.5" style={{ color: MALVA, fontFamily: fontBody }}>¿Cuántos gramos en total le das al día?</p>
              <input
                type="number" inputMode="numeric" min="0" placeholder="600"
                value={totalGramosDiaPorcentaje}
                onChange={(e) => setTotalGramosDiaPorcentaje(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg text-sm"
                style={{ border: "1.5px solid #E3DAF0", color: TINTA, fontFamily: fontMono }}
              />
            </div>
          )}

          {/* ⚠️ REDISEÑADO (5 agosto, noche): antes era una sola lista
              plana -- añadir un alimento de cada categoría significaba
              volver a abrir el selector entero cada vez, eligiendo
              categoría otra vez desde cero. Ahora, igual que en
              Personalizar, cada categoría es su propia tarjeta siempre
              visible, con su botón de añadir dentro -- se puede ir
              completando categoría a categoría sin perder el sitio. */}
          {CATEGORIAS_ICONOS.map((cat) => {
            const Icono = cat.Icono;
            const itemsDeEstaCategoria = dietaAnalizar
              .map((it, idxReal) => ({ ...it, idxReal }))
              .filter((it) => it.categoria === cat.nombre);
            const abierto = abiertoAnalizar && abiertoAnalizar.categoria === cat.nombre ? abiertoAnalizar : null;
            const catsParaEsta = { [cat.nombre]: (categoriasDisponibles || CATEGORIAS_ALIMENTO)[cat.nombre] };
            return (
              <div key={cat.nombre} className="rounded-2xl p-4 mb-3" style={{ background: "#FFFFFF", border: "1.5px solid #E3DAF0" }}>
                <div className="flex items-center gap-3 mb-1">
                  <div className="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: PAPEL }}>
                    <Icono size={16} strokeWidth={1.6} style={{ color: VIOLETA }} />
                  </div>
                  <p className="flex-1" style={{ color: TINTA, fontFamily: fontDisplay, fontSize: 16 }}>{cat.nombre}</p>
                </div>
                {itemsDeEstaCategoria.length > 0 && (
                  <div className="mt-3 pl-12 flex flex-col gap-2">
                    {itemsDeEstaCategoria.map((it) => (
                      <div key={it.idxReal} className="flex items-center gap-2">
                        <span className="flex-1 text-sm" style={{ color: TINTA, fontFamily: fontBody }}>{it.alimento}</span>
                        <input
                          type="number" inputMode="numeric" min="0" placeholder="0"
                          value={it.gramos}
                          onChange={(e) => setDietaAnalizar((prev) => prev.map((x, i) => i === it.idxReal ? { ...x, gramos: e.target.value } : x))}
                          className="w-16 text-right text-sm px-2 py-1.5 rounded-lg"
                          style={{ border: "1.5px solid #E3DAF0", color: VIOLETA, fontFamily: fontMono }}
                        />
                        <span className="text-xs" style={{ color: MALVA, fontFamily: fontBody }}>{modoEntradaAnalizar === "porcentaje" ? "%" : "g"}</span>
                        <button onClick={() => setDietaAnalizar((prev) => prev.filter((_, i) => i !== it.idxReal))}>
                          <X size={14} style={{ color: ROSA }} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="mt-3 pl-12">
                  {!abierto && (
                    <button onClick={() => setAbiertoAnalizar({ categoria: cat.nombre, especie: null })}
                      className="px-3 py-2 rounded-lg text-sm" style={{ background: PAPEL, color: MALVA, fontFamily: fontBody, border: "1.5px dashed #C9BEDD" }}>
                      {itemsDeEstaCategoria.length > 0 ? "+ Añadir otro" : "+ Añadir alimento"}
                    </button>
                  )}
                  {abierto && !abierto.especie && (
                    <div className="rounded-xl p-3" style={{ background: PAPEL }}>
                      <p className="text-xs mb-2" style={{ color: MALVA, fontFamily: "monospace" }}>ESPECIE</p>
                      <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto">
                        {Object.keys(catsParaEsta[cat.nombre] || {}).map((especie) => (
                          <button key={especie} onClick={() => setAbiertoAnalizar({ categoria: cat.nombre, especie })}
                            className="text-left px-3 py-2 rounded-lg text-sm" style={{ color: TINTA, fontFamily: fontBody, background: "#FFFFFF" }}>
                            {especie}
                          </button>
                        ))}
                      </div>
                      <button onClick={() => setAbiertoAnalizar(null)} className="text-xs mt-2" style={{ color: MALVA, fontFamily: fontBody }}>Cancelar</button>
                    </div>
                  )}
                  {abierto && abierto.especie && (
                    <div className="rounded-xl p-3" style={{ background: PAPEL }}>
                      <p className="text-xs mb-2" style={{ color: MALVA, fontFamily: "monospace" }}>{abierto.especie.toUpperCase()}</p>
                      <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto">
                        {(catsParaEsta[cat.nombre]?.[abierto.especie] || []).map((alimento) => (
                          <button key={alimento} onClick={() => {
                              setDietaAnalizar((prev) => [...prev, { categoria: cat.nombre, alimento, gramos: "" }]);
                              setAbiertoAnalizar(null);
                            }}
                            className="text-left px-3 py-2 rounded-lg text-sm" style={{ color: TINTA, fontFamily: fontBody, background: "#FFFFFF" }}>
                            {alimento}
                          </button>
                        ))}
                      </div>
                      <button onClick={() => setAbiertoAnalizar({ categoria: cat.nombre, especie: null })} className="text-xs mt-2" style={{ color: MALVA, fontFamily: fontBody }}>← Otra especie</button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {dietaAnalizar.length > 0 && (() => {
            const esPct = modoEntradaAnalizar === "porcentaje";
            const totalPctMetido = dietaAnalizar.reduce((s, i) => s + (Number(i.gramos) || 0), 0);
            const totalGramosDia = esPct ? Number(totalGramosDiaPorcentaje) || 0 : null;
            const totalGramosMetidos = esPct
              ? (totalPctMetido / 100) * totalGramosDia
              : dietaAnalizar.reduce((s, i) => s + (Number(i.gramos) || 0), 0);
            const kcalMetidas = dietaAnalizar.reduce((s, i) => {
              const gramosReales = esPct ? (Number(i.gramos) || 0) / 100 * totalGramosDia : (Number(i.gramos) || 0);
              return s + gramosReales * (energiaAlimentos[i.alimento] || 0) / 100;
            }, 0);
            const hayDatosEnergia = Object.keys(energiaAlimentos).length > 0;
            return (
              <div className="mb-5">
                <p className="text-xs" style={{ color: MALVA, fontFamily: fontBody }}>
                  {esPct
                    ? `Total: ${Math.round(totalPctMetido)}% ${totalGramosDia ? `(≈ ${Math.round(totalGramosMetidos)} g al día)` : ""}`
                    : `Total: ${totalGramosMetidos} g al día`}
                </p>
                {hayDatosEnergia && derParaAnalisis && (!esPct || totalGramosDia > 0) && (
                  <p className="text-xs mt-1" style={{ color: Math.abs(kcalMetidas - derParaAnalisis) / derParaAnalisis > 0.1 ? ROSA : "#5A9367", fontFamily: fontBody }}>
                    Eso son {Math.round(kcalMetidas)} kcal · {analizandoParaOtro ? "este perro" : nombrePerro} necesita {derParaAnalisis} kcal al día
                  </p>
                )}
              </div>
            );
          })()}

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
          </PremiumGate>
        </div>
      )}

      {semanaConfirmada && (
        <div className="fixed inset-0 z-50 flex flex-col px-6 pt-10 pb-8 overflow-y-auto cnl-pantalla-scroll" style={{ background: PAPEL }}>
          {/* ⚠️ REDISEÑADO (5 agosto, madrugada) — pedido expreso: antes
              esto era solo un "¡Todo listo!" genérico con tres botones
              de navegación -- ahora es un resumen real de lo que se
              acaba de guardar: una tarjeta por cada menú, con el total
              de gramos y los ingredientes (sin gramos por ingrediente,
              solo los nombres, tal como se pidió). El menú lateral
              queda accesible directamente desde aquí, a la izquierda,
              en vez de tener que pasar por un botón de "volver". */}
          <div className="flex items-center gap-3 mb-6">
            <BotonMenu onClick={() => setMenuLateralAbierto(true)} color={VIOLETA} className="p-1" />
            <p className="text-xs" style={{ color: MALVA, fontFamily: fontBody }}>
              Guardado
            </p>
          </div>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-11 h-11 rounded-full flex items-center justify-center shrink-0" style={{ background: VIOLETA }}>
              <Dog size={20} strokeWidth={1.4} style={{ color: ROSA }} />
            </div>
            <div>
              <p className="text-xl leading-tight" style={{ color: VIOLETA, fontFamily: fontDisplay, fontWeight: 600 }}>
                Menú{menus.length > 1 ? "s" : ""} de {nombrePerro}
              </p>
              <p className="text-xs" style={{ color: MALVA, fontFamily: fontBody }}>
                Puedes seguir cambiando lo que quieras cuando quieras.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3 mb-6">
            {menus.map((m, i) => {
              // ⚠️ los gramos EDITADOS (si los hay) son los que de
              // verdad valen -- menu.items es solo el original, antes
              // de cualquier cambio hecho a mano después de generarlo.
              const gramosDeVerdad = gramosRealesPorMenu[m.id];
              const items = gramosDeVerdad
                ? Object.entries(gramosDeVerdad).map(([alimento, gramos]) => ({ alimento, gramos }))
                : m.items;
              const totalGramos = Math.round(items.reduce((s, it) => s + (Number(it.gramos) || 0), 0));
              return (
                <button
                  key={m.id}
                  onClick={() => { setSemanaConfirmada(false); setTabActiva(m.id); }}
                  className="text-left p-4 rounded-2xl"
                  style={{ background: "#FFFFFF", border: "1.5px solid #E3DAF0" }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span style={{ color: TINTA, fontFamily: fontDisplay, fontSize: 16, fontWeight: 600 }}>
                      {menus.length > 1 ? `Menú ${i + 1}` : "Menú"}
                    </span>
                    <span className="text-xs" style={{ color: MALVA, fontFamily: "monospace" }}>
                      {totalGramos} g
                    </span>
                  </div>
                  {/* ⚠️ AÑADIDO (5 agosto, madrugada): esto es lo que
                      antes salía roto ("2 días", "semana 2"...) -- el
                      dato ya existía (m.dias), solo faltaba mostrarlo
                      con sentido. */}
                  <p className="text-xs mb-1.5" style={{ color: VIOLETA, fontFamily: fontBody, fontWeight: 600 }}>
                    {m.dias} {m.dias === 1 ? "día" : "días"} a la semana
                  </p>
                  <p className="text-xs leading-relaxed" style={{ color: MALVA, fontFamily: fontBody }}>
                    {items.map((it) => it.alimento).join(" · ")}
                  </p>
                </button>
              );
            })}
          </div>

          <div className="flex-1" />
        </div>
      )}
      {menuLateralAbierto && (
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
                { key: "perfil", Icono: Dog, label: `Perfil de ${nombrePerro}`, isPremium: false },
                { key: "evolucion", Icono: TrendingUp, label: "Evolución y crecimiento", isPremium: true },
                { key: "menus", Icono: ClipboardList, label: "Mis menús", isPremium: true },
                { key: "analizar", Icono: Search, label: "Analizar la dieta actual", isPremium: true },
                { key: "porque", Icono: Heart, label: "Por qué Rawku", isPremium: false },
              ].map((op) => {
                const Icono = op.Icono;
                const bloqueado = op.isPremium && !premium;
                return (
                  <button key={op.key} onClick={() => { setSeccionActiva(op.key); setMenuLateralAbierto(false); setSemanaConfirmada(false); }} className="w-full flex items-center gap-3 px-3 py-3.5 rounded-xl">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: PAPEL }}>
                      <Icono size={17} strokeWidth={1.6} style={{ color: bloqueado ? MALVA : VIOLETA }} />
                    </div>
                    <span className="flex-1 text-left" style={{ color: bloqueado ? MALVA : TINTA, fontFamily: fontDisplay, fontSize: 16 }}>{op.label}</span>
                    {bloqueado
                      ? <Lock size={13} style={{ color: MALVA }} />
                      : <ChevronRight size={16} style={{ color: "#C9BEDD" }} />
                    }
                  </button>
                );
              })}
            </div>
            {/* ⚠️ AÑADIDO (5 agosto, madrugada) — CASO REAL SIN RESOLVER,
                MISMO PATRÓN QUE YA PASÓ CON EL BACKEND: si esto en
                pantalla no dice esta fecha exacta, es que Vercel sigue
                sirviendo una versión vieja de la app -- fuérzalo con
                "Redeploy" desde el panel de Vercel, o revisa que el
                último commit sea el que está en producción. */}
            <p className="text-[10px] text-center pb-3" style={{ color: "#D8CFEC", fontFamily: "monospace" }}>
              build 2026-08-13 19:40 UTC
            </p>
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

function RawkuOnboardingInterna({ usuario }) {
  // ─── AUTH — recibido como prop desde AuthGate ─────────────
  const [premium, setPremium] = useState(false);
  const [mostrarSuscripcion, setMostrarSuscripcion] = useState(false);

  useEffect(() => {
    if (usuario) {
      esPremium(usuario.id).then(setPremium).catch(() => setPremium(false));
    }
    // Si viene de Stripe con pago ok, marcar como premium
    const params = new URLSearchParams(window.location.search);
    if (params.get('pago') === 'ok') {
      setPremium(true);
      window.history.replaceState({}, '', '/');
    }
  }, [usuario]);

  // ─── RESTO DE ESTADOS ─────────────────────────────────────
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
    // ⚠️ AÑADIDO (5 agosto, madrugada) — pedido expreso: perros que no
    // pueden masticar hueso carnoso con normalidad (senior, dientes en
    // mal estado, etc.) necesitan poder excluir esa categoría entera de
    // la ración, compensando el calcio con suplementos comerciales.
    categoriasExcluidasSi: null,
    categoriasExcluidas: [],
  });
  const [categoriaAbierta, setCategoriaAbierta] = useState(null);
  // ⚠️ CORREGIDO (5 agosto, madrugada) — FALLO REAL CONFIRMADO: esto
  // estaba declarado 42 líneas más abajo, DESPUÉS de "drawerLigero" --
  // que lo usa dentro de su JSX. En JavaScript, una "const" no se
  // puede leer antes de su propia línea de declaración (a diferencia
  // de una función, que sí tiene "hoisting"). Como drawerLigero se
  // reevalúa en cada render, en cuanto se abría el menú (en cualquier
  // pantalla del 1 al 6), intentaba leer nombreMostrar antes de que
  // existiera -- error real de JavaScript, atrapado por el
  // ErrorBoundary como "Algo ha fallado". Movido aquí arriba, antes de
  // todo lo que lo usa.
  const nombreMostrar = perfil.nombre.trim() || "tu perro";
  const [busqueda, setBusqueda] = useState("");

  const [fase, setFase] = useState("onboarding");
  const [menuReal, setMenuReal] = useState(null);
  const [alimentosAPreservar, setAlimentosAPreservar] = useState([]);
  // ⚠️ AÑADIDO (5 agosto, madrugada) — pedido expreso, AUDITORÍA: el
  // servidor ya avisaba (no_se_pudo_forzar: true) cuando en Personalizar
  // no era viable un menú con TODO lo elegido a mano, y tenía que
  // resolver libre para poder darte algo -- pero el frontend nunca leía
  // ese dato, así que nunca se veía ningún aviso, aunque el servidor sí
  // lo estaba mandando.
  const [avisoNoForzado, setAvisoNoForzado] = useState(false);
  // ⚠️ AÑADIDO (5 agosto, madrugada) — pedido expreso: distinto de
  // avisoNoForzado (que es "nada de lo elegido se pudo mantener") --
  // esto es "casi todo se mantuvo, pero hizo falta añadir una especie
  // más en carne/pescado/hueso que no habías elegido a mano".
  const [avisoExtraEspecie, setAvisoExtraEspecie] = useState(null);
  // ⚠️ AÑADIDO (5 agosto, madrugada) — pedido expreso: en Personalizar
  // también se elige a mano, así que merece el mismo tipo de
  // diagnóstico que ya existe al editar un menú ya generado --
  // comparar exactamente qué se eligió a mano contra qué salió de
  // verdad en el menú final (extras, suplementos o alimentos añadidos
  // por el motor para cerrar los requisitos no cuentan como "perdido",
  // solo lo que se ELIGIÓ y luego no apareció).
  const [diagnosticoPersonalizar, setDiagnosticoPersonalizar] = useState(null);
  // ⚠️ AÑADIDO (5 agosto, noche): la usuaria lleva varias rondas viendo
  // que pedir varios menús automáticos solo le da 1 -- revisado el
  // código a fondo y en mis pruebas SÍ funciona bien, así que sospecho
  // que sigue con una versión vieja desplegada. Para no seguir
  // adivinando a ciegas, esto guarda cuántos se pidieron de verdad y
  // cuántos se consiguieron, visible en la pantalla si no coinciden --
  // así la próxima vez hay datos reales, no solo sospechas.
  const [diagnosticoMenus, setDiagnosticoMenus] = useState(null);
  const [menuCargando, setMenuCargando] = useState(false);
  const [menuError, setMenuError] = useState(null);
  const [necesitaVeterinario, setNecesitaVeterinario] = useState(false);
  const [menuDespertando, setMenuDespertando] = useState(false);
  const [dietaActual, setDietaActual] = useState(null);
  const [modo, setModo] = useState(null);
  const [pantalla, setPantalla] = useState("elegir");

  const [numMenus, setNumMenus] = useState(1);
  // ⚠️ AÑADIDO (5 agosto, noche): la barra de arriba con el menú lateral
  // desaparecía en cuantos/personalizar/resultado -- vivía solo dentro de
  // VistaMenus, que no existe todavía en esas pantallas (aún no hay
  // ningún menú generado). Versión ligera para estas pantallas: solo
  // "Editar perfil", que es lo único que tiene sentido antes de generar
  // nada (Mis menús, Evolución... necesitan un menú ya hecho).
  const [menuLigeroAbierto, setMenuLigeroAbierto] = useState(false);

  const [configPersonalizar, setConfigPersonalizar] = useState(
    Object.fromEntries(CATEGORIAS_ICONOS.map((c) => [c.nombre, { modo: c.nombre === "Suplementos comerciales" ? "no" : "auto", elegido: [] }]))
  );
  // ⚠️ AÑADIDO (5 agosto, madrugada) — CASO REAL, pedido expreso: "que
  // se pueda personalizar cada menú individualmente, no que pongas los
  // ingredientes y los reparta entre todos los menús que quieres
  // hacer". Antes, Personalizar SIEMPRE generaba un único menú -- ni
  // siquiera existía la opción de pedir varios (esa pantalla decía
  // literalmente "Menú semanal · automático" en su cabecera). Ahora,
  // en Personalizar con más de un menú, cada uno tiene su PROPIA
  // configuración -- para no reescribir toda la lógica que ya usa
  // `configPersonalizar` (elegir/quitar alimento, la pantalla de
  // categorías...), ese estado sigue representando "el menú que se
  // está editando ahora mismo"; este array nuevo guarda los configs de
  // TODOS los menús, y al cambiar de pestaña se intercambia cuál de
  // ellos es el activo. Se inicializa con la copia del config recién
  // declarado arriba, repetida tantas veces como el máximo de menús
  // permitido (8) -- solo se usan los primeros `numMenus` de verdad.
  const configPersonalizarBase = () =>
    Object.fromEntries(CATEGORIAS_ICONOS.map((c) => [c.nombre, { modo: c.nombre === "Suplementos comerciales" ? "no" : "auto", elegido: [] }]));
  const [configsPorMenu, setConfigsPorMenu] = useState(
    Array.from({ length: 8 }, () => configPersonalizarBase())
  );
  const [menuPersonalizandoIdx, setMenuPersonalizandoIdx] = useState(0);
  const [estadoAbiertoPersonalizar, setEstadoAbiertoPersonalizar] = useState(null);

  // sincroniza automáticamente: cualquier cambio en configPersonalizar
  // (elegir/quitar un alimento, cambiar de modo auto/manual...) se
  // guarda en el hueco del menú que se está editando ahora mismo.
  useEffect(() => {
    setConfigsPorMenu((prev) => {
      const copia = [...prev];
      copia[menuPersonalizandoIdx] = configPersonalizar;
      return copia;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configPersonalizar]);

  // cambiar de menú a personalizar: carga el config guardado de ese
  // menú (o uno vacío si es la primera vez que se visita).
  const cambiarMenuPersonalizando = (nuevoIdx) => {
    setMenuPersonalizandoIdx(nuevoIdx);
    setConfigPersonalizar(configsPorMenu[nuevoIdx] || configPersonalizarBase());
  };

  // ⚠️ AÑADIDO (5 agosto, noche): panel ligero para las pantallas de
  // antes de tener un menú generado (cuantos/personalizar/resultado) --
  // solo "Editar perfil", que es lo único que tiene sentido ahí. El
  // panel completo (con Evolución, Mis menús...) sigue viviendo dentro
  // de VistaMenus, una vez ya hay un menú de verdad.
  const drawerLigero = menuLigeroAbierto && (
    <div className="fixed inset-0 z-[60] flex" style={{ background: "rgba(35,21,57,0.4)" }} onClick={() => setMenuLigeroAbierto(false)}>
      <div className="w-[78%] max-w-xs h-full flex flex-col" style={{ background: "#FFFFFF" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ background: VIOLETA }} className="px-6 pt-10 pb-6 flex items-center justify-between">
          <p className="text-xl" style={{ color: "#FFFFFF", fontFamily: fontDisplay }}>{nombreMostrar}</p>
          <button onClick={() => setMenuLigeroAbierto(false)}><X size={22} style={{ color: "#FFFFFF" }} /></button>
        </div>
        <div className="flex-1 px-3 pt-4">
          {/* ⚠️ CORREGIDO (5 agosto, madrugada) — CASO REAL ENCONTRADO:
              "Editar perfil de X" llevaba a la pantalla de RESUMEN
              final (fase="onboarding"), que muestra los 6 pasos ya
              completados -- pero si se pulsa DESDE DENTRO de los
              propios pasos 1-6 (donde ya se está editando el perfil
              en ese mismo momento), esa pantalla sale prácticamente
              vacía ("—" en casi todo, porque nada se ha rellenado
              aún). Esto es justo lo que se estaba percibiendo como
              "error" al abrir el menú desde el paso 1 -- no era un
              fallo técnico, era llevar a una pantalla que no tenía
              ningún sentido mostrar ahí. Igual que las otras 3
              opciones, ahora se ve en gris y sin poder pulsarse
              mientras se está dentro de los pasos 1-6 -- solo se
              activa en las pantallas de después (elegir/cuantos/
              personalizar/resultado), donde sí tiene sentido volver a
              revisar un perfil ya completado. */}
          {paso >= 1 && paso <= TOTAL_PASOS ? (
            <div className="w-full flex items-center gap-3 px-3 py-3.5 rounded-xl" style={{ opacity: 0.4 }}>
              <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: PAPEL }}>
                <Dog size={17} strokeWidth={1.6} style={{ color: MALVA }} />
              </div>
              <span className="flex-1 text-left" style={{ color: MALVA, fontFamily: fontDisplay, fontSize: 16 }}>Editar perfil de {nombreMostrar}</span>
              <span className="text-[10px]" style={{ color: MALVA, fontFamily: "monospace" }}>ya estás aquí</span>
            </div>
          ) : (
            <button onClick={() => { setMenuLigeroAbierto(false); setFase("onboarding"); }} className="w-full flex items-center gap-3 px-3 py-3.5 rounded-xl">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: PAPEL }}>
                <Dog size={17} strokeWidth={1.6} style={{ color: VIOLETA }} />
              </div>
              <span className="flex-1 text-left" style={{ color: TINTA, fontFamily: fontDisplay, fontSize: 16 }}>Editar perfil de {nombreMostrar}</span>
              <ChevronRight size={16} style={{ color: "#C9BEDD" }} />
            </button>
          )}
          {/* ⚠️ AÑADIDO (5 agosto, madrugada) — pedido expreso: antes,
              durante el onboarding, el menú SOLO tenía "Editar perfil"
              -- el resto de secciones (Evolución, Mis menús, Analizar)
              ni siquiera se veían, como si no existieran. Ahora se ven
              igual que en el menú completo, pero en gris y sin poder
              pulsarlas, porque todavía no tiene sentido entrar ahí (no
              hay ningún menú generado, ni perfil completo, hasta que se
              termine este proceso) -- así se entiende que van a estar
              ahí en cuanto termines, en vez de que simplemente no
              existan. */}
          {[
            { Icono: TrendingUp, label: "Evolución y crecimiento" },
            { Icono: ClipboardList, label: "Mis menús" },
            { Icono: Search, label: "Analizar la dieta actual" },
          ].map((op) => (
            <div key={op.label} className="w-full flex items-center gap-3 px-3 py-3.5 rounded-xl" style={{ opacity: 0.4 }}>
              <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: PAPEL }}>
                <op.Icono size={17} strokeWidth={1.6} style={{ color: MALVA }} />
              </div>
              <span className="flex-1 text-left" style={{ color: MALVA, fontFamily: fontDisplay, fontSize: 16 }}>{op.label}</span>
              <span className="text-[10px]" style={{ color: MALVA, fontFamily: "monospace" }}>aún no</span>
            </div>
          ))}
        </div>
        {/* ⚠️ AÑADIDO (5 agosto, madrugada) — mismo patrón que en el
            menú lateral completo: marca de versión visible para poder
            confirmar si Vercel está sirviendo de verdad la última
            versión, dado el patrón repetido de despliegues viejos. */}
        <p className="text-[10px] text-center pb-3" style={{ color: "#D8CFEC", fontFamily: "monospace" }}>
          build 2026-08-13 19:40 UTC
        </p>
        {usuario && !premium && (
          <button
            onClick={() => { setMenuLigeroAbierto(false); setMostrarSuscripcion(true); }}
            className="w-full text-center py-3 mx-auto mb-2 rounded-xl"
            style={{ color: '#FFFFFF', background: ROSA, fontFamily: fontBody, fontSize: 14, fontWeight: 700, border: 'none', cursor: 'pointer', maxWidth: 280 }}
          >
            ✨ Hazte Premium — 7 días gratis
          </button>
        )}
        {usuario && (
          <button
            onClick={() => { setMenuLigeroAbierto(false); logout(); }}
            className="w-full text-center pb-4"
            style={{ color: MALVA, fontFamily: fontBody, fontSize: 13, background: 'none', border: 'none', cursor: 'pointer' }}
          >
            Cerrar sesión
          </button>
        )}
      </div>
    </div>
  );

  const irAModo = (m) => {
    setModo(m);
    // ⚠️ CAMBIADO (5 agosto, madrugada) — pedido expreso: antes solo
    // "automático" pasaba por la pantalla de "¿cuántos menús?" --
    // Personalizar iba directo a elegir categorías, siempre con 1
    // solo menú. Ahora ambos pasan por ahí primero.
    if (m === "automatico" || m === "personalizar") setPantalla("cuantos");
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
    return RAZAS.filter((r) => r.nombre.toLowerCase().includes(q)).slice(0, 12);
  }, [busqueda]);

  const edad = useMemo(() => calcularEdad(perfil.dia, perfil.mesIdx, perfil.anio), [perfil.dia, perfil.mesIdx, perfil.anio]);

  const especiesExcluidas = useMemo(() => especiesExcluidasDePerfil(perfil), [perfil.alergias, perfil.otrosEvitar]);
  const alimentosEvitados = useMemo(() => alimentosEvitadosDePerfil(perfil), [perfil.alergias, perfil.otrosEvitar]);
  const categoriasDisponibles = useMemo(
    () => filtrarCategoriasPorEspecies(CATEGORIAS_ALIMENTO, especiesExcluidas),
    [especiesExcluidas]
  );

  // ⚠️ CORREGIDO (5 agosto, noche): antes esto era directamente la media
  // de la raza, sin ajustar nunca por la curva de crecimiento real del
  // cachorro. Ahora, si hay edad y peso actual, se usa su propia
  // trayectoria (igual que ya hacía der.py en el servidor) -- la media
  // de la raza queda solo como último recurso, cuando faltan datos.
  const pesoAdultoMedioRaza = perfil.raza?.pesoMedio || PESO_ADULTO_POR_TAMANO[perfil.tamanoManual] || 25;
  const pesoAdultoEsperado = pesoAdultoDesdeCurva(
    Number(perfil.pesoActual), edad?.totalMeses, pesoAdultoMedioRaza,
    perfil.raza?.pesoMin, perfil.raza?.pesoMax
  ) || pesoAdultoMedioRaza;
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
    [perfil.pesoActual, etapaCalculada, perfil.actividadIdx, perfil.esterilizado,
     pesoAdultoEsperado, perfil.raza?.nombre, perfil.sexo, perfil.condicionIdx]
  );

  // ⚠️ CONECTADO al motor nuevo (5 agosto): /menu/v2 en vez de /menu. El
  // motor decide QUÉ alimentos usar Y cuánto de cada uno a la vez (programa-
  // cion lineal entera mixta), comprobado de forma EXACTA contra los 30
  // requisitos, con maximo 2 suplementos -- ya NO hace falta darle una lista
  // de candidatos "razonable" a mano: el motor busca de verdad entre TODOS
  // los alimentos accesibles. Se le sigue mandando nombres_alimentos/
  // forzar_presencia porque el backend lo usa para personalizar
  // (via el campo "modo").
  useEffect(() => {
    if (!(fase === "generador" && pantalla === "resultado" && derReal)) return;
    let cancelado = false;
    setMenuCargando(true);
    setAlimentosAPreservar([]); // limpiar tras usar — no afectar a futuras generaciones
    setMenuError(null);
    setDiagnosticoMenus(null);
    setNecesitaVeterinario(false);
    setMenuDespertando(false);

    // ⚠️ AÑADIDO (5 agosto): especiesYaUsadas -- para que, al pedir varios
    // menús en automático, cada uno rote a una proteína DISTINTA en vez de
    // salir siempre el mismo. Antes se llamaba 3 veces con los MISMOS
    // datos, así que con la vía rápida del catálogo (que es determinista:
    // mismos datos, mismo resultado siempre) los 3 menús salían idénticos.
    // ⚠️ CAMBIADO (5 agosto, madrugada) — pedido expreso: acepta el
    // config del menú concreto que se está pidiendo (para que, en
    // Personalizar con varios menús, cada uno mande SUS PROPIAS
    // elecciones, en vez de repetir siempre las del último editado).
    // Por defecto usa configPersonalizar (el activo ahora mismo), así
    // que las llamadas que ya existían sin este parámetro no cambian.
    const pedirMenu = (especiesYaUsadas = [], configDeEsteMenu = configPersonalizar) =>
      fetch(`${API_BASE}/menu/v2`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modo: modo || "automatico",
          nombres_alimentos:
            alimentosAPreservar.length > 0 ? alimentosAPreservar :
            modo === "personalizar" ? eleccionesDelUsuario(modo, configDeEsteMenu) :
            [],
          forzar_presencia: eleccionesDelUsuario(modo, configDeEsteMenu),
          restringir_especie: restriccionesDeEspecie(modo, configDeEsteMenu),
          der_objetivo: derReal,
          etapa_requisitos: ETAPA_A_SUFIJO_API[etapaCalculada] || "Adulto",
          // ⚠️ CORREGIDO (5 agosto, madrugada): antes la especie a rotar
          // (para dar variedad entre varios menús automáticos) se
          // mezclaba aquí, en especies_excluidas -- pensado para
          // alergias REALES, una exclusión dura. Si la especie del
          // menú anterior era la única forma razonable de cerrar los 30
          // requisitos, esa exclusión dura podía volver el problema
          // imposible, y el usuario veía el fallo sin haber pedido
          // nada de eso -- la rotación es una decisión interna, nunca
          // debería poder romper el menú. Ahora va aparte, como
          // preferencia suave (evitar_especies): el motor la evita si
          // puede, nunca falla por su causa.
          especies_excluidas: Array.from(especiesExcluidas),
          evitar_especies: especiesYaUsadas,
          nombres_excluidos: Array.from(alimentosEvitados),
          peso_perro_kg: perfil?.pesoActual ? Number(perfil.pesoActual) : null,
          patologias: perfil?.patologias || [],
          // ⚠️ AÑADIDO (5 agosto, madrugada) — pedido expreso: perros
          // que no pueden masticar hueso carnoso (senior, dientes en
          // mal estado...) -- se manda al servidor, que compensa el
          // calcio con suplementos comerciales en su lugar.
          categorias_excluidas: perfil?.categoriasExcluidas || [],
          peso_adulto_esperado_kg: pesoAdultoEsperado || null,
          // ⚠️ CORREGIDO (5 agosto, madrugada): antes esto solo se mandaba
          // en el primer menú, forzando que el 2º y 3º cayeran siempre a
          // la búsqueda libre en caliente -- que en el servidor real
          // podía tardar 19+ segundos, demasiado cerca del límite de
          // 30s de Render (confirmado con el tiempo exacto). Ahora hay
          // variantes pre-resueltas con proteína distinta para CUALQUIER
          // menú de la sesión, no solo el primero, así que el tamaño se
          // manda siempre -- el servidor decide solo si puede usar la
          // vía rápida o no.
          tamano: perfil?.raza?.tamano || perfil?.tamanoManual || null,
        }),
      }).then(async (res) => {
        // ⚠️ AÑADIDO (5 agosto, noche): antes esto era solo
        // `res.json()` -- si el servidor devolvía algo vacío o
        // recortado (un proxy cortando la respuesta a medio camino,
        // por ejemplo), esto fallaba en silencio y el registro
        // de diagnóstico decía "no factible -- (sin motivo)", sin
        // decir POR QUÉ. Ahora se captura el código HTTP siempre,
        // y si el cuerpo no es JSON válido, se dice explícitamente
        // en vez de fingir que fue una respuesta normal sin motivo.
        let cuerpo;
        try {
          cuerpo = await res.json();
        } catch (e) {
          return { factible: false, motivo: `Respuesta no válida del servidor (HTTP ${res.status}).` };
        }
        if (!res.ok && !cuerpo?.motivo) {
          return { factible: false, motivo: `El servidor respondió con error (HTTP ${res.status}).` };
        }
        return cuerpo;
      });

    const pedirTodos = async () => {
      // ⚠️ CAMBIADO (5 agosto, madrugada) — pedido expreso: Personalizar
      // ahora también puede pedir varios menús (antes siempre era 1).
      const cuantos = (modo === "automatico" || modo === "personalizar") ? numMenus : 1;
      const resultados = [];
      let ultimoError = null;
      const registro = [];

      // ⚠️ AÑADIDO (5 agosto, madrugada) — CAMBIO DE ARQUITECTURA PEDIDO
      // EXPRESAMENTE: los límites de seguridad crónica (tiaminasa,
      // mercurio, vitamina D, yodo, selenio) tienen sentido SEMANAL, y
      // antes cada menú se pedía en una llamada aparte, sin que el
      // servidor supiera nada de los menús anteriores de la misma
      // semana -- así que un límite semanal no podía protegerse de
      // verdad, solo avisar después. Ahora, cuando hay más de un menú
      // en la rotación automática (el único caso donde el límite
      // semanal importa de verdad), se pide TODA la semana de una vez
      // al nuevo endpoint /menu/semana, que reparte y endurece el
      // presupuesto de seguridad entre los menús él mismo -- así es
      // matemáticamente imposible que la semana entera se pase, sin
      // depender de ningún aviso que el usuario pueda ignorar.
      if (modo === "automatico" && cuantos > 1) {
        try {
          const cuerpoBase = {
            modo: "automatico",
            nombres_alimentos: [],
            forzar_presencia: [],
            restringir_especie: null,
            der_objetivo: derReal,
            etapa_requisitos: ETAPA_A_SUFIJO_API[etapaCalculada] || "Adulto",
            especies_excluidas: Array.from(especiesExcluidas),
            evitar_especies: [],
            nombres_excluidos: Array.from(alimentosEvitados),
            peso_perro_kg: perfil?.pesoActual ? Number(perfil.pesoActual) : null,
            patologias: perfil?.patologias || [],
            categorias_excluidas: perfil?.categoriasExcluidas || [],
            peso_adulto_esperado_kg: pesoAdultoEsperado || null,
            tamano: perfil?.raza?.tamano || perfil?.tamanoManual || null,
          };
          const res = await fetch(`${API_BASE}/menu/semana?numero_de_menus=${cuantos}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(cuerpoBase),
          });
          let cuerpo;
          try {
            cuerpo = await res.json();
          } catch (e) {
            cuerpo = { factible: false, motivo: `Respuesta no válida del servidor (HTTP ${res.status}).` };
          }
          if (cuerpo.factible && Array.isArray(cuerpo.menus)) {
            for (const m of cuerpo.menus) resultados.push(m);
            registro.push({ intento: 1, resultado: "ok", motivo: cuerpo.aviso || null });
            if (cuerpo.aviso) ultimoError = { motivo: cuerpo.aviso };
          } else {
            ultimoError = cuerpo;
            registro.push({ intento: 1, resultado: "no factible", motivo: cuerpo?.motivo || "(sin motivo)" });
          }
        } catch (err) {
          ultimoError = { motivo: "La semana no se pudo calcular por un problema de conexión." };
          registro.push({ intento: 1, resultado: "error de red", motivo: String(err?.message || err) });
        }
        setDiagnosticoMenus({ pedidos: cuantos, conseguidos: resultados.length, registro });
        return { resultados, ultimoError };
      }

      const especiesUsadas = [];
      for (let i = 0; i < cuantos; i++) {
        // ⚠️ CORREGIDO (5 agosto, noche) — FALLO GRAVE ENCONTRADO: pedir
        // varios menús hace las llamadas una detrás de otra (pueden
        // sumar hasta 90s con 4 menús), y si CUALQUIERA de ellas fallaba
        // por la red (muy fácil en móvil), la excepción escapaba fuera
        // de esta función, hasta el reintento general de más arriba --
        // que empieza TODO desde cero, perdiendo los menús que ya se
        // habían conseguido. Por eso siempre acababa saliendo 1 solo:
        // la primera llamada solía completar antes de que algo fallara,
        // las siguientes no llegaban nunca. Ahora un fallo en una
        // llamada no tira las demás: se sigue intentando el resto.
        try {
          // ⚠️ AÑADIDO (5 agosto, madrugada) — pedido expreso: en
          // Personalizar con varios menús, cada iteración manda SU
          // PROPIO config (configsPorMenu[i]), no siempre el mismo --
          // así cada menú lleva de verdad lo que se eligió para él, en
          // vez de repartir las mismas elecciones entre todos.
          const configDeEsteMenu = modo === "personalizar" ? (configsPorMenu[i] || configPersonalizar) : configPersonalizar;
          const data = await pedirMenu(especiesUsadas, configDeEsteMenu);
          if (data.factible) {
            resultados.push(data);
            registro.push({ intento: i + 1, resultado: "ok" });
            // ⚠️ AMPLIADO (5 agosto, madrugada): antes solo se rastreaba
            // la especie de Carne muscular/Pescado -- si el menú caía al
            // camino normal (no al atajo instantáneo), el hígado, hueso y
            // vísceras seguían convergiendo siempre en lo mismo, porque
            // nada les decía que rotaran. Ahora se evita la especie
            // repetida en las 4 categorías, no solo la proteína.
            const gramosMenu = data.menu || data.gramos || {};
            for (const cat of ["Carne muscular", "Pescados y mariscos", "Hueso carnoso", "Vísceras", "Hígado"]) {
              const principal = Object.entries(gramosMenu)
                .filter(([n]) => categoriaDeAlimento(n) === cat)
                .sort((a, b) => b[1] - a[1])[0];
              if (principal) especiesUsadas.push(especieDe(principal[0]));
            }
          } else {
            ultimoError = data;
            registro.push({ intento: i + 1, resultado: "no factible", motivo: data?.motivo || "(sin motivo)" });
          }
        } catch (err) {
          ultimoError = { motivo: "Uno de los menús no se pudo calcular por un problema de conexión." };
          registro.push({ intento: i + 1, resultado: "error de red", motivo: String(err?.message || err) });
        }
      }
      setDiagnosticoMenus({ pedidos: cuantos, conseguidos: resultados.length, registro });
      return { resultados, ultimoError };
    };

    const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    (async () => {
      const MAX_INTENTOS = 6;
      for (let intento = 1; intento <= MAX_INTENTOS; intento++) {
        if (cancelado) return;
        try {
          const { resultados, ultimoError } = await pedirTodos();
          if (cancelado) return;
          if (resultados.length > 0) {
            setMenuReal(resultados);
            setAvisoNoForzado(resultados.some((r) => r.no_se_pudo_forzar));
            // Guardar menú en Supabase si el usuario está autenticado
            if (usuario) {
              guardarMenu(usuario.id, null, {
                modo,
                derReal,
                etapaLabel,
                menusData: resultados,
                numMenus: resultados.length,
              }).catch(console.error);
            }
            // ⚠️ AÑADIDO (5 agosto, madrugada): captura el aviso de
            // "también se ha añadido X" que puede mandar cualquiera de
            // los menús pedidos -- se muestra el primero que lo tenga.
            const primerAviso = resultados.find((r) => r.aviso)?.aviso;
            setAvisoExtraEspecie(primerAviso || null);
            // ⚠️ QUITADO (5 agosto, madrugada): la comprobación heurística
            // de "pescado en todos los menús" que iba aquí (solo miraba
            // % de peso, sin calcular kcal reales ni ponderar por días)
            // se sustituye por revisar_seguridad_semanal en el backend,
            // que sí calcula el aporte real de tiaminasa a lo largo de
            // toda la semana -- ver el useEffect nuevo más abajo, que se
            // dispara solo con que cambie menuReal.
            // ⚠️ AÑADIDO (5 agosto, madrugada): comparación real, solo
            // tiene sentido en Personalizar -- en automático no hay
            // nada "elegido a mano" con lo que comparar.
            //
            // ⚠️ CORREGIDO en el mismo momento -- CASO REAL, pedido
            // expreso: con varios menús en Personalizar, esto solo
            // miraba resultados[0] contra configPersonalizar (el
            // config del ÚLTIMO menú editado, no el de cada uno) --
            // así que el diagnóstico salía mal en cuanto había más de
            // un menú. Ahora compara CADA resultado con SU PROPIO
            // config, y junta lo elegido/salido/no-salido de todos.
            if (modo === "personalizar") {
              const elegidoAMano = [];
              const salioDeVerdad = [];
              const noSalieron = [];
              resultados.forEach((r, i) => {
                const configDeEseMenu = configsPorMenu[i] || configPersonalizar;
                const elegidoDeEseMenu = eleccionesDelUsuario(modo, configDeEseMenu);
                const salioDeEseMenu = Object.keys(r.menu || r.gramos || {});
                elegidoAMano.push(...elegidoDeEseMenu);
                salioDeVerdad.push(...salioDeEseMenu);
                noSalieron.push(...elegidoDeEseMenu.filter((n) => !salioDeEseMenu.includes(n)));
              });
              setDiagnosticoPersonalizar({
                elegido: elegidoAMano,
                salio: salioDeVerdad,
                noSalieron,
              });
            } else {
              setDiagnosticoPersonalizar(null);
            }
          } else if (ultimoError?.requiere_veterinario) {
            setMenuError(ultimoError.motivo);
            setNecesitaVeterinario(true);
          } else {
            setMenuError(ultimoError?.motivo || "No se encontró una combinación posible con estos alimentos.");
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
          await esperar(10000);
        }
      }
    })();

    return () => {
      cancelado = true;
    };
  }, [fase, pantalla, derReal, etapaCalculada, especiesExcluidas, modo, configPersonalizar, numMenus, perfil, alimentosEvitados]);

  // ⚠️ AÑADIDO (5 agosto, madrugada) — pedido expreso: en cuanto se
  // tienen TODOS los menús de la semana generados, se manda una
  // llamada más para comprobar el aporte de tiaminasa a lo largo de
  // toda la rotación (no solo dentro de cada menú por separado) --
  // reutiliza el mismo reparto de días que usa la pantalla de
  // resultado, para que el aviso hable de la semana real que va a
  // vivir el perro, no de una suposición aparte.
  //
  // ⚠️ CORREGIDO (5 agosto, madrugada) — CASO REAL ENCONTRADO, pedido
  // expreso: este aviso seguía apareciendo con UN SOLO menú en
  // Personalizar, aunque el menú fuera perfectamente seguro. Motivo:
  // este chequeo se diseñó para detectar un patrón que solo aparece
  // ENTRE VARIOS menús distintos en rotación (ninguno se pasa del
  // límite por separado, pero repetirse en todos sí es un problema) --
  // pero con UN SOLO menú para toda la semana, el motor YA aplica por
  // defecto un límite diario más estricto pensado justo para ese caso
  // (ver _presupuesto_semanal_inicial en main.py), así que el menú que
  // llega aquí ya es seguro para los 7 días de por sí. Repetir el
  // mismo chequeo (con un umbral más flojo, pensado para detectar
  // patrones ENTRE menús) sobre un único menú ya protegido solo genera
  // ruido: dice "esto se repite en 7 de 7 días" sobre algo que, siendo
  // un solo menú, se iba a repetir por definición, y que el sistema ya
  // resolvió en el momento de generarlo. Se salta esta llamada cuando
  // solo hay 1 menú -- el aviso solo tiene sentido real con 2 o más.
  if (paso === 1) {
    const puedeContinuar = perfil.nombre.trim().length > 0 && perfil.sexo !== null;
    return (
      <div className="cnl-pantalla-completa w-full flex flex-col" style={{ background: PAPEL }}>
        <Fuentes />
        <Cabecera onAbrirMenu={() => setMenuLigeroAbierto(true)} paso={1} titulo={<>Empecemos por<br />lo esencial.</>} />
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
            <BotonContinuar activo={puedeContinuar} onClick={siguiente} />
        </div>
        {drawerLigero}
      </div>
    );
  }

  if (paso === 2) {
    const puedeContinuar = (perfil.modoRaza === "raza" && perfil.raza) || (perfil.modoRaza === "sin_raza" && perfil.tamanoManual);
    return (
      <div className="cnl-pantalla-completa w-full flex flex-col" style={{ background: PAPEL }}>
        <Fuentes />
        <Cabecera onAbrirMenu={() => setMenuLigeroAbierto(true)} paso={2} titulo="¿De qué raza es?" />
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
                      <span className="block text-[11px] mt-0.5" style={{ fontFamily: "monospace", color: activo ? "#D8CFEC" : MALVA }}>
                        {RANGO_PESO_POR_TAMANO[t]}
                      </span>
                    </button>
                  );
                })}
              </div>
              <button onClick={() => set("modoRaza", null)} className="text-sm" style={{ color: MALVA, fontFamily: fontBody }}>← Volver</button>
            </div>
          )}

          <div className="flex-1" />
          {perfil.modoRaza && <BotonContinuar activo={puedeContinuar} onClick={siguiente} />}
        </div>
        {drawerLigero}
      </div>
    );
  }

  if (paso === 3) {
    const dias = Array.from({ length: 31 }, (_, i) => i + 1);
    const anioActual = new Date().getFullYear();
    const anios = Array.from({ length: 25 }, (_, i) => anioActual - i);
    return (
      <div className="cnl-pantalla-completa w-full flex flex-col" style={{ background: PAPEL }}>
        <Fuentes />
        <Cabecera onAbrirMenu={() => setMenuLigeroAbierto(true)} paso={3} titulo="¿Cuándo nació?" />
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
            <BotonContinuar activo={!!edad} onClick={siguiente} />
        </div>
        {drawerLigero}
      </div>
    );
  }

  if (paso === 4) {
    const puedeContinuar = perfil.pesoActual && Number(perfil.pesoActual) > 0 && perfil.condicionTocado;
    const actual = CONDICIONES[perfil.condicionIdx];
    const tuck = perfil.condicionIdx / 4;
    return (
      <div className="cnl-pantalla-completa w-full flex flex-col" style={{ background: PAPEL }}>
        <Fuentes />
        <Cabecera onAbrirMenu={() => setMenuLigeroAbierto(true)} paso={4} titulo={<>¿Cómo está<br />{nombreMostrar} ahora?</>} />
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
            <BotonContinuar activo={puedeContinuar} onClick={siguiente} />
        </div>
        {drawerLigero}
      </div>
    );
  }

  if (paso === 5) {
    const puedeContinuar = perfil.actividadTocado && perfil.esterilizado !== null;
    const actual = NIVELES[perfil.actividadIdx];
    const Icono = actual.Icono;
    return (
      <div className="cnl-pantalla-completa w-full flex flex-col" style={{ background: PAPEL }}>
        <Fuentes />
        <Cabecera onAbrirMenu={() => setMenuLigeroAbierto(true)} paso={5} titulo={<>{nombreMostrar}, en su<br />día a día</>} />
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
            <BotonContinuar activo={puedeContinuar} onClick={siguiente} />
        </div>
        {drawerLigero}
      </div>
    );
  }

  if (paso === 6) {
    const puedeContinuar =
      perfil.alergiaSi !== null &&
      (perfil.alergiaSi === "no" || perfil.alergias.length > 0) &&
      perfil.otrosEvitarSi !== null &&
      (perfil.otrosEvitarSi === "no" || perfil.otrosEvitar.length > 0) &&
      perfil.categoriasExcluidasSi !== null &&
      (perfil.categoriasExcluidasSi === "no" || perfil.categoriasExcluidas.length > 0) &&
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
      <div className="cnl-pantalla-completa w-full flex flex-col" style={{ background: PAPEL }}>
        <Fuentes />
        <Cabecera onAbrirMenu={() => setMenuLigeroAbierto(true)} paso={6} titulo={<>Última cosa<br />sobre {nombreMostrar}</>} />
        <div className="flex-1 px-6 pt-8 pb-6 flex flex-col">
          <BotonAtras onClick={atras} />

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

          <div className="mt-7">
            <Etiqueta>¿Hay alguna categoría entera que no pueda comer?</Etiqueta>
            <p className="text-xs mb-3" style={{ color: MALVA, fontFamily: fontBody }}>
              Por ejemplo, si es senior o tiene los dientes en mal estado y no puede masticar huesos —
              el calcio que aportaría se cubre con suplemento en su lugar.
            </p>
            <SiNoToggle
              valor={perfil.categoriasExcluidasSi}
              onChange={(v) => { set("categoriasExcluidasSi", v); if (v === "no") set("categoriasExcluidas", []); }}
            />
            {perfil.categoriasExcluidasSi === "si" && (
              <div className="flex flex-col gap-2 mt-3">
                {[{ key: "Hueso carnoso", label: "Hueso carnoso (huesos crudos)" }].map((c) => {
                  const activo = perfil.categoriasExcluidas.includes(c.key);
                  return (
                    <button
                      key={c.key}
                      onClick={() => {
                        if (activo) set("categoriasExcluidas", perfil.categoriasExcluidas.filter((x) => x !== c.key));
                        else set("categoriasExcluidas", [...perfil.categoriasExcluidas, c.key]);
                      }}
                      className="flex items-center justify-between px-4 py-3 rounded-xl text-left"
                      style={{ background: activo ? VIOLETA : "#FFFFFF", border: `1.5px solid ${activo ? VIOLETA : "#E3DAF0"}` }}
                    >
                      <span style={{ color: activo ? "#FFFFFF" : TINTA, fontFamily: fontDisplay, fontSize: 15 }}>{c.label}</span>
                      {activo && <Check size={16} style={{ color: ROSA }} />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

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
                      Esta condición depende de analíticas que la app no puede ver, o todavía no está entre
                      las que sabemos ajustar automáticamente — te pondremos en contacto con la guía para
                      hablar con tu veterinario y que se estudie tu caso en concreto, en vez de generar una
                      dieta automática que no estaría realmente adaptada a esto.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex-1" />
            <BotonContinuar activo={puedeContinuar} onClick={() => {
              // ⚠️ AÑADIDO (5 agosto, madrugada) — pedido expreso: si
              // hay alguna patología que bloquea la dieta automática,
              // salta el aviso de veterinario AQUÍ MISMO, sin dejar
              // avanzar hasta elegir modo/cuántos menús/generar -- no
              // tiene sentido llevar hasta ahí sabiendo ya que no va
              // a funcionar.
              const bloqueantes = perfil.patologias
                .map((k) => PATOLOGIAS.find((p) => p.key === k))
                .filter((p) => p && !p.segura);
              if (bloqueantes.length > 0) {
                setMenuError(bloqueantes.map((p) => p.aviso).join(" "));
                setNecesitaVeterinario(true);
                setFase("generador");
                setPantalla("veterinario_requerido");
              } else {
                siguiente();
              }
            }} texto="Terminar" />
        </div>
        {drawerLigero}
      </div>
    );
  }

  if (mostrarSuscripcion) {
    return (
      <Suscripcion
        usuario={usuario}
        onVolver={() => setMostrarSuscripcion(false)}
      />
    );
  }

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
    <div className="cnl-pantalla-completa w-full flex flex-col" style={{ background: PAPEL }}>
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
        <button
          onClick={() => {
            // ⚠️ CORREGIDO (5 agosto, madrugada) — CASO REAL GRAVE
            // ENCONTRADO, pedido expreso: "marco una patología que
            // bloquea, luego la desmarco y pongo que no, pero sigue sin
            // dejarme generar menús". Causa real: este botón solo hacía
            // setFase("generador") sin tocar "pantalla" -- así que si
            // antes se había caído en la pantalla de aviso veterinario
            // (bloqueada), pantalla se quedaba en "veterinario_requerido"
            // de forma persistente, y aterrizaba ahí otra vez, con el
            // MISMO mensaje de error viejo -- sin importar que la
            // patología ya se hubiera corregido. Ahora se navega
            // explícitamente a "elegir" (el punto de entrada real del
            // generador) y se limpia cualquier aviso de veterinario
            // que hubiera quedado de un intento anterior.
            setMenuError(null);
            setNecesitaVeterinario(false);
            setPantalla("elegir");
            setFase("generador");
            // Guardar perfil del perro en Supabase si el usuario está autenticado
            if (usuario) {
              guardarPerro(usuario.id, perfil).catch(console.error);
            }
          }}
          className="w-full py-4 rounded-2xl text-base"
          style={{ background: ROSA, color: "#FFFFFF", fontFamily: fontBody, fontWeight: 700 }}
        >
          Todo bien, ir al generador de menús →
        </button>
      </div>
    </div>
  );
  }

  if (fase === "generador" && pantalla === "elegir") {
    return (
      <div className="cnl-pantalla-completa w-full flex flex-col" style={{ background: PAPEL }}>
        <Fuentes />
        <div style={{ background: VIOLETA }} className="w-full px-6 pt-10 pb-8">
          <div className="flex items-center justify-between mb-3">
            <BotonMenu onClick={() => setMenuLigeroAbierto(true)} color="#FFFFFF" />
            <p className="text-[11px] tracking-[0.18em] uppercase" style={{ color: MALVA, fontFamily: "monospace" }}>Menú semanal</p>
          </div>
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
          </div>
        {drawerLigero}
      </div>
    );
  }

  if (fase === "generador" && pantalla === "cuantos") {
    return (
      <div className="cnl-pantalla-completa w-full flex flex-col" style={{ background: PAPEL }}>
        <Fuentes />
        <div style={{ background: VIOLETA }} className="w-full px-6 pt-10 pb-7">
          <div className="flex items-center justify-between mb-1">
            <BotonMenu onClick={() => setMenuLigeroAbierto(true)} color="#FFFFFF" className="p-1 -mt-4" />
            {/* ⚠️ AÑADIDO (5 agosto, noche): la barra de arriba desaparecía
                en esta pantalla -- tenía que estar siempre accesible. */}
            <BotonAtras onClick={volverAElegir} texto="Cambiar modo" />
          </div>
          <button onClick={() => setFase("onboarding")} className="text-xs mb-4" style={{ color: MALVA, fontFamily: fontBody }}>
            Editar perfil (alergias, exclusiones...)
          </button>
          <p className="text-[11px] tracking-[0.18em] uppercase mb-2" style={{ color: MALVA, fontFamily: "monospace" }}>Menú semanal · {modo === "personalizar" ? "personalizado" : "automático"}</p>
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
              <button onClick={() => {
                if (!premium && numMenus >= 1) {
                  setMostrarSuscripcion(true);
                } else {
                  setNumMenus(Math.min(8, numMenus + 1));
                }
              }} className="w-11 h-11 rounded-full flex items-center justify-center text-xl" style={{ background: PAPEL, color: VIOLETA, fontFamily: fontDisplay }}>+</button>
            </div>
          </div>
          <p className="text-xs text-center mb-6" style={{ color: MALVA, fontFamily: fontBody }}>
            El sistema decide también qué día toca cada menú, según lo que lleve cada uno.
          </p>
          <div className="flex-1" />
            <BotonPrincipal activo={true} onClick={() => {
              // Gate premium: más de 1 menú requiere premium
              if (!premium && numMenus > 1) {
                setMostrarSuscripcion(true);
                return;
              }
              if (modo === "personalizar") {
                setMenuPersonalizandoIdx(0);
                setConfigPersonalizar(configsPorMenu[0] || configPersonalizarBase());
                setPantalla("personalizar");
              } else {
                setPantalla("resultado");
              }
            }} texto={modo === "personalizar"
              ? (numMenus === 1 ? "Elegir los ingredientes" : `Personalizar los ${numMenus} menús`)
              : `Generar ${numMenus === 1 ? "el menú" : `los ${numMenus} menús`}`} />
        </div>
        {drawerLigero}
      </div>
    );
  }

  // ⚠️ AÑADIDO (5 agosto, madrugada) — CASO REAL, pedido expreso: el
  // aviso de "esto lo tiene que ver un veterinario" saltaba solo
  // DESPUÉS de navegar por todo el flujo (elegir modo, cuántos menús,
  // esperar a que generara) y que el backend respondiera que no podía.
  // No tenía sentido dejar avanzar tanto sabiendo ya, desde el propio
  // Paso 6, que no iba a funcionar. Esta pantalla es una parada
  // dedicada, sin ningún useEffect que dispare una llamada real al
  // servidor -- a diferencia de "resultado", que si se reutilizara
  // para esto arrancaría una generación de verdad innecesaria.
  if (fase === "generador" && pantalla === "veterinario_requerido") {
    return (
      <div className="cnl-pantalla-completa w-full flex flex-col items-center justify-center px-8 text-center relative" style={{ background: PAPEL }}>
        <Fuentes />
        <BotonMenu onClick={() => setMenuLigeroAbierto(true)} color={VIOLETA} className="absolute top-10 left-6 p-1" />
        <AlertCircle size={36} strokeWidth={1.4} style={{ color: ROSA }} />
        <p className="mt-4 mb-2" style={{ color: TINTA, fontFamily: fontDisplay, fontSize: 18 }}>
          Esto lo tiene que pautar tu veterinario
        </p>
        <p className="text-sm mb-6" style={{ color: MALVA, fontFamily: fontBody }}>{menuError}</p>
        <button
          onClick={() => { setMenuError(null); setNecesitaVeterinario(false); setFase("onboarding"); setPaso(6); }}
          className="px-5 py-3 rounded-xl text-sm"
          style={{ background: VIOLETA, color: "#FFFFFF", fontFamily: fontBody, fontWeight: 700 }}
        >
          Volver a revisar las patologías
        </button>
        {drawerLigero}
      </div>
    );
  }

  if (fase === "generador" && pantalla === "resultado") {
    if (menuCargando) {
      return (
        <div className="cnl-pantalla-completa w-full flex flex-col items-center justify-center px-8 text-center relative" style={{ background: PAPEL }}>
          <Fuentes />
          <BotonMenu onClick={() => setMenuLigeroAbierto(true)} color={VIOLETA} className="absolute top-10 left-6 p-1" />
          <Dog size={36} strokeWidth={1.4} style={{ color: VIOLETA }} />
          <p className="mt-4" style={{ color: TINTA, fontFamily: fontDisplay, fontSize: 18 }}>
            {menuDespertando
              ? "Despertando el servidor..."
              : `Calculando ${(modo === "automatico" ? numMenus : 1) === 1 ? "el menú" : `los ${modo === "automatico" ? numMenus : 1} menús`} de ${nombreMostrar}...`}
          </p>
          <p className="text-sm mt-3 mb-1" style={{ color: MALVA, fontFamily: fontBody }}>
            {menuDespertando
              ? "Puede tardar hasta un minuto la primera vez tras un rato sin uso — ya casi está."
              : `Esto puede tardar un momento, estamos calculando un menú totalmente adaptado para ${nombreMostrar} — sus medidas, su etapa y sus necesidades concretas.`}
          </p>
          {!menuDespertando && (
            <div className="flex items-center gap-2 mt-4 px-4 py-3 rounded-xl" style={{ background: "#FFF7E8", border: "1px solid #F5DFA8" }}>
              <span style={{ fontSize: 16 }}>☝️</span>
              <p className="text-xs text-left" style={{ color: "#7A5C00", fontFamily: fontBody }}>
                No cierres esta pantalla ni salgas de la app — si lo haces, habrá que empezar de cero.
              </p>
            </div>
          )}
          {drawerLigero}
        </div>
      );
    }
    if (menuError) {
      return (
        <div className="cnl-pantalla-completa w-full flex flex-col items-center justify-center px-8 text-center relative" style={{ background: PAPEL }}>
          <Fuentes />
          <BotonMenu onClick={() => setMenuLigeroAbierto(true)} color={VIOLETA} className="absolute top-10 left-6 p-1" />
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
          {drawerLigero}
        </div>
      );
    }
    const menus = menuReal ? respuestaApiAMenu(menuReal, derReal) : MENUS_EJEMPLO;
    const huboDiscrepancia = diagnosticoMenus && diagnosticoMenus.conseguidos < diagnosticoMenus.pedidos;
    return (
      <>
        {/* ⚠️ AÑADIDO (5 agosto, noche): si se pidieron más menús de los
            que se consiguieron, esto lo dice aquí mismo, con el motivo
            real de cada intento fallido -- para diagnosticar sin
            depender de las herramientas de desarrollador del móvil. */}
        {huboDiscrepancia && (
          <div className="fixed top-0 inset-x-0 z-[80] px-4 py-3" style={{ background: "#FFE8EC", borderBottom: `1.5px solid ${ROSA}` }}>
            <p className="text-xs" style={{ color: TINTA, fontFamily: fontBody, fontWeight: 700 }}>
              Pediste {diagnosticoMenus.pedidos} menús, se consiguieron {diagnosticoMenus.conseguidos}.
            </p>
            {diagnosticoMenus.registro.filter((r) => r.resultado !== "ok").map((r, i) => (
              <p key={i} className="text-[11px]" style={{ color: TINTA, fontFamily: fontBody }}>
                Menú {r.intento}: {r.resultado} — {r.motivo}
              </p>
            ))}
          </div>
        )}
        <VistaMenus menus={menus} onVolver={volverAElegir} modo={modo} alimentosEvitados={alimentosEvitados} patologias={perfil?.patologias || []} nombrePerro={nombreMostrar} necesitaTransicion={dietaActual === "pienso" || dietaActual === "cocinada"} dietaActual={dietaActual} categoriasDisponibles={categoriasDisponibles} perfil={perfil} derReal={derReal} etapaLabel={etapaLabel} etapaCalculada={etapaCalculada} especiesExcluidas={especiesExcluidas} pesoAdultoEsperado={pesoAdultoEsperado} edad={edad} set={set} setFase={setFase} avisoNoForzado={avisoNoForzado} diagnosticoPersonalizar={diagnosticoPersonalizar} avisoExtraEspecie={avisoExtraEspecie} premium={premium} onMostrarSuscripcion={() => setMostrarSuscripcion(true)} onRegenerarConAlimentos={(alimentos) => { setAlimentosAPreservar(alimentos); setPantalla("resultado"); setMenuReal(null); }} />
      </>
    );
  }


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
      <div className="cnl-pantalla-completa w-full flex flex-col" style={{ background: PAPEL }}>
        <Fuentes />
        <div style={{ background: VIOLETA }} className="w-full px-6 pt-10 pb-7">
          <div className="flex items-center justify-between mb-1">
            <BotonMenu onClick={() => setMenuLigeroAbierto(true)} color="#FFFFFF" className="p-1 -mt-4" />
            <BotonAtras onClick={volverAElegir} texto="Cambiar modo" />
          </div>
          <button onClick={() => setFase("onboarding")} className="text-xs mb-4" style={{ color: MALVA, fontFamily: fontBody }}>
            Editar perfil (alergias, exclusiones...)
          </button>
          <p className="text-[11px] tracking-[0.18em] uppercase mb-2" style={{ color: MALVA, fontFamily: "monospace" }}>Menú {menuPersonalizandoIdx + 1} · personalizar</p>
          <h1 className="text-3xl leading-tight" style={{ color: "#FFFFFF", fontFamily: fontDisplay, fontWeight: 500 }}>A tu gusto,<br />categoría a categoría</h1>
        </div>
        <div className="flex-1 px-6 pt-8 pb-6 flex flex-col">
          {/* ⚠️ AÑADIDO (5 agosto, madrugada) — pedido expreso: navegación
              entre menús cuando se piden varios en Personalizar -- cada
              pestaña guarda su propia elección de ingredientes por
              separado, no se reparten los mismos entre todos. */}
          {numMenus > 1 && (
            <div className="flex gap-2 mb-6 overflow-x-auto">
              {Array.from({ length: numMenus }, (_, i) => i).map((i) => {
                const tieneAlgo = Object.values(configsPorMenu[i] || {}).some((c) => c.modo === "manual" && c.elegido.length > 0);
                return (
                  <button key={i} onClick={() => cambiarMenuPersonalizando(i)}
                    className="shrink-0 px-4 py-2 rounded-xl text-sm flex items-center gap-1.5"
                    style={{
                      background: i === menuPersonalizandoIdx ? VIOLETA : "#FFFFFF",
                      border: `1.5px solid ${i === menuPersonalizandoIdx ? VIOLETA : "#E3DAF0"}`,
                      color: i === menuPersonalizandoIdx ? "#FFFFFF" : TINTA,
                      fontFamily: fontDisplay,
                    }}>
                    Menú {i + 1}
                    {tieneAlgo && <span style={{ color: i === menuPersonalizandoIdx ? "#FFFFFF" : ROSA }}>●</span>}
                  </button>
                );
              })}
            </div>
          )}
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
                            {/* ⚠️ CORREGIDO (5 agosto, madrugada): si la
                                especie solo tiene 1 alimento, pulsarla ya
                                lo elige directamente -- antes siempre
                                navegaba a un submenú de un solo elemento. */}
                            {Object.entries(categoriasDisponibles[cat.nombre] || {}).map(([especie, items]) => {
                              const unico = items.length === 1;
                              return (
                                <button key={especie}
                                  onClick={() => unico ? elegirAlimento(cat.nombre, items[0]) : setEstadoAbiertoPersonalizar({ categoria: cat.nombre, especie })}
                                  className="text-left px-3 py-2 rounded-lg text-sm flex items-center justify-between" style={{ color: TINTA, fontFamily: fontBody, background: "#FFFFFF" }}>
                                  <span>{unico ? items[0] : especie}</span>
                                  {/* ⚠️ CORREGIDO (5 agosto, madrugada) — CASO REAL: "2 tipos"
                                      en texto pequeño y gris era muy fácil de no ver, y este
                                      botón se veía casi idéntico al de una especie con un solo
                                      alimento (que SÍ selecciona directamente al pulsar) --
                                      alguien podía pensar que ya había elegido cuando en
                                      realidad este botón solo abre un paso más. Ahora se ve
                                      claramente como "esto navega a otro sitio", con flecha y
                                      color destacado, no como una selección ya hecha. */}
                                  {!unico && (
                                    <span className="flex items-center gap-1 shrink-0" style={{ color: VIOLETA }}>
                                      <span className="text-[11px] font-semibold" style={{ fontFamily: "monospace" }}>{items.length} tipos</span>
                                      <ChevronRight size={14} />
                                    </span>
                                  )}
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
                            {/* ⚠️ CORREGIDO (5 agosto, madrugada): este botón salía
                                siempre, aunque la especie solo tuviera 1 alimento --
                                mostrando dos opciones que hacían exactamente lo
                                mismo (elegir el único alimento, o "todo el/la X"),
                                confuso de verdad. Ahora solo aparece cuando de
                                verdad hay más de un alimento entre los que elegir. */}
                            {categoriasDisponibles[cat.nombre][especieAbierta].length > 1 && (
                              <button onClick={() => elegirAlimento(cat.nombre, `Todo: ${especieAbierta}`)}
                                className="text-left px-3 py-2 rounded-lg text-sm" style={{ color: VIOLETA, fontFamily: fontBody, fontWeight: 700, background: "#F0ECF7" }}>
                                Todo el/la {especieAbierta}
                              </button>
                            )}
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
            <BotonPrincipal activo={true} onClick={() => {
              if (menuPersonalizandoIdx < numMenus - 1) {
                cambiarMenuPersonalizando(menuPersonalizandoIdx + 1);
              } else {
                setPantalla("resultado");
              }
            }} texto={menuPersonalizandoIdx < numMenus - 1
              ? `Siguiente: Menú ${menuPersonalizandoIdx + 2}`
              : (numMenus === 1 ? "Generar este menú" : "Generar los menús")} />
        </div>
        {drawerLigero}
      </div>
    );
  }

  return null;
}

function Fuentes() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&display=swap');
      /* ⚠️ AÑADIDO (5 agosto, madrugada) — CASO REAL, patrón muy
         reconocible: "el primer toque no hace nada, el segundo sí, y
         luego todo funciona normal" -- esto es un problema conocido de
         navegadores móviles con pantallas que hacen scroll (fixed +
         overflow-y-auto): el navegador espera un instante en el primer
         toque para decidir si es un tap o el inicio de un deslizamiento
         de scroll, y ese primer toque se pierde sin llegar a disparar
         el clic. "touch-action: manipulation" le dice al navegador que
         no espere -- soluciona exactamente este patrón, no es un
         problema del código en sí sino de cómo el navegador interpreta
         el gesto. Se aplica a los botones (donde importa de verdad) y
         a las pantallas de pantalla completa con scroll.
      */
      button, a, [role="button"] {
        touch-action: manipulation;
      }
      .cnl-pantalla-scroll {
        touch-action: pan-y;
      }
      /* ⚠️ AÑADIDO (5 agosto, madrugada) — CASO REAL: "el botón
         Continuar queda más abajo de lo necesario en móvil, aunque
         haya hueco visible, obligando a deslizar sin hacer falta". La
         causa es conocida: cnl-pantalla-completa de Tailwind usa 100vh, y en
         navegadores móviles 100vh NO tiene en cuenta la barra de
         direcciones dinámica (que aparece/desaparece al hacer scroll)
         -- calcula una altura MAYOR que la realmente visible en cada
         momento, dejando un hueco "fantasma" que empuja el contenido
         (y el botón) fuera de la pantalla real. 100dvh (dynamic
         viewport height) sí se ajusta en tiempo real a la altura
         visible de verdad -- con 100vh como respaldo para navegadores
         que aún no lo soporten. */
      .cnl-pantalla-completa {
        min-height: 100vh;
        min-height: 100dvh;
      }
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

// ⚠️ AÑADIDO (5 agosto, madrugada) — CASO REAL: "la gente a la que le
// paso la app nunca abre el menú desplegable". Causa real encontrada:
// en TODA la app, el botón era solo un icono de tres líneas sin
// ninguna palabra al lado -- pequeño, de bajo contraste, sin ningún
// indicio visual de que fuera interactivo. Un icono "hamburguesa" sin
// etiqueta es un problema de descubribilidad muy conocido: quien no
// sabe de antemano que ahí hay un menú, no tiene forma de adivinarlo.
// Componente único y reutilizable para los 12 sitios de la app donde
// aparecía este botón, con la palabra "Menú" siempre visible junto al
// icono -- así deja de ser un icono ambiguo y pasa a ser un botón
// claro, con el mismo aspecto en todos sitios.
function BotonMenu({ onClick, color = VIOLETA, className = "" }) {
  return (
    <button onClick={onClick} className={`flex items-center gap-1.5 ${className}`}>
      <Menu size={20} style={{ color }} />
      <span className="text-xs font-semibold" style={{ color, fontFamily: fontBody }}>Menú</span>
    </button>
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
    setEstadoAbierto({ grupo: idGrupo, categoria, especie });
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
            {/* ⚠️ CORREGIDO (5 agosto, madrugada): mismo ajuste que en
                Personalizar y el editor -- si la especie solo tiene 1
                alimento, pulsarla ya lo añade directamente. */}
            {Object.keys(CATS[abierto.categoria]).filter((especie) => !especiesYaExcluidas.has(especie)).map((especie) => {
              const items = CATS[abierto.categoria][especie];
              const unico = items.length === 1;
              return (
                <button
                  key={especie}
                  onClick={() => unico
                    ? onAnadir({ categoria: abierto.categoria, alimento: items[0] })
                    : elegirEspecie(abierto.categoria, especie)}
                  className="text-left px-3 py-2 rounded-lg text-sm flex items-center justify-between"
                  style={{ color: TINTA, fontFamily: fontBody, background: PAPEL }}
                >
                  <span>{unico ? items[0] : especie}</span>
                  {/* ⚠️ CORREGIDO (5 agosto, madrugada) — mismo arreglo que en
                      Personalizar: indicador claro de navegación, no un texto
                      pequeño fácil de pasar por alto. */}
                  {!unico && (
                    <span className="flex items-center gap-1 shrink-0" style={{ color: VIOLETA }}>
                      <span className="text-[11px] font-semibold" style={{ fontFamily: "monospace" }}>{items.length} tipos</span>
                      <ChevronRight size={14} />
                    </span>
                  )}
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
            {/* ⚠️ CORREGIDO (5 agosto, madrugada): mismo ajuste que en
                Personalizar -- este botón salía siempre, aunque solo
                hubiera 1 alimento para la especie, duplicando la opción. */}
            {CATS[abierto.categoria][abierto.especie].length > 1 && (
              <button
                onClick={() => onAnadir({ categoria: abierto.categoria, alimento: `Todo: ${abierto.especie}` })}
                className="text-left px-3 py-2 rounded-lg text-sm"
                style={{ color: VIOLETA, fontFamily: fontBody, fontWeight: 700, background: "#F0ECF7" }}
              >
                Todo el/la {abierto.especie}
              </button>
            )}
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
  const alturaItem = 40;
  const idx = Math.max(0, valores.indexOf(valor));

  // ⚠️ AÑADIDO (5 agosto, madrugada) — pedido expreso: en móvil solo se
  // podía tocar la flechita repetidamente o tocar uno de los 3 valores
  // visibles a la vez -- nada de deslizar el dedo, que es como
  // cualquier persona espera poder usar una rueda de selección en
  // móvil. Esto añade arrastre real (touch Y ratón, con el mismo
  // código): mientras se arrastra, la rueda sigue el dedo/ratón en
  // tiempo real sin cambiar el valor todavía; al soltar, se calcula a
  // cuántas posiciones equivale ese arrastre y se ajusta el valor de
  // golpe, con un pequeño "snap" final para quedar alineado.
  const [arrastre, setArrastre] = useState(null); // { yInicial, offsetPx } o null si no se está arrastrando
  const arrastreRef = useRef(null);
  useEffect(() => { arrastreRef.current = arrastre; }, [arrastre]);

  const mover = (delta) => {
    const nuevo = Math.max(0, Math.min(valores.length - 1, idx + delta));
    if (nuevo !== idx) onChange(valores[nuevo]);
  };

  const iniciarArrastre = (yCliente) => {
    setArrastre({ yInicial: yCliente, offsetPx: 0 });
  };
  const moverArrastre = (yCliente) => {
    if (!arrastreRef.current) return;
    setArrastre((prev) => prev && { ...prev, offsetPx: yCliente - prev.yInicial });
  };
  const soltarArrastre = () => {
    const a = arrastreRef.current;
    setArrastre(null);
    if (!a) return;
    // se arrastra hacia ABAJO para ir a valores ANTERIORES (como una
    // rueda física: empujas el papel hacia abajo para ver lo de arriba)
    const pasos = Math.round(-a.offsetPx / alturaItem);
    if (pasos !== 0) mover(pasos);
  };

  // ⚠️ AÑADIDO (5 agosto, madrugada): con el RATÓN, si se suelta el
  // botón FUERA del componente (arrastrando y moviendo el cursor
  // lejos antes de soltar), el onMouseUp local del propio elemento no
  // lo capturaría -- por eso, mientras se está arrastrando con ratón,
  // se escuchan mousemove/mouseup en window entero, no solo dentro
  // del componente. El táctil no necesita esto: touchmove/touchend sí
  // se disparan sobre el elemento aunque el dedo se mueva fuera.
  useEffect(() => {
    if (!arrastre) return;
    const alMover = (e) => moverArrastre(e.clientY);
    const alSoltar = () => soltarArrastre();
    window.addEventListener("mousemove", alMover);
    window.addEventListener("mouseup", alSoltar);
    return () => {
      window.removeEventListener("mousemove", alMover);
      window.removeEventListener("mouseup", alSoltar);
    };
  }, [arrastre]);

  // el desplazamiento visual mientras se arrastra: se limita un poco
  // más allá del propio contenido para que no se sienta "duro" al
  // llegar al primer/último valor, pero sin desplazarse infinitamente
  const offsetVisual = arrastre ? arrastre.offsetPx : 0;

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
      <div
        className="cnl-rueda-arrastrable"
        style={{ position: "relative", height: alturaItem * 3, overflow: "hidden", touchAction: "none", cursor: arrastre ? "grabbing" : "grab" }}
        onTouchStart={(e) => iniciarArrastre(e.touches[0].clientY)}
        onTouchMove={(e) => { e.preventDefault(); moverArrastre(e.touches[0].clientY); }}
        onTouchEnd={soltarArrastre}
        onMouseDown={(e) => { e.preventDefault(); iniciarArrastre(e.clientY); }}
      >
        <div style={{ position: "absolute", top: alturaItem, left: 0, right: 0, height: alturaItem,
                      borderTop: `1.5px solid ${VIOLETA}`, borderBottom: `1.5px solid ${VIOLETA}`,
                      pointerEvents: "none", borderRadius: 8 }} />
        <div style={{
          transform: `translateY(${(1 - idx) * alturaItem + offsetVisual}px)`,
          transition: arrastre ? "none" : "transform 0.18s ease-out",
        }}>
          {valores.map((v, i) => (
            <div
              key={v}
              onClick={() => { if (!arrastre) onChange(v); }}
              style={{
                height: alturaItem, display: "flex", alignItems: "center", justifyContent: "center",
                fontFamily: fontDisplay,
                fontSize: i === idx ? 19 : 15,
                color: i === idx ? TINTA : "#C9BEDD",
                opacity: Math.abs(i - idx) > 1 ? 0 : 1,
                transition: arrastre ? "none" : "all 0.18s", cursor: "pointer",
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

function AuthGate() {
  const [usuario, setUsuario] = useState(undefined);

  useEffect(() => {
    const { data: { subscription } } = onAuthChange((user) => {
      setUsuario(user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  if (usuario === undefined) {
    return (
      <div style={{ minHeight: '100dvh', background: '#FBF7FC', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#9A8CB8', fontFamily: '"DM Sans", sans-serif' }}>Cargando...</p>
      </div>
    );
  }

  if (usuario === null) {
    return <Auth onAutenticado={(user) => setUsuario(user)} />;
  }

  return (
    <ErrorBoundary>
      <RawkuOnboardingInterna usuario={usuario} />
    </ErrorBoundary>
  );
}

export default function RawkuOnboarding() {
  return <AuthGate />;
}
