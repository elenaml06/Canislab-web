import { useState, useMemo, useEffect, useRef, Component } from "react";
import { AlertCircle, Award, Beef, Check, CheckCircle2, ChevronLeft, ChevronRight, ClipboardList, Dog, Fish, Flame, Footprints, Hand, Heart, HeartPulse, Info, Lock, Menu, Moon, MoreVertical, Pencil, Pill, Plus, Salad, Scissors, Search, SlidersHorizontal, Sparkles, Settings, ShoppingBasket, Trash2, TrendingUp, UtensilsCrossed, X, Zap } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import Auth from "./auth";
import Formulador from "./formulador.jsx";
import { onAuthChange, logout, cambiarPassword, cambiarCorreo, pedirRolProfesional,
         getPerfil, firmarPauta, getPautasFirmadas } from "./supabase";
// Los textos de cómo se prepara cada cosa viven aparte para poder
// comprobarlos enteros desde las pruebas. Ver su cabecera.
import { INSTRUCCIONES_POR_CATEGORIA, COMO_DAR_ALIMENTO } from "./instrucciones";
import { cestaDeLaCompra, formatearCompra, deQuienEs } from './cesta'
// ⚠️ Los datos NO se piden a Supabase directamente: pasan por el almacén,
// que los manda a Supabase o al navegador según haya cuenta o no. Ver el
// comentario de cabecera de almacen.js — ahí está decidido cuándo se da
// de alta el usuario y por qué.
import {
  guardarPerro, guardarMenu, esPremium, getPerros, getMenus, eliminarMenu, actualizarMenu, eliminarPerro,
  getMenusDelProfesional,
  USUARIO_LOCAL, estaSinCuenta, entrarSinCuenta, salirDeSinCuenta,
  hayDatosLocales, migrarLocalACuenta, vaciarLocal, esProfesional, getAccesos,
  marcarComoPaciente,
} from "./almacen";
import Suscripcion from "./suscripcion";
import PremiumGate from "./premiumgate";
import FichaClinica from "./fichaclinica";
import { perrosDelModo } from "./pacientes";
import { contiene } from "./texto.js";
import { ESCALA_BCS, BCS_MINIMO, BCS_MAXIMO, pesoIdealDesdeBcs, bcsDesdeCondicion,
         condicionDesdeBcs, bcsVigente } from "./bcs";
import { leerEleccionModo, guardarEleccionModo,
         enModoProfesional as calcularModoProfesional } from "./modo";
import { API_BASE, fetchConTimeout } from "./api.js";

// ⚠️ AÑADIDO — el muro de pago tiene TRES modos, y se cambia sin tocar
// código: variable VITE_PAYWALL en Vercel + redeploy.
//
//   "demo"  — Premium se ve y se puede activar, pero
//           SIN pago: el botón lo enciende al momento. Sirve para probar
//           cómo se ve la app como Premium y como no-Premium, sin
//           depender de que Stripe funcione. La activación se guarda
//           SOLO en este navegador (localStorage): nunca toca Supabase,
//           así no deja plan="premium" en cuentas de verdad que luego
//           haya que limpiar a mano.
//
//   "off"   (POR DEFECTO AHORA) — nada bloqueado y Premium no se ofrece
//           por ningún lado.
//
//   "on"    — el de verdad: se consulta el plan en Supabase y se paga
//           por Stripe. Antes de poner esto hay que comprobar que
//           /stripe/checkout responde de verdad en canislab-api.
//
// ⚠️ CAMBIADO A "off" (22 agosto) — PEDIDO EXPRESO: "necesito hacer
// pruebas de todo y si hay cosas a las que no puedo acceder, jodido".
// Tenía sentido: el muro estaba tapando funciones (varios menús en la
// semana, evolución, analizar) mientras se está probando la app entera,
// y ahora mismo no protege ningún ingreso -- Stripe está en modo prueba
// con precios de sandbox, así que nadie puede pagar aunque quiera.
//
// NO se ha tocado nada de Stripe: el checkout, el webhook y la pantalla
// de suscripción siguen enteros y probados (BLOQUE 10 del backend). Lo
// único que cambia es que no se ofrece ni bloquea nada.
//
// PARA VOLVER A ENCENDERLO no hace falta tocar código: variable
// VITE_PAYWALL en Vercel ("on" para el de verdad, "demo" para probar sin
// pagar) y redesplegar.
const PAYWALL_MODO = import.meta.env.VITE_PAYWALL || "off";
const PAYWALL_ACTIVO = PAYWALL_MODO !== "off";
const PAYWALL_ES_DEMO = PAYWALL_MODO === "demo";

// Premium de mentira, sólo en este navegador.
const CLAVE_PREMIUM_DEMO = "rawku_premium_demo";
const leerPremiumDemo = () => {
  try { return window.localStorage.getItem(CLAVE_PREMIUM_DEMO) === "si"; } catch { return false; }
};
const guardarPremiumDemo = (valor) => {
  try {
    if (valor) window.localStorage.setItem(CLAVE_PREMIUM_DEMO, "si");
    else window.localStorage.removeItem(CLAVE_PREMIUM_DEMO);
  } catch { /* navegador sin localStorage: se queda en memoria y ya */ }
};
import { capturarError, migaDePan, identificarUsuarioEnSentry } from "./sentry.js";
// Las kcal del día viven aparte desde el 26 de agosto: es lógica pura, y
// además está duplicada en der.py de la API. Ver la cabecera de der.js.
import { finCrecimientoMeses, inicioSeniorAnios, pesoEsperado,
         determinarEtapa, calcularDER, ACTIVIDAD_KEY } from "./der.js";

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
    // ⚠️ AÑADIDO — y además se manda a Sentry con el "component stack"
    // (el árbol de componentes React donde reventó), que es justo el
    // dato que no se ve en una captura de pantalla de la consola.
    capturarError(error, { componentStack: info?.componentStack });
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

// Igual que con Supabase: se puede apuntar a otro sitio por variable de
// entorno (los tests levantan una API de mentira en local). Sin variable,
// se usa la de producción de siempre.


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

// ⚠️ AÑADIDO — saca el nombre de la raza venga como venga. Las filas
// guardadas antes del arreglo tienen el objeto entero serializado, así
// que hay que saber leerlas igualmente: si no, esas usuarias seguirían
// viendo el texto raro para siempre aunque el guardado ya esté bien.
function nombreDeRaza(valor) {
  if (!valor) return null;
  if (typeof valor === "object") return valor.nombre ? nombreDeRaza(valor.nombre) : null;
  const texto = String(valor).trim();
  if (!texto || texto === "[object Object]") return null;
  if (texto.startsWith("{")) {
    try {
      const objeto = JSON.parse(texto);
      return objeto?.nombre ? nombreDeRaza(objeto.nombre) : null;
    } catch {
      return null; // JSON roto: mejor sin raza que con un churro en pantalla
    }
  }
  return texto;
}

// Recupera la raza completa del catálogo a partir de su nombre, para no
// perder tamano/pesoMedio (que se usan para calcular la etapa y el peso
// adulto esperado). Si es una raza que no está en el catálogo, al menos
// se conserva el nombre.
function razaDesdeNombre(nombre) {
  if (!nombre) return null;
  return RAZAS.find((r) => r.nombre === nombre) || { nombre };
}

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
// Qué bandera de "sí/no" acompaña a cada lista. En la ficha de una sola
// pantalla las listas SON la respuesta -- una lista vacía es "no tiene" --,
// pero el resto de la app lee estas banderas, así que se escriben solas para
// que la ficha no pueda decir dos cosas a la vez.
// Las seis categorías de comida del catálogo, tal como las nombra el motor.
// Si un nombre no coincide EXACTAMENTE, la exclusión no hace nada y el menú
// sale igual -- sin error y sin aviso. Por eso están escritas una sola vez.
const CATEGORIAS_QUE_PUEDE_EXCLUIR = [
  { key: "Carne muscular", label: "Carne muscular" },
  { key: "Hueso carnoso", label: "Hueso carnoso" },
  { key: "Pescados y mariscos", label: "Pescados y mariscos" },
  { key: "Vísceras", label: "Vísceras" },
  { key: "Hígado", label: "Hígado" },
  { key: "Verduras y frutas", label: "Verduras y frutas" },
];

const BANDERA_DE = {
  alergias: "alergiaSi",
  otrosEvitar: "otrosEvitarSi",
  categoriasExcluidas: "categoriasExcluidasSi",
  patologias: "patologiaSi",
};

// Los mismos cinco niveles de actividad, dichos como se dicen en consulta.
// El índice es lo único que llega al cálculo del DER, así que cambiar las
// palabras no cambia ni una kcal -- y estas son las palabras que usa quien
// escribe una pauta, no "no para".
const NIVELES_CLINICOS = [
  { label: "Reposo / restricción", detalle: "sedentario, postoperatorio" },
  { label: "Mantenimiento", detalle: "paseos diarios" },
  { label: "Actividad moderada", detalle: "ejercicio regular" },
  { label: "Actividad alta", detalle: "deporte, carrera" },
  { label: "Trabajo", detalle: "pastoreo, guarda, tiro" },
];

const NIVELES = [
  { label: "Sedentario", detalle: "Paseos cortos, se mueve poco", Icono: Moon },
  { label: "Normal", detalle: "Paseos diarios de siempre", Icono: Footprints },
  { label: "Activo", detalle: "Paseos largos, juega bastante", Icono: Zap },
  { label: "Muy activo", detalle: "Corre, hace deporte, no para", Icono: Flame },
  { label: "Trabajo", detalle: "Pastoreo, guarda, o similar", Icono: Award },
];

// ─── ELEGIR ALIMENTO: LA LISTA DE ESPECIES, UNA SOLA VEZ ─────────────────────
//
// ⚠️ CASO REAL ENCONTRADO (25 agosto): "veo que hay en ciertas categorías
// alimentos dentro de otra subcategoría cuando solo hay un alimento dentro,
// por ejemplo en verduras seleccionas acelga y se abre otra vez para solo
// poder seleccionar acelga... eso tiene que ser solo si hay más de un
// alimento dentro".
//
// POR QUÉ ESTO ES UN COMPONENTE Y NO CUATRO COPIAS
// Porque esto YA SE ARREGLÓ el 5 de agosto. El comentario de entonces dice
// literalmente "este era el peor de los TRES SITIOS con este problema".
// Eran cuatro: el analizador de dietas se quedó fuera, con el clic de más,
// y ahí es donde ella lo encontró veinte días después. Y había un quinto
// (los suplementos comerciales) que nadie había mirado nunca.
//
// Arreglar cuatro copias a mano no es arreglarlo: es dejarlo listo para que
// vuelva a pasar en la quinta pantalla. Ahora hay UNA lista, y la pantalla
// que venga la usa y ya está bien sin que nadie se acuerde de esto.
//
// La regla, en una línea: si dentro de una especie solo hay un alimento,
// pulsarla LO ELIGE. Si hay varios, se ve cuántos son y que esto abre otro
// paso -- sin ese indicador los dos botones se veían iguales y no se sabía
// si ya habías elegido o te faltaba un clic.
// `ocultar`: especies que no se enseñan (en alergias, las que ya excluiste).
function ListaDeEspecies({ porEspecie, onElegir, onAbrir, fondo = "#FFFFFF", ocultar = null }) {
  return (
    <>
      {Object.entries(porEspecie || {}).map(([especie, alimentos]) => {
        if (ocultar && ocultar(especie)) return null;
        const lista = alimentos || [];
        const unico = lista.length === 1;
        return (
          <button
            key={especie}
            onClick={() => (unico ? onElegir(lista[0], especie) : onAbrir(especie))}
            aria-label={unico ? lista[0] : `${especie}: ver los ${lista.length} tipos`}
            className="text-left px-3 py-2 rounded-lg text-sm flex items-center justify-between"
            style={{ color: TINTA, fontFamily: fontBody, background: fondo }}
          >
            <span>{unico ? lista[0] : especie}</span>
            {!unico && (
              <span className="flex items-center gap-1 shrink-0" style={{ color: VIOLETA }}>
                <span className="text-[11px] font-semibold" style={{ fontFamily: "monospace" }}>{lista.length} tipos</span>
                <ChevronRight size={14} />
              </span>
            )}
          </button>
        );
      })}
    </>
  );
}

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
    "Cordero": ["Pulmón de cordero", "Riñón de cordero", "Bazo de cordero"],
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
  // ⚠️ CAMBIADO A `segura: false` (25 agosto), con la revisión clínica.
  // La restricción de cobre que hace falta en una hepatopatía por acúmulo
  // (1,2 mg/1000 kcal, Today's Veterinary Practice 2023) está POR DEBAJO
  // del mínimo de cobre que FEDIAF exige a cualquier perro (2,08). O sea
  // que la dieta que trata está por debajo de la que alimenta: no es que
  // el catálogo se quede corto, es que no se puede hacer con comida sin
  // suplementación dirigida.
  //
  // Va aquí y no solo en el servidor porque el aviso tiene que saltar al
  // ELEGIR la patología, no después de recorrer todo el generador para
  // que al final no salga menú. Mismo patrón que estruvita.
  { key: "hepatopatia", label: "Hepatopatía (enfermedad hepática)", segura: false,
    aviso: "La restricción de cobre que hace falta en una hepatopatía por acúmulo está POR DEBAJO del mínimo de cobre que necesita cualquier perro para estar sano. No es algo que se pueda resolver eligiendo mejor los alimentos: hace falta supervisión veterinaria con suplementación dirigida, así que no generamos menú automático." },
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
      // ⚠️ EL NOMBRE GUARDADO MANDA (26 agosto). Antes esto era siempre
      // "Menú 1", "Menú 2"... calculado al vuelo, así que renombrar uno no
      // se veía en ninguna parte: el nombre existía en la base de datos y la
      // pantalla lo pisaba con el número cada vez que se abría.
      nombre: data.nombre || `Menú ${i + 1}`,
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
      // ⚠️ AÑADIDO — mismo caso que problemasSeguridad: el servidor ya
      // mandaba esto y no se leía en ningún sitio. Explica por qué a
      // este menú le falta una categoría entera (típicamente vísceras o
      // hígado, cuando el perro tiene varias alergias y no hay ninguna
      // compatible). El menú cumple los 30 requisitos igual, pero no se
      // parece a los demás -- sin explicación, parece un error.
      avisoComposicion: data.aviso_composicion || null,
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


// ⚠️ LA FÓRMULA SE FUE A `bcs.js` (29 agosto), entera y sin cambiarla. Los
// cinco escalones del dueño y el BCS de 9 puntos del veterinario son la
// misma cosa preguntada de dos maneras, y si cada pantalla calculara su peso
// objetivo por su cuenta, el mismo perro tendría dos objetivos -- y de ahí
// salen las kcal. Aquí solo queda la puerta de los cinco escalones.
function pesoIdealDesdeCondicion(pesoActualKg, condicionIdx) {
  return pesoIdealDesdeBcs(pesoActualKg, bcsDesdeCondicion(condicionIdx));
}

// ─── QUÉ PESO OBJETIVO SE USA HOY ────────────────────────────────────────────
//
// ⚠️ CASO REAL ENCONTRADO (25 agosto): "cree el primer menú poniendo que
// pesaba 7 kg y que está rellenita, y luego actualicé el peso a 6.2 pero
// sigue quedándose en rellenito, entonces sigue metiendo menos kcal".
//
// Tenía razón, y el fallo era peor que el olvido de actualizar la
// condición. `pesoIdealDesdeCondicion` divide el peso de HOY, así que el
// objetivo bajaba con el perro y el ratio quedaba clavado en 1,20 pesara lo
// que pesara. Medido con Lola: 7,0 kg -> 263 kcal, 6,5 -> 249 (la cifra que
// ella vio en pantalla), 6,2 -> 240, 5,9 -> 231. Adelgazaba y le dábamos
// menos comida, para siempre: la dieta no podía terminar nunca. Y al revés
// igual -- un perro «Flaquito» está siempre exactamente en 0,90, así que
// engorde lo que engorde sigue en régimen de subida.
//
// Ahora el objetivo se fija EN KILOS cuando se marca la condición, y deja
// de moverse. Pero un objetivo guardado puede quedarse viejo, y uno viejo
// es más peligroso que no tener ninguno:
//
//   · UN CACHORRO. Un labrador marcado a los 5 kg guardaría objetivo 5. De
//     adulto con 30 kg, el ratio sería 6 y le pondríamos una dieta de
//     hambre de por vida. Por eso en crecimiento NO se usa objetivo
//     ninguno, igual que hace calcularDER, y se estrena al llegar a
//     adulto.
//   · UNO ABANDONADO. Una ficha que lleva un año sin tocarse puede tener
//     un objetivo que ya no se parece en nada al perro. Si el ratio se sale
//     de una banda razonable, se descarta y se recalcula -- y la pantalla
//     de Evolución pide confirmarlo.
//
// Devuelve { kg, esViejo, esCalculadoAlVuelo } para que la pantalla pueda
// decir de dónde sale el número en vez de enseñarlo a secas.
const RATIO_MINIMO_CREIBLE = 0.55;
const RATIO_MAXIMO_CREIBLE = 1.60;

function objetivoVigente(perfil, etapa) {
  const peso = Number(perfil?.pesoActual);
  if (!(peso > 0)) return { kg: null, esViejo: false, esCalculadoAlVuelo: false };

  // En crecimiento el peso cambia por definición: no hay objetivo que fijar.
  if (etapa === "cachorro_joven" || etapa === "cachorro_crecimiento") {
    return { kg: null, esViejo: false, esCalculadoAlVuelo: false };
  }

  const guardado = Number(perfil?.pesoObjetivoKg);
  if (guardado > 0) {
    const ratio = peso / guardado;
    if (ratio >= RATIO_MINIMO_CREIBLE && ratio <= RATIO_MAXIMO_CREIBLE) {
      return { kg: guardado, esViejo: false, esCalculadoAlVuelo: false };
    }
    // Se sale de la banda: el objetivo es de otra época del perro.
    return {
      kg: pesoIdealDesdeBcs(peso, bcsVigente(perfil)),
      esViejo: true,
      esCalculadoAlVuelo: true,
    };
  }

  // Nunca se ha fijado (fichas de antes del 25 de agosto).
  return {
    kg: pesoIdealDesdeBcs(peso, bcsVigente(perfil)),
    esViejo: false,
    esCalculadoAlVuelo: true,
  };
}

// Cuánto le falta para llegar, y si conviene avisar. El aviso salta ANTES
// de cruzar el umbral de 1,10, no después: al cruzarlo la ración pega un
// salto grande (de dieta de bajada a mantenimiento), y lo que toca en ese
// momento es volver a mirar al perro, no que le cambie la comida sin más.
const UMBRAL_FIN_DE_DIETA = 1.10;
const UMBRAL_AVISO_CERCA = 1.15;

function comoVaLaDieta(perfil, etapa) {
  const { kg } = objetivoVigente(perfil, etapa);
  const peso = Number(perfil?.pesoActual);
  if (!(kg > 0) || !(peso > 0)) return null;
  const ratio = peso / kg;
  return {
    objetivoKg: kg,
    ratio,
    enBajada: ratio >= UMBRAL_FIN_DE_DIETA,
    cerca: ratio >= UMBRAL_FIN_DE_DIETA && ratio < UMBRAL_AVISO_CERCA,
  };
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

// ⚠️ AMPLIADO — `soloSeccion` abre VistaMenus directamente en una de sus
// secciones (Evolución, Analizar...) sin pintar la vista de menús que hay
// detrás. Esas secciones no dependen para nada de que haya un menú recién
// generado -- son la ficha de peso y el analizador de dieta -- pero
// estaban programadas aquí dentro, así que desde el perfil no había forma
// de llegar a ellas. Esto es lo que hace de puerta.
function VistaMenus({ menus, onVolver, soloSeccion = null, modo, alimentosEvitados, patologias, nombrePerro, necesitaTransicion, dietaActual, categoriasDisponibles, perfil, derReal, etapaLabel, etapaCalculada, especiesExcluidas, pesoAdultoEsperado, pesoObjetivoKg = null, edad, set, setFase, avisoNoForzado, diagnosticoPersonalizar, avisoExtraEspecie, premium, onMostrarSuscripcion, onRegenerarConAlimentos, usuario = null, onPerroGuardado = () => {}, onCrearCuenta = () => {}, burbuja = null, burbujaClara = null, onAbrirLaCompra = null, onMenuEditado = null, onAbrirPanel = null,
  // ⚠️ AÑADIDO (26 agosto) — los tres puntos de CADA menú de la semana.
  // Pedido expreso: "se tiene que poder borrar y editar desde dentro y desde
  // fuera; cada menú individual de la semana y el global". Solo llega con
  // valor si el menú está GUARDADO: renombrar uno recién generado que
  // todavía no se ha guardado no tendría dónde escribirse.
  onAccionesDeMenu = null,
  // ⚠️ AÑADIDO (28 agosto) — el modo profesional. Llega como prop y no se
  // calcula aquí a propósito: quién está acreditado lo decide Supabase y lo
  // resuelve `rol.js` en un solo sitio. Por defecto false, así que cualquier
  // camino que se olvide de pasarlo enseña la vista de tutor -- que es el
  // lado seguro del error.
  enModoProfesional = false }) {
  const [tabActiva, setTabActiva] = useState(menus[0].id);
  // ⚠️ AÑADIDO — LAS DOS PESTAÑAS DEL RESULTADO. Pedido expreso: la
  // pantalla del menú era un scroll larguísimo donde el plan de
  // transición y la congelación quedaban enterrados a mitad de
  // camino, y cómo preparar cada alimento estaba escondido detrás
  // del icono de cubiertos de cada fila -- para verlo todo antes de
  // ponerte a cocinar había que ir abriéndolos de uno en uno.
  //
  // "El menú" = qué le doy. "Cómo darlo" = cómo se lo doy.
  //
  // OJO: no confundir con `tabActiva`, que es OTRA cosa -- ésa elige
  // entre Menú 1 / Menú 2 / ... cuando se piden varios.
  const [vistaActiva, setVistaActiva] = useState("menu");
  // ⚠️ AÑADIDO (5 agosto, madrugada): estado LOCAL para poder cerrar
  // este aviso -- se inicializa a partir de la prop, pero una vez
  // cerrado no debe volver a aparecer solo porque el componente se
  // vuelva a renderizar.
  const [avisoNoForzadoVisible, setAvisoNoForzadoVisible] = useState(avisoNoForzado);
  // ⚠️ AÑADIDO (5 agosto, madrugada): mismo patrón que avisoNoForzado --
  // estado local para poder cerrarlo.
  const [avisoExtraEspecieVisible, setAvisoExtraEspecieVisible] = useState(avisoExtraEspecie);
  // ⚠️ QUITADO (5 agosto, madrugada): el selector de mascotas no hacía
  // nada funcional (ni siquiera "Añadir mascota" tenía onClick), y tras
  // quitar el único botón que lo abría (para poner el menú siempre en
  // el mismo sitio), se quedaba sin ninguna forma de acceder -- código
  // muerto. Se retoma el día que exista de verdad la gestión de varias
  // mascotas.
  const [seccionActiva, setSeccionActiva] = useState(soloSeccion);

  // ⚠️ CASO REAL ENCONTRADO (25 agosto): "desde analizar la dieta actual
  // también hay ciertas pantallas a las que no puedo ir". Era esto, y no
  // el panel: `seccionActiva` se estrenaba con `soloSeccion` y ahí se
  // quedaba para siempre. Estando en Analizar y pidiendo Evolución, el
  // padre cambiaba `soloSeccion` -- pero esta vista seguía montada, con la
  // sección de antes puesta. El panel se abría, la entrada se pulsaba, la
  // navegación ocurría... y la pantalla no cambiaba. Ni un error.
  //
  // Solo se sigue a `soloSeccion`. Cerrar la sección desde dentro
  // (`seccionActiva = null`) tiene que poder salir, y por eso el efecto de
  // abajo existe aparte: si éste mirara las dos, se pisarían.
  useEffect(() => {
    if (soloSeccion) setSeccionActiva(soloSeccion);
  }, [soloSeccion]);

  // En modo "sólo una sección" no hay vista de menús detrás a la que
  // volver: cerrar la sección significa salir de aquí del todo. Así los
  // botones de "← Volver" existentes siguen valiendo sin tocarlos uno a uno.
  useEffect(() => {
    if (soloSeccion && seccionActiva === null) onVolver?.();
  }, [soloSeccion, seccionActiva, onVolver]);
  // ⚠️ AÑADIDO (25 agosto) — al pesar hay que volver a mirar al perro.
  // CASO REAL: "cree el primer menú poniendo que pesaba 7 kg y que está
  // rellenita, y luego actualicé el peso a 6.2 pero sigue quedándose en
  // rellenito, entonces sigue metiendo menos kcal... si solo cambia el peso
  // y no cambia eso porque no se acuerda pues es un problema".
  //
  // Se pregunta DESPUÉS de guardar el peso, no antes: el peso ya está a
  // salvo pase lo que pase, y la pregunta no bloquea nada.
  const [preguntarCondicion, setPreguntarCondicion] = useState(false);
  const [objetivoConfirmado, setObjetivoConfirmado] = useState(false);
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
    fetchConTimeout(`${API_BASE}/alimentos`)
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
      const resp = await fetchConTimeout(`${API_BASE}/analizar`, {
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
  const [avisoComposicionVisible, setAvisoComposicionVisible] = useState(true);
  // ⚠️ AÑADIDO (5 agosto, madrugada) — pedido expreso: recordatorio
  // general de congelación/descongelación, visible arriba del todo en
  // la pantalla de menús, no solo enterrado dentro del texto de "cómo
  // dar" de cada categoría (donde antes solo se veía si se pulsaba a
  // ver el detalle del hueso carnoso en concreto).
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
  const [avisoComposicionPorMenu, setAvisoComposicionPorMenu] = useState({});

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
  // ⚠️ REHECHO (25 agosto) — CASO REAL ENCONTRADO: "cuando te genera varios
  // menús y te pones a cambiar las cantidades según si es para toda la
  // semana o para un solo día, y cambias de menú, no se refresca
  // automáticamente la pantalla del siguiente menú: tienes que darle a
  // algún botón para que se refresquen las cantidades".
  //
  // Aquí había un número de días suelto, COMPARTIDO por todas las pestañas.
  // Y cada menú cubre los suyos: el 1 puede durar 4 días y el 2 durar 3.
  // Estando en el menú 1 con "toda la semana" (4), al pasar al menú 2 el
  // número se quedaba en 4 -- así que se veían las cantidades de CUATRO
  // días de un menú que se da TRES. Ningún botón salía marcado, porque el 4
  // no era ninguna de sus opciones, y hasta que no tocabas uno las cifras
  // eran de otro menú. Eso no es un refresco que falta: es cocinar de más.
  //
  // Ahora no se guarda el número, se guarda la INTENCIÓN: "de un día" o "la
  // tanda entera". Los días salen del menú que estés mirando, así que no
  // pueden ser los de otro ni aunque se quiera.
  // ⚠️ Se pregunta antes de quitar, y no es por prudencia genérica: un
  // alimento quitado NO se puede volver a poner. "Añadir" solo existe para
  // suplementos comerciales, así que si quitas el pollo no hay forma de
  // devolverlo sin rehacer el menú entero.
  const [alimentoAQuitar, setAlimentoAQuitar] = useState(null);
  const [verLaTanda, setVerLaTanda] = useState(false);
  const diasSeleccionados = verLaTanda && menu.dias > 1 ? menu.dias : 1;
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
  // El aviso de composición va por menú igual que los de seguridad: en
  // una rotación, un menú puede llevar vísceras y otro no.
  // Se usa `??` y no `||` a propósito: tras editar, el servidor manda
  // null para decir "ya no falta nada", y con `||` ese null caería al
  // valor de la generación y el aviso se quedaría pegado para siempre.
  const avisoComposicion = tabActiva in avisoComposicionPorMenu
    ? avisoComposicionPorMenu[tabActiva]
    : (menu.avisoComposicion || null);
  useEffect(() => { setProblemasSeguridadVisible(true); }, [JSON.stringify(problemasSeguridad)]);
  useEffect(() => { setAvisoComposicionVisible(true); }, [avisoComposicion]);
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
      const res = await fetchConTimeout(`${API_BASE}${endpoint}`, {
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
      peso_objetivo_kg: pesoObjetivoKg || null,
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
        // ⚠️ AÑADIDO (24 agosto) — AVISAR HACIA FUERA DE QUE EL MENÚ CAMBIÓ.
        //
        // Al editar un alimento, el servidor recalcula el menú ENTERO y el
        // resultado se guardaba SOLO aquí dentro (`gramosRealesPorMenu`).
        // Fuera, `menuReal` seguía con el menú de antes -- y de `menuReal`
        // sale la lista de la compra. O sea: editabas, la pantalla te
        // enseñaba lo nuevo, y la compra te mandaba a comprar lo viejo. Sin
        // ningún error y sin nada que lo delatara.
        onMenuEditado?.(tabActiva, data.gramos);
        setFichaPorMenu((prev) => ({ ...prev, [tabActiva]: data.ficha }));
        // ⚠️ AÑADIDO (5 agosto, madrugada) — AUDITORÍA: al editar un
        // alimento, los avisos de seguridad pueden cambiar (un cambio
        // puede resolver un problema, o crear uno nuevo) -- había que
        // refrescarlos igual que se refresca la ficha.
        setProblemasSeguridadPorMenu((prev) => ({ ...prev, [tabActiva]: data.problemas_seguridad || [] }));
        // ⚠️ Mismo motivo: al editar, la composición puede cambiar. Si el
        // cambio hace que vuelvan a entrar las vísceras, el aviso tiene
        // que desaparecer -- por eso se guarda también cuando viene null,
        // en vez de dejar el de antes.
        setAvisoComposicionPorMenu((prev) => ({ ...prev, [tabActiva]: data.aviso_composicion || null }));
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
  // ⚠️ AÑADIDO (25 agosto) — PEDIDO EXPRESO: "me gustaría también que
  // existiese un botón de cruz o papelera para eliminar un alimento de una
  // dieta cuando se edita la dieta".
  //
  // El servidor ya sabía hacerlo (/menu/quitar, que excluye el alimento y
  // RESUELVE EL MENÚ ENTERO otra vez con el motor real, no le resta los
  // gramos y ya). Lo que faltaba era el botón: esta función existía desde
  // agosto para los suplementos y no la llamaba nadie.
  //
  // Importante que recalcule de verdad: quitar el hígado no es tener el
  // mismo menú con menos hígado, es otro menú que tiene que volver a
  // cumplir los 30 requisitos. Si con ese alimento fuera no hay menú
  // posible, el servidor lo dice y no se cambia nada.
  const quitarAlimento = async (alimento) => {
    setEditorAbierto(null);
    setAlimentoAQuitar(null);
    const ok = await llamarRecalculo("/menu/quitar", { menu_actual: nombresActualesDelMenu(), alimento });
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
      {!soloSeccion && (<>
      <div style={{ background: VIOLETA }} className="w-full px-6 pt-8 pb-6">
        {/* ⚠️ CORREGIDO (5 agosto, madrugada) — pedido expreso: esta era
            la ÚNICA pantalla de toda la app con el menú a la IZQUIERDA
            -- en cualquier otro sitio está a la derecha. Esa
            inconsistencia era el problema real, no que faltara en
            ningún sitio. El menú va SIEMPRE a la izquierda -- y se
            quita de aquí la burbuja de mascota, que no hace nada
            funcional todavía (era solo una maqueta). */}
        <div className="flex items-center justify-between mb-4">
          <BotonMenu onClick={() => onAbrirPanel?.()} color="#FFFFFF" className="p-1" />
          {burbuja || <p className="text-sm" style={{ color: "#FFFFFF", fontFamily: fontDisplay }}>Rawku</p>}
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
        {/* ⚠️ AQUÍ, Y NO EN LA LISTA DE DENTRO (26 agosto). Los puse primero
            en la sección "Mis menús" que VistaMenus tiene dentro, y esa
            sección NO SE PUEDE ABRIR: solo aparece si el padre pasa
            `soloSeccion="menus"`, y nadie lo pasa -- el "Mis menús" del panel
            va a la pantalla de FUERA. Es código muerto desde hace tiempo. El
            botón se habría visto perfecto en el código y no lo habría
            encontrado nadie.
            Aquí está donde se está mirando el menú de verdad, al lado de su
            nombre. Solo con el menú GUARDADO: renombrar uno recién generado
            que aún no se ha guardado no tendría dónde escribirse. */}
        <div className="flex items-start justify-between gap-3 mb-5">
          <h1 className="text-3xl leading-tight min-w-0" style={{ color: "#FFFFFF", fontFamily: fontDisplay, fontWeight: 500 }}>
            {menus.length === 1 ? "Tu menú" : `Tus ${menus.length} menús`}
          </h1>
          {onAccionesDeMenu && (() => {
            const i = menus.findIndex((m) => m.id === tabActiva);
            if (i < 0) return null;
            return (
              <button
                onClick={() => onAccionesDeMenu(i)}
                aria-label={`Opciones de ${menus[i].nombre}`}
                className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center mt-1"
                style={{ background: "rgba(255,255,255,0.14)", border: "none" }}
              >
                <MoreVertical size={16} style={{ color: "#FFFFFF" }} />
              </button>
            );
          })()}
        </div>
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

      {/* ⚠️ AÑADIDO — LAS DOS PESTAÑAS. Van FUERA de la cabecera morada
          y pegadas a ella, para que se lean como parte de la pantalla
          del menú y no como otra navegación más. Sin scroll horizontal:
          son dos y caben siempre. */}
      <div className="flex" style={{ background: "#FFFFFF", borderBottom: "1.5px solid #E3DAF0" }}>
        {[
          { key: "menu", label: "El menú" },
          { key: "comoDarlo", label: "Cómo darlo" },
          // La tercera solo existe en modo profesional. Un tutor no la ve:
          // no es que se le esconda nada -- ve el menú entero y su semáforo
          // --, es que la tabla de márgenes no le dice nada y le quita sitio.
          ...(enModoProfesional ? [{ key: "fichaClinica", label: "Ficha clínica" }] : []),
        ].map((v) => {
          const activo = vistaActiva === v.key;
          return (
            <button
              key={v.key}
              onClick={() => setVistaActiva(v.key)}
              aria-current={activo ? "page" : undefined}
              className="flex-1 text-center py-3.5"
              style={{
                background: "transparent",
                border: "none",
                borderBottom: activo ? `2.5px solid ${VIOLETA}` : "2.5px solid transparent",
                color: activo ? VIOLETA : MALVA,
                fontFamily: fontBody,
                fontSize: 13,
                fontWeight: activo ? 700 : 400,
              }}
            >
              {v.label}
            </button>
          );
        })}
      </div>

      <div className="flex-1 px-6 pt-6 pb-6 flex flex-col">
        {/* ⚠️ PESTAÑA "CÓMO DARLO". Lo que hay aquí no es nuevo: estaba
            todo en esta misma pantalla, pero repartido -- la transición
            arriba del todo pegada a las tarjetas, la congelación en
            medio de la pila de avisos (y con una X para cerrarla, o sea
            que se podía perder de vista para siempre), y la preparación
            de cada alimento detrás de su icono. */}
        {vistaActiva === "fichaClinica" && enModoProfesional && (
          <FichaClinica ficha={ficha} />
        )}

        {vistaActiva === "comoDarlo" && (
          <div className="flex flex-col gap-3 mb-4">
          {necesitaTransicion && (
            <div className="rounded-xl p-3" style={{ background: "#F0ECF7" }}>
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
            <div className="rounded-xl p-3 mb-4" style={{ background: "#F0ECF7", border: "1px solid #D9CDEE" }}>
              <div className="flex items-center gap-1.5 mb-1">
                <AlertCircle size={14} style={{ color: VIOLETA }} />
                <p className="text-[11px] tracking-[0.1em] uppercase" style={{ color: VIOLETA, fontFamily: "monospace" }}>
                  Congelación
                </p>
              </div>
              <p className="text-xs leading-snug" style={{ color: TINTA, fontFamily: fontBody }}>
                {/* ⚠️ CASO REAL (23 agosto): salía "al menos 1 semanacongelados".
                    En JSX, la línea que TERMINA en etiqueta se pega a la
                    siguiente sin espacio -- y lo mismo la que EMPIEZA con una.
                    El espacio de dentro de la línea sí se respeta, así que
                    cada <b> va pegado a sus palabras en su propia línea. */}
                Si preparas este menú con antelación: carne, vísceras, hígado y hueso, <b>al menos 1 semana</b> congelados
                a -18/-20°C antes de dar; pescado, <b>al menos 2 semanas</b> — el anisakis aguanta más. Los suplementos,
                aceites, huevo y semillas se añaden CRUDOS al final, sobre la comida ya descongelada — nunca se congelan
                junto con el resto.
                <br /><br />
                Una vez descongelado, dáselo <b>dentro de 3 días</b> guardándolo en la nevera; pasado ese
                tiempo, mejor no. El pescado se estropea antes que la carne: si huele mal, descártalo aunque
                no hayan pasado los tres días.
              </p>
            </div>
          {/* ⚠️ AÑADIDO — CÓMO PREPARAR CADA ALIMENTO, TODO JUNTO.
              Esto mismo sigue estando detrás del icono de cubiertos de
              cada fila, y no es un descuido: ahí sirve para mirar UN
              alimento mientras lees la lista, y aquí para leerlo todo
              seguido antes de ponerte a cocinar. Son dos momentos
              distintos.

              Se agrupa por categoría, no por alimento: la instrucción
              larga (crudo, troceado, congelado...) es de la categoría,
              y repetirla en cada fila llenaría la pantalla de lo
              mismo. Debajo de cada una van solo los alimentos de este
              menú que tienen algo propio que decir. */}
          {(() => {
            const porCategoria = [];
            for (const item of itemsMostrados) {
              if (!INSTRUCCIONES_POR_CATEGORIA[item.categoria]) continue;
              let grupo = porCategoria.find((g) => g.categoria === item.categoria);
              if (!grupo) { grupo = { categoria: item.categoria, items: [] }; porCategoria.push(grupo); }
              grupo.items.push(item);
            }
            if (porCategoria.length === 0) return null;
            return (
              <>
                <p className="text-[11px] tracking-[0.1em] uppercase mt-2" style={{ color: MALVA, fontFamily: "monospace" }}>
                  Alimento por alimento
                </p>
                {porCategoria.map((grupo) => (
                  <div key={grupo.categoria} className="rounded-xl p-3" style={{ background: "#FFFFFF", border: "1.5px solid #E3DAF0" }}>
                    <div className="flex gap-2 items-start">
                      <UtensilsCrossed size={14} style={{ color: VIOLETA, flexShrink: 0, marginTop: 2 }} />
                      <div className="flex-1">
                        <p className="text-sm mb-1" style={{ color: TINTA, fontFamily: fontBody, fontWeight: 600 }}>
                          {grupo.categoria}
                        </p>
                        <p className="text-xs leading-snug" style={{ color: TINTA, fontFamily: fontBody }}>
                          {INSTRUCCIONES_POR_CATEGORIA[grupo.categoria]}
                        </p>
                      </div>
                    </div>
                    {grupo.items.filter((it) => COMO_DAR_ALIMENTO[it.alimento]).map((it) => (
                      <div key={it.alimento} className="mt-2.5 p-2.5 rounded-xl" style={{ background: PAPEL }}>
                        <div className="flex items-baseline justify-between gap-2 mb-1">
                          <p className="text-xs" style={{ color: TINTA, fontFamily: fontBody, fontWeight: 600 }}>{it.alimento}</p>
                          <span className="text-xs shrink-0" style={{ color: VIOLETA, fontFamily: fontDisplay }}>
                            {formatearGramos(it.gramos * multiplicador)}
                          </span>
                        </div>
                        <p className="text-xs leading-snug" style={{ color: TINTA, fontFamily: fontBody }}>
                          {COMO_DAR_ALIMENTO[it.alimento].como}
                        </p>
                        {/* Sin `pieza` no hay referencia que dar -- si se
                            pinta igual sale "Como referencia, undefined".
                            Mismo motivo que en el panel de los cubiertos. */}
                        {COMO_DAR_ALIMENTO[it.alimento].pieza && (
                          <p className="text-xs mt-1" style={{ color: MALVA, fontFamily: fontBody }}>
                            Como referencia, {COMO_DAR_ALIMENTO[it.alimento].pieza}.
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              </>
            );
          })()}
          </div>
        )}
        {vistaActiva === "menu" && (<>
        {/* ⚠️ REORGANIZADO (5 agosto, madrugada) — pedido expreso: en
            pantallas anchas, el plan de transición y las tres tarjetas
            (ración/kcal/semáforo) van lado a lado, aprovechando el
            espacio -- en móvil siguen apiladas como antes, no hay sitio
            para ponerlas al lado. Si no hay transición, las tres
            tarjetas ocupan el ancho entero, como siempre hicieron. */}
        <div className="flex-1">
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
        {avisoComposicion && avisoComposicionVisible && (
          // ⚠️ AÑADIDO — por qué este menú no se parece a los demás.
          //
          // Va en su PROPIO panel y no dentro de "avisos de seguridad", y
          // no es un descuido: que a un menú le falten las vísceras no es
          // un riesgo, es una consecuencia de las alergias del perro. El
          // menú cumple los 30 requisitos igual. Meterlo bajo el rótulo
          // de seguridad, en ámbar, diría que hay algo peligroso cuando
          // no lo hay -- y a base de teñir de ámbar cosas que no lo son,
          // los avisos que SÍ importan dejan de leerse.
          //
          // Va ENCIMA del de seguridad y en violeta (el color de la app
          // para informar, el mismo de los otros avisos informativos),
          // manteniendo la forma del panel para que se lea como parte
          // del mismo sistema.
          <div className="rounded-xl p-3 mb-3" style={{ background: "#F4F0FB", border: "1px solid #DCD2F0" }}>
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1.5">
                <Info size={14} style={{ color: VIOLETA }} />
                <p className="text-[11px] tracking-[0.1em] uppercase" style={{ color: VIOLETA, fontFamily: "monospace" }}>
                  Sobre la composición
                </p>
              </div>
              <button onClick={() => setAvisoComposicionVisible(false)}
                      aria-label="Cerrar el aviso sobre la composición">
                <X size={14} style={{ color: VIOLETA }} />
              </button>
            </div>
            <p className="text-xs leading-relaxed" style={{ color: TINTA, fontFamily: fontBody }}>
              {avisoComposicion}
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
                  onClick={() => setVerLaTanda(op.dias > 1)}
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
                      <button
                        // ⚠️ AÑADIDO (24 agosto) — sin nombre accesible, este
                        // botón no se podía tocar desde una prueba: el lápiz
                        // solo es un icono. Y editar es justo donde apareció
                        // el fallo de que la compra se quedaba con el menú de
                        // antes.
                        aria-label={`Cambiar ${item.alimento}`}
                        onClick={() => {
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
                    <button
                      aria-label={`Quitar ${item.alimento}`}
                      onClick={() => {
                        setAlimentoAQuitar(alimentoAQuitar === item.alimento ? null : item.alimento);
                        setEditorAbierto(null); setPorqueAbierto(null); setComoAbierto(null);
                      }}>
                      <Trash2 size={15} style={{ color: alimentoAQuitar === item.alimento ? ROSA : "#C9BEDD" }} />
                    </button>
                    {INSTRUCCIONES_POR_CATEGORIA[item.categoria] && (
                      <button
                        aria-label={`Cómo preparar ${item.alimento}`}
                        onClick={() => { setComoAbierto(comoAbierto === i ? null : i); setPorqueAbierto(null); setEditorAbierto(null); }}>
                        <UtensilsCrossed size={15} style={{ color: comoAbierto === i ? ROSA : "#C9BEDD" }} />
                      </button>
                    )}
                  </div>
                </div>
                {alimentoAQuitar === item.alimento && (
                  <div className="mt-3 pt-3" style={{ borderTop: "1px solid #F0ECF7" }}>
                    <p className="text-xs mb-2 leading-snug" style={{ color: TINTA, fontFamily: fontBody }}>
                      ¿Quitar <b>{item.alimento}</b>? Se rehace el menú entero sin él, y{" "}
                      <b>no se puede volver a poner</b> sin generar otro.
                    </p>
                    <div className="flex gap-2">
                      <button
                        aria-label={`Confirmar quitar ${item.alimento}`}
                        onClick={() => quitarAlimento(item.alimento)}
                        className="px-3 py-1.5 rounded-lg text-xs"
                        style={{ background: ROSA, color: "#FFFFFF", fontFamily: fontBody, fontWeight: 700 }}>
                        Quitar
                      </button>
                      <button
                        onClick={() => setAlimentoAQuitar(null)}
                        className="px-3 py-1.5 rounded-lg text-xs"
                        style={{ background: PAPEL, color: MALVA, fontFamily: fontBody }}>
                        Dejarlo
                      </button>
                    </div>
                  </div>
                )}
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
                      <ListaDeEspecies
                        porEspecie={(categoriasDisponibles || CATEGORIAS_ALIMENTO)[editorAbierto.categoria]}
                        onElegir={(alimento) => cambiarAlimento(editorAbierto.alimentoViejo, alimento)}
                        onAbrir={(especie) => setEditorAbierto({ ...editorAbierto, especie })}
                        fondo={PAPEL}
                      />
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
                        {/* ⚠️ CORREGIDO (22 agosto) — CASO REAL: en la
                            zanahoria ponía "Como referencia, undefined —
                            con los 15g de hoy...". 34 de las 77 entradas
                            de COMO_DAR_ALIMENTO (todas las verduras y
                            frutas) tienen instrucción pero NO tienen
                            `pieza`, y la plantilla lo pintaba tal cual.
                            Sin `pieza` no hay referencia que dar, así que
                            no se pinta la línea. Los pesos de referencia
                            que faltan son un dato, no código: se añaden a
                            mano cuando los haya, y entonces aparecen
                            solas.

                            ⚠️ Y el número tampoco cuadraba: la fila de
                            arriba enseña el total para los días que se
                            preparan de golpe (item.gramos x multiplicador)
                            y esto enseñaba la ración de UN día. Los dos
                            eran correctos, pero juntos parecían
                            contradecirse: 105 g arriba y "los 15g de hoy"
                            debajo. Ahora se dicen las dos cosas y de dónde
                            sale cada una. */}
                        {COMO_DAR_ALIMENTO[item.alimento].pieza && (
                          <p className="text-xs" style={{ color: MALVA, fontFamily: fontBody }}>
                            {COMO_DAR_ALIMENTO[item.alimento].esComprimido
                              ? `${COMO_DAR_ALIMENTO[item.alimento].pieza} — se puede partir para dosis más pequeñas.`
                              : multiplicador > 1
                                ? `Como referencia, ${COMO_DAR_ALIMENTO[item.alimento].pieza} — los ${formatearGramos(item.gramos * multiplicador)} de arriba son para ${diasSeleccionados} días: ${formatearGramos(item.gramos)} al día.`
                                : `Como referencia, ${COMO_DAR_ALIMENTO[item.alimento].pieza} — con los ${formatearGramos(item.gramos)} de hoy te haces una idea de cuánto es.`}
                          </p>
                        )}
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
              <ListaDeEspecies
                porEspecie={CATEGORIAS_ALIMENTO["Suplementos comerciales"]}
                onElegir={(producto, tipo) => anadirSuplemento(tipo, producto)}
                onAbrir={(tipo) => setSupTipoAbierto(tipo)}
                fondo={PAPEL}
              />
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

        </>)}

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
        {/* ⚠️ AÑADIDO — LA INVITACIÓN A CREAR LA CUENTA.
            Aquí y no antes: éste es el primer momento en que existe algo
            que perder. Pedir la cuenta en la primera pantalla es pedirla
            a cambio de nada, y por eso echa para atrás.
            Se puede ignorar -- no tapa el botón de abajo ni bloquea nada. */}
        {usuario?.local && (
          <div className="rounded-2xl p-4 mb-3" style={{ background: "#F0ECF7", border: `1.5px solid ${VIOLETA}` }}>
            <p className="text-sm mb-1" style={{ color: TINTA, fontFamily: fontBody, fontWeight: 700 }}>
              Este menú sólo está en este móvil
            </p>
            <p className="text-xs leading-snug mb-3" style={{ color: TINTA, fontFamily: fontBody }}>
              Estás usando Rawku sin cuenta. Si creas una, {nombrePerro} y sus menús
              suben solos y los tendrás desde cualquier sitio. No hace falta ahora.
            </p>
            <button
              onClick={onCrearCuenta}
              className="w-full py-3 rounded-xl"
              style={{ background: VIOLETA, color: "#FFFFFF", fontFamily: fontBody, fontWeight: 700, border: "none", cursor: "pointer" }}
            >
              Crear cuenta y guardarlo
            </button>
          </div>
        )}
        <button
          onClick={() => setSemanaConfirmada(true)}
          className="w-full py-4 rounded-2xl text-base"
          style={{ background: ROSA, color: "#FFFFFF", fontFamily: fontBody, fontWeight: 700 }}
        >
          Confirmar semana
        </button>
      </div>


      </>)}

      {seccionActiva === "perfil" && (
        <div className="fixed inset-0 z-50 flex flex-col px-6 pt-10 pb-8 overflow-y-auto cnl-pantalla-scroll" style={{ background: PAPEL }}>
          <div className="flex items-center justify-between gap-3 mb-6">
            <div className="flex items-center gap-3 min-w-0">
            <BotonMenu onClick={() => onAbrirPanel?.()} color={VIOLETA} className="p-1" />
            </div>
            {/* ⚠️ CORREGIDO (24 agosto) — CASO REAL: "se ve raro lo del
                engranaje y el perfil en varias pantallas, se ve como arriba
                centrado, debería estar siempre en el mismo sitio".
                Cierto. En toda la app la regla es hamburguesa IZQUIERDA y
                burbuja DERECHA, con `justify-between` entre las dos. Al
                meter aquí el "← Volver" como TERCER hijo, el reparto dejaba
                la burbuja en medio. Ahora el volver va agrupado con la
                hamburguesa a la izquierda y la burbuja vuelve a su esquina,
                igual que en las demás pantallas. */}
            {burbujaClara}
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
          <div className="flex items-center justify-between gap-3 mb-6">
            <div className="flex items-center gap-3 min-w-0">
            <BotonMenu onClick={() => onAbrirPanel?.()} color={VIOLETA} className="p-1" />
            </div>
            {/* ⚠️ CORREGIDO (24 agosto) — CASO REAL: "se ve raro lo del
                engranaje y el perfil en varias pantallas, se ve como arriba
                centrado, debería estar siempre en el mismo sitio".
                Cierto. En toda la app la regla es hamburguesa IZQUIERDA y
                burbuja DERECHA, con `justify-between` entre las dos. Al
                meter aquí el "← Volver" como TERCER hijo, el reparto dejaba
                la burbuja en medio. Ahora el volver va agrupado con la
                hamburguesa a la izquierda y la burbuja vuelve a su esquina,
                igual que en las demás pantallas. */}
            {burbujaClara}
          </div>
          <p className="text-2xl mb-1" style={{ color: TINTA, fontFamily: fontDisplay }}>Evolución de {nombrePerro}</p>
          <p className="text-xs mb-6" style={{ color: MALVA, fontFamily: fontBody }}>Peso esperado vs. peso real registrado</p>
          <PremiumGate
            premium={premium}
            onSuscribir={() => { setSeccionActiva(null); onMostrarSuscripcion(); }}
            onCerrar={() => setSeccionActiva(null)}
            esDemo={PAYWALL_ES_DEMO}
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

            {/* ⚠️ AÑADIDO (25 agosto) — EL PESO OBJETIVO, A LA VISTA. Estaba
                calculado por dentro y no se enseñaba en ninguna parte, así
                que nadie podía notar que se movía. Y se movía: bajaba con el
                perro, un 20% por debajo de donde estuviera, y por eso la
                dieta no terminaba nunca. Un número que decide las kcal no
                puede estar escondido. */}
            {(() => {
              const obj = objetivoVigente(perfil, etapaCalculada);
              if (!(obj.kg > 0)) return null;   // en crecimiento no hay objetivo
              const dieta = comoVaLaDieta(perfil, etapaCalculada);
              const hayQueConfirmar = obj.esCalculadoAlVuelo && !objetivoConfirmado;
              return (
                <div className="mt-3 pt-3" style={{ borderTop: "1px solid #F0ECF7" }}>
                  <p className="text-xs" style={{ color: MALVA, fontFamily: fontBody }}>
                    Peso objetivo:{" "}
                    <b style={{ color: TINTA }}>{String(obj.kg).replace(".", ",")} kg</b>
                    {dieta?.enBajada && <span style={{ color: ROSA }}> · ración de bajada</span>}
                  </p>

                  {/* Fichas de antes de que el objetivo se guardara, y las
                      que traían uno que ya no se parece al perro. Se enseña
                      el número y se pide confirmarlo en vez de aplicarlo a
                      la callada: de él salen las kcal. */}
                  {hayQueConfirmar && (
                    <div className="mt-2">
                      <p className="text-[11px] leading-snug mb-2" style={{ color: MALVA, fontFamily: fontBody }}>
                        {obj.esViejo
                          ? `El objetivo que había guardado ya no cuadra con lo que pesa hoy, así que está recalculado con «${CONDICIONES[perfil?.condicionIdx ?? 2].label}».`
                          : `Sale de su peso de hoy y de «${CONDICIONES[perfil?.condicionIdx ?? 2].label}». Confírmalo y dejará de moverse cada vez que lo peses.`}
                      </p>
                      <button
                        aria-label="Confirmar el peso objetivo"
                        onClick={() => {
                          set("pesoObjetivoKg", obj.kg);
                          setObjetivoConfirmado(true);
                          if (usuario && perfil?._id) {
                            const ficha = { ...perfil, pesoObjetivoKg: obj.kg, id: perfil._id };
                            const d = datosDeUnPerro(ficha);
                            guardarPerro(usuario.id, ficha,
                              { etapa: d.etapaCalculada, pesoAdultoEsperado: d.pesoAdultoEsperado })
                              .then((g) => { if (g?.id) onPerroGuardado(g); })
                              .catch((err) => capturarError(err, { donde: "confirmarObjetivo" }));
                          }
                        }}
                        className="px-3 py-1.5 rounded-lg text-xs"
                        style={{ background: VIOLETA, color: "#FFFFFF", fontFamily: fontBody, fontWeight: 700 }}>
                        Confirmar {String(obj.kg).replace(".", ",")} kg
                      </button>
                    </div>
                  )}

                  {/* ⚠️ EL AVISO DE QUE SE ACERCA. Al cruzar el objetivo la
                      ración pega un salto grande -- de dieta de bajada a
                      mantenimiento -- y lo que toca en ese momento no es que
                      le cambie la comida sin más, es volver a mirar al perro.
                      Por eso se avisa ANTES de cruzarlo, no después. */}
                  {dieta?.cerca && !hayQueConfirmar && (
                    <p className="text-[11px] mt-2 leading-snug px-2 py-2 rounded-lg"
                       style={{ background: "#FFF7E8", border: "1px solid #F5DFA8", color: "#7A5C00", fontFamily: fontBody }}>
                      {nombrePerro} está cerca de su peso objetivo. Cuando llegue, mira otra vez
                      cómo lo ves: la ración pasa de bajada a mantenimiento y sube bastante de golpe.
                    </p>
                  )}
                </div>
              );
            })()}
          </div>
          <div className="flex gap-2 mb-2">
            <input type="number" inputMode="decimal" value={nuevoPeso} onChange={(e) => setNuevoPeso(e.target.value)} placeholder="ej. 18.5"
              className="flex-1 text-lg py-3 px-4 rounded-xl outline-none" style={{ background: "#FFFFFF", border: "1.5px solid #E3DAF0", color: TINTA, fontFamily: fontDisplay }} />
            <button onClick={() => {
              if (Number(nuevoPeso) > 0) {
                set("pesoActual", nuevoPeso);
                setNuevoPeso("");
                setAvisoPesoActualizado(true);
                setPreguntarCondicion(true);
                // ⚠️ CORREGIDO — CASO REAL: pesar al perro aquí decía
                // "✅ Peso actualizado" pero NO lo guardaba nunca. Este
                // `usuario` no existía en esta pantalla: VistaMenus no lo
                // recibía. Al pulsar Guardar, las tres líneas de antes ya
                // habían corrido (por eso salía el ✅ y cambiaba el peso
                // en pantalla) y justo aquí reventaba con un
                // ReferenceError — el peso se perdía al recargar y el
                // error se lo comía React. Ahora `usuario` llega como
                // prop desde arriba.
                if (usuario && perfil._id) {
                  // ⚠️ etapa y peso adulto se recalculan con el peso NUEVO:
                  // guardar el peso nuevo con la etapa vieja dejaría la
                  // ficha contradiciéndose a sí misma.
                  guardarPerro(usuario.id, { ...perfil, pesoActual: nuevoPeso, id: perfil._id },
                    (() => { const d = datosDeUnPerro({ ...perfil, pesoActual: nuevoPeso });
                             return { etapa: d.etapaCalculada, pesoAdultoEsperado: d.pesoAdultoEsperado }; })())
                    .then((perroGuardado) => { if (perroGuardado?.id) onPerroGuardado(perroGuardado); })
                    .catch(console.error);
                }
              }
            }}
              className="px-5 rounded-xl" style={{ background: ROSA, color: "#FFFFFF", fontFamily: fontBody, fontWeight: 700 }}>Guardar</button>
          </div>
          {/* ⚠️ LA PREGUNTA DEL 25 DE AGOSTO. De la condición salen las kcal:
              con «Rellenito» se calcula una dieta de bajada. Si el peso
              cambia y la condición no, seguimos dándole de comer como al
              perro de hace tres meses. Por eso al pesar se vuelve a
              preguntar, con la respuesta anterior ya marcada.

              Cualquier respuesta REHACE el peso objetivo con el peso que
              se acaba de meter -- también si eliges la misma de antes,
              porque "sigue rellenita, ahora con 6,2 kg" es información
              nueva, no una repetición. Lo que no se puede es que el
              objetivo se mueva sin que nadie haya mirado al perro: eso era
              el fallo. */}
          {preguntarCondicion && (
            <div className="rounded-xl p-3 mb-2" style={{ background: "#FFFFFF", border: "1.5px solid #D8CFEC" }}>
              <p className="text-xs mb-1" style={{ color: TINTA, fontFamily: fontBody, fontWeight: 700 }}>
                ¿Cómo ves a {nombrePerro} ahora?
              </p>
              <p className="text-[11px] mb-2 leading-snug" style={{ color: MALVA, fontFamily: fontBody }}>
                De esto salen las kcal, no solo del peso. Si ya no le sobra, hay que decirlo
                aquí o le seguiremos dando una ración de bajada.
              </p>
              {/* ⚠️ EN MODO VETERINARIO, LA MISMA PREGUNTA EN BCS (29 agosto).
                  Pedido expreso: sus pantallas no van en el idioma de
                  "Rellenito". Y no es solo tono: si aquí se contestara con
                  los cinco escalones, un paciente con BCS 6 apuntado en
                  consulta se quedaría con un 7 al pesarlo, sin que nadie
                  hubiera cambiado de opinión sobre el perro. */}
              {enModoProfesional && (
                <div className="grid grid-cols-9 gap-1">
                  {ESCALA_BCS.map((b) => {
                    const puesta = bcsVigente(perfil) === b.n;
                    return (
                      <button key={b.n}
                        aria-label={`Ahora está: BCS ${b.n}`}
                        title={`${b.n} · ${b.titulo}`}
                        onClick={() => {
                          const peso = Number(perfil?.pesoActual);
                          const objetivo = pesoIdealDesdeBcs(peso, b.n);
                          set("bcs", b.n);
                          set("condicionIdx", condicionDesdeBcs(b.n));
                          set("condicionTocado", true);
                          set("pesoObjetivoKg", objetivo);
                          setPreguntarCondicion(false);
                          setObjetivoConfirmado(true);
                          if (usuario && perfil?._id) {
                            const ficha = { ...perfil, bcs: b.n, condicionIdx: condicionDesdeBcs(b.n),
                                            pesoObjetivoKg: objetivo, id: perfil._id };
                            const d = datosDeUnPerro(ficha);
                            guardarPerro(usuario.id, ficha,
                              { etapa: d.etapaCalculada, pesoAdultoEsperado: d.pesoAdultoEsperado })
                              .then((g) => { if (g?.id) onPerroGuardado(g); })
                              .catch((err) => capturarError(err, { donde: "bcsAlPesar" }));
                          }
                        }}
                        className="py-2 rounded-lg text-center text-sm"
                        style={{ background: puesta ? VIOLETA : PAPEL,
                                 border: `1.5px solid ${puesta ? VIOLETA : "#E3DAF0"}`,
                                 color: puesta ? "#FFFFFF" : TINTA, fontFamily: fontBody,
                                 cursor: "pointer" }}>
                        {b.n}
                      </button>
                    );
                  })}
                </div>
              )}
              <div className="flex flex-col gap-1.5" hidden={enModoProfesional}>
                {CONDICIONES.map((c, idx) => {
                  const puesta = idx === perfil?.condicionIdx;
                  return (
                    <button key={c.label}
                      aria-label={`Ahora está: ${c.label}`}
                      onClick={() => {
                        const peso = Number(perfil?.pesoActual);
                        const objetivo = pesoIdealDesdeCondicion(peso, idx);
                        set("condicionIdx", idx);
                        // El BCS equivalente, por lo mismo que en la ficha:
                        // dos campos que dicen la condición y solo uno
                        // actualizado es una ficha que se contradice.
                        set("bcs", bcsDesdeCondicion(idx));
                        set("condicionTocado", true);
                        set("pesoObjetivoKg", objetivo);
                        setPreguntarCondicion(false);
                        setObjetivoConfirmado(true);
                        if (usuario && perfil?._id) {
                          const ficha = { ...perfil, condicionIdx: idx, bcs: bcsDesdeCondicion(idx),
                                          pesoObjetivoKg: objetivo, id: perfil._id };
                          const d = datosDeUnPerro(ficha);
                          guardarPerro(usuario.id, ficha,
                            { etapa: d.etapaCalculada, pesoAdultoEsperado: d.pesoAdultoEsperado })
                            .then((g) => { if (g?.id) onPerroGuardado(g); })
                            .catch((err) => capturarError(err, { donde: "condicionAlPesar" }));
                        }
                      }}
                      className="text-left px-3 py-2 rounded-lg text-sm flex items-center justify-between"
                      style={{
                        background: puesta ? "#F0EBF8" : PAPEL,
                        border: `1.5px solid ${puesta ? VIOLETA : "transparent"}`,
                        color: TINTA, fontFamily: fontBody,
                      }}>
                      <span>{c.label}</span>
                      <span className="text-[10px] text-right ml-2" style={{ color: MALVA, fontFamily: fontBody }}>
                        {c.detalle}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {avisoPesoActualizado ? (
            <div className="rounded-xl p-3 mb-2" style={{ background: "#F0EBF8", border: "1.5px solid #D8CFEC" }}>
              <p className="text-xs mb-2" style={{ color: TINTA, fontFamily: fontBody }}>
                ✅ Peso actualizado. Para que el menú refleje este cambio, regenera con los mismos ingredientes.
              </p>
              <button
                onClick={() => {
                  // ⚠️ CASO REAL ENCONTRADO (25 agosto, por Sentry):
                  // "ReferenceError: setMenuReal is not defined", sin
                  // manejar. Aquí había un `setMenuReal(null)` -- pero
                  // `menuReal` vive en el componente de fuera, no en éste.
                  // Pesabas al perro, salía el ✅, pulsabas "Regenerar
                  // menú adaptado al nuevo peso" y reventaba: el menú no
                  // se regeneraba nunca y en pantalla no pasaba nada.
                  //
                  // Es EL MISMO fallo que el de `usuario` doce líneas más
                  // arriba, en esta misma pantalla: JavaScript no avisa de
                  // un nombre que no existe hasta que se ejecuta esa línea,
                  // y esa línea solo se ejecuta pulsando ese botón.
                  //
                  // Vaciar el menú es cosa de quien lo tiene: lo hace
                  // `onRegenerarConAlimentos` en el componente de fuera.
                  // ⚠️ LOS ALIMENTOS NO SE SACAN DE AQUÍ (25 agosto). Se
                  // intentó (`menus.map(...)`) y estaba mal: abriendo
                  // Evolución desde el panel, esta vista recibe
                  // MENUS_EJEMPLO de relleno, así que se habrían mandado
                  // los alimentos del EJEMPLO como si fueran los del
                  // perro. Los menús de verdad los tiene el componente de
                  // fuera; que los lea de ahí.
                  setAvisoPesoActualizado(false);
                  setSeccionActiva(null);
                  onRegenerarConAlimentos();
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
          <div className="flex items-center justify-between gap-3 mb-6">
            <div className="flex items-center gap-3 min-w-0">
            <BotonMenu onClick={() => onAbrirPanel?.()} color={VIOLETA} className="p-1" />
            </div>
            {/* ⚠️ CORREGIDO (24 agosto) — CASO REAL: "se ve raro lo del
                engranaje y el perfil en varias pantallas, se ve como arriba
                centrado, debería estar siempre en el mismo sitio".
                Cierto. En toda la app la regla es hamburguesa IZQUIERDA y
                burbuja DERECHA, con `justify-between` entre las dos. Al
                meter aquí el "← Volver" como TERCER hijo, el reparto dejaba
                la burbuja en medio. Ahora el volver va agrupado con la
                hamburguesa a la izquierda y la burbuja vuelve a su esquina,
                igual que en las demás pantallas. */}
            {burbujaClara}
          </div>
          <p className="text-2xl mb-4" style={{ color: TINTA, fontFamily: fontDisplay }}>Mis menús</p>
          <div className="flex flex-col gap-2">
            {menus.map((m, i) => (
              /* ⚠️ REHECHO (26 agosto) — TRES PUNTOS EN CADA MENÚ DE LA
                 SEMANA. Pedido expreso: "se tiene que poder borrar y editar
                 desde dentro y desde fuera; cada menú individual de la
                 semana y el global".
                 Era un solo <button> con toda la fila dentro, así que no
                 cabía otro botón: un botón dentro de otro no es HTML válido
                 y el navegador lo desmonta. Ahora la fila es un div con dos
                 botones hermanos, igual que en la lista de "Mis menús" de
                 fuera. */
              <div key={m.id} className="flex items-center gap-2 p-4 rounded-2xl"
                   style={{ background: "#FFFFFF", border: "1.5px solid #E3DAF0" }}>
                <button onClick={() => { setTabActiva(m.id); setSeccionActiva(null); }}
                        className="flex items-center gap-3 flex-1 min-w-0 text-left">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: VIOLETA }}>
                    <ClipboardList size={16} style={{ color: ROSA }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="truncate" style={{ color: TINTA, fontFamily: fontDisplay, fontSize: 16 }}>{m.nombre} · {m.kcal}kcal</p>
                    <p className="text-[10px] tracking-[0.1em] uppercase mt-0.5" style={{ color: MALVA, fontFamily: "monospace" }}>
                      {ETIQUETA_MODO[modo] || "AUTOMÁTICO"}
                    </p>
                  </div>
                  <ChevronRight size={16} style={{ color: "#C9BEDD" }} />
                </button>
                {/* Solo si el menú está GUARDADO: renombrar uno que todavía
                    no se ha guardado no tendría dónde escribirse. */}
                {onAccionesDeMenu && (
                  <button onClick={() => onAccionesDeMenu(i)}
                          aria-label={`Opciones de ${m.nombre}`}
                          className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center"
                          style={{ background: PAPEL, border: "none" }}>
                    <MoreVertical size={16} style={{ color: MALVA }} />
                  </button>
                )}
              </div>
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
        </div>
      )}

      {seccionActiva === "porque" && (
        <div className="fixed inset-0 z-50 flex flex-col px-6 pt-10 pb-8 overflow-y-auto cnl-pantalla-scroll" style={{ background: PAPEL }}>
          <div className="flex items-center justify-between gap-3 mb-6">
            <div className="flex items-center gap-3 min-w-0">
            <BotonMenu onClick={() => onAbrirPanel?.()} color={VIOLETA} className="p-1" />
            </div>
            {/* ⚠️ CORREGIDO (24 agosto) — CASO REAL: "se ve raro lo del
                engranaje y el perfil en varias pantallas, se ve como arriba
                centrado, debería estar siempre en el mismo sitio".
                Cierto. En toda la app la regla es hamburguesa IZQUIERDA y
                burbuja DERECHA, con `justify-between` entre las dos. Al
                meter aquí el "← Volver" como TERCER hijo, el reparto dejaba
                la burbuja en medio. Ahora el volver va agrupado con la
                hamburguesa a la izquierda y la burbuja vuelve a su esquina,
                igual que en las demás pantallas. */}
            {burbujaClara}
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
          <div className="flex items-center justify-between gap-3 mb-6">
            <div className="flex items-center gap-3 min-w-0">
              <BotonMenu onClick={() => onAbrirPanel?.()} color={VIOLETA} className="p-1" />
            </div>
            {burbujaClara}
          </div>
          <PremiumGate
            premium={premium}
            onSuscribir={() => { setSeccionActiva(null); onMostrarSuscripcion(); }}
            onCerrar={() => setSeccionActiva(null)}
            esDemo={PAYWALL_ES_DEMO}
            titulo="Analizador nutricional"
            descripcion="Analiza en detalle los nutrientes de la dieta actual de tu perro."
          >
          {/* ⚠️ CORREGIDO — aquí había un ternario a medio deshacer: un
              bloque suelto con el título repetido y un `) : (` sin su
              `{condicion ? (` delante. JSX no se queja de eso: lo trata
              como texto, así que en la pantalla salía literalmente
              ") : (" debajo del título, y el título dos veces. */}
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
                      aria-label={`${cat.nombre}: añadir alimento`}
                      className="px-3 py-2 rounded-lg text-sm" style={{ background: PAPEL, color: MALVA, fontFamily: fontBody, border: "1.5px dashed #C9BEDD" }}>
                      {itemsDeEstaCategoria.length > 0 ? "+ Añadir otro" : "+ Añadir alimento"}
                    </button>
                  )}
                  {abierto && !abierto.especie && (
                    <div className="rounded-xl p-3" style={{ background: PAPEL }}>
                      <p className="text-xs mb-2" style={{ color: MALVA, fontFamily: "monospace" }}>ESPECIE</p>
                      <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto">
                        <ListaDeEspecies
                          porEspecie={catsParaEsta[cat.nombre]}
                          onElegir={(alimento) => {
                            setDietaAnalizar((prev) => [...prev, { categoria: cat.nombre, alimento, gramos: "" }]);
                            setAbiertoAnalizar(null);
                          }}
                          onAbrir={(especie) => setAbiertoAnalizar({ categoria: cat.nombre, especie })}
                        />
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
          <div className="flex items-center justify-between gap-3 mb-6">
            <div className="flex items-center gap-3 min-w-0">
              <BotonMenu onClick={() => onAbrirPanel?.()} color={VIOLETA} className="p-1" />
              <p className="text-xs" style={{ color: MALVA, fontFamily: fontBody }}>
                Guardado
              </p>
            </div>
            {burbujaClara}
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
                      {/* ⚠️ EL NOMBRE, no el número (26 agosto). Pedido
                          expreso: "donde aparezcan los nombres de los menús
                          que pone menú uno o menú tres días, ahí tiene que
                          aparecer el nombre de cada menú si lo tiene".
                          `m.nombre` ya cae al número cuando no hay nombre
                          guardado (ver `respuestaApiAMenu`), así que esto
                          sigue diciendo "Menú 2" en los que no se han
                          renombrado. */}
                      {menus.length > 1 ? m.nombre : (m.nombre || "Menú")}
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

const ETAPA_LABEL = {
  cachorro_joven: "Cachorro muy joven",
  cachorro_crecimiento: "Cachorro en crecimiento",
  adulto: "Adulto",
  senior: "Senior",
};

/**
 * Todo lo que se deduce de la ficha de un perro: su edad, en qué etapa
 * está, cuántas kcal necesita al día y qué no puede comer.
 *
 * Está a nivel de módulo, y no dentro del componente, porque hace falta
 * para perros que NO son el que se está mirando: al hacer los menús de
 * varios perros de la misma casa hay que mandarle al servidor las kcal y
 * la etapa de cada uno, y los demás solo existen como filas de Supabase.
 *
 * Es una función pura: mismos datos, mismo resultado, sin tocar nada.
 */
// Convierte la fila de un perro tal y como viene de Supabase al formato
// de perfil que usa la app.
//
// ⚠️ MOVIDO FUERA DEL COMPONENTE (21 agosto) — hacía falta también para
// los OTROS perros de la casa, no solo para el que se está mirando: al
// hacer sus menús a la vez hay que sacar de cada fila sus kcal y su
// etapa, y eso empieza por convertirla.
function perfilDesdeSupabase(p) {
  if (!p) return null;
  const fechaNac = p.fecha_nacimiento ? new Date(p.fecha_nacimiento) : null;
  return {
    _id: p.id,
    nombre: p.nombre || "",
    pesoActual: p.peso_actual ? String(p.peso_actual) : "",
    condicionIdx: p.condicion_idx ?? 2,
    condicionTocado: true,
    // El BCS exacto, cuando lo puso un veterinario. Puede no venir: las
    // fichas de un dueño no lo tienen, y ahí manda `condicion_idx`.
    bcs: p.bcs ?? null,
    tutorNombre: p.tutor_nombre || "",
    tutorContacto: p.tutor_contacto || "",
    // Puede no venir: las fichas de antes del 25 de agosto no lo tienen, y
    // tampoco viene si la columna aún no existe en Supabase. En los dos
    // casos `objetivoVigente` lo calcula al vuelo y Evolución pide
    // confirmarlo.
    pesoObjetivoKg: p.peso_objetivo_kg ?? null,
    actividadIdx: p.actividad === "alta" ? 2 : p.actividad === "baja" ? 0 : 1,
    actividadTocado: true,
    esterilizado: p.castrado ? "si" : "no",
    alergiaSi: p.alergia_si,
    alergias: p.alergias || [],
    otrosEvitarSi: p.otros_evitar_si,
    otrosEvitar: p.otros_evitar || [],
    patologiaSi: p.patologia_si,
    patologias: p.patologias || [],
    categoriasExcluidasSi: p.categorias_excluidas_si,
    categoriasExcluidas: p.categorias_excluidas || [],
    dia: fechaNac ? fechaNac.getDate() : 15,
    mesIdx: fechaNac ? fechaNac.getMonth() : 1,
    // ⚠️ CORREGIDO — aquí había un 2024 en duro: cualquier perro sin
    // fecha de nacimiento guardada aparecía nacido en 2024, dijera lo
    // que dijera el calendario. Ahora es el año de verdad.
    anio: fechaNac ? fechaNac.getFullYear() : new Date().getFullYear(),
    tamano: p.tamano,
    // ⚠️ CORREGIDO — CASO REAL: "la raza sale con texto raro". No era
    // un problema de codificación: se estaba guardando el OBJETO
    // entero de la raza ({nombre, tamano, pesoMin, pesoMax,
    // pesoMedio}) en vez de sólo su nombre, y aquí se volvía a
    // envolver -- así que perfil.raza.nombre acababa siendo otro
    // objeto, que al pintarse salía como texto ilegible.
    // Ahora se lee el nombre venga como venga (texto suelto, objeto,
    // o el JSON que quedó guardado en las filas viejas) y se
    // recupera la raza completa del catálogo, para no perder el
    // tamaño y el peso de referencia.
    raza: razaDesdeNombre(nombreDeRaza(p.raza)),
    sexo: p.sexo || null,
    // ⚠️ CORREGIDO (21 agosto) — estos dos volvían SIEMPRE en null, y el
    // tamaño no es decorativo: para un mestizo (sin raza) es de donde
    // sale su peso adulto esperado, y de ahí la etapa y las kcal. Ver
    // datosDeUnPerro: usa PESO_ADULTO_POR_TAMANO[perfil.tamanoManual].
    // Con null caía al valor por defecto de 25 kg, fuera el perro un Toy
    // de 3 kg o un Gigante de 55 -- en cada recarga, sin avisar.
    //
    // Solo se recupera como "manual" si NO hay raza: con raza, el tamaño
    // sale de ella y poner las dos cosas se contradiría.
    modoRaza: razaDesdeNombre(nombreDeRaza(p.raza)) ? "raza" : (p.tamano ? "sin_raza" : null),
    tamanoManual: razaDesdeNombre(nombreDeRaza(p.raza)) ? null : (p.tamano || null),
  };
}


function datosDeUnPerro(perfil) {
  const edad = calcularEdad(perfil.dia, perfil.mesIdx, perfil.anio);
  const especiesExcluidas = especiesExcluidasDePerfil(perfil);
  const alimentosEvitados = alimentosEvitadosDePerfil(perfil);

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
  const etapaCalculada = determinarEtapa(edad, pesoAdultoEsperado);
  // ⚠️ `objetivoVigente` y no `pesoIdealDesdeCondicion` (25 agosto): el
  // objetivo se fija en kilos al marcar la condición y deja de moverse. Ver
  // el comentario largo de esa función -- antes bajaba con el perro y la
  // dieta no podía terminar nunca. Este es el ÚNICO sitio donde se calcula
  // el DER de un perro, así que con cambiarlo aquí cambia en toda la app.
  const objetivo = objetivoVigente(perfil, etapaCalculada);
  const derReal = calcularDER(Number(perfil.pesoActual), etapaCalculada, perfil.actividadIdx,
      perfil.esterilizado, {
        pesoAdultoKg: pesoAdultoEsperado,
        pesoIdealKg: objetivo.kg,
        raza: perfil.raza?.nombre,
        machoEntero: perfil.sexo === "macho" && perfil.esterilizado !== "si",
      });

  return {
    edad, especiesExcluidas, alimentosEvitados, pesoAdultoEsperado,
    etapaCalculada, etapaLabel: ETAPA_LABEL[etapaCalculada] || "Adulto", derReal,
    objetivo, dieta: comoVaLaDieta(perfil, etapaCalculada),
  };
}

/**
 * La ficha de un perro en el idioma que habla la API. Mismo cuerpo que
 * manda el generador de un solo perro -- por eso se construye aquí una
 * vez y no en cada sitio que lo necesita.
 */
function cuerpoApiDeUnPerro(perfil) {
  const d = datosDeUnPerro(perfil);
  return {
    modo: "automatico",
    nombres_alimentos: [],
    forzar_presencia: [],
    restringir_especie: null,
    der_objetivo: d.derReal,
    etapa_requisitos: ETAPA_A_SUFIJO_API[d.etapaCalculada] || "Adulto",
    especies_excluidas: Array.from(d.especiesExcluidas),
    evitar_especies: [],
    nombres_excluidos: Array.from(d.alimentosEvitados),
    peso_perro_kg: perfil?.pesoActual ? Number(perfil.pesoActual) : null,
    patologias: perfil?.patologias || [],
    categorias_excluidas: perfil?.categoriasExcluidas || [],
    peso_adulto_esperado_kg: d.pesoAdultoEsperado || null,
    peso_objetivo_kg: d.objetivo?.kg || null,
    bcs: bcsVigente(perfil),
    tamano: perfil?.raza?.tamano || perfil?.tamanoManual || null,
  };
}

// ─── LAS DOS PIEZAS DE LA FICHA CLÍNICA, FUERA DE LA PANTALLA ───────────────
//
// ⚠️ CASO REAL ENCONTRADO POR LA USUARIA EN EL MÓVIL (29 agosto): "cuando
// pide el nombre del paciente, cada vez que selecciono una letra se quita el
// teclado".
//
// Estaban definidas DENTRO del componente grande. Eso las convierte en un
// tipo de componente NUEVO en cada render: React no puede saber que
// `<Bloque>` de esta vuelta es el mismo `<Bloque>` de la anterior, así que
// desmonta todo lo que hay dentro y lo vuelve a montar. El `<input>` deja de
// ser el mismo nodo del DOM, pierde el foco, y en un móvil eso significa que
// el teclado se cierra -- a cada letra.
//
// En un ordenador casi no se nota (el cursor parpadea y sigues escribiendo);
// en un teléfono hace la pantalla inservible. Es la razón por la que una
// función que devuelve JSX no puede vivir dentro de otro componente si algo
// de dentro guarda estado -- y un campo de texto con el foco lo guarda.
function BloqueFicha({ titulo, children }) {
  return (
    <div className="rounded-2xl px-4 py-4 mb-3" style={{ background: "#FFFFFF", border: "1.5px solid #E3DAF0" }}>
      <p className="text-[11px] tracking-[0.14em] uppercase mb-3" style={{ color: MALVA, fontFamily: "monospace" }}>
        {titulo}
      </p>
      {children}
    </div>
  );
}

function OpcionesFicha({ opciones, valor, onElegir, columnas = 2 }) {
  return (
    <div className={`grid gap-2 grid-cols-${columnas}`}>
      {opciones.map((op) => {
        const activo = valor === op.key;
        return (
          <button key={op.key} onClick={() => onElegir(op.key)}
            className="py-2.5 rounded-xl text-center"
            style={{ background: activo ? VIOLETA : PAPEL,
                     border: `1.5px solid ${activo ? VIOLETA : "#E3DAF0"}`,
                     color: activo ? "#FFFFFF" : TINTA, fontFamily: fontBody,
                     fontSize: 14, cursor: "pointer" }}>
            {op.label}
          </button>
        );
      })}
    </div>
  );
}


function RawkuOnboardingInterna({
  usuario,
  perroInicial,
  perros = [],
  // Qué perros de la cuenta son pacientes. Por defecto null -- "no se sabe"
  // --, que hace que no se reparta nada y se vean todos. Ver `pacientes.js`.
  accesos = null,
  onCambiarDePerro = () => {},
  // Dónde arrancar tras un cambio de perro CON INTENCIÓN. Hoy solo
  // "generador_solo": el generador, con el menú pedido para este perro y no
  // para la casa. Ver el comentario de `arranqueTrasCambio`.
  arrancarEn = null,
  onAnadirPerro = () => {},
  onPerroGuardado = () => {},
  onPerroEliminado = () => {},
  onCrearCuenta = () => {},
  onDescartarLocal = () => {},
}) {
  // Sin cuenta: `usuario` existe (USUARIO_LOCAL) para que todos los
  // `usuario && ...` de esta pantalla sigan valiendo, pero no hay sesión
  // de Supabase detrás. Lo que cambia es dónde se guardan las cosas y
  // qué se le ofrece: crear cuenta en vez de cerrar sesión.
  const sinCuenta = Boolean(usuario?.local);
  // ─── AUTH — recibido como prop desde AuthGate ─────────────
  // ⚠️ AÑADIDO — interruptor único del muro de pago.
  //
  // Ver PAYWALL_MODO arriba: en "demo" manda el interruptor local, en "on"
  // manda el plan guardado en Supabase, y en "off" todo está abierto.
  const [premiumReal, setPremiumReal] = useState(PAYWALL_ES_DEMO ? leerPremiumDemo() : false);
  const premium = PAYWALL_ACTIVO ? premiumReal : true;

  // Activar/desactivar el Premium de mentira. En modo demo se puede
  // apagar otra vez, que es lo que hace falta para comprobar cómo ve la
  // app alguien que NO es Premium.
  const cambiarPremiumDemo = (valor) => {
    guardarPremiumDemo(valor);
    setPremiumReal(valor);
    setMostrarSuscripcion(false);
  };
  const [mostrarSuscripcion, setMostrarSuscripcion] = useState(false);

  // ─── EL ROL PROFESIONAL Y EL INTERRUPTOR DE MODO ───────────────────────
  //
  // Son DOS cosas distintas y hay que no confundirlas:
  //   `acreditado`       — lo que dice Supabase. No se puede cambiar desde
  //                        aquí: lo enciende una persona mirando el número
  //                        de colegiado (ver el disparador en la migración).
  //   `modoProfesional`  — en cuál de sus dos modos está mirando AHORA.
  //
  // Un veterinario acreditado con perro propio usa Rawku para las dos cosas:
  // en modo tutor es un usuario normal con su perro, su cesta y su
  // suscripción; en modo profesional ve a sus pacientes. El interruptor
  // cambia la VISTA, nunca la cuenta.
  //
  // El modo se guarda en este navegador a propósito y no en Supabase: es de
  // este móvil y de este rato, como la cesta de la compra.
  const [acreditado, setAcreditado] = useState(false);
  // Nombre y número de colegiado de quien firma. Null mientras no se sabe.
  const [perfilProfesional, setPerfilProfesional] = useState(null);
  // El historial de pautas firmadas del paciente que se está mirando. Es una
  // LISTA de documentos, no un documento que se va pisando: una pauta
  // firmada no se edita, se firma otra y la anterior se queda con su fecha.
  const [pautasFirmadas, setPautasFirmadas] = useState([]);

  // ⚠️ CORREGIDO (28 agosto) — UN VETERINARIO ACREDITADO ENTRA EN SU MODO.
  //
  // Antes esto empezaba apagado siempre, así que alguien a quien acabábamos
  // de acreditar entraba y veía la app de un dueño: lo suyo seguía
  // escondido detrás de saber que existe un interruptor en Ajustes. Es el
  // mismo fallo que tenía la pantalla de registro, un paso más adentro.
  //
  // Por eso lo que se guarda es la ELECCIÓN, no el estado: `null` significa
  // "todavía no ha dicho nada", y entonces manda su acreditación. En cuanto
  // toca el interruptor se guarda lo que quiera y se respeta -- un
  // veterinario con perro propio puede quedarse en modo tutor y no se le
  // vuelve a mover.
  //
  // ⚠️ LA REGLA VIVE EN `modo.js` (29 agosto). Estaba escrita aquí dentro, y
  // en cuanto hizo falta en un segundo sitio -- AuthGate, para decidir con
  // QUÉ PERRO se abre la app -- había que copiarla. Una regla copiada se
  // separa: es lo mismo que le pasa al DER entre los dos repos, con la
  // diferencia de que aquí ni siquiera habría dos archivos que comparar.
  const [eleccionModo, setEleccionModo] = useState(leerEleccionModo);
  const enModoProfesional = calcularModoProfesional(acreditado, eleccionModo);
  const cambiarModoProfesional = (valor) => {
    setEleccionModo(valor);
    guardarEleccionModo(valor);
  };
  const [cargandoPerfil] = useState(false); // ya no necesario, carga en AuthGate

  useEffect(() => {
    if (usuario) {
      // En demo NO se pregunta a Supabase: manda el interruptor local.
      if (PAYWALL_ACTIVO && !PAYWALL_ES_DEMO) {
        esPremium(usuario.id).then(setPremiumReal).catch(() => setPremiumReal(false));
      }
      // Y si la cuenta está acreditada como profesional. Ante cualquier
      // fallo, NO: preferimos no enseñar el modo a enseñarlo a quien no
      // le corresponde.
      esProfesional(usuario.id).then(setAcreditado).catch(() => setAcreditado(false));
      // Y quién es, para poder firmar con su nombre y su número. Se lee de
      // `profiles` una vez y se COPIA en cada pauta al firmarla: un
      // documento firmado no puede cambiar porque su autor edite su ficha.
      getPerfil(usuario.id)
        .then((p) => setPerfilProfesional(p ? { nombre: p.nombre || "",
                                                num_colegiado: p.num_colegiado || "" } : null))
        .catch(() => setPerfilProfesional(null));
    }
    const params = new URLSearchParams(window.location.search);
    if (params.get('pago') === 'ok') {
      setPremiumReal(true);
      window.history.replaceState({}, '', '/');
    }
  }, [usuario]);

  // ─── RESTO DE ESTADOS — inicializados con perroInicial si existe ──
  //
  // ⚠️ CORREGIDO — CASO REAL: "el perfil se carga desde Supabase (los
  // datos SÍ llegan) pero la app no navega al generador, se queda en el
  // onboarding". Causa real encontrada: este componente decide qué
  // pintar mirando PRIMERO `paso` y sólo DESPUÉS `fase`:
  //
  //     if (paso === 1) { ...asistente, pantalla 1 de 6... }
  //     ...
  //     if (fase === "onboarding") { ...resumen del perfil... }
  //     if (fase === "generador" && pantalla === "elegir") { ...generador... }
  //
  // `fase` SÍ se inicializaba con perroInicial, pero `paso` se quedaba
  // siempre en 1. Resultado: al volver con un perro ya guardado,
  // fase valía "generador" (correcto) pero paso valía 1, y como el
  // `if (paso === 1)` va antes, ganaba él y se pintaba el asistente
  // desde cero -- la pantalla del generador era literalmente
  // inalcanzable. No faltaba ningún dato: el perro estaba cargado,
  // simplemente nunca se llegaba a mirar `fase`.
  //
  // Terminar el onboarding a mano deja `paso` en TOTAL_PASOS + 1 (ver
  // `siguiente()`), así que ése es el valor que significa "asistente ya
  // completado". Ahora los tres estados que describen "por dónde va
  // esta usuaria" (paso, fase y pantalla) se derivan de UNA sola
  // fuente de verdad, para que no puedan volver a contradecirse.
  const yaTienePerroGuardado = Boolean(perroInicial);

  const [paso, setPaso] = useState(yaTienePerroGuardado ? TOTAL_PASOS + 1 : 1);

  // ⚠️ AÑADIDO (29 agosto) — LA PUERTA DEL VETERINARIO.
  //
  // CASO REAL, encontrado por la usuaria entrando con la cuenta de pruebas
  // acreditada: "he entrado como veterinario y te manda a la misma pantalla
  // primera que si entras como usuario". Era verdad. Un veterinario sin
  // pacientes caía en el asistente de siempre, que le preguntaba por "tu
  // perro" -- y él no viene a apuntar a su perro, viene a dar de alta a un
  // paciente. Lo profesional que ya existe (la lista, la ficha clínica, el
  // interruptor) vivía todo un paso más adentro, así que la primera
  // pantalla no se distinguía en nada.
  //
  // Es una pantalla y no un cambio de rótulos porque lo que cambia es el
  // primer paso: dar de alta a alguien de fuera, no describir al de casa.
  const [puertaProfesionalPasada, setPuertaProfesionalPasada] = useState(false);

  // ─── LOS MENÚS DE TODOS SUS PACIENTES ─────────────────────────────────
  // ⚠️ PEDIDO EXPRESO (29 agosto): "en lo de los menús tiene que haber una
  // opción de filtros, rollo filtrar por paciente, filtrar por nombre del
  // dueño, filtrar por raza". La pantalla de un dueño enseña los menús DEL
  // perro en el que está, porque un dueño entra ya dentro de su perro. Un
  // veterinario no: entra a buscar, y lo que busca puede ser de cualquiera
  // de sus pacientes.
  const [menusDeTodos, setMenusDeTodos] = useState(null);   // null = sin cargar
  const [filtroMenus, setFiltroMenus] = useState("");

  // ⚠️ AÑADIDO (25 agosto) — PEDIDO EXPRESO, y la segunda vez con el matiz
  // que hacía falta: "cuando terminas de generar por primera vez el perfil
  // del perro sí que tienes que tener ese botón, pero cuando entras a
  // editar el perfil del perro desde el menú lateral ahí es donde no tiene
  // que estar".
  //
  // O sea que no depende de si el perro existe: depende de CÓMO HAS LLEGADO
  // a esta pantalla. Terminar el asistente y abrir la ficha para cambiar
  // algo pintan lo mismo (`fase === "onboarding"`), y son dos momentos
  // distintos: en el primero acabas de crear al perro y lo siguiente es
  // hacerle el menú; en el segundo has venido a corregir un dato y para
  // hacer menús ya está "Mis menús".
  //
  // Empieza en `true` cuando la app arranca con un perro ya guardado:
  // abrir la app no es terminar un asistente.
  const [editandoLaFicha, setEditandoLaFicha] = useState(yaTienePerroGuardado);
  const [perfil, setPerfil] = useState(() => {
    const base = {
      nombre: "", sexo: null, modoRaza: null, raza: null, tamanoManual: null,
      // ⚠️ CORREGIDO — mismo problema, con otro año en duro: en 2027
      // este 2026 habría envejecido igual de mal.
      dia: 15, mesIdx: 1, anio: new Date().getFullYear(),
      pesoActual: "",
      condicionIdx: 2,
      condicionTocado: true,
      bcs: null,
      tutorNombre: "",
      tutorContacto: "",
      pesoObjetivoKg: null,
      actividadIdx: 1,
      actividadTocado: true,
      esterilizado: null,
      alergiaSi: null,
      alergias: [],
      otrosEvitarSi: null,
      otrosEvitar: [],
      patologiaSi: null,
      patologias: [],
      categoriasExcluidasSi: null,
      categoriasExcluidas: [],
    };
    const perfilDeSupabase = perfilDesdeSupabase(perroInicial);
    return perfilDeSupabase ? { ...base, ...perfilDeSupabase } : base;
  });
  const [categoriaAbierta, setCategoriaAbierta] = useState(null);
  const nombreMostrar = perfil.nombre.trim() || (enModoProfesional ? "el paciente" : "tu perro");
  const [busqueda, setBusqueda] = useState("");

  // ⚠️ CAMBIADO — pedido expreso: al entrar, en vez de caer directamente
  // en el generador de menús, se aterriza en el PERFIL del perro (la
  // pantalla del resumen, con sus datos y sus kcal/día), y desde ahí se
  // va a donde haga falta. Entrar directamente a "¿cómo quieres hacer el
  // menú?" daba por hecho que lo único que quieres hacer es generar un
  // menú, y encima dejaba el perfil escondido.
  //
  // Ojo: `fase` arranca igual para todo el mundo; quien manda es `paso`.
  // Con perro guardado, paso vale TOTAL_PASOS + 1 y se pinta el resumen.
  // Sin perro, paso vale 1 y gana el asistente (el `if (paso === 1)` va
  // antes). Por eso aquí ya no hace falta mirar yaTienePerroGuardado.
  // ⚠️ `arrancarEn` (26 agosto): si se llegó aquí eligiendo "Solo para <otro
  // perro>", el componente acaba de montarse de cero con ESE perro y hay que
  // volver al generador. Sin esto, elegirlo te devolvía al perfil.
  const [fase, setFase] = useState(arrancarEn === "generador_solo" ? "generador" : "onboarding");

  // Deja constancia en Sentry de la decisión de arranque. Si algún día
  // vuelve a fallar la navegación, en el error se verá con qué datos se
  // montó la pantalla, sin tener que pedirle a nadie que abra la consola.
  useEffect(() => {
    migaDePan("Pantalla inicial decidida", {
      tienePerroGuardado: yaTienePerroGuardado,
      paso: yaTienePerroGuardado ? TOTAL_PASOS + 1 : 1,
      fase: "onboarding",
      pantallaQueSeVe: yaTienePerroGuardado ? "perfil del perro" : "asistente paso 1",
    });
    // Sólo al montar: es la decisión de arranque, no un seguimiento continuo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [menuReal, setMenuReal] = useState(null);
  // ⚠️ REHECHO (25 agosto) — UNA LISTA POR MENÚ. CASO REAL: "he lanzado el
  // regenerar menús cambiando el peso del perro desde evolución, pero me
  // los ha cambiado BASTANTE, el primero lo ha respetado un poco más pero
  // el segundo... prácticamente nada".
  //
  // Era UNA sola lista, sacada de `menus[0]`, y se mandaba igual para
  // todos: el menú 2 recibía los alimentos del 1. Medido con dos menús de
  // 6 alimentos: el 1 conservaba 3 de 6 y el 2 solo 2 de 6, que es
  // exactamente "el primero un poco más, el segundo prácticamente nada".
  const [alimentosAPreservarPorMenu, setAlimentosAPreservarPorMenu] = useState([]);
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
  // ⚠️ CORREGIDO (21 agosto) — MISMA FAMILIA QUE EL FALLO DE LA FICHA:
  // esto arrancaba SIEMPRE en null y la columna `dieta_actual` no se leía
  // en ningún sitio de la app. O sea: se preguntaba "¿qué come X ahora
  // mismo?" en cada visita, aunque ya lo hubieras contestado, y encima al
  // guardar la ficha se escribía null encima de lo que había.
  //
  // No es solo una molestia: de aquí sale si el perro necesita TRANSICIÓN
  // (pienso o comida cocinada -> BARF no se hace de golpe). Un perro que
  // venía de pienso perdía ese dato y con él el aviso de transición.
  const [dietaActual, setDietaActual] = useState(perroInicial?.dieta_actual ?? null);
  const [modo, setModo] = useState(null);
  const [pantalla, setPantalla] = useState("elegir");

  const [numMenus, setNumMenus] = useState(1);

  // ⚠️ AÑADIDO — los menús SÍ se guardaban en Supabase (guardarMenu), pero
  // nadie los leía nunca: getMenus estaba escrita en supabase.js y no se
  // llamaba desde ningún sitio. Es decir, entraban en la base de datos y
  // no volvían a salir: cerrabas la app y los perdías de vista para
  // siempre. Esto los recupera y los enseña.
  const [menusGuardados, setMenusGuardados] = useState([]);

  // ⚠️ AÑADIDO (24 agosto) — LA COMPRA, DESDE EL PANEL LATERAL.
  //
  // La lista de la compra no se mira al generar el menú: se mira EN LA
  // TIENDA, dos días después. Estando solo al final de "El menú" había que
  // volver a entrar en el menú para verla, y desde el perfil o desde Mis
  // menús no se llegaba.
  //
  // DECISIÓN SUYA: con varios perros enseña la de TODA LA CASA, sumando el
  // último menú guardado de cada uno. Es lo que de verdad se compra -- vas
  // a la tienda una vez, no una por perro -- y arriba se puede filtrar por
  // uno concreto si hace falta.
  //
  // Se carga AL ABRIRLA y no antes: son una petición por perro, y la
  // inmensa mayoría de las veces nadie la abre.
  const [compraAbierta, setCompraAbierta] = useState(false);
  const [compraDeQuien, setCompraDeQuien] = useState(null);   // null = toda la casa
  // ⚠️ AÑADIDO (24 agosto) — MARCAR LO QUE YA TIENES. Pedido expreso:
  // "molaría que tuviera casillas de marcaje, como para saber cuándo has
  // comprado algo o lo tienes y cuándo te falta, y luego un botón para
  // regenerar y dejarlo todo a cero".
  //
  // Se guarda en el NAVEGADOR, no en Supabase: es de este móvil y de esta
  // compra. Vas por el pasillo marcando, te llaman, cierras la app, vuelves
  // -- y lo marcado sigue ahí. Si viviera solo en memoria se perdería en el
  // primer despiste, que es justo cuando hace falta.
  const CLAVE_MARCADOS = "rawku.compra.marcados";
  const [marcados, setMarcados] = useState(() => {
    try {
      const guardado = window.localStorage.getItem(CLAVE_MARCADOS);
      return new Set(guardado ? JSON.parse(guardado) : []);
    } catch { return new Set(); }
  });

  const marcar = (alimento) => {
    setMarcados((antes) => {
      const nuevo = new Set(antes);
      if (nuevo.has(alimento)) nuevo.delete(alimento); else nuevo.add(alimento);
      try { window.localStorage.setItem(CLAVE_MARCADOS, JSON.stringify([...nuevo])); } catch { /* modo privado */ }
      return nuevo;
    });
  };

  const desmarcarTodo = () => {
    setMarcados(new Set());
    try { window.localStorage.removeItem(CLAVE_MARCADOS); } catch { /* modo privado */ }
  };

  // null = todos los menús juntos. Un número = solo ese menú.
  const [compraMenu, setCompraMenu] = useState(null);
  // Cuántas veces: semanas si están todos juntos, tandas si es uno solo.
  const [compraTandas, setCompraTandas] = useState(1);
  const [compraGuardada, setCompraGuardada] = useState(null); // [{nombre, menus}]
  const [cargandoCompra, setCargandoCompra] = useState(false);
  // Para poder decir en pantalla de dónde salen los números: del menú que
  // acabas de hacer, o del último que guardaste. No es lo mismo y la
  // diferencia no se ve mirando la lista.
  const [compraDeLoQueMiras, setCompraDeLoQueMiras] = useState(false);
  const [errorCompra, setErrorCompra] = useState(null);

  // ⚠️ UNO SOLO (25 agosto). Estaba escrito a mano en la llamada a
  // VistaMenus de la pantalla del menú, y en la de las secciones era un
  // `() => {}`. Mismo botón, misma pantalla, dos comportamientos. Aquí
  // también se sale de la sección: si no, se regenera por detrás y sigues
  // mirando Evolución sin enterarte.
  const regenerarConAlimentos = () => {
    // ⚠️ Los alimentos salen de `menuReal`, que es EL menú del perro, y no
    // de lo que tenga pintado la vista: abriendo Evolución desde el panel,
    // la vista recibe MENUS_EJEMPLO de relleno. Sin menú de verdad, lista
    // vacía y se calcula de cero con el peso nuevo, que es lo que se ha
    // pedido.
    setAlimentosAPreservarPorMenu(
      (menuReal || []).map((r) => Object.entries(r.menu || r.gramos || {})
                                        .filter(([, g]) => g > 0)
                                        .map(([n]) => n)));
    setMenuReal(null);
    setSeccionSuelta(null);
    setFase("generador");
    setPantalla("resultado");
  };

  const abrirLaCompra = async () => {
    setCompraAbierta(true);
    setCompraDeQuien(null);
    setCompraMenu(null);
    setCompraTandas(1);
    setErrorCompra(null);
    setCargandoCompra(true);
    try {
      // ⚠️ AÑADIDO (24 agosto) — LO QUE ESTÁS MIRANDO MANDA SOBRE LO
      // GUARDADO.
      //
      // Desde que la compra vive SOLO aquí (pedido: "no quiero que la
      // compra aparezca en el menú"), leer únicamente lo guardado tenía un
      // fallo callado: acabas de generar un menú, no le has dado a guardar
      // todavía, abres la compra y te enseña la del menú ANTERIOR. Números
      // correctos, menú equivocado, y nada en pantalla que lo delate.
      //
      // Así que si hay menús en pantalla, son ésos. Lo guardado es el
      // respaldo para cuando no estás mirando ninguno.
      if (menusDeLaCasa?.perros?.length) {
        setCompraGuardada(menusDeLaCasa.perros
          .filter((p) => p.factible && (p.menus || []).length)
          .map((p) => ({
            nombre: p.nombre,
            // ⚠️ `nombre` (26 agosto): la compra pintaba "Menú 1", "Menú 2"
            // a mano porque aquí solo llegaban los gramos y los días. Si el
            // menú tiene nombre, tiene que llegar hasta allí.
            menus: (p.menus || []).map((m) => ({ gramos: m.menu, dias: m.dias, nombre: m.nombre || null })),
          })));
        setCompraDeLoQueMiras(true);
        setCargandoCompra(false);
        return;
      }

      const conMenu = [];
      let hayEnPantalla = false;
      for (const p of (perros ?? [])) {
        // El perro que tienes abierto puede tener menús recién hechos sin
        // guardar. Ésos ganan.
        if (p.id === perfil._id && menuReal && menuReal.length) {
          const diasAhora = repartirDiasSemana(Math.max(1, menuReal.length));
          conMenu.push({
            nombre: p.nombre || "Sin nombre",
            menus: menuReal.map((r, i) => ({
              gramos: r.menu || r.gramos || {},
              dias: diasAhora[i],
              nombre: r.nombre || null,
            })),
          });
          hayEnPantalla = true;
          continue;
        }
        const filas = await getMenus(p.id);
        // getMenus ya los devuelve del más nuevo al más viejo.
        const ultima = (filas || [])[0];
        if (!ultima) continue;
        // ⚠️ Un menú guardado puede no traer los días de cada tanda: los
        // primeros que se guardaron no los llevaban. Sin días, cesta.js
        // contaría cada menú como UN día y la compra saldría corta, que es
        // justo el fallo que la cesta viene a arreglar. Así que si faltan,
        // se reparte la semana igual que hace el generador.
        const trozos = ultima.menus_data || [];
        const dias = repartirDiasSemana(Math.max(1, trozos.length));
        conMenu.push({
          nombre: p.nombre || "Sin nombre",
          menus: trozos.map((m, i) => ({
            gramos: m.menu || m.gramos || {},
            dias: m.dias > 0 ? m.dias : dias[i],
            // El nombre vive en `menus_data[i].nombre`, que es donde lo
            // escribe el renombrado de dentro.
            nombre: m.nombre || null,
          })),
        });
      }
      setCompraGuardada(conMenu);
      setCompraDeLoQueMiras(hayEnPantalla);
    } catch (err) {
      capturarError(err, { donde: "abrirLaCompra" });
      setErrorCompra("No hemos podido cargar tus menús guardados. Inténtalo otra vez.");
      setCompraGuardada([]);
    } finally {
      setCargandoCompra(false);
    }
  };

  // ⚠️ REHECHO (24 agosto) — LOS DÍAS ESTABAN MAL PLANTEADOS, y era un
  // fallo de concepto, no de cuentas. Sus palabras: "no debería poner para
  // 3 días, 1 semana, y multiplicar por 7 días, porque hay menús que pone
  // que se den 3 días y otro 4 — entonces si cocinas para 1 semana uno de 3
  // días tienes para más de dos".
  //
  // Tenía razón. La cesta salía de UNA SEMANA y todo se escalaba por
  // dias/7. Con los menús juntos eso funciona: la semana es la semana. Pero
  // mirando UN menú suelto, "1 semana" no significa nada — ¿siete días de
  // comida, o los 3 que le tocan dentro de la semana?
  //
  // Ahora son dos preguntas distintas según lo que estés mirando:
  //   · Todos juntos → SEMANAS. Multiplicar una semana por 2 es exacto.
  //   · Un menú solo → TANDAS DE ESE MENÚ, y cada opción dice cuántos DÍAS
  //     DE COMIDA te da, que es lo que de verdad quieres saber en la tienda.
  //
  // Así ningún número sale sin explicación.
  const menusDeLaCompra = useMemo(() => {
    // Cuántos menús hay y cuántos días cubre cada uno. Se toman del primer
    // perro: en una casa todos reciben el mismo número de menús y el mismo
    // reparto de días (lo decide /menu/varios-perros).
    const primero = (compraGuardada || [])[0];
    return ((primero && primero.menus) || []).map((m, i) => ({
      indice: i,
      dias: m.dias > 0 ? m.dias : 1,
      // ⚠️ EL NOMBRE SI LO TIENE (26 agosto). Antes era siempre el número,
      // así que renombrar un menú no se veía en la compra -- que es
      // justamente donde hace falta distinguirlos, porque es la pantalla
      // desde la que se va a comprar.
      etiqueta: m.nombre || `Menú ${i + 1}`,
    }));
  }, [compraGuardada]);

  // Cuántos días de comida sale la lista que se está viendo. Es el número
  // que hay que enseñar: "2 semanas" y "8 días" no son lo mismo si el menú
  // dura 4 días.
  const diasDeLaCompra = useMemo(() => {
    if (compraMenu === null) return 7 * compraTandas;
    const m = menusDeLaCompra.find((x) => x.indice === compraMenu);
    return (m ? m.dias : 7) * compraTandas;
  }, [compraMenu, compraTandas, menusDeLaCompra]);

  const cestaDelPanel = useMemo(() => {
    if (!compraGuardada) return [];
    const perrosElegidos = compraDeQuien
      ? compraGuardada.filter((p) => p.nombre === compraDeQuien)
      : compraGuardada;
    // Y de cada perro, el menú elegido o todos.
    const conElMenu = perrosElegidos.map((p) => ({
      ...p,
      menus: compraMenu === null
        ? p.menus
        : (p.menus || []).filter((_, i) => i === compraMenu),
    })).filter((p) => (p.menus || []).length);

    const cesta = cestaDeLaCompra(conElMenu, categoriaDeAlimento);
    if (compraTandas === 1) return cesta;
    return cesta.map((z) => ({
      ...z,
      lineas: z.lineas.map((l) => ({ ...l, gramos: l.gramos * compraTandas })),
    }));
  }, [compraGuardada, compraDeQuien, compraMenu, compraTandas]);
  const [cargandoMenusGuardados, setCargandoMenusGuardados] = useState(false);
  // Fila de Supabase que se está viendo ahora mismo, si se ha abierto uno
  // guardado. Sirve para dos cosas: saber que NO hay que regenerar nada, y
  // mostrar las kcal/etapa con las que se hizo aquel menú, no las de hoy
  // (el perro puede haber cambiado de peso desde entonces).
  const [menuGuardadoAbierto, setMenuGuardadoAbierto] = useState(null);

  useEffect(() => {
    if (!perfil._id) { setMenusGuardados([]); return; }
    let cancelado = false;
    setCargandoMenusGuardados(true);
    getMenus(perfil._id)
      .then((filas) => {
        if (cancelado) return;
        migaDePan("Menús guardados cargados", { n: filas.length });
        setMenusGuardados(filas);
      })
      .catch((err) => {
        if (cancelado) return;
        capturarError(err, { donde: "getMenus", perroId: perfil._id });
        setMenusGuardados([]);
      })
      .finally(() => { if (!cancelado) setCargandoMenusGuardados(false); });
    return () => { cancelado = true; };
  }, [perfil._id]);

  // ⚠️ AÑADIDO — borrar un menú guardado. eliminarMenu ya existía en
  // supabase.js y tampoco se usaba desde ningún sitio, igual que le
  // pasaba a getMenus.
  const [menuAConfirmarBorrado, setMenuAConfirmarBorrado] = useState(null);
  const [borrandoMenu, setBorrandoMenu] = useState(false);

  const confirmarBorrarMenu = async () => {
    // ⚠️ Desde el 26 de agosto esto puede llevar dentro un menú de los de
    // DENTRO ({fila, indice}). Ese caso tiene su propia función porque no es
    // un borrado: es reescribir la fila con un menú menos.
    if (menuAConfirmarBorrado?.indice != null) return confirmarBorrarMenuInterno();
    const fila = menuAConfirmarBorrado?.fila || menuAConfirmarBorrado;
    if (!fila) return;
    setBorrandoMenu(true);
    try {
      await eliminarMenu(fila.id);
      setMenusGuardados((previos) => previos.filter((m) => m.id !== fila.id));
      migaDePan("Menú guardado borrado", { id: fila.id });
      setMenuAConfirmarBorrado(null);
    } catch (err) {
      capturarError(err, { donde: "eliminarMenu", menuId: fila.id });
      // Se deja el diálogo abierto con el aviso: borrar y que parezca que
      // funcionó cuando no ha funcionado es peor que decirlo.
      setMenuAConfirmarBorrado({ ...fila, error: "No se ha podido borrar. Inténtalo otra vez." });
    } finally {
      setBorrandoMenu(false);
    }
  };

  // ⚠️ AÑADIDO (26 agosto) — RENOMBRAR, Y LOS DOS NIVELES.
  //
  // Pedido expreso: "en vez de la papelera debería haber tres puntitos para
  // poder renombrar y borrar; y tienes que tener en cuenta si es un menú que
  // tiene varios menús dentro -- cada menú individual de la semana y el
  // global, desde dentro y desde fuera".
  //
  // Los dos niveles viven en la MISMA fila de la tabla:
  //   · el conjunto guardado -> la columna `nombre`
  //   · cada menú de dentro  -> `menus_data[i].nombre`
  //
  // `accionesDeMenu` es lo que abre la hoja de los tres puntos, y lleva
  // dentro a qué se refiere:
  //   { fila }            -> el conjunto entero
  //   { fila, indice }    -> el menú número `indice` de dentro
  const [accionesDeMenu, setAccionesDeMenu] = useState(null);
  const [renombrando, setRenombrando] = useState(null);   // { fila, indice?, valor }
  const [guardandoNombre, setGuardandoNombre] = useState(false);

  // El nombre que se ve hoy de un menú de dentro. Los guardados antiguos no
  // tienen ninguno (se generaba al vuelo como "Menú 1"), así que se cae al
  // número -- sin esto, renombrar el segundo dejaría el primero en blanco.
  const nombreDelMenuInterno = (fila, i) =>
    (fila?.menus_data?.[i]?.nombre) || `Menú ${i + 1}`;

  const guardarNombreDeMenu = async () => {
    const p = renombrando;
    if (!p) return;
    const limpio = (p.valor || "").trim();
    setGuardandoNombre(true);
    try {
      let actualizada;
      if (p.indice == null) {
        // El conjunto. Vacío = volver a la fecha, que es lo que se enseña
        // cuando no hay nombre: borrar el texto tiene que poder deshacerlo.
        actualizada = await actualizarMenu(p.fila.id, { nombre: limpio });
      } else {
        const datos = (p.fila.menus_data || []).map((m, i) =>
          i === p.indice ? { ...m, nombre: limpio || null } : m);
        actualizada = await actualizarMenu(p.fila.id, { menusData: datos });
      }
      const nueva = actualizada || p.fila;
      setMenusGuardados((previos) => previos.map((m) => (m.id === nueva.id ? nueva : m)));
      // Si es el que está abierto, que el cambio se vea sin salir y entrar.
      setMenuGuardadoAbierto((abierto) => (abierto && abierto.id === nueva.id ? nueva : abierto));
      if (p.indice != null) setMenuReal(nueva.menus_data);
      migaDePan("Menú renombrado", { id: p.fila.id, interno: p.indice ?? null });
      setRenombrando(null);
    } catch (err) {
      capturarError(err, { donde: "renombrarMenu", menuId: p.fila.id });
      setRenombrando((r) => ({ ...r, error: "No se ha podido guardar el nombre. Inténtalo otra vez." }));
    } finally {
      setGuardandoNombre(false);
    }
  };

  // Borrar UN menú de los de dentro. No es un borrado normal: hay que quitar
  // la entrada Y bajar `num_menus`, y las dos cosas en la misma llamada --
  // en dos, la fila se quedaría un rato diciendo que tiene tres menús
  // cuando ya solo lleva dos, y la lista de fuera lo enseñaría mal.
  //
  // ⚠️ Y si era el ÚLTIMO, lo que toca es borrar la fila entera: dejar un
  // menú guardado con cero menús dentro es dejar basura que se abre en una
  // pantalla vacía.
  const confirmarBorrarMenuInterno = async () => {
    const p = menuAConfirmarBorrado;
    if (!p || p.indice == null) return;
    setBorrandoMenu(true);
    try {
      const restantes = (p.fila.menus_data || []).filter((_, i) => i !== p.indice);
      if (restantes.length === 0) {
        await eliminarMenu(p.fila.id);
        setMenusGuardados((previos) => previos.filter((m) => m.id !== p.fila.id));
        migaDePan("Menú guardado borrado al quitar el último de dentro", { id: p.fila.id });
        setMenuAConfirmarBorrado(null);
        salirDeMenuGuardado();
        return;
      }
      const actualizada = await actualizarMenu(p.fila.id, {
        menusData: restantes, numMenus: restantes.length });
      const nueva = actualizada || { ...p.fila, menus_data: restantes, num_menus: restantes.length };
      setMenusGuardados((previos) => previos.map((m) => (m.id === nueva.id ? nueva : m)));
      setMenuGuardadoAbierto((abierto) => (abierto && abierto.id === nueva.id ? nueva : abierto));
      setMenuReal(nueva.menus_data);
      migaDePan("Menú de dentro borrado", { id: p.fila.id, indice: p.indice });
      setMenuAConfirmarBorrado(null);
    } catch (err) {
      capturarError(err, { donde: "borrarMenuInterno", menuId: p.fila.id, indice: p.indice });
      setMenuAConfirmarBorrado((x) => ({ ...x, error: "No se ha podido borrar. Inténtalo otra vez." }));
    } finally {
      setBorrandoMenu(false);
    }
  };

  // ⚠️ SUBIDA AQUÍ (26 agosto). Vivía dentro de la pantalla de "Mis menús",
  // y desde que la hoja de los tres puntos también la necesita -- y esa se
  // dibuja fuera, porque hace falta dentro de un menú abierto igual que en
  // la lista -- tiene que estar donde la vean las dos. Lo cazó ESLint, que
  // para eso está: `fecha is not defined` en dos líneas, antes de ejecutar
  // nada. Es el mismo fallo que `setMenuReal is not defined`.
  const fecha = (iso) => {
    if (!iso) return "";
    try {
      return new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });
    } catch { return ""; }
  };

  // La hoja de los tres puntos, y el diálogo de renombrar. Se dibujan
  // aparte porque hacen falta en DOS sitios: en la lista de "Mis menús"
  // (el conjunto guardado) y dentro de un menú abierto (cada uno de los de
  // la semana). Pedido expreso: "se tiene que poder borrar y editar desde
  // dentro y desde fuera".
  //
  // ⚠️ Las opciones son una LISTA, no dos botones escritos a mano. Pedido
  // expreso: "ya se nos irán ocurriendo más cosas que meter ahí" -- meter
  // una más tiene que ser añadir una entrada, no rehacer la hoja.
  const hojaDeAccionesDeMenu = accionesDeMenu && (() => {
    const { fila, indice } = accionesDeMenu;
    const esDeDentro = indice != null;
    const titulo = esDeDentro
      ? nombreDelMenuInterno(fila, indice)
      : (fila.nombre || fecha(fila.created_at));
    const cuantosDentro = (fila.menus_data || []).length;

    const opciones = [
      { key: "renombrar", icono: Pencil, texto: "Renombrar",
        onClick: () => {
          setRenombrando({ fila, indice, valor: esDeDentro ? (fila.menus_data?.[indice]?.nombre || "") : (fila.nombre || "") });
          setAccionesDeMenu(null);
        } },
      { key: "borrar", icono: Trash2, peligro: true,
        // Decir QUÉ se borra, que no es lo mismo: desde dentro se borra un
        // menú de la semana; desde fuera, el conjunto entero.
        texto: esDeDentro
          ? (cuantosDentro > 1 ? "Eliminar este menú" : "Eliminar (es el único que queda)")
          : (cuantosDentro > 1 ? `Eliminar los ${cuantosDentro} menús` : "Eliminar"),
        onClick: () => { setMenuAConfirmarBorrado({ fila, indice }); setAccionesDeMenu(null); } },
    ];

    return (
      <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center"
           style={{ background: "rgba(35,21,57,0.45)" }}
           onClick={() => setAccionesDeMenu(null)}>
        <div role="dialog" aria-label={`Opciones de ${titulo}`}
             className="w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl px-5 pt-5 pb-8 sm:pb-5"
             style={{ background: "#FFFFFF" }} onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-4">
            <div className="min-w-0">
              <p className="text-[11px] tracking-[0.14em] uppercase" style={{ color: MALVA, fontFamily: "monospace" }}>
                {esDeDentro ? "Este menú" : "Menú guardado"}
              </p>
              <p className="truncate" style={{ color: TINTA, fontFamily: fontDisplay, fontSize: 17 }}>{titulo}</p>
            </div>
            <button onClick={() => setAccionesDeMenu(null)} aria-label="Cerrar"
                    style={{ background: "none", border: "none", cursor: "pointer" }}>
              <X size={20} style={{ color: MALVA }} />
            </button>
          </div>
          <div className="flex flex-col gap-1.5">
            {opciones.map((op) => (
              <button key={op.key} onClick={op.onClick}
                      className="flex items-center gap-3 w-full text-left px-4 py-3.5 rounded-xl"
                      style={{ background: PAPEL, border: "none" }}>
                <op.icono size={16} style={{ color: op.peligro ? ROSA : VIOLETA }} />
                <span className="text-sm" style={{ color: op.peligro ? ROSA : TINTA, fontFamily: fontBody, fontWeight: 600 }}>
                  {op.texto}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  })();

  // El diálogo de "¿seguro que lo borro?" para un menú DE DENTRO. La lista
  // de fuera ya tenía el suyo escrito dentro de su pantalla; éste hace falta
  // aparte porque se pulsa desde dentro de un menú abierto, que es otra
  // pantalla, y porque lo que dice no es lo mismo: ahí se borra un menú de
  // la semana, no el conjunto.
  const dialogoDeBorrarMenuInterno = menuAConfirmarBorrado?.indice != null && (() => {
    const { fila, indice, error } = menuAConfirmarBorrado;
    const quedan = (fila.menus_data || []).length - 1;
    return (
      <div className="fixed inset-0 z-[85] flex items-center justify-center px-6"
           style={{ background: "rgba(35,21,57,0.45)" }}
           onClick={() => !borrandoMenu && setMenuAConfirmarBorrado(null)}>
        <div className="w-full max-w-sm rounded-2xl p-6" style={{ background: "#FFFFFF" }}
             onClick={(e) => e.stopPropagation()}>
          <p className="mb-2" style={{ color: TINTA, fontFamily: fontDisplay, fontSize: 19 }}>
            {quedan > 0 ? "¿Borrar este menú?" : "¿Borrar el menú guardado?"}
          </p>
          <p className="text-sm mb-1" style={{ color: MALVA, fontFamily: fontBody }}>
            {nombreDelMenuInterno(fila, indice)}
          </p>
          {/* Decir qué queda después. Borrar el último de dentro se lleva el
              conjunto entero por delante, y eso no se puede descubrir
              después de haberlo pulsado. */}
          <p className="text-xs mt-2 mb-4 leading-snug" style={{ color: MALVA, fontFamily: fontBody }}>
            {quedan > 0
              ? `Se quedan ${quedan} ${quedan === 1 ? "menú" : "menús"} en este guardado. El resto de la semana se reparte entre los que queden.`
              : "Es el único que queda, así que se borra el menú guardado entero."}
          </p>
          {error && (
            <p className="text-xs mb-3" style={{ color: ROSA, fontFamily: fontBody }}>{error}</p>
          )}
          <div className="flex gap-2">
            <button onClick={() => setMenuAConfirmarBorrado(null)} disabled={borrandoMenu}
                    className="flex-1 py-3 rounded-xl text-sm"
                    style={{ background: PAPEL, color: TINTA, fontFamily: fontBody, fontWeight: 600, border: "none" }}>
              Cancelar
            </button>
            <button onClick={confirmarBorrarMenuInterno} disabled={borrandoMenu}
                    className="flex-1 py-3 rounded-xl text-sm"
                    style={{ background: ROSA, color: "#FFFFFF", fontFamily: fontBody, fontWeight: 700, border: "none" }}>
              {borrandoMenu ? "Borrando..." : "Borrar"}
            </button>
          </div>
        </div>
      </div>
    );
  })();

  const dialogoDeRenombrar = renombrando && (
    <div className="fixed inset-0 z-[85] flex items-center justify-center px-6"
         style={{ background: "rgba(35,21,57,0.45)" }}
         onClick={() => !guardandoNombre && setRenombrando(null)}>
      <div className="w-full max-w-sm rounded-2xl p-6" style={{ background: "#FFFFFF" }}
           onClick={(e) => e.stopPropagation()}>
        <p className="mb-1" style={{ color: TINTA, fontFamily: fontDisplay, fontSize: 19 }}>
          {renombrando.indice != null ? "Nombre de este menú" : "Nombre del menú guardado"}
        </p>
        <p className="text-xs mb-4 leading-snug" style={{ color: MALVA, fontFamily: fontBody }}>
          {renombrando.indice != null
            ? "Para distinguirlo del resto de la semana: «el de pescado», «el del finde»..."
            : "Déjalo vacío y volverá a verse la fecha."}
        </p>
        <input
          autoFocus
          value={renombrando.valor}
          maxLength={60}
          onChange={(e) => setRenombrando((r) => ({ ...r, valor: e.target.value, error: null }))}
          onKeyDown={(e) => { if (e.key === "Enter" && !guardandoNombre) guardarNombreDeMenu(); }}
          aria-label="Nombre del menú"
          placeholder={renombrando.indice != null
            ? nombreDelMenuInterno(renombrando.fila, renombrando.indice)
            : fecha(renombrando.fila.created_at)}
          className="w-full px-4 py-3 rounded-xl mb-4 text-sm"
          style={{ border: "1.5px solid #E3DAF0", color: TINTA, fontFamily: fontBody, outline: "none" }}
        />
        {renombrando.error && (
          <p className="text-xs mb-3" style={{ color: ROSA, fontFamily: fontBody }}>{renombrando.error}</p>
        )}
        <div className="flex gap-2">
          <button onClick={() => setRenombrando(null)} disabled={guardandoNombre}
                  className="flex-1 py-3 rounded-xl text-sm"
                  style={{ background: PAPEL, color: TINTA, fontFamily: fontBody, fontWeight: 600, border: "none" }}>
            Cancelar
          </button>
          <button onClick={guardarNombreDeMenu} disabled={guardandoNombre}
                  className="flex-1 py-3 rounded-xl text-sm"
                  style={{ background: ROSA, color: "#FFFFFF", fontFamily: fontBody, fontWeight: 700, border: "none" }}>
            {guardandoNombre ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );

  const abrirMenuGuardado = (fila) => {
    setMenuGuardadoAbierto(fila);
    setMenuReal(fila.menus_data);
    setModo(fila.modo || "automatico");
    // Limpiar restos de una generación anterior, o la pantalla de
    // resultado mostraría el "Calculando..." o un error viejo.
    setMenuCargando(false);
    setMenuError(null);
    setDiagnosticoMenus(null);
    setNecesitaVeterinario(false);
    setMenuLigeroAbierto(false);
    // Pantalla propia: la de "resultado" tiene un useEffect que genera un
    // menú nuevo cada vez que se entra en ella, y nos machacaría éste.
    setPantalla("menuGuardado");
    setFase("generador");
  };

  const salirDeMenuGuardado = () => {
    setMenuGuardadoAbierto(null);
    setMenuReal(null);
    setPantalla("elegir");
    setFase("misMenus");
  };
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

  // ⚠️ AÑADIDO — SELECTOR DE PERROS.
  //
  // Hasta ahora la app enseñaba el primer perro de la cuenta y ya: quien
  // tuviera dos, sólo podía usar uno. La lista y el guardado siempre han
  // admitido varios (la tabla `perros` va por user_id, y los menús ya
  // llevan su `perro_id`); lo que faltaba era poder elegir.
  //
  // Vive en la cabecera de los dos paneles laterales, que es el único
  // sitio que se puede abrir desde cualquier pantalla. Con un solo perro
  // no se despliega nada: sólo aparece "Añadir otro perro", para que a
  // quien tenga uno no le cambie la app de sitio.
  // ─── MENÚS DE TODA LA CASA ────────────────────────────────────────
  // "solo"      → como siempre, el menú de este perro.
  // "parecidos" → los de todos, amoldados entre sí: misma compra.
  // "cada_uno"  → los de todos, pero cada uno el mejor suyo.
  // ⚠️ QUITADA LA OPCIÓN "Solo para X" de la pantalla (23 agosto) —
  // pedido expreso: "si metes otro perro es porque también quieres
  // hacerle un menú, si no, no lo meterías". Era una tercera opción que
  // había que leer y descartar cada vez, para un caso que no se da.
  //
  // Por eso el valor de partida pasa de "solo" a "parecidos": con varios
  // perros se hacen siempre los de todos, y lo único que se elige es CÓMO.
  //
  // "solo" NO desaparece del estado: es a donde salta el botón de rescate
  // cuando la generación de la casa falla entera ("Hacer solo el de X").
  // Sin ese valor, ese botón devolvería a la misma pantalla que acaba de
  // fallar. Se puede llegar, pero ya no se elige.
  // ⚠️ EN MODO VETERINARIO, SIEMPRE "SOLO" (29 agosto). "Los menús de la
  // casa" es una idea de tutor: varios perros que viven juntos, una sola
  // compra, las mismas bandejas. Los pacientes de un veterinario no viven
  // juntos ni comen de la misma bolsa -- preguntarle si quiere el mismo
  // menú "para todos" no es que sobre: es que no significa nada.
  const [paraQuien, setParaQuien] = useState(
    (arrancarEn === "generador_solo" || enModoProfesional) ? "solo" : "parecidos");
  // ⚠️ Qué come AHORA cada perro, por separado: uno puede venir de pienso
  // y el otro llevar años en BARF, y de ahí sale si cada uno necesita
  // transición. Arranca con lo que tenga guardado cada ficha.
  const [dietasDeLaCasa, setDietasDeLaCasa] = useState(() =>
    Object.fromEntries((perros || []).map((p) => [p.id, p.dieta_actual ?? null])));
  const [menusDeLaCasa, setMenusDeLaCasa] = useState(null);
  const [cargandoCasa, setCargandoCasa] = useState(false);
  const [errorCasa, setErrorCasa] = useState(null);
  const [guardandoCasa, setGuardandoCasa] = useState(false);
  const [guardadosCasa, setGuardadosCasa] = useState(false);

  // Perro al que se quiere ir teniendo otro a medio crear: se guarda
  // aquí para poder preguntar antes de tirar lo escrito.
  const [perroAlQueIrmeTrasAvisar, setPerroAlQueIrmeTrasAvisar] = useState(null);
  // Perro que se está a punto de borrar (con sus menús).
  const [confirmarDescartarLocal, setConfirmarDescartarLocal] = useState(false);
  const [perroABorrar, setPerroABorrar] = useState(null);
  const [borrandoPerro, setBorrandoPerro] = useState(false);
  const [errorAlBorrarPerro, setErrorAlBorrarPerro] = useState(null);

  // Se pinta el perro en curso con el nombre que se esté escribiendo AHORA
  // (perfil.nombre), no con el guardado: durante el asistente aún no hay
  // fila en Supabase, y verse a uno mismo como "Sin nombre" mientras
  // acabas de teclear el nombre es raro.
  // "Cairo y Lola" en vez de "2 perros". Pedido expreso: mientras esperas
  // quieres leer los nombres de TUS perros, no una cuenta. Con tres o más
  // se enumera como en español: "Cairo, Lola y Ruffo".
  const nombresDeLosPerros = (lista) => {
    const nombres = lista.map((p) => p.nombre);
    if (nombres.length === 0) return "";
    if (nombres.length === 1) return nombres[0];
    return `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`;
  };

  // ⚠️ UN PERRO CREADO EN MODO VETERINARIO NACE COMO PACIENTE (28 agosto).
  //
  // Es lo único que lo separa del perro propio del veterinario, porque los
  // dos llevan `user_id` = él. Si esto no se hiciera, el paciente aparecería
  // entre sus perros y no en su lista de pacientes -- sin dar ningún error.
  //
  // Va en su propia función y no repetido en los dos caminos de alta, por lo
  // de siempre: dos copias de la misma regla se separan solas.
  //
  // Y si falla, NO se rompe el alta: la ficha ya está guardada y perderla
  // sería mucho peor que tener un paciente en la lista equivocada. Se avisa
  // a Sentry y se sigue.
  const nacerComoPaciente = async (perroGuardado) => {
    if (!enModoProfesional || !perroGuardado?.id || !usuario?.id) return;
    try {
      await marcarComoPaciente(perroGuardado.id, usuario.id);
      onPerroGuardado(perroGuardado);   // recargar arriba con el acceso ya puesto
    } catch (err) {
      capturarError(err, { donde: "nacerComoPaciente", perroId: perroGuardado.id });
    }
  };

  // Cómo se llama lo que hay en la lista. En modo veterinario no son "tus
  // perros": son sus pacientes, que es otra cosa -- un vet no tiene una casa
  // con cinco perros. Los rótulos salen de aquí para que no se separen entre
  // la hoja de perros y Ajustes, que es donde ya pasó una vez con el DER.
  const rotuloLista = enModoProfesional ? "Tus pacientes" : "Tus perros";
  const rotuloAnadir = enModoProfesional ? "Dar de alta un paciente" : "Añadir otro perro";

  const listaDePerros = (() => {
    // ⚠️ EN MODO VETERINARIO SE VEN SUS PACIENTES, NO SUS PERROS (28 agosto).
    // Los dos llevan `user_id` = él, así que la columna no los distingue: lo
    // hace `accesos`. La regla vive en `pacientes.js`, en un solo sitio,
    // para que el día que la fase 3 traiga perros que NO son suyos se
    // cambie ahí y lo vean todas las pantallas a la vez.
    const delModo = perrosDelModo(perros ?? [], accesos, enModoProfesional);
    const guardados = delModo.map((p) => ({
      id: p.id,
      nombre: p.id === perfil._id ? (perfil.nombre.trim() || p.nombre || "Sin nombre") : (p.nombre || "Sin nombre"),
      esElDeAhora: p.id === perfil._id,
      sinGuardar: false,
    }));
    // Perro a medio crear: todavía no está en la lista de Supabase, pero
    // hay que verlo para saber que estás dentro de él.
    if (!perfil._id) {
      guardados.push({
        id: null,
        nombre: perfil.nombre.trim() || "Perro nuevo",
        esElDeAhora: true,
        sinGuardar: true,
      });
    }
    return guardados;
  })();

  // ⚠️ AÑADIDO (24 agosto) — LA BURBUJA DE PERFIL Y EL ENGRANAJE.
  //
  // Pedido expreso: "que cambiar de perro esté metido en una pestaña del
  // panel es esconderlo; va como burbuja de perfil bien visible, y de ahí
  // cuelga una rueda de engranaje con la configuración de la cuenta y de
  // las mascotas".
  //
  // Tenía razón en lo de esconderlo: para cambiar de perro había que
  // saber que existía un panel, abrirlo, y encontrar dentro una fila
  // plegada que ponía "2 perros". Tres pasos y ninguno se ve desde fuera.
  //
  // `hojaDePerros` es lo que se abre al tocar la burbuja, y `ajustes` la
  // pantalla del engranaje.
  const [hojaDePerrosAbierta, setHojaDePerrosAbierta] = useState(false);
  const [ajustesAbiertos, setAjustesAbiertos] = useState(false);

  // La burbuja: quién es el perro de ahora, y el engranaje al lado. Va en
  // la cabecera de las pantallas principales, siempre en el mismo sitio,
  // para que se lea como "estás en Cairo" y no como un botón más.
  //
  // `sobreOscuro` porque hay dos cabeceras: la morada (menú, perfil) y la
  // clara (generador). El mismo componente en las dos, con los colores
  // dados la vuelta.
  const burbujaDePerfil = (sobreOscuro = true) => {
    const varios = listaDePerros.length > 1;
    const inicial = (nombreMostrar || "?").trim().charAt(0).toUpperCase();
    return (
      <button
        // ⚠️ REHECHA (24 agosto) — CASO REAL: "NO QUIERO DOS, QUIERO UNA
        // SOLA BURBUJITA PARA CONFIGURACIÓN Y LOS PERROS, Y TIENE QUE
        // ESTAR EN EL EXTREMO DERECHO ARRIBA".
        //
        // Eran dos botones pegados: el perro y un engranaje aparte. Dos
        // cosas que abren dos sitios distintos, en la esquina donde solo
        // cabe una idea. Ahora es UNA: se toca y la hoja lleva los perros
        // Y los ajustes.
        onClick={() => setHojaDePerrosAbierta(true)}
        aria-label={varios
          ? `Perro actual: ${nombreMostrar}. Cambiar de perro y ajustes`
          : `Perro actual: ${nombreMostrar}. Tus perros y ajustes`}
        className="flex items-center gap-2 pl-1 pr-2.5 py-1 rounded-full shrink-0"
        style={{
          background: sobreOscuro ? "rgba(255,255,255,0.14)" : "#FFFFFF",
          border: sobreOscuro ? "none" : "1.5px solid #E3DAF0",
          cursor: "pointer",
        }}
      >
        <span
          aria-hidden="true"
          className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
          style={{ background: sobreOscuro ? "#FFFFFF" : VIOLETA,
                   color: sobreOscuro ? VIOLETA : "#FFFFFF",
                   fontFamily: fontDisplay, fontSize: 12, fontWeight: 700 }}
        >
          {inicial}
        </span>
        <span className="truncate" style={{ maxWidth: 92, color: sobreOscuro ? "#FFFFFF" : TINTA,
                                            fontFamily: fontBody, fontSize: 13, fontWeight: 600 }}>
          {nombreMostrar}
        </span>
        <ChevronRight size={13} aria-hidden="true"
                      style={{ color: sobreOscuro ? "#D8CFEC" : MALVA, transform: "rotate(90deg)" }} />
      </button>
    );
  };

  // La hoja que sale al tocar la burbuja: los perros de la casa y añadir
  // otro. Es lo mismo que había escondido en el panel, pero a un toque y
  // desde cualquier pantalla.
  const hojaDePerros = hojaDePerrosAbierta && (
    // ⚠️ CASO REAL (24 agosto): "en el ordenador necesito que cuando se
    // despliega esté abajo en pequeñito". En el móvil una hoja a todo lo
    // ancho es lo natural -- ahí el ancho ES la pantalla. En un monitor de
    // 1200px la misma hoja son 1200px de blanco para enseñar dos nombres.
    //
    // Se acota SOLO a partir de `sm` (640px): por debajo, el móvil se queda
    // exactamente como estaba. Y va a la DERECHA porque es donde está la
    // burbuja que la abre: aparecer en la esquina contraria a lo que has
    // tocado obliga a buscarla con la vista.
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:justify-end sm:p-6"
         style={{ background: "rgba(35,21,57,0.45)" }}
         onClick={() => setHojaDePerrosAbierta(false)}>
      <div role="dialog" aria-label="Tus perros"
           className="w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl px-5 pt-5 pb-8 sm:pb-5"
           style={{ background: "#FFFFFF" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <p className="text-[11px] tracking-[0.14em] uppercase" style={{ color: MALVA, fontFamily: "monospace" }}>
            {rotuloLista}
          </p>
          <button onClick={() => setHojaDePerrosAbierta(false)} aria-label="Cerrar"
                  style={{ background: "none", border: "none", cursor: "pointer" }}>
            <X size={20} style={{ color: MALVA }} />
          </button>
        </div>
        <div className="flex flex-col gap-1.5">
          {listaDePerros.map((p) => (
            <button
              key={p.id ?? "__nuevo__"}
              onClick={() => {
                if (p.esElDeAhora) { setHojaDePerrosAbierta(false); return; }
                // ⚠️ Cambiar de perro remonta la app entera (ver AuthGate).
                // Si se está a medio crear uno sin guardar, ese perro se
                // pierde -- por eso se avisa antes en vez de hacerlo a la
                // brava. Mismo aviso que tenía el panel de antes.
                if (!perfil._id && perfil.nombre.trim()) {
                  setPerroAlQueIrmeTrasAvisar(p.id);
                  return;
                }
                cerrarPaneles();
                onCambiarDePerro(p.id);
              }}
              aria-label={p.nombre}
              className="w-full flex items-center gap-3 px-3 py-3 rounded-2xl"
              style={{ background: p.esElDeAhora ? "#F3EDFB" : "#FBF7FC",
                       border: `1.5px solid ${p.esElDeAhora ? VIOLETA : "#E3DAF0"}`, cursor: "pointer" }}
            >
              <span aria-hidden="true" className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                    style={{ background: p.esElDeAhora ? VIOLETA : "#E3DAF0",
                             color: p.esElDeAhora ? "#FFFFFF" : VIOLETA,
                             fontFamily: fontDisplay, fontSize: 15, fontWeight: 700 }}>
                {(p.nombre || "?").trim().charAt(0).toUpperCase()}
              </span>
              <span className="flex-1 text-left truncate" style={{ color: TINTA, fontFamily: fontDisplay, fontSize: 16 }}>
                {p.nombre}
              </span>
              {p.sinGuardar
                ? <span className="text-[9px]" style={{ color: MALVA, fontFamily: "monospace" }}>sin guardar</span>
                : p.esElDeAhora
                  ? <Check size={17} style={{ color: VIOLETA }} />
                  : null}
            </button>
          ))}
          <button
            onClick={() => {
              if (!perfil._id) {
                // Ya está creando uno. Mandarla otra vez al paso 1
                // borraría lo que lleva escrito sin avisar.
                cerrarPaneles();
                setFase("onboarding");
                setPaso(1);
                return;
              }
              cerrarPaneles();
              onAnadirPerro();
            }}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-2xl mt-1"
            style={{ background: "none", border: "1.5px dashed #C9BEDD", cursor: "pointer" }}
          >
            <span className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: "#F0EAF8" }}>
              <Plus size={17} strokeWidth={2} style={{ color: VIOLETA }} />
            </span>
            <span className="flex-1 text-left" style={{ color: VIOLETA, fontFamily: fontDisplay, fontSize: 16 }}>
              {rotuloAnadir}
            </span>
          </button>
        </div>

        {/* ⚠️ AÑADIDO (24 agosto) — LOS AJUSTES, AQUÍ DENTRO.
            Antes colgaban de un engranaje aparte, al lado de la burbuja.
            Eran dos botones en la esquina donde solo cabe una idea. Ahora
            la burbuja es una sola y esta hoja lleva las dos cosas: de qué
            perro estás, y tu cuenta. Separado por una línea porque no es
            un perro más. */}
        <button
          onClick={() => { setHojaDePerrosAbierta(false); setAjustesAbiertos(true); }}
          className="w-full flex items-center gap-3 px-3 py-3 rounded-2xl mt-4 pt-4"
          style={{ background: "none", border: "none", borderTop: "1px solid #F0EAF8",
                   borderRadius: 0, cursor: "pointer" }}
        >
          <span aria-hidden="true" className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                style={{ background: "#F0EAF8" }}>
            <Settings size={17} strokeWidth={1.8} style={{ color: VIOLETA }} />
          </span>
          <span className="flex-1 text-left" style={{ color: TINTA, fontFamily: fontDisplay, fontSize: 16 }}>
            Ajustes
          </span>
          <ChevronRight size={16} style={{ color: "#C9BEDD" }} />
        </button>
      </div>
    </div>
  );

  // ⚠️ AJUSTES — lo que cuelga del engranaje. Junta las dos cosas que
  // estaban pendientes y sueltas: la cuenta (correo, contraseña, sesión) y
  // las mascotas. Antes no había NINGÚN sitio donde cambiar la contraseña
  // estando dentro: la única forma era salir, pedir el enlace de "olvidé
  // mi contraseña" y abrir el correo.
  const [ajusteCampo, setAjusteCampo] = useState(null);   // "password" | "correo"
  const [ajusteValor, setAjusteValor] = useState("");
  const [ajusteValor2, setAjusteValor2] = useState("");
  const [ajusteEstado, setAjusteEstado] = useState(null); // {tipo:"ok"|"error", texto}
  const [ajusteGuardando, setAjusteGuardando] = useState(false);

  const cerrarAjustes = () => {
    setAjustesAbiertos(false);
    setAjusteCampo(null); setAjusteValor(""); setAjusteValor2("");
    setAjusteEstado(null);
  };

  const guardarAjuste = async () => {
    if (ajusteGuardando) return;
    setAjusteEstado(null);
    if (ajusteCampo === "password") {
      if (ajusteValor.length < 6) {
        setAjusteEstado({ tipo: "error", texto: "La contraseña tiene que tener al menos 6 caracteres." });
        return;
      }
      if (ajusteValor !== ajusteValor2) {
        setAjusteEstado({ tipo: "error", texto: "Las dos contraseñas no son iguales." });
        return;
      }
    }
    if (ajusteCampo === "correo" && !/.+@.+\..+/.test(ajusteValor)) {
      setAjusteEstado({ tipo: "error", texto: "Ese correo no parece válido." });
      return;
    }
    setAjusteGuardando(true);
    try {
      if (ajusteCampo === "password") {
        await cambiarPassword(ajusteValor);
        setAjusteEstado({ tipo: "ok", texto: "Contraseña cambiada." });
      } else {
        await cambiarCorreo(ajusteValor);
        // ⚠️ El correo NO cambia al pulsar: Supabase manda un enlace al
        // correo NUEVO y hasta que se abre, la sesión sigue con el viejo.
        // Si no se dice, parece que no ha funcionado.
        setAjusteEstado({ tipo: "ok",
          texto: `Te hemos mandado un correo a ${ajusteValor}. Hasta que abras el enlace, tu cuenta sigue con el correo de antes.` });
      }
      setAjusteCampo(null); setAjusteValor(""); setAjusteValor2("");
    } catch (err) {
      capturarError(err, { donde: `ajustes.${ajusteCampo}` });
      setAjusteEstado({ tipo: "error",
        texto: "No se ha podido guardar. Inténtalo otra vez en un momento." });
    } finally {
      setAjusteGuardando(false);
    }
  };

  // Mandar el número de colegiado. Solicitud, no acreditación: escribe
  // `num_colegiado` y NADA MÁS. El disparador de Supabase rechaza que
  // desde aquí se toque `rol` o `rol_verificado_en`, así que ni un fallo
  // ni una mala idea pueden encender el modo desde el navegador.
  const enviarColegiado = async () => {
    if (ajusteGuardando || !ajusteValor.trim()) return;
    setAjusteGuardando(true);
    setAjusteEstado(null);
    try {
      await pedirRolProfesional(usuario.id, ajusteValor);
      setAjusteEstado({ tipo: "ok",
        texto: "Recibido. Comprobamos el número y te avisamos cuando el modo veterinario esté encendido." });
      setAjusteCampo(null); setAjusteValor("");
    } catch (err) {
      capturarError(err, { donde: "ajustes.colegiado" });
      setAjusteEstado({ tipo: "error",
        texto: "No se ha podido enviar. Inténtalo otra vez en un momento." });
    } finally {
      setAjusteGuardando(false);
    }
  };

  const filaAjuste = (Icono, titulo, subtitulo, onClick, peligro = false) => (
    <button onClick={onClick} className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl"
            style={{ background: "#FFFFFF", border: "1.5px solid #E3DAF0", cursor: "pointer" }}>
      <Icono size={17} strokeWidth={1.7} style={{ color: peligro ? "#B4436C" : VIOLETA, flexShrink: 0 }} />
      <span className="flex-1 text-left">
        <span className="block" style={{ color: peligro ? "#B4436C" : TINTA, fontFamily: fontBody, fontSize: 14, fontWeight: 600 }}>
          {titulo}
        </span>
        {subtitulo && (
          <span className="block truncate" style={{ color: MALVA, fontFamily: fontBody, fontSize: 12 }}>{subtitulo}</span>
        )}
      </span>
      <ChevronRight size={15} style={{ color: "#C9BEDD", flexShrink: 0 }} />
    </button>
  );

  const pantallaAjustes = ajustesAbiertos && (
    <div className="fixed inset-0 z-[75] overflow-y-auto" style={{ background: PAPEL }}>
      <Fuentes />
      <div style={{ background: VIOLETA }} className="w-full px-6 pt-10 pb-7">
        <div className="flex items-center justify-between mb-3">
          <button onClick={cerrarAjustes} aria-label="Volver"
                  style={{ background: "none", border: "none", cursor: "pointer" }}>
            <ChevronLeft size={22} style={{ color: "#FFFFFF" }} />
          </button>
          <span className="text-[11px] tracking-[0.18em] uppercase" style={{ color: MALVA, fontFamily: "monospace" }}>
            Ajustes
          </span>
        </div>
        <h1 className="text-3xl leading-tight" style={{ color: "#FFFFFF", fontFamily: fontDisplay, fontWeight: 500 }}>
          Tu cuenta<br />y tus perros
        </h1>
      </div>

      <div className="px-6 pt-6 pb-10 flex flex-col gap-6">
        {ajusteEstado && (
          <p className="text-sm leading-snug px-4 py-3 rounded-xl"
             style={{ fontFamily: fontBody,
                      color: ajusteEstado.tipo === "ok" ? "#2F6B4F" : "#B4436C",
                      background: ajusteEstado.tipo === "ok" ? "#E8F5EE" : "#FFE8EC" }}>
            {ajusteEstado.texto}
          </p>
        )}

        {/* ── LOS PERROS ── */}
        <div>
          <p className="text-[11px] tracking-[0.14em] uppercase mb-2" style={{ color: MALVA, fontFamily: "monospace" }}>
            {rotuloLista}
          </p>
          <div className="flex flex-col gap-2">
            {listaDePerros.map((p) => (
              <div key={p.id ?? "__nuevo__"} className="flex items-center gap-3 px-4 py-3 rounded-2xl"
                   style={{ background: "#FFFFFF", border: `1.5px solid ${p.esElDeAhora ? VIOLETA : "#E3DAF0"}` }}>
                <span aria-hidden="true" className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                      style={{ background: p.esElDeAhora ? VIOLETA : "#E3DAF0",
                               color: p.esElDeAhora ? "#FFFFFF" : VIOLETA,
                               fontFamily: fontDisplay, fontSize: 13, fontWeight: 700 }}>
                  {(p.nombre || "?").trim().charAt(0).toUpperCase()}
                </span>
                <span className="flex-1 truncate" style={{ color: TINTA, fontFamily: fontDisplay, fontSize: 15 }}>
                  {p.nombre}
                </span>
                {p.esElDeAhora ? (
                  <button onClick={() => { cerrarAjustes(); setFase("onboarding"); }}
                          className="text-xs px-3 py-1.5 rounded-full"
                          style={{ color: VIOLETA, background: "#F0EAF8", border: "none",
                                   fontFamily: fontBody, fontWeight: 600, cursor: "pointer" }}>
                    Editar ficha
                  </button>
                ) : (
                  <button onClick={() => { cerrarAjustes(); onCambiarDePerro(p.id); }}
                          className="text-xs px-3 py-1.5 rounded-full"
                          style={{ color: VIOLETA, background: "none", border: "1.5px solid #E3DAF0",
                                   fontFamily: fontBody, fontWeight: 600, cursor: "pointer" }}>
                    Ir a {p.nombre}
                  </button>
                )}
              </div>
            ))}
            {filaAjuste(Plus, rotuloAnadir, null, () => {
              cerrarAjustes();
              if (!perfil._id) { setFase("onboarding"); setPaso(1); return; }
              onAnadirPerro();
            })}
            {perfil._id && filaAjuste(Trash2, `Borrar a ${nombreMostrar}`,
              "Se van también sus menús guardados", () => {
                setErrorAlBorrarPerro(null);
                setPerroABorrar({ id: perfil._id, nombre: nombreMostrar });
              }, true)}
          </div>
        </div>

        {/* ── PROFESIONAL ──
            Dos cosas distintas en el mismo sitio: PEDIR la acreditación
            (dejar el número de colegiado) y, si ya la tienes, el
            INTERRUPTOR entre los dos modos. Nunca sale sin cuenta: sin
            perfil no hay nada que acreditar. */}
        {!sinCuenta && (
          <div>
            <p className="text-[11px] tracking-[0.14em] uppercase mb-2" style={{ color: MALVA, fontFamily: "monospace" }}>
              Profesional
            </p>
            {acreditado ? (
              <button
                onClick={() => cambiarModoProfesional(!enModoProfesional)}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-left"
                style={{ background: "#FFFFFF", border: `1.5px solid ${enModoProfesional ? VIOLETA : "#E3DAF0"}`, cursor: "pointer" }}>
                <Award size={17} style={{ color: enModoProfesional ? VIOLETA : MALVA, flexShrink: 0 }} />
                <span className="flex-1">
                  <span className="block" style={{ color: TINTA, fontFamily: fontBody, fontSize: 14 }}>
                    Modo veterinario
                  </span>
                  <span className="block text-xs" style={{ color: MALVA, fontFamily: fontBody }}>
                    {enModoProfesional
                      ? "Encendido: ves la ficha clínica de cada menú"
                      : "Apagado: usas Rawku como cualquier tutor"}
                  </span>
                </span>
                {/* El interruptor, dibujado a mano para no meter una
                    dependencia por un botón. */}
                <span aria-hidden="true" className="shrink-0 rounded-full"
                      style={{ width: 38, height: 22, padding: 3,
                               background: enModoProfesional ? VIOLETA : "#E3DAF0",
                               display: "flex", justifyContent: enModoProfesional ? "flex-end" : "flex-start" }}>
                  <span style={{ width: 16, height: 16, borderRadius: "50%", background: "#FFFFFF" }} />
                </span>
              </button>
            ) : ajusteCampo === "colegiado" ? (
              <div className="px-4 py-4 rounded-2xl flex flex-col gap-2"
                   style={{ background: "#FFFFFF", border: "1.5px solid #E3DAF0" }}>
                <p className="text-sm mb-1" style={{ color: TINTA, fontFamily: fontBody, fontWeight: 600 }}>
                  Tu número de colegiado
                </p>
                <p className="text-xs leading-snug mb-1" style={{ color: MALVA, fontFamily: fontBody }}>
                  Lo comprobamos a mano antes de encender el modo veterinario. Dejarlo
                  aquí no lo enciende: te avisamos cuando esté.
                </p>
                <input
                  type="text"
                  value={ajusteValor}
                  onChange={(e) => setAjusteValor(e.target.value)}
                  placeholder="COLVET-00000"
                  className="w-full px-3 py-2.5 rounded-xl"
                  style={{ border: "1.5px solid #E3DAF0", fontFamily: fontBody, fontSize: 14, color: TINTA }} />
                <div className="flex gap-2 mt-1">
                  <button onClick={() => { setAjusteCampo(null); setAjusteEstado(null); }}
                          className="flex-1 py-2.5 rounded-xl"
                          style={{ background: "#F0EBF8", color: VIOLETA, border: "none", fontFamily: fontBody, fontSize: 14, cursor: "pointer" }}>
                    Cancelar
                  </button>
                  <button onClick={enviarColegiado} disabled={!ajusteValor.trim()}
                          className="flex-1 py-2.5 rounded-xl"
                          style={{ background: ajusteValor.trim() ? VIOLETA : "#E3DAF0", color: "#FFFFFF",
                                   border: "none", fontFamily: fontBody, fontSize: 14,
                                   cursor: ajusteValor.trim() ? "pointer" : "default" }}>
                    Enviar
                  </button>
                </div>
              </div>
            ) : (
              filaAjuste(Award, "Soy veterinario/a", "Pedir el modo profesional", () => {
                setAjusteCampo("colegiado"); setAjusteValor(""); setAjusteEstado(null);
              })
            )}
          </div>
        )}

        {/* ── LA CUENTA ── */}
        <div>
          <p className="text-[11px] tracking-[0.14em] uppercase mb-2" style={{ color: MALVA, fontFamily: "monospace" }}>
            Tu cuenta
          </p>
          {sinCuenta ? (
            <div className="flex flex-col gap-2">
              <p className="text-xs leading-snug mb-1" style={{ color: MALVA, fontFamily: fontBody }}>
                Estás usando Rawku sin cuenta: todo se guarda en este móvil. Si creas una,
                {listaDePerros.length > 1 ? " tus perros y sus menús suben" : ` ${nombreMostrar} y sus menús suben`} solos.
              </p>
              {filaAjuste(Check, "Crear una cuenta", "Para tenerlo desde cualquier sitio",
                          () => { cerrarAjustes(); onCrearCuenta(); })}
              {filaAjuste(X, "Salir y borrar lo de este móvil", null,
                          () => { setAjustesAbiertos(false); setConfirmarDescartarLocal(true); }, true)}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {ajusteCampo === null && (
                <>
                  {filaAjuste(Info, "Correo", usuario?.email || "—", () => {
                    setAjusteCampo("correo"); setAjusteValor(""); setAjusteEstado(null);
                  })}
                  {filaAjuste(Lock, "Cambiar la contraseña", null, () => {
                    setAjusteCampo("password"); setAjusteValor(""); setAjusteValor2(""); setAjusteEstado(null);
                  })}
                  {filaAjuste(X, "Cerrar sesión", null, () => { cerrarAjustes(); logout(); })}
                </>
              )}
              {ajusteCampo !== null && (
                <div className="px-4 py-4 rounded-2xl flex flex-col gap-2"
                     style={{ background: "#FFFFFF", border: "1.5px solid #E3DAF0" }}>
                  <p className="text-sm mb-1" style={{ color: TINTA, fontFamily: fontBody, fontWeight: 600 }}>
                    {ajusteCampo === "password" ? "Nueva contraseña" : "Nuevo correo"}
                  </p>
                  <input
                    type={ajusteCampo === "password" ? "password" : "email"}
                    value={ajusteValor}
                    onChange={(e) => setAjusteValor(e.target.value)}
                    placeholder={ajusteCampo === "password" ? "Al menos 6 caracteres" : "tu@correo.com"}
                    className="w-full px-3 py-2.5 rounded-xl"
                    style={{ border: "1.5px solid #E3DAF0", fontFamily: fontBody, fontSize: 14 }}
                  />
                  {ajusteCampo === "password" && (
                    <input
                      type="password"
                      value={ajusteValor2}
                      onChange={(e) => setAjusteValor2(e.target.value)}
                      placeholder="Repítela"
                      className="w-full px-3 py-2.5 rounded-xl"
                      style={{ border: "1.5px solid #E3DAF0", fontFamily: fontBody, fontSize: 14 }}
                    />
                  )}
                  <div className="flex gap-2 mt-1">
                    <button onClick={guardarAjuste} disabled={ajusteGuardando}
                            className="flex-1 py-2.5 rounded-xl"
                            style={{ background: ajusteGuardando ? MALVA : VIOLETA, color: "#FFFFFF",
                                     border: "none", fontFamily: fontBody, fontWeight: 700, cursor: "pointer" }}>
                      {ajusteGuardando ? "Guardando..." : "Guardar"}
                    </button>
                    <button onClick={() => { setAjusteCampo(null); setAjusteEstado(null); }}
                            className="px-4 py-2.5 rounded-xl"
                            style={{ background: "none", color: MALVA, border: "1.5px solid #E3DAF0",
                                     fontFamily: fontBody, cursor: "pointer" }}>
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // Se cargan al entrar en la pantalla, no al arrancar la app: son hasta 200
  // filas y solo hacen falta cuando se va a buscar entre ellas.
  useEffect(() => {
    if (!enModoProfesional || fase !== "misMenus" || !usuario?.id || sinCuenta) return;
    if (menusDeTodos !== null) return;
    let vivo = true;
    getMenusDelProfesional(usuario.id)
      .then((filas) => { if (vivo) setMenusDeTodos(filas); })
      .catch((err) => {
        capturarError(err, { donde: "getMenusDelProfesional" });
        // Lista vacía NO: eso diría "no tienes menús" cuando lo que pasa es
        // que no se han podido leer. Se deja en null y se dice.
        if (vivo) setMenusDeTodos(undefined);
      });
    return () => { vivo = false; };
  }, [enModoProfesional, fase, usuario, sinCuenta, menusDeTodos]);

  const cerrarPaneles = () => {
    setMenuLigeroAbierto(false);
    setHojaDePerrosAbierta(false);
  };


  // ⚠️ AÑADIDO (5 agosto, noche): panel ligero para las pantallas de
  // antes de tener un menú generado (cuantos/personalizar/resultado) --
  // solo "Editar perfil", que es lo único que tiene sentido ahí. El
  // panel completo (con Evolución, Mis menús...) sigue viviendo dentro
  // de VistaMenus, una vez ya hay un menú de verdad.
  // ⚠️ LAS ENTRADAS DEL PANEL — UNA SOLA LISTA, UN SOLO ORDEN (24 agosto).
  //
  // El orden lo pidió ella y es éste, no otro: perfil, menús, evolución,
  // compra, analizar.
  //
  // LO IMPORTANTE NO ES LA LISTA, ES QUE TODAS SON ACCIONES DE FUERA
  // (`fase`, `seccionSuelta`, `abrirLaCompra`). Una entrada que dependa del
  // estado interno de una pantalla solo funciona dentro de esa pantalla --
  // que es exactamente por lo que "desde la compra no podía moverme a
  // algunas pantallas del menú lateral".
  //
  // Si añades una entrada: que su acción viva AQUÍ, no dentro de una vista.
  //
  // ⚠️ Y NAVEGAR NO ES SOLO LLAMAR A `ir()`. CASO REAL (25 agosto): "desde
  // la compra sigo sin poder ir a mis menús... ni a nada de nadaaaa". El
  // panel se abría, la entrada se pulsaba y `fase` cambiaba de verdad --
  // pero la compra es una CAPA FIJA (inset-0) que no depende de `fase`, así
  // que seguía tapando la pantalla nueva. Navegabas bien y no lo veías.
  //
  // Por eso se navega SIEMPRE por aquí: cerrar todo lo que esté por encima
  // y luego ir. Si algún día se añade otra capa fija, se cierra AQUÍ -- si
  // no, repetirá este fallo, que no da error y parece que el botón está
  // muerto.
  const navegarDesdeElPanel = (op) => {
    setMenuLigeroAbierto(false);
    setHojaDePerrosAbierta(false);
    setCompraAbierta(false);   // "La compra" la vuelve a abrir en su `ir()`
    op.ir();
  };

  const ENTRADAS_DEL_PANEL = [
    // ⚠️ QUITADO (25 agosto) — aquí había una sexta entrada, "El menú de la
    // semana". La puse el 24 para poder salir de las pantallas del panel
    // después de quitarles el "← Volver". Sobra por dos motivos: ella pidió
    // CINCO y esas cinco ("aparece el menú de la semana arriba"), y el menú
    // recién hecho no se pierde -- se guarda solo al generarlo, así que
    // está en "Mis menús". No había nada que rescatar.
    { key: "perfil", Icono: Dog,
      label: enModoProfesional ? `Ficha de ${nombreMostrar}` : `Perfil de ${nombreMostrar}`,
      isPremium: false,
      ir: () => {
        setSeccionSuelta(null);
        setEditandoLaFicha(true);
        // ⚠️ EN MODO VETERINARIO SE ABRE LA FICHA CLÍNICA (29 agosto). Con
        // un paciente ya guardado, `paso` vale TOTAL_PASOS + 1 -- "el
        // asistente ya está hecho" -- y eso pinta el resumen de tutor. La
        // ficha de una sola pantalla vive en los pasos, así que entrar a
        // editar tiene que devolver ahí: si no, el veterinario ve la ficha
        // clínica UNA vez, al dar de alta, y nunca más -- y el BCS, las
        // patologías y los datos del tutor se quedan sin sitio donde
        // corregirse.
        if (enModoProfesional) setPaso(1);
        setFase("onboarding");
      } },
    { key: "menus", Icono: ClipboardList, label: enModoProfesional ? "Menús" : "Mis menús",
      isPremium: false,
      ir: () => { setSeccionSuelta(null); setFase("misMenus"); } },
    // Solo en modo veterinario: el historial de lo firmado. Un tutor no
    // firma nada, así que para él esta entrada no significaría nada.
    ...(enModoProfesional ? [{
      key: "pautas", Icono: Award, label: "Pautas firmadas", isPremium: false,
      ir: () => {
        setSeccionSuelta(null);
        setFase("pautas");
        if (perfil._id) {
          getPautasFirmadas(perfil._id)
            .then(setPautasFirmadas)
            .catch((err) => capturarError(err, { donde: "getPautasFirmadas" }));
        }
      },
    }] : []),
    { key: "evolucion", Icono: TrendingUp, label: "Evolución y crecimiento", isPremium: true,
      ir: () => { setSeccionSuelta("evolucion"); setFase("seccion"); } },
    // ⚠️ EN MODO PROFESIONAL NO HAY CESTA. Un veterinario no hace la compra
    // de un perro que no es suyo. La lista de la compra sigue existiendo --
    // es de lo que el tutor se lleva --, pero no es una pantalla suya.
    ...(enModoProfesional ? [] : [
      { key: "compra", Icono: ShoppingBasket, label: "La compra", isPremium: false,
        ir: () => abrirLaCompra() }]),
    { key: "analizar", Icono: Search, label: "Analizar la dieta actual", isPremium: true,
      ir: () => { setSeccionSuelta("analizar"); setFase("seccion"); } },
  ];

  const panelLigero = menuLigeroAbierto && (
    <div className="fixed inset-0 z-[60] flex" style={{ background: "rgba(35,21,57,0.4)" }} onClick={() => setMenuLigeroAbierto(false)}>
      <div role="dialog" aria-label="Panel lateral" className="w-[78%] max-w-xs h-full flex flex-col" style={{ background: "#FFFFFF" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ background: VIOLETA }} className="px-6 pt-10 pb-6 flex items-center justify-between">
          <p className="text-xl" style={{ color: "#FFFFFF", fontFamily: fontDisplay }}>{nombreMostrar}</p>
          <button onClick={() => setMenuLigeroAbierto(false)} aria-label="Cerrar el menú"><X size={22} style={{ color: "#FFFFFF" }} /></button>
        </div>
        {/* ⚠️ QUITADO DE AQUÍ (24 agosto) — pedido expreso: "que cambiar
            de perro esté metido en una pestaña del panel es esconderlo".
            Vive en la burbuja de la cabecera, que se ve sin abrir nada.
            El panel se queda con lo que es: navegación. */}
        {/* ⚠️ REHECHO (24 agosto) — CASO REAL: "el menú lateral está
            jodido, cuando me meto en evolución y crecimiento cambia el
            menú lateral. Luego, desde la compra no puedo moverme a algunas
            pantallas del menú lateral."
            Y la lista pedida, literal: "Perfil de <perro>, Mis menús,
            Evolución y crecimiento, La compra y Analizar la dieta actual.
            En ese orden. Y desde todas se tiene que poder abrir todas las
            demás sin problema."

            HABÍA DOS PANELES. Uno vivía dentro de VistaMenus (con sus
            propias secciones) y otro aquí fuera, cada uno con sus entradas
            y su orden. Por eso cambiaba al moverte, y por eso desde la
            compra no se llegaba a todo: sus entradas eran de un panel que
            en esa pantalla no existía.

            Ahora hay UNO. El de dentro se ha borrado y su hamburguesa abre
            éste. Y las cinco acciones son todas de FUERA (fase /
            seccionSuelta / abrirLaCompra), que es lo que hace que
            funcionen desde cualquier pantalla: una entrada que dependa del
            estado interno de una pantalla solo sirve dentro de ella. */}
        <div className="flex-1 px-3 pt-4">
          {ENTRADAS_DEL_PANEL.map((op) => {
            const bloqueado = op.isPremium && !premium;
            return (
              <button
                key={op.key}
                onClick={() => navegarDesdeElPanel(op)}
                className="w-full flex items-center gap-3 px-3 py-3.5 rounded-xl"
                style={{ background: "none", border: "none", cursor: "pointer" }}
              >
                <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: PAPEL }}>
                  <op.Icono size={17} strokeWidth={1.6} style={{ color: bloqueado ? MALVA : VIOLETA }} />
                </div>
                <span className="flex-1 text-left" style={{ color: bloqueado ? MALVA : TINTA, fontFamily: fontDisplay, fontSize: 16 }}>
                  {op.label}
                </span>
                {bloqueado && <span className="text-[10px] mr-1" style={{ color: MALVA, fontFamily: "monospace" }}>premium</span>}
                <ChevronRight size={16} style={{ color: "#C9BEDD" }} />
              </button>
            );
          })}

          {/* "Por qué Rawku" no está en las cinco que pidió, pero tampoco
              hay que perderlo: es informativo, no navegación. Va abajo y en
              pequeño, no como una sexta entrada. */}
          <button
            onClick={() => navegarDesdeElPanel({ ir: () => { setSeccionSuelta("porque"); setFase("seccion"); } })}
            className="w-full text-left px-3 py-3 mt-2"
            style={{ background: "none", border: "none", borderTop: "1px solid #F0EAF8", cursor: "pointer" }}
          >
            <span style={{ color: MALVA, fontFamily: fontBody, fontSize: 13 }}>Por qué Rawku</span>
          </button>
        </div>
        {/* ⚠️ AÑADIDO (5 agosto, madrugada) — mismo patrón que en el
            menú lateral completo: marca de versión visible para poder
            confirmar si Vercel está sirviendo de verdad la última
            versión, dado el patrón repetido de despliegues viejos. */}
        <p className="text-[10px] text-center pb-3" style={{ color: "#D8CFEC", fontFamily: "monospace" }}>
          build 2026-08-22 · sin muro de pago
        </p>
        {usuario && !premium && (
          <button
            onClick={() => { setMenuLigeroAbierto(false); setMostrarSuscripcion(true); }}
            className="w-full text-center py-3 mx-auto mb-2 rounded-xl"
            style={{ color: '#FFFFFF', background: ROSA, fontFamily: fontBody, fontSize: 14, fontWeight: 700, border: 'none', cursor: 'pointer', maxWidth: 280 }}
          >
            {PAYWALL_ES_DEMO ? "✨ Ver Rawku Premium (sin pago)" : "✨ Hazte Premium — 7 días gratis"}
          </button>
        )}
        {/* ⚠️ En modo prueba hace falta poder VOLVER a no ser Premium:
            si no, en cuanto lo enciendes una vez ya no hay forma de ver
            la app como la ve alguien que no lo es. */}
        {usuario && premium && PAYWALL_ES_DEMO && (
          <button
            onClick={() => { setMenuLigeroAbierto(false); cambiarPremiumDemo(false); }}
            className="w-full text-center py-2 mx-auto mb-2"
            style={{ color: MALVA, fontFamily: 'monospace', fontSize: 11, background: 'none', border: 'none', cursor: 'pointer' }}
          >
            Premium de prueba activo · apagar
          </button>
        )}
        {/* ⚠️ Sin cuenta no hay sesión que cerrar. Lo que se ofrece es
            crearla — y "salir" borra lo de este móvil, así que lo dice
            claro y va en gris pequeño, lejos del otro botón. */}
        {sinCuenta && (
          <>
            <button
              onClick={() => { setMenuLigeroAbierto(false); onCrearCuenta(); }}
              className="w-full text-center py-3 mx-auto mb-2 rounded-xl"
              style={{ color: '#FFFFFF', background: VIOLETA, fontFamily: fontBody, fontSize: 14, fontWeight: 700, border: 'none', cursor: 'pointer' }}
            >
              Crear una cuenta
            </button>
            <button
              onClick={() => { setMenuLigeroAbierto(false); setConfirmarDescartarLocal(true); }}
              className="w-full text-center pb-4"
              style={{ color: MALVA, fontFamily: fontBody, fontSize: 13, background: 'none', border: 'none', cursor: 'pointer' }}
            >
              Salir y borrar lo de este móvil
            </button>
          </>
        )}
        {usuario && !sinCuenta && (
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

  // ⚠️ Los avisos van FUERA del panel: hay que poder verlos con el panel
  // ya cerrado (el de borrar se lanza desde la ficha del perro) y por
  // encima de él (el de cambiar de perro se lanza desde el propio panel).
  // Se cuelgan de `drawerLigero` para que aparezcan en las ~16 pantallas
  // que ya lo pintaban, sin tener que tocarlas una por una.
  const avisoCambiarDePerro = perroAlQueIrmeTrasAvisar !== null && (
    <div className="fixed inset-0 z-[80] flex items-center justify-center px-6" style={{ background: "rgba(35,21,57,0.55)" }}>
      <div className="w-full max-w-sm rounded-2xl p-6" style={{ background: "#FFFFFF" }}>
        <p className="text-lg mb-2" style={{ color: TINTA, fontFamily: fontDisplay }}>
          Estás creando a {perfil.nombre.trim() || "un perro nuevo"}
        </p>
        <p className="text-sm mb-5 leading-snug" style={{ color: MALVA, fontFamily: fontBody }}>
          Todavía no está guardado. Si cambias de perro ahora, tendrás que
          empezar su ficha otra vez desde el principio.
        </p>
        <button
          onClick={() => {
            const destino = perroAlQueIrmeTrasAvisar;
            setPerroAlQueIrmeTrasAvisar(null);
            cerrarPaneles();
            onCambiarDePerro(destino);
          }}
          className="w-full py-3 rounded-xl mb-2"
          style={{ background: ROSA, color: "#FFFFFF", fontFamily: fontBody, fontWeight: 700, border: "none" }}
        >
          Cambiar igualmente
        </button>
        <button
          onClick={() => setPerroAlQueIrmeTrasAvisar(null)}
          className="w-full py-3 rounded-xl"
          style={{ background: "none", color: MALVA, fontFamily: fontBody, border: "none" }}
        >
          Seguir con esta ficha
        </button>
      </div>
    </div>
  );

  // ⚠️ Salir de "sin cuenta" borra lo que hay en este móvil, y no hay
  // copia en ningún sitio: sin confirmación, un toque despistado se lleva
  // los perros y los menús para siempre. Mismo patrón que borrar perro.
  const avisoDescartarLocal = confirmarDescartarLocal && (
    <div className="fixed inset-0 z-[80] flex items-center justify-center px-6" style={{ background: "rgba(35,21,57,0.55)" }}>
      <div className="w-full max-w-sm rounded-2xl p-6" style={{ background: "#FFFFFF" }}>
        <p className="text-lg mb-2" style={{ color: TINTA, fontFamily: fontDisplay }}>
          ¿Salir y borrar lo de este móvil?
        </p>
        <p className="text-sm mb-5 leading-snug" style={{ color: MALVA, fontFamily: fontBody }}>
          Estás usando Rawku sin cuenta, así que {perros.length === 1 ? "el perro" : `los ${perros.length} perros`} y
          {menusGuardados.length > 0 ? ` sus ${menusGuardados.length} menús` : " sus menús"} sólo existen aquí.
          Si sales, se pierden. Si prefieres conservarlos, crea una cuenta y suben solos.
        </p>
        <button
          onClick={() => { setConfirmarDescartarLocal(false); onCrearCuenta(); }}
          className="w-full py-3 rounded-xl mb-2"
          style={{ background: VIOLETA, color: "#FFFFFF", fontFamily: fontBody, fontWeight: 700, border: "none", cursor: "pointer" }}
        >
          Mejor creo la cuenta
        </button>
        <button
          onClick={() => { setConfirmarDescartarLocal(false); onDescartarLocal(); }}
          className="w-full py-3 rounded-xl mb-2"
          style={{ background: "transparent", color: "#B4436C", fontFamily: fontBody, fontWeight: 700, border: "1.5px solid #B4436C", cursor: "pointer" }}
        >
          Sí, salir y borrarlo
        </button>
        <button
          onClick={() => setConfirmarDescartarLocal(false)}
          className="w-full py-3"
          style={{ background: "none", border: "none", color: MALVA, fontFamily: fontBody, cursor: "pointer" }}
        >
          Cancelar
        </button>
      </div>
    </div>
  );

  const avisoBorrarPerro = perroABorrar && (
    <div className="fixed inset-0 z-[80] flex items-center justify-center px-6" style={{ background: "rgba(35,21,57,0.55)" }}>
      <div className="w-full max-w-sm rounded-2xl p-6" style={{ background: "#FFFFFF" }}>
        <p className="text-lg mb-2" style={{ color: TINTA, fontFamily: fontDisplay }}>
          ¿Borrar a {perroABorrar.nombre}?
        </p>
        <p className="text-sm mb-5 leading-snug" style={{ color: MALVA, fontFamily: fontBody }}>
          Se borran también sus menús guardados
          {menusGuardados.length > 0 ? ` (${menusGuardados.length})` : ""}. Esto no se puede deshacer.
        </p>
        {errorAlBorrarPerro && (
          <p className="text-sm mb-3 leading-snug" style={{ color: "#B4436C", fontFamily: fontBody }}>
            {errorAlBorrarPerro}
          </p>
        )}
        <button
          disabled={borrandoPerro}
          onClick={() => {
            const id = perroABorrar.id;
            setBorrandoPerro(true);
            setErrorAlBorrarPerro(null);
            eliminarPerro(id)
              .then(() => {
                setBorrandoPerro(false);
                setPerroABorrar(null);
                onPerroEliminado(id);
              })
              .catch((err) => {
                // Antes de esto no existía borrar perro, así que no había
                // fallo que enseñar. Ahora sí: si Supabase dice que no, se
                // dice, y el perro sigue donde estaba.
                setBorrandoPerro(false);
                setErrorAlBorrarPerro("No se ha podido borrar. Inténtalo otra vez en un momento.");
                capturarError(err, { donde: "eliminarPerro", perroId: id });
              });
          }}
          className="w-full py-3 rounded-xl mb-2"
          style={{ background: borrandoPerro ? "#E0D3D9" : "#B4436C", color: "#FFFFFF", fontFamily: fontBody, fontWeight: 700, border: "none" }}
        >
          {borrandoPerro ? "Borrando..." : "Sí, borrar"}
        </button>
        <button
          disabled={borrandoPerro}
          onClick={() => { setPerroABorrar(null); setErrorAlBorrarPerro(null); }}
          className="w-full py-3 rounded-xl"
          style={{ background: "none", color: MALVA, fontFamily: fontBody, border: "none" }}
        >
          No, dejarlo
        </button>
      </div>
    </div>
  );

  // ⚠️ LA PANTALLA DE LA COMPRA. Cuelga de `drawerLigero`, que es lo que
  // la hace alcanzable desde las ~16 pantallas donde está el panel: si
  // viviera dentro de VistaMenus solo existiría con un menú recién
  // generado, que es justo lo contrario de para lo que sirve.
  const pantallaDeLaCompra = compraAbierta ? (
    // ⚠️ z-[55] y no z-[60]: por encima de las secciones (z-50), pero por
    // DEBAJO del panel lateral (z-60) y de la hoja de perros (z-70). Con
    // los tres al mismo nivel, abrir el panel desde aquí lo dejaba detrás
    // -- se veía el oscurecido y ningún panel.
    <div role="dialog" aria-label="La compra"
         className="fixed inset-0 z-[55] flex flex-col px-6 pt-10 pb-8 overflow-y-auto" style={{ background: PAPEL }}>
      {/* ⚠️ AÑADIDO (24 agosto) — CASO REAL: "en la pantalla de la compra no
          aparece la hamburguesa del menú lateral ni lo del perfil". Misma
          cabecera que el resto: hamburguesa IZQUIERDA, burbuja DERECHA. */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <BotonMenu onClick={() => { setMenuLigeroAbierto(true); }} color={VIOLETA} className="p-1" />
        {burbujaDePerfil(false)}
      </div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-2xl" style={{ color: TINTA, fontFamily: fontDisplay }}>La compra</p>
        <button onClick={() => setCompraAbierta(false)} aria-label="Cerrar"
                style={{ background: "none", border: "none" }}>
          <X size={22} style={{ color: MALVA }} />
        </button>
      </div>

      {cargandoCompra && (
        <p className="text-sm" style={{ color: MALVA, fontFamily: fontBody }}>Sumando tus menús...</p>
      )}

      {!cargandoCompra && errorCompra && (
        <p className="text-sm" style={{ color: ROSA, fontFamily: fontBody }}>{errorCompra}</p>
      )}

      {!cargandoCompra && !errorCompra && cestaDelPanel.length === 0 && (
        <p className="text-sm leading-relaxed" style={{ color: MALVA, fontFamily: fontBody }}>
          Todavía no hay ningún menú guardado del que sacar la compra. Haz uno y
          guárdalo, y aquí tendrás la lista.
        </p>
      )}

      {!cargandoCompra && cestaDelPanel.length > 0 && (
        <>
          {/* El filtro solo tiene sentido con más de un perro. Con uno,
              "toda la casa" y "solo Ruffo" son lo mismo. */}
          {(compraGuardada || []).length > 1 && (
            <div className="flex gap-2 flex-wrap mb-4">
              {[{ clave: null, texto: "Toda la casa" },
                ...(compraGuardada || []).map((p) => ({ clave: p.nombre, texto: p.nombre }))
              ].map((op) => {
                const activo = compraDeQuien === op.clave;
                return (
                  <button key={op.texto} onClick={() => setCompraDeQuien(op.clave)}
                    aria-pressed={activo}
                    className="px-3 py-1.5 rounded-full text-xs"
                    style={{ background: activo ? VIOLETA : "#FFFFFF",
                             color: activo ? "#FFFFFF" : VIOLETA,
                             border: `1.5px solid ${activo ? VIOLETA : "#E3DAF0"}`,
                             fontFamily: fontBody, fontWeight: activo ? 700 : 400 }}>
                    {op.texto}
                  </button>
                );
              })}
            </div>
          )}

          {/* ⚠️ REHECHO (24 agosto) — QUÉ MENÚ Y CUÁNTO.
              Pedido: "se debería poder elegir el menú en la compra para ver
              los alimentos de cada menú por separado o en conjunto, como
              elija el usuario". */}
          {menusDeLaCompra.length > 1 && (
            <>
              <p className="text-[10px] tracking-[0.14em] uppercase mb-1.5" style={{ color: MALVA, fontFamily: "monospace" }}>
                ¿Qué menú?
              </p>
              <div className="flex gap-2 flex-wrap mb-4">
                {[{ indice: null, texto: "Todos juntos" },
                  ...menusDeLaCompra.map((m) => ({
                    indice: m.indice,
                    texto: `${m.etiqueta} · ${m.dias} ${m.dias === 1 ? "día" : "días"}`,
                  }))].map((op) => {
                  const activo = compraMenu === op.indice;
                  return (
                    <button key={op.texto}
                      onClick={() => { setCompraMenu(op.indice); setCompraTandas(1); }}
                      aria-pressed={activo}
                      className="px-3 py-1.5 rounded-full text-xs"
                      style={{ background: activo ? VIOLETA : "#FFFFFF",
                               color: activo ? "#FFFFFF" : VIOLETA,
                               border: `1.5px solid ${activo ? VIOLETA : "#E3DAF0"}`,
                               fontFamily: fontBody, fontWeight: activo ? 700 : 400 }}>
                      {op.texto}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {/* ⚠️ Y AQUÍ EL ARREGLO DE CONCEPTO. Antes ponía "3 días / 1
              semana / 2 semanas / 1 mes" y multiplicaba la semana. Con los
              menús juntos eso vale; mirando UN menú de 3 días, "1 semana" no
              significa nada. Ahora la pregunta cambia con lo que estás
              mirando, y CADA OPCIÓN DICE CUÁNTOS DÍAS DE COMIDA da. */}
          <p className="text-[10px] tracking-[0.14em] uppercase mb-1.5" style={{ color: MALVA, fontFamily: "monospace" }}>
            {compraMenu === null ? "¿Para cuántas semanas?" : "¿Cuántas tandas?"}
          </p>
          <div className="flex gap-2 flex-wrap mb-4">
            {(() => {
              const diasPorTanda = compraMenu === null
                ? 7
                : (menusDeLaCompra.find((m) => m.indice === compraMenu)?.dias || 7);
              return [1, 2, 4].map((veces) => {
                const dias = diasPorTanda * veces;
                const texto = compraMenu === null
                  ? `${veces} ${veces === 1 ? "semana" : "semanas"}`
                  : `${veces} ${veces === 1 ? "tanda" : "tandas"} · ${dias} días`;
                const activo = compraTandas === veces;
                return (
                  <button key={veces} onClick={() => setCompraTandas(veces)}
                    aria-pressed={activo}
                    className="px-3 py-1.5 rounded-full text-xs"
                    style={{ background: activo ? VIOLETA : "#FFFFFF",
                             color: activo ? "#FFFFFF" : VIOLETA,
                             border: `1.5px solid ${activo ? VIOLETA : "#E3DAF0"}`,
                             fontFamily: fontBody, fontWeight: activo ? 700 : 400 }}>
                    {texto}
                  </button>
                );
              });
            })()}
          </div>

          <p className="text-xs mb-4 leading-snug" style={{ color: MALVA, fontFamily: fontBody }}>
            {compraDeQuien
              ? `Para ${compraDeQuien}, ${compraDeLoQueMiras ? "del menú que tienes en pantalla" : "de su último menú guardado"}.`
              : (compraGuardada || []).length > 1
                ? `Para ${nombresDeLosPerros(compraGuardada || [])} juntos, ${compraDeLoQueMiras ? "de los menús que tienes en pantalla" : "del último menú guardado de cada uno"}.`
                : compraDeLoQueMiras
                  ? "Del menú que tienes en pantalla."
                  : "De tu último menú guardado."}
            {" "}
            {/* El número que de verdad importa en la tienda: para cuántos
                días de comida es esta lista. Nunca una cifra sin explicar. */}
            <b style={{ color: TINTA }}>
              {compraMenu === null
                ? `${diasDeLaCompra} días de comida`
                : `${menusDeLaCompra.find((m) => m.indice === compraMenu)?.etiqueta} — ${diasDeLaCompra} días de comida`}
            </b>.
          </p>

          {cestaDelPanel.map((zona) => (
            <div key={zona.clave} className="rounded-2xl p-4 mb-3" style={{ background: "#FFFFFF", border: "1.5px solid #E3DAF0" }}>
              <p className="text-[10px] tracking-[0.14em] uppercase mb-2" style={{ color: VIOLETA, fontFamily: "monospace" }}>
                {zona.titulo}
              </p>
              {zona.lineas.map((linea) => {
                const deQuien = deQuienEs(linea.deQuien,
                  compraDeQuien ? 1 : (compraGuardada || []).length);
                const hecho = marcados.has(linea.alimento);
                return (
                  // ⚠️ La línea ENTERA es el botón, no una casilla de 20px:
                  // esto se usa de pie en una tienda, con una mano.
                  <button key={linea.alimento}
                    onClick={() => marcar(linea.alimento)}
                    aria-pressed={hecho}
                    aria-label={`${linea.alimento}: ${hecho ? "ya lo tienes" : "te falta"}`}
                    className="w-full flex items-center justify-between gap-3 mb-1.5 text-left"
                    style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <span aria-hidden="true"
                        className="w-5 h-5 rounded-md flex items-center justify-center shrink-0"
                        style={{ background: hecho ? VIOLETA : "#FFFFFF",
                                 border: `1.5px solid ${hecho ? VIOLETA : "#C9BEDD"}` }}>
                        {hecho && <Check size={13} strokeWidth={3} style={{ color: "#FFFFFF" }} />}
                      </span>
                      <span className="text-sm truncate"
                            style={{ color: hecho ? MALVA : TINTA, fontFamily: fontBody,
                                     textDecoration: hecho ? "line-through" : "none" }}>
                        {linea.alimento}
                        {deQuien && (
                          <span className="text-[10px] ml-1" style={{ color: MALVA, fontFamily: "monospace" }}>
                            {deQuien}
                          </span>
                        )}
                      </span>
                    </span>
                    <span className="text-sm shrink-0"
                          style={{ color: hecho ? MALVA : VIOLETA, fontFamily: fontBody, fontWeight: 700,
                                   textDecoration: hecho ? "line-through" : "none" }}>
                      {formatearCompra(linea.gramos)}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}

          {/* ⚠️ "Un botón para regenerar y dejarlo todo a cero como si no
              tuvieras nada". Solo se pinta si hay algo marcado: un botón de
              borrar siempre visible se pulsa sin querer. */}
          {marcados.size > 0 && (
            <button
              onClick={desmarcarTodo}
              className="w-full py-3 rounded-xl mb-3"
              style={{ background: "#FFFFFF", color: VIOLETA, border: "1.5px solid #E3DAF0",
                       fontFamily: fontBody, fontSize: 14, fontWeight: 700, cursor: "pointer" }}
            >
              Empezar de cero ({marcados.size} {marcados.size === 1 ? "marcado" : "marcados"})
            </button>
          )}

          <p className="text-[11px] leading-snug mb-2" style={{ color: MALVA, fontFamily: fontBody }}>
            Compra un poco de más en lo fresco: al deshuesar y limpiar se pierde
            parte, y estas cifras son de comida ya lista para pesar.
          </p>
        </>
      )}
    </div>
  ) : null;

  const drawerLigero = (
    <>
      {pantallaDeLaCompra}
      {panelLigero}
      {avisoCambiarDePerro}
      {avisoBorrarPerro}
      {avisoDescartarLocal}
      {hojaDePerros}
      {pantallaAjustes}
    </>
  );

  // ⚠️ AÑADIDO — GENERAR LOS MENÚS DE TODOS LOS PERROS DE LA CASA.
  //
  // Una sola llamada a /menu/varios-perros con la ficha de cada perro.
  // El reparto de quién manda y cuánto se amolda cada uno lo decide el
  // servidor, que es donde está el motor -- aquí solo se manda quién es
  // quién y se enseña lo que vuelve.
  //
  // Cada perro va con SUS kcal, SU etapa y SUS alergias: lo único que se
  // comparte, y solo en modo "parecidos", es la lista de alimentos. Un
  // menú que no cumpla lo suyo no sale, igual que en el resto de la app.
  // Las fichas de todos los perros, en el orden que enseña la app: el que
  // se está mirando primero (con los cambios de pantalla, que pueden no
  // estar guardados aún) y los demás como están en Supabase.
  const fichasDeLaCasa = () => [
    { id: perfil._id, nombre: nombreMostrar, perfil },
    ...(perros || [])
      .filter((p) => p.id !== perfil._id)
      .map((p) => ({ id: p.id, nombre: p.nombre || "Sin nombre", perfil: perfilDesdeSupabase(p) })),
  ];

  // `configsDelMenu` es un ARRAY: la configuración de Personalizar de cada
  // menú, en orden. Antes era una sola para toda la semana, y de ahí el
  // fallo que encontró la usuaria: "en el menú 1 puse conejo y en el 2
  // pollo, y me los ha dado los dos de pollo" -- se mandaba la del menú
  // que estuvieras editando al pulsar Generar, y valía para todos.
  //
  // No se parte en una llamada por menú a propósito: el reparto del
  // presupuesto semanal de seguridad crónica (vitamina D, yodo, selenio,
  // mercurio) lo lleva el endpoint, y una llamada por menú le daría a cada
  // uno el presupuesto de la semana entera cubriendo solo 3 o 4 días. Va
  // todo en la misma petición, en `personalizacion_por_menu`.
  const generarMenusDeLaCasa = async (comoSeQuieren, cuantos = 1, configsDelMenu = null) => {
    setCargandoCasa(true);
    setErrorCasa(null);
    setMenusDeLaCasa(null);
    setGuardadosCasa(false);
    setFase("casa");

    const fichas = fichasDeLaCasa();
    const configs = Array.isArray(configsDelMenu) ? configsDelMenu : null;

    // Uno por menú, en el orden en que se pidieron. El servidor aplica
    // cada uno al menú que le toca y deja que los demás perros se amolden
    // a ese menú, no al de otro.
    const porMenu = configs
      ? Array.from({ length: cuantos }, (_, i) => {
          const c = configs[i] || null;
          return {
            forzar_presencia: c ? eleccionesDelUsuario("personalizar", c) : [],
            nombres_alimentos: c ? eleccionesDelUsuario("personalizar", c) : [],
            restringir_especie: c ? restriccionesDeEspecie("personalizar", c) : null,
          };
        })
      : null;

    // Lo elegido a mano en Personalizar. Se manda a TODOS los perros: al
    // que mande se le fuerza, y los demás se amoldan a su menú, así que
    // acaba en la casa entera -- que es lo que se pide al personalizar
    // para varios.
    //
    // Con varios menús esto es solo el punto de partida: manda
    // `personalizacion_por_menu`, que va menú a menú. Se sigue mandando
    // para que un servidor viejo (Render sirviendo una versión anterior)
    // no se quede sin NADA de lo elegido -- daría el fallo de antes, que
    // es feo, pero no dejaría a nadie sin menú.
    const primero = configs ? configs[0] : null;
    const elegidos = primero ? eleccionesDelUsuario("personalizar", primero) : [];
    const especiePorCategoria = primero
      ? restriccionesDeEspecie("personalizar", primero) : null;

    try {
      const res = await fetchConTimeout(`${API_BASE}/menu/varios-perros`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          perros: fichas.map((f) => ({
            ...cuerpoApiDeUnPerro(f.perfil),
            ...(elegidos.length > 0
              ? { modo: "personalizar", forzar_presencia: elegidos,
                  nombres_alimentos: elegidos, restringir_especie: especiePorCategoria }
              : {}),
          })),
          nombres: fichas.map((f) => f.nombre),
          modo_conjunto: comoSeQuieren === "parecidos" ? "parecidos" : "distintos",
          numero_de_menus: cuantos,
          ...(porMenu ? { personalizacion_por_menu: porMenu } : {}),
        }),
      });
      let cuerpo;
      try {
        cuerpo = await res.json();
      } catch {
        cuerpo = { factible: false, motivo: `Respuesta no válida del servidor (HTTP ${res.status}).` };
      }
      if (!cuerpo.factible) {
        setErrorCasa(cuerpo.motivo || "No hemos encontrado menús que cumplan para todos.");
      } else {
        // Se guardan junto el id del perro y su dieta actual: la respuesta
        // no los trae (el servidor no sabe nada de Supabase) y hacen falta
        // para guardar el menú de cada uno en SU ficha y para saber quién
        // necesita transición.
        setMenusDeLaCasa({
          ...cuerpo,
          perros: (cuerpo.perros || []).map((p, i) => ({
            ...p,
            perroId: fichas[i]?.id ?? null,
            dietaActual: dietasDeLaCasa[fichas[i]?.id] ?? null,
            // ⚠️ Lo que ese perro NECESITA al día. Hace falta para poder
            // enseñarlo AL LADO de lo que aporta el menú: el motor admite
            // un 3% arriba o abajo (tolerancia_kcal), así que un perro de
            // 1602 kcal puede recibir un menú de 1555 y estar bien. Sin
            // las dos cifras, esa diferencia parece un error de cálculo
            // -- y es exactamente lo que pasó: "Cairo necesita 1602 pero
            // me genera un menú de 1555, no sé por qué".
            necesitaKcal: fichas[i] ? Math.round(datosDeUnPerro(fichas[i].perfil).derReal) : null,
          })),
        });
      }
    } catch (err) {
      setErrorCasa(err?.esTimeout
        ? "El servidor no ha contestado a tiempo. Suele pasar tras un rato sin uso: inténtalo otra vez."
        : "No hemos podido conectar con el servidor. Comprueba la conexión e inténtalo otra vez.");
      capturarError(err, { donde: "generarMenusDeLaCasa", cuantos: fichas.length });
    } finally {
      setCargandoCasa(false);
    }
  };

  const guardarMenusDeLaCasa = async () => {
    if (!usuario || !menusDeLaCasa || guardandoCasa) return;
    setGuardandoCasa(true);
    try {
      for (const p of menusDeLaCasa.perros) {
        // Sin dueño no se guarda: sería un menú perdido. Y el de cada perro
        // va a SU ficha -- guardarlos todos en el que estabas mirando le
        // daría a un animal las cantidades de otro.
        if (!p.perroId || !p.factible || !(p.menus || []).length) continue;
        const fila = await guardarMenu(usuario.id, p.perroId, {
          modo: "automatico",
          derReal: p.menus[0]?.kcal_total ?? null,
          etapaLabel: null,
          menusData: p.menus,
          numMenus: p.menus.length,
          nombre: `Menú de casa · ${p.nombre}`,
        });
        // Que aparezca ya en "Mis menús" del perro que se está mirando,
        // sin recargar. Los de los otros aparecen al cambiar a ellos.
        if (fila && p.perroId === perfil._id) setMenusGuardados((previos) => [fila, ...previos]);
      }
      setGuardadosCasa(true);
    } catch (err) {
      capturarError(err, { donde: "guardarMenusDeLaCasa" });
      setErrorCasa("Los menús están hechos, pero no se han podido guardar. Inténtalo otra vez.");
    } finally {
      setGuardandoCasa(false);
    }
  };

  // La compra de la semana, sumando lo de todos los perros. Es el motivo
  // entero de que los menús se parezcan: si cada perro lleva lo suyo, la
  // lista es el doble de larga y hay que porcionar dos veces.

  // ⚠️ AÑADIDO — AÑADIR OTRO PERRO DESDE LA PRIMERA VEZ.
  //
  // Pedido expreso: poder decir "tengo más de un perro" ya en la primera
  // pantalla, la de la ficha del perro antes de hacer el menú. Antes la
  // invitación solo salía con la ficha YA guardada, o sea nunca la
  // primera vez -- que es justo cuando la persona está pensando en sus
  // perros y sabe cuántos tiene.
  //
  // La primera vez la ficha todavía no está en Supabase (se guarda al
  // entrar al generador), así que hay que guardarla ANTES de empezar la
  // siguiente: empezar otra sin guardar ésta se la llevaría por delante,
  // porque añadir perro remonta la app entera.
  const [guardandoParaAnadirOtro, setGuardandoParaAnadirOtro] = useState(false);
  const [errorAlAnadirOtro, setErrorAlAnadirOtro] = useState(null);

  const anadirOtroPerroGuardandoEste = async () => {
    if (guardandoParaAnadirOtro) return;
    // Ya guardado (o sin sesión donde guardar): directo.
    if (perfil._id || !usuario) { onAnadirPerro(); return; }
    setGuardandoParaAnadirOtro(true);
    setErrorAlAnadirOtro(null);
    try {
      const guardado = await guardarPerro(usuario.id, { ...perfil, id: perfil._id },
        { etapa: etapaCalculada, pesoAdultoEsperado, dietaActual });
      if (!guardado?.id) throw new Error("Supabase no devolvió el perro guardado");
      onPerroGuardado(guardado);
      await nacerComoPaciente(guardado);
      onAnadirPerro();
    } catch (err) {
      // Si no se ha podido guardar NO se navega: irse ahora perdería la
      // ficha que se acaba de rellenar entera.
      capturarError(err, { donde: "anadirOtroPerroGuardandoEste" });
      setErrorAlAnadirOtro(`No hemos podido guardar la ficha de ${nombreMostrar}. ` +
                           "Inténtalo otra vez antes de añadir otro perro.");
    } finally {
      setGuardandoParaAnadirOtro(false);
    }
  };

  // La tarjeta de "¿tienes más perros?", que se usa en dos sitios: en la
  // ficha del perro y en la pantalla de hacer el menú.
  const invitacionAOtroPerro = (
    <>
      <button
        onClick={anadirOtroPerroGuardandoEste}
        disabled={guardandoParaAnadirOtro}
        className="w-full flex items-center gap-3 p-4 rounded-2xl"
        style={{ background: "#FFFFFF", border: `1.5px dashed #D8CFEC` }}
      >
        <div className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: PAPEL }}>
          <Plus size={18} strokeWidth={2} style={{ color: VIOLETA }} />
        </div>
        <div className="flex-1 min-w-0 text-left">
          <p style={{ color: TINTA, fontFamily: fontBody, fontSize: 14, fontWeight: 700 }}>
            {guardandoParaAnadirOtro ? `Guardando a ${nombreMostrar}...` : "¿Tienes más perros?"}
          </p>
          <p className="text-xs mt-0.5 leading-snug" style={{ color: MALVA, fontFamily: fontBody }}>
            Añade a otro y podréis hacer sus menús lo más parecidos posible:
            una sola compra para los dos.
          </p>
        </div>
        <ChevronRight size={16} style={{ color: "#C9BEDD" }} />
      </button>
      {errorAlAnadirOtro && (
        <p className="text-xs mt-2 leading-snug" style={{ color: "#B4436C", fontFamily: fontBody }}>
          {errorAlAnadirOtro}
        </p>
      )}
    </>
  );

  // Para pasar de pantalla hace falta saber qué come CADA perro que va a
  // entrar en el menú, no solo el que se está mirando.
  const dietasContestadas = (paraQuien !== "solo" && listaDePerros.length > 1)
    ? fichasDeLaCasa().every((f) => Boolean(dietasDeLaCasa[f.id]))
    : Boolean(dietaActual);

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
  const siguiente = () => setPaso((p) => {
    const nuevo = Math.min(TOTAL_PASOS + 1, p + 1);
    // Pasar del último paso al resumen es TERMINAR el asistente. A partir
    // de aquí la ficha ya está hecha, así que la próxima vez que se abra
    // será para editarla. Ver `editandoLaFicha`.
    if (nuevo > TOTAL_PASOS) setEditandoLaFicha(false);
    return nuevo;
  });
  const atras = () => setPaso((p) => Math.max(1, p - 1));

  const resultadosRaza = useMemo(() => {
    if (!busqueda.trim()) return [];
    const q = busqueda.trim().toLowerCase();
    return RAZAS.filter((r) => r.nombre.toLowerCase().includes(q)).slice(0, 12);
  }, [busqueda]);

  // ⚠️ MOVIDO FUERA DEL COMPONENTE (21 agosto) — estos cálculos (edad,
  // etapa, kcal al día, qué no puede comer) describen a UN perro, y
  // vivían aquí dentro porque solo hacía falta el que se está mirando.
  // Al poder hacer los menús de VARIOS perros de la casa a la vez hacen
  // falta también los de los OTROS, que no están en `perfil` sino en la
  // lista que vino de Supabase. Están en datosDeUnPerro(), tal cual: la
  // fórmula no se ha tocado. Copiarla habría sido asegurarse de que
  // algún día las dos versiones dieran kcal distintas para el mismo
  // perro, y nadie sabría cuál mira la app.
  const { edad, especiesExcluidas, alimentosEvitados, pesoAdultoEsperado,
          etapaCalculada, etapaLabel, derReal, objetivo } = useMemo(
    () => datosDeUnPerro(perfil), [perfil]);
  // El peso sobre el que se miden las kcal, y por tanto sobre el que hay que
  // medir la densidad de nutrientes. Ver la nota de `peso_objetivo_kg`.
  const pesoObjetivoKg = objetivo?.kg || null;
  const categoriasDisponibles = useMemo(
    () => filtrarCategoriasPorEspecies(CATEGORIAS_ALIMENTO, especiesExcluidas),
    [especiesExcluidas]
  );

  // ─── IR AL GENERADOR ────────────────────────────────────────────────────
  //
  // ⚠️ ESTO ESTABA METIDO DENTRO DEL onClick DE UN BOTÓN, y al quitar ese
  // botón de la ficha (25 agosto) se perdía entero. Lo cazó el BLOQUE de
  // pruebas de la ficha: un perro de diez años se guardaba con etapa
  // "adulto" en vez de "senior". De la etapa salen los 30 requisitos de
  // FEDIAF, así que eso no es un detalle: es darle a un senior la comida de
  // otro perro. No daba ningún error.
  //
  // Empezar un menú no es navegar: son tres cosas, y las tres hacen falta
  // vengas por donde vengas.
  // ⚠️ AÑADIDO (26 agosto) — DE DÓNDE VIENES DECIDE PARA QUIÉN ES EL MENÚ.
  //
  // CASO REAL: "he entrado a mi cuenta desde mis menús y quiero hacer uno
  // solo para Cairo y no puedo". Con dos perros solo se ofrecían las dos
  // formas de hacer los menús de LA CASA, así que pedir otro menú desde
  // dentro de Cairo te regeneraba también el de Lola -- que puede tener la
  // compra hecha y la comida ya porcionada en el congelador.
  //
  // La opción "Solo para X" existió y se quitó el 23 de agosto por pedido
  // expreso: "si metes otro perro es porque también quieres hacerle un
  // menú, si no, no lo meterías". Eso es verdad AL CREAR EL PERFIL por
  // primera vez, y ahí sigue sin aparecer. Pero no lo es al REHACER uno
  // desde la ficha de un perro concreto: ahí ya has elegido el perro por el
  // hecho de estar dentro de él, y volver a preguntarlo sobra.
  //
  // Por eso no es un botón más en la pantalla: es de dónde vienes.
  //   · Asistente, al terminar de crear el perfil  → los menús de la casa
  //   · "Hacer otro menú", dentro de un perro       → el menú de ESE perro
  const irAlGeneradorDeMenus = (soloParaEstePerro = false) => {
    // ⚠️ Ojo con el valor de partida: se pone SIEMPRE, en los dos sentidos.
    // Dejarlo sin tocar en el camino del asistente heredaría el "solo" de
    // una visita anterior, y crear el perfil por primera vez con dos perros
    // dejaría a uno sin menú sin que nadie lo pidiera.
    setParaQuien(soloParaEstePerro ? "solo" : "parecidos");
    // 1. Limpiar el bloqueo de veterinario que hubiera quedado. ⚠️ CASO
    //    REAL (5 agosto): "marco una patología que bloquea, luego la
    //    desmarco y pongo que no, pero sigue sin dejarme generar menús" --
    //    `pantalla` se quedaba en "veterinario_requerido" para siempre.
    setMenuError(null);
    setNecesitaVeterinario(false);
    setPantalla("elegir");
    setFase("generador");

    // 2. Guardar la ficha CON SU ETAPA. La etapa y el peso adulto los
    //    calcula la app, no salen de la ficha, así que hay que pasarlos a
    //    mano: guardar sin ellos deja al perro con la etapa de antes.
    if (!usuario) return;
    guardarPerro(usuario.id, { ...perfil, id: perfil._id },
                 { etapa: etapaCalculada, pesoAdultoEsperado, dietaActual })
      .then((perroGuardado) => {
        if (perroGuardado?.id && !perfil._id) {
          setPerfil((p) => ({ ...p, _id: perroGuardado.id }));
        }
        // 3. Avisar arriba de que este perro existe (o de que cambió de
        //    nombre). Sin esto, un perro recién creado no aparecía en el
        //    selector hasta recargar: la lista solo se leía al entrar.
        //    NO remonta la app a propósito: acabas de pedir el generador y
        //    remontar te devolvería a la ficha.
        if (perroGuardado?.id) onPerroGuardado(perroGuardado);
        // Solo si es NUEVO: reeditar la ficha de un paciente no tiene que
        // volver a marcarlo, y reeditar la del perro propio del veterinario
        // no puede convertirlo en paciente.
        if (perroGuardado?.id && !perfil._id) return nacerComoPaciente(perroGuardado);
      })
      .catch((err) => capturarError(err, { donde: "irAlGeneradorDeMenus" }));
  };

  // ═══ REVALIDACIÓN DEL MENÚ CUANDO CAMBIA EL PERRO ═══════════════════
  //
  // ⚠️ AÑADIDO — CASO 3 del backend: un menú calculado para un cachorro
  // deja de cumplir cuando ese perro es adulto. Los requisitos FEDIAF no
  // son los mismos por etapa: no basta con escalar las calorías, y el
  // multivitamínico de cachorro sigue ahí dentro.
  //
  // Hasta ahora la web no llamaba a /menu/revalidar desde ningún sitio,
  // así que el menú guardado se seguía enseñando tal cual.
  //
  // DECISIÓN IMPORTANTE: esto NO regenera nada por su cuenta. Sólo
  // comprueba y avisa. Cambiarle el menú a alguien sin preguntar, cuando
  // puede tener la compra hecha y la comida ya porcionada en el
  // congelador, no es algo que deba decidir la app.
  const [revision, setRevision] = useState({ estado: "reposo" });
  // Qué sección suelta (Evolución / Analizar) se está viendo desde el perfil.
  const [seccionSuelta, setSeccionSuelta] = useState(null);

  // Se comprueba la rotación guardada más reciente, ENTERA.
  //
  // ⚠️ CORREGIDO — antes sólo se miraba el primer menú, dando por hecho
  // que "los requisitos de etapa son los mismos para todos". Eso es
  // cierto para los REQUISITOS, pero no para los MENÚS: cada uno lleva
  // alimentos distintos, así que uno puede seguir cumpliendo y otro no
  // (es justo el caso del multivitamínico de cachorro, que sólo está en
  // algunos). Si alguien come 3 menús a la semana, hay que revisar y
  // corregir los 3, no uno.
  const menuParaRevisar = menusGuardados[0] || null;

  const menusDeLaRotacion = (fila) => {
    const datos = fila?.menus_data;
    const lista = Array.isArray(datos) ? datos : datos ? [datos] : [];
    return lista
      .map((m) => m?.menu || m?.gramos || null)
      .filter((g) => g && Object.keys(g).length > 0);
  };

  useEffect(() => {
    // Sólo desde el perfil (la pantalla de inicio), y sólo si hay algo
    // que comprobar. Así no se llama a una API dormida en cada pantalla.
    if (fase !== "onboarding") return;
    if (!menuParaRevisar || !derReal || !etapaCalculada) return;

    const rotacion = menusDeLaRotacion(menuParaRevisar);
    if (rotacion.length === 0) return;

    // Huella de lo que determina el resultado. Si no ha cambiado, no se
    // vuelve a preguntar: no tiene sentido gastar N llamadas por cada vez
    // que se entra en el perfil.
    const huella = [menuParaRevisar.id, Math.round(derReal), etapaCalculada].join("|");
    if (revision.huella === huella) return;

    let cancelado = false;
    setRevision({ estado: "comprobando", huella });

    const cuerpoBase = {
      der_objetivo: derReal,                       // el DER de AHORA
      etapa_requisitos: ETAPA_A_SUFIJO_API[etapaCalculada] || "Adulto",
      peso_perro_kg: perfil?.pesoActual ? Number(perfil.pesoActual) : null,
      peso_adulto_esperado_kg: pesoAdultoEsperado || null,
      peso_objetivo_kg: pesoObjetivoKg || null,
      // El BCS viaja además del objetivo, y no en su lugar: el motor usa el
      // objetivo declarado cuando lo hay (`_peso_de_referencia`), así que
      // esto es la red por debajo -- si algún día llegara una ficha sin
      // objetivo, el motor sabría derivarlo en vez de dar por bueno el peso
      // de un perro con sobrepeso.
      bcs: bcsVigente(perfil),
      nombres_excluidos: Array.from(alimentosEvitados || []),
      especies_excluidas: Array.from(especiesExcluidas || []),
      patologias: perfil?.patologias || [],
      categorias_excluidas: perfil?.categoriasExcluidas || [],
    };

    // Un menú de la semana no depende de los otros para revalidarse, así
    // que van en paralelo: con la API recién despierta, en serie serían
    // tres esperas seguidas de casi un minuto.
    Promise.all(
      rotacion.map((gramos) =>
        fetchConTimeout(`${API_BASE}/menu/revalidar`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...cuerpoBase, menu_actual_gramos: gramos }),
        })
          .then((res) => res.json())
          .then((data) => ({ original: gramos, data }))
      )
    )
      .then((respuestas) => {
        if (cancelado) return;

        const caducados = respuestas.filter((r) => !r.data?.sigue_siendo_valido);
        if (caducados.length === 0) {
          setRevision({ estado: "al_dia", huella });
          return;
        }

        // Si aunque sea uno no tiene arreglo, no se puede ofrecer una
        // semana corregida a medias: se dice y se ofrece empezar de cero.
        const sinArreglo = caducados.find((r) => !r.data?.factible);

        // La semana corregida conserva tal cual los menús que SÍ siguen
        // valiendo, y sustituye sólo los que no. Eso es lo que hace que
        // cambie lo mínimo.
        const semanaCorregida = respuestas.map((r) =>
          r.data?.sigue_siendo_valido
            ? r.original
            : (r.data?.menu || r.data?.gramos || null)
        );

        const unir = (clave) => {
          const vistos = new Set();
          caducados.forEach((r) => (r.data?.cambios?.[clave] || []).forEach((n) => vistos.add(n)));
          return Array.from(vistos);
        };

        migaDePan("La rotación guardada ya no cumple con la etapa de ahora", {
          revisados: respuestas.length, caducados: caducados.length,
          hayArreglo: !sinArreglo,
        });

        setRevision({
          estado: "caducado",
          huella,
          revisados: respuestas.length,
          caducados: caducados.length,
          porQue: Array.from(new Set(caducados.flatMap((r) => r.data?.por_que_ya_no_vale || []))),
          // /menu/revalidar ya devuelve cada menú rehecho conservando lo
          // que puede -- no hace falta generar nada desde cero.
          menusNuevos: sinArreglo || semanaCorregida.some((m) => !m) ? null : semanaCorregida,
          cambios: sinArreglo ? null : { quitados: unir("quitados"), anadidos: unir("anadidos") },
          motivo: sinArreglo?.data?.motivo || null,
        });
      })
      .catch((err) => {
        if (cancelado) return;
        // Que la comprobación falle no puede estropear la pantalla de
        // inicio: se calla y ya. Pero queda en Sentry.
        if (!err?.esTimeout) capturarError(err, { donde: "menu/revalidar" });
        setRevision({ estado: "reposo" });
      });

    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fase, menuParaRevisar?.id, derReal, etapaCalculada]);

  // Enseña el menú ya rehecho por /menu/revalidar. Reutiliza la pantalla
  // de menú guardado, que no dispara ninguna regeneración.
  const verMenuRevalidado = () => {
    if (!revision.menusNuevos?.length) return;
    const semana = revision.menusNuevos.map((menu) => ({ menu }));
    setMenuGuardadoAbierto({
      ...menuParaRevisar,
      der_real: derReal,
      etapa_label: etapaLabel,
      menus_data: semana,
    });
    setMenuReal(semana);
    setModo(menuParaRevisar?.modo || "automatico");
    setMenuCargando(false);
    setMenuError(null);
    setPantalla("menuGuardado");
    setFase("generador");
  };


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
    setAlimentosAPreservarPorMenu([]); // limpiar tras usar — no afectar a futuras generaciones
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
    const pedirMenu = (especiesYaUsadas = [], configDeEsteMenu = configPersonalizar, indice = 0) =>
      fetchConTimeout(`${API_BASE}/menu/v2`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modo: modo || "automatico",
          nombres_alimentos:
            modo === "personalizar" ? eleccionesDelUsuario(modo, configDeEsteMenu) :
            [],
          // ⚠️ AQUÍ ESTABA EL FALLO (25 agosto). Los alimentos a conservar
          // se metían arriba, en `nombres_alimentos` -- y el servidor SOLO
          // mira esa lista en los modos "personalizar" y "aprovechar".
          // Esta pantalla manda "automatico", que la ignora. La petición
          // salía perfecta y el servidor la tiraba entera.
          //
          // `preferir_alimentos` vale en cualquier modo y es una
          // preferencia, no una imposición: abarata usar esos alimentos,
          // nunca puede volver el menú imposible ni saltarse un requisito.
          preferir_alimentos: alimentosAPreservarPorMenu[indice] || null,
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
                    // ⚠️ AÑADIDO (28 agosto) — EL PESO SOBRE EL QUE SE MIDE LA DENSIDAD.
          // FEDIAF (apartado 7.2.5) dice que cuando un perro come menos de lo
          // normal, los mínimos de nutrientes POR 1000 KCAL tienen que subir:
          // necesita los mismos miligramos de zinc coma lo que coma, así que si
          // caben en menos calorías, la densidad sube. El motor lo calcula con
          // `kcal / peso^0,75`, y ese peso tiene que ser el MISMO que se usó
          // para las kcal — que en un perro con sobrepeso es el OBJETIVO, no el
          // real. Si no se manda, el motor usa el real y escala un poco de más.
          //
          // Sin esta línea el escalado está puesto en el servidor y apagado en
          // la práctica, que es la peor forma de tener algo: parece hecho.
          peso_objetivo_kg: pesoObjetivoKg || null,
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
            // Una lista por menú, en orden. Vacío = semana nueva de cero.
            preferir_por_menu: alimentosAPreservarPorMenu.length ? alimentosAPreservarPorMenu : null,
            nombres_excluidos: Array.from(alimentosEvitados),
            peso_perro_kg: perfil?.pesoActual ? Number(perfil.pesoActual) : null,
            patologias: perfil?.patologias || [],
            categorias_excluidas: perfil?.categoriasExcluidas || [],
                      // ⚠️ AÑADIDO (28 agosto) — EL PESO SOBRE EL QUE SE MIDE LA DENSIDAD.
          // FEDIAF (apartado 7.2.5) dice que cuando un perro come menos de lo
          // normal, los mínimos de nutrientes POR 1000 KCAL tienen que subir:
          // necesita los mismos miligramos de zinc coma lo que coma, así que si
          // caben en menos calorías, la densidad sube. El motor lo calcula con
          // `kcal / peso^0,75`, y ese peso tiene que ser el MISMO que se usó
          // para las kcal — que en un perro con sobrepeso es el OBJETIVO, no el
          // real. Si no se manda, el motor usa el real y escala un poco de más.
          //
          // Sin esta línea el escalado está puesto en el servidor y apagado en
          // la práctica, que es la peor forma de tener algo: parece hecho.
          peso_objetivo_kg: pesoObjetivoKg || null,
          peso_adulto_esperado_kg: pesoAdultoEsperado || null,
            tamano: perfil?.raza?.tamano || perfil?.tamanoManual || null,
          };
          const res = await fetchConTimeout(`${API_BASE}/menu/semana?numero_de_menus=${cuantos}`, {
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
          // ⚠️ AÑADIDO — un timeout NO se trata como "no factible": se
          // deja subir para que el bucle de reintentos de arriba lo
          // recoja y enseñe "Despertando el servidor...". Ese reintento
          // ya existía, pero era código muerto: como aquí se capturaba
          // todo, nunca le llegaba nada que reintentar.
          if (err?.esTimeout) throw err;
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
          // ⚠️ Conservando NO se rota (25 agosto): `especiesUsadas` está
          // para que dos menús automáticos no salgan con la misma
          // proteína, pero al regenerar la variedad ya la da el menú
          // original -- evitar la especie del menú 1 es empujar al menú 2
          // fuera de sus propios alimentos. Las dos cosas juntas se
          // anulan: se pide conservar y se obliga a cambiar.
          const conservando = (alimentosAPreservarPorMenu[i] || []).length > 0;
          const data = await pedirMenu(conservando ? [] : especiesUsadas, configDeEsteMenu, i);
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
          // Igual que arriba: el timeout sube al bucle de reintentos.
          if (err?.esTimeout) throw err;
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
              // ⚠️ CORREGIDO — aquí iba `null` como perro_id, así que TODOS
              // los menús se guardaban sin dueño. getMenus filtra justo por
              // esa columna, de modo que aunque se hubiera llamado, no
              // habría encontrado nada. Ahora se guarda el perro de verdad,
              // que es lo que hará falta cuando haya varios perros por
              // cuenta.
              if (!perfil._id) {
                capturarError(new Error("Menú guardado sin perro_id"), {
                  donde: "guardarMenu", motivo: "perfil._id vacío al generar",
                });
              }
              guardarMenu(usuario.id, perfil._id || null, {
                modo,
                derReal,
                etapaLabel,
                menusData: resultados,
                numMenus: resultados.length,
              })
                .then((fila) => {
                  // Que aparezca ya en "Mis menús" sin recargar la app.
                  if (fila) setMenusGuardados((previos) => [fila, ...previos]);
                })
                .catch((err) => capturarError(err, { donde: "guardarMenu" }));
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
              capturarError(err, {
                donde: "generarMenu",
                intentos: MAX_INTENTOS,
                fueTimeout: Boolean(err?.esTimeout),
                modo,
                numMenus,
              });
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
  // ─── LA PUERTA DEL VETERINARIO ────────────────────────────────────────
  // Un veterinario acreditado sin ningún paciente no entra por el asistente
  // de "cuéntanos de tu perro": entra por su lista, vacía, con el botón de
  // dar de alta al primero. Ver el comentario de `puertaProfesionalPasada`.
  //
  // Se pinta solo cuando NO hay perro montado (`yaTienePerroGuardado`), que
  // en modo veterinario significa "ningún paciente": desde el 29 de agosto
  // AuthGate elige el perro de arranque DENTRO del modo, así que tener el
  // perro propio ya no cuenta como tener paciente.
  if (enModoProfesional && paso === 1 && !yaTienePerroGuardado && !puertaProfesionalPasada) {
    return (
      <div className="cnl-pantalla-completa w-full flex flex-col" style={{ background: PAPEL }}>
        <Fuentes />
        <Cabecera onAbrirMenu={() => setMenuLigeroAbierto(true)} titulo={<>Tus<br />pacientes.</>} />
        <div className="flex-1 px-6 pt-8 pb-6 flex flex-col">
          <div className="px-5 py-6 rounded-2xl mb-6"
               style={{ background: "#FFFFFF", border: "1.5px solid #E3DAF0" }}>
            <div className="flex items-center gap-3 mb-3">
              <Award size={20} style={{ color: VIOLETA, flexShrink: 0 }} />
              <p style={{ color: TINTA, fontFamily: fontDisplay, fontSize: 17 }}>
                Todavía no tienes ninguno
              </p>
            </div>
            <p className="text-sm leading-relaxed" style={{ color: MALVA, fontFamily: fontBody }}>
              Da de alta al primero y Rawku le calcula la ración con los
              requisitos de FEDIAF, con su ficha clínica y con los topes de su
              patología si la tiene. Los pacientes van aparte de tus propios
              perros: no se mezclan en ninguna lista.
            </p>
          </div>
          <button
            onClick={() => setPuertaProfesionalPasada(true)}
            className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl"
            style={{ background: VIOLETA, color: "#FFFFFF", border: "none",
                     fontFamily: fontDisplay, fontSize: 16, cursor: "pointer" }}>
            <Plus size={18} /> Dar de alta un paciente
          </button>
          <div className="flex-1" />
          {/* Un veterinario con perro propio usa Rawku para las dos cosas.
              Desde aquí se pasa a su lado de tutor sin ir a buscar el
              interruptor a Ajustes. */}
          <button
            onClick={() => cambiarModoProfesional(false)}
            className="w-full text-center text-sm py-3"
            style={{ background: "transparent", border: "none", color: MALVA,
                     fontFamily: fontBody, cursor: "pointer" }}>
            Usar Rawku para mi propio perro
          </button>
        </div>
        {drawerLigero}
      </div>
    );
  }

  // ─── LA FICHA DEL PACIENTE, EN UNA SOLA PANTALLA ──────────────────────
  //
  // ⚠️ PEDIDO EXPRESO (29 agosto): "un veterinario debería tener
  // prácticamente todo en la misma pantalla, no tener que ir pasando
  // pantallas, y lo de la pantalla de alergias y tal tiene que ser
  // profesional, no esos textos para el usuario".
  //
  // Las seis pantallas del asistente están pensadas para alguien que hace
  // esto UNA VEZ, con su perro, y a quien conviene llevar de la mano: una
  // pregunta por pantalla, un dibujo, una frase que tranquiliza. Un
  // veterinario hace esto VARIAS VECES AL DÍA, con un animal delante, y lo
  // que necesita es ver la ficha entera y rellenarla en el orden que él
  // quiera. Son dos trabajos distintos, no dos gustos distintos.
  //
  // Es la MISMA ficha: los mismos campos, los mismos nombres de estado y el
  // mismo guardado. Lo que cambia es la disposición y las palabras. Si
  // mañana se añade un campo a la ficha, hay que añadirlo AQUÍ TAMBIÉN --
  // y a `ficha-ida-y-vuelta.spec.js` y a `sin-cuenta.spec.js`, que es lo
  // que impide que un campo se pierda en silencio.
  if (enModoProfesional && paso <= TOTAL_PASOS) {
    const fechaISO = (() => {
      const m = String((perfil.mesIdx ?? 0) + 1).padStart(2, "0");
      const d = String(perfil.dia ?? 1).padStart(2, "0");
      return `${perfil.anio}-${m}-${d}`;
    })();
    // ⚠️ EN UN PACIENTE NUEVO, EL BCS NO SE DA POR PUESTO (29 agosto).
    // La ficha nace con `condicionIdx: 2` y `condicionTocado: true` -- son
    // los valores de partida del deslizador del dueño --, así que mirar
    // "¿lo ha tocado?" daba por observado un BCS 5 que nadie había mirado.
    // En una ficha clínica eso es peor que un hueco: un ideal supuesto pasa
    // por un ideal comprobado, y de ahí salen las kcal.
    //
    // En una ficha QUE YA EXISTE sí se enseña el equivalente de lo que haya
    // -- si el tutor dijo "Rellenito", el veterinario ve un 7 y lo corrige
    // si no está de acuerdo --, porque ahí el dato existe y esconderlo sería
    // hacerle preguntar dos veces lo mismo.
    const bcsPuesto = perfil.bcs ?? (perfil._id ? bcsVigente(perfil) : null);
    const filaBcs = ESCALA_BCS.find((b) => b.n === bcsPuesto) || null;
    const objetivoBcs = bcsPuesto ? pesoIdealDesdeBcs(Number(perfil.pesoActual), bcsPuesto) : null;
    const ponerBcs = (n) => {
      set("bcs", n);
      set("condicionIdx", condicionDesdeBcs(n));
      set("condicionTocado", true);
      set("pesoObjetivoKg", pesoIdealDesdeBcs(Number(perfil.pesoActual), n));
    };
    // Las listas SON la respuesta: si están vacías, no hay nada que
    // declarar. El "¿tiene alergias? sí/no" es una pregunta de asistente,
    // y en una ficha clínica sobra -- pero el resto de la app lee esas
    // banderas, así que se escriben aquí para que no se contradigan.
    const anadirA = (campo, item) => {
      set(campo, [...perfil[campo], item]);
      set(BANDERA_DE[campo], "si");
      setCategoriaAbierta(null);
    };
    const quitarDe = (campo, idx) => {
      const nueva = perfil[campo].filter((_, i) => i !== idx);
      set(campo, nueva);
      set(BANDERA_DE[campo], nueva.length ? "si" : "no");
    };
    const alternar = (campo, clave) => {
      const nueva = perfil[campo].includes(clave)
        ? perfil[campo].filter((k) => k !== clave)
        : [...perfil[campo], clave];
      set(campo, nueva);
      set(BANDERA_DE[campo], nueva.length ? "si" : "no");
    };
    const faltan = [];
    if (!perfil.nombre.trim()) faltan.push("nombre");
    if (perfil.sexo === null) faltan.push("sexo");
    if (perfil.esterilizado === null) faltan.push("estado reproductivo");
    if (!(perfil.raza || perfil.tamanoManual)) faltan.push("raza o tamaño adulto");
    if (!edad) faltan.push("fecha de nacimiento");
    if (!(Number(perfil.pesoActual) > 0)) faltan.push("peso");
    if (!bcsPuesto) faltan.push("BCS");
    const puedeGuardar = faltan.length === 0;
    const bloqueantes = perfil.patologias
      .map((k) => PATOLOGIAS.find((p) => p.key === k))
      .filter((p) => p && !p.segura);

    return (
      <div className="cnl-pantalla-completa w-full flex flex-col" style={{ background: PAPEL }}>
        <Fuentes />
        <Cabecera onAbrirMenu={() => setMenuLigeroAbierto(true)}
                  titulo={perfil._id ? "Ficha del paciente" : "Nuevo paciente"} />
        <div className="flex-1 overflow-y-auto px-5 pt-6 pb-6">

          <BloqueFicha titulo="Identificación">
            <input
              type="text" value={perfil.nombre} onChange={(e) => set("nombre", e.target.value)}
              placeholder="Nombre del paciente"
              className="w-full text-lg pb-2 mb-4 outline-none bg-transparent"
              style={{ color: TINTA, fontFamily: fontDisplay,
                       borderBottom: `2px solid ${perfil.nombre ? VIOLETA : "#E3DAF0"}` }} />
            <p className="text-xs mb-1.5" style={{ color: MALVA, fontFamily: fontBody }}>Sexo</p>
            <OpcionesFicha opciones={[{ key: "macho", label: "Macho" }, { key: "hembra", label: "Hembra" }]}
                      valor={perfil.sexo} onElegir={(v) => set("sexo", v)} />
            <p className="text-xs mt-3 mb-1.5" style={{ color: MALVA, fontFamily: fontBody }}>
              Estado reproductivo
            </p>
            <OpcionesFicha opciones={[{ key: "no", label: "Entero" }, { key: "si", label: "Esterilizado" }]}
                      valor={perfil.esterilizado} onElegir={(v) => set("esterilizado", v)} />
            <p className="text-xs mt-3 mb-1.5" style={{ color: MALVA, fontFamily: fontBody }}>
              Fecha de nacimiento {edad && `· ${edad.anios} a ${edad.meses} m`}
            </p>
            <input
              type="date" value={fechaISO}
              onChange={(e) => {
                const [a, m, d] = e.target.value.split("-").map(Number);
                if (a && m && d) { set("anio", a); set("mesIdx", m - 1); set("dia", d); }
              }}
              className="w-full py-2.5 px-3 rounded-xl outline-none"
              style={{ background: PAPEL, border: "1.5px solid #E3DAF0", color: TINTA, fontFamily: fontBody }} />
          </BloqueFicha>

          <BloqueFicha titulo="Raza y tamaño adulto">
            {perfil.raza ? (
              <div className="flex items-center justify-between">
                <span style={{ color: TINTA, fontFamily: fontDisplay, fontSize: 16 }}>{perfil.raza.nombre}</span>
                <button onClick={() => { set("raza", null); set("modoRaza", "raza"); setBusqueda(""); }}
                        className="text-xs" style={{ color: ROSA, fontFamily: fontBody, cursor: "pointer" }}>
                  Cambiar
                </button>
              </div>
            ) : (
              <>
                <div className="relative mb-2">
                  <Search size={16} style={{ position: "absolute", left: 12, top: 13, color: MALVA }} />
                  <input
                    value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
                    placeholder="Buscar raza"
                    className="w-full py-2.5 pl-9 pr-3 rounded-xl outline-none"
                    style={{ background: PAPEL, border: "1.5px solid #E3DAF0", color: TINTA, fontFamily: fontBody }} />
                </div>
                {resultadosRaza.length > 0 && (
                  <div className="flex flex-col gap-1.5 mb-3">
                    {resultadosRaza.map((r) => (
                      <button key={r.nombre} onClick={() => { set("raza", r); set("modoRaza", "raza"); setBusqueda(""); }}
                        className="text-left px-3 py-2 rounded-lg flex items-center justify-between"
                        style={{ background: PAPEL, border: "1.5px solid #E3DAF0", cursor: "pointer" }}>
                        <span style={{ color: TINTA, fontFamily: fontBody, fontSize: 14 }}>{r.nombre}</span>
                        <span className="text-[11px]" style={{ color: MALVA, fontFamily: "monospace" }}>
                          {r.tamano} · ~{r.pesoMedio} kg
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                <p className="text-xs mb-1.5" style={{ color: MALVA, fontFamily: fontBody }}>
                  Sin raza definida: tamaño adulto
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {TAMANOS.map((t) => {
                    const activo = perfil.tamanoManual === t;
                    return (
                      <button key={t} onClick={() => { set("tamanoManual", t); set("modoRaza", "sin_raza"); }}
                        className="py-2 rounded-lg text-center"
                        style={{ background: activo ? VIOLETA : PAPEL,
                                 border: `1.5px solid ${activo ? VIOLETA : "#E3DAF0"}`,
                                 color: activo ? "#FFFFFF" : TINTA, fontFamily: fontBody,
                                 fontSize: 13, cursor: "pointer" }}>
                        {t}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </BloqueFicha>

          <BloqueFicha titulo="Peso y condición corporal">
            <div className="flex items-baseline gap-2 mb-4">
              <input
                type="number" inputMode="decimal" value={perfil.pesoActual}
                onChange={(e) => {
                  set("pesoActual", e.target.value);
                  if (bcsPuesto) set("pesoObjetivoKg", pesoIdealDesdeBcs(Number(e.target.value), bcsPuesto));
                }}
                placeholder="0"
                className="text-2xl pb-1 outline-none bg-transparent w-24"
                style={{ color: TINTA, fontFamily: fontDisplay,
                         borderBottom: `2px solid ${perfil.pesoActual ? VIOLETA : "#E3DAF0"}` }} />
              <span style={{ color: MALVA, fontFamily: fontBody }}>kg</span>
            </div>
            <p className="text-xs mb-1.5" style={{ color: MALVA, fontFamily: fontBody }}>
              Condición corporal (BCS 1-9)
            </p>
            <div className="grid grid-cols-9 gap-1 mb-2">
              {ESCALA_BCS.map((b) => {
                const activo = bcsPuesto === b.n;
                return (
                  <button key={b.n} onClick={() => ponerBcs(b.n)} aria-label={`BCS ${b.n}`}
                    title={`${b.n} · ${b.titulo}`}
                    className="py-2.5 rounded-lg text-center"
                    style={{ background: activo ? VIOLETA : PAPEL,
                             border: `1.5px solid ${activo ? VIOLETA : "#E3DAF0"}`,
                             color: activo ? "#FFFFFF" : TINTA, fontFamily: fontDisplay,
                             fontSize: 14, cursor: "pointer" }}>
                    {b.n}
                  </button>
                );
              })}
            </div>
            {filaBcs && (
              <p className="text-xs leading-snug" style={{ color: MALVA, fontFamily: fontBody }}>
                <span style={{ color: TINTA, fontWeight: 700 }}>{filaBcs.n} · {filaBcs.titulo}.</span>{" "}
                {filaBcs.detalle}
              </p>
            )}
            {objetivoBcs && (
              <p className="text-xs mt-2" style={{ color: MALVA, fontFamily: fontBody }}>
                Peso objetivo estimado:{" "}
                <span style={{ color: VIOLETA, fontWeight: 700 }}>{objetivoBcs} kg</span>
                {bcsPuesto === 9 && " (cota inferior: la escala se satura en 9)"}
              </p>
            )}
          </BloqueFicha>

          <BloqueFicha titulo="Actividad">
            <div className="grid grid-cols-1 gap-1.5">
              {NIVELES_CLINICOS.map((n, idx) => {
                const activo = perfil.actividadTocado && perfil.actividadIdx === idx;
                return (
                  <button key={n.label}
                    onClick={() => { set("actividadIdx", idx); set("actividadTocado", true); }}
                    className="text-left px-3 py-2 rounded-lg flex items-center justify-between"
                    style={{ background: activo ? "#F0EBF8" : PAPEL,
                             border: `1.5px solid ${activo ? VIOLETA : "#E3DAF0"}`,
                             cursor: "pointer" }}>
                    <span style={{ color: TINTA, fontFamily: fontBody, fontSize: 14 }}>{n.label}</span>
                    <span className="text-[11px] text-right ml-2" style={{ color: MALVA, fontFamily: fontBody }}>
                      {n.detalle}
                    </span>
                  </button>
                );
              })}
            </div>
          </BloqueFicha>

          <BloqueFicha titulo="Alergias alimentarias confirmadas">
            <SelectorAlimentos
              lista={perfil.alergias}
              onAnadir={(item) => anadirA("alergias", item)}
              onQuitar={(idx) => quitarDe("alergias", idx)}
              idGrupo="alergias"
              estadoAbierto={categoriaAbierta}
              setEstadoAbierto={setCategoriaAbierta} />
          </BloqueFicha>

          <BloqueFicha titulo="Otras exclusiones (intolerancia, rechazo, criterio clínico)">
            <SelectorAlimentos
              lista={perfil.otrosEvitar}
              onAnadir={(item) => anadirA("otrosEvitar", item)}
              onQuitar={(idx) => quitarDe("otrosEvitar", idx)}
              idGrupo="otros"
              estadoAbierto={categoriaAbierta}
              setEstadoAbierto={setCategoriaAbierta} />
          </BloqueFicha>

          <BloqueFicha titulo="Categorías excluidas">
            <p className="text-xs mb-2 leading-snug" style={{ color: MALVA, fontFamily: fontBody }}>
              Lo que quede fuera se cubre con el resto de la ración o con suplemento. Si no hay
              forma de cumplir los requisitos sin ella, el motor lo dice en vez de apañarlo.
            </p>
            {/* ⚠️ LAS SEIS, NO SOLO EL HUESO (29 agosto). Al dueño se le ofrece
                únicamente "hueso carnoso", y con razón: es el caso real que se
                pidió (un senior sin dientes) y las demás no las va a querer
                quitar nadie por su cuenta. Un veterinario sí: una dieta de
                eliminación deja fuera el pescado, una hepatopatía puede querer
                sin vísceras, un ensayo de proteína novel se queda sin carne
                muscular del catálogo. El motor las acepta todas desde siempre
                -- `categorias_excluidas` es una lista --, así que lo que
                faltaba era ofrecérselas. */}
            {CATEGORIAS_QUE_PUEDE_EXCLUIR.map((c) => {
              const activo = perfil.categoriasExcluidas.includes(c.key);
              return (
                <button key={c.key} onClick={() => alternar("categoriasExcluidas", c.key)}
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg"
                  style={{ background: activo ? VIOLETA : PAPEL,
                           border: `1.5px solid ${activo ? VIOLETA : "#E3DAF0"}`, cursor: "pointer" }}>
                  <span style={{ color: activo ? "#FFFFFF" : TINTA, fontFamily: fontBody, fontSize: 14 }}>{c.label}</span>
                  {activo && <Check size={15} style={{ color: ROSA }} />}
                </button>
              );
            })}
          </BloqueFicha>

          <BloqueFicha titulo="Patologías diagnosticadas">
            <div className="flex flex-col gap-1.5">
              {PATOLOGIAS.map((pat) => {
                const activo = perfil.patologias.includes(pat.key);
                return (
                  <button key={pat.key} onClick={() => alternar("patologias", pat.key)}
                    className="flex items-center justify-between px-3 py-2 rounded-lg text-left"
                    style={{ background: activo ? VIOLETA : PAPEL,
                             border: `1.5px solid ${activo ? VIOLETA : "#E3DAF0"}`, cursor: "pointer" }}>
                    <span style={{ color: activo ? "#FFFFFF" : TINTA, fontFamily: fontBody, fontSize: 14 }}>
                      {pat.label}
                    </span>
                    {activo && <Check size={15} style={{ color: ROSA }} />}
                  </button>
                );
              })}
            </div>
            {bloqueantes.length > 0 && (
              <div className="flex gap-2 items-start p-3 rounded-xl mt-2" style={{ background: "#FFF0F3" }}>
                <AlertCircle size={15} style={{ color: ROSA, flexShrink: 0, marginTop: 2 }} />
                <p className="text-xs leading-snug" style={{ color: TINTA, fontFamily: fontBody }}>
                  Depende de analíticas y de pH urinario que la app no lee, así que no se genera
                  ración automática: la formulación es tuya.
                </p>
              </div>
            )}
          </BloqueFicha>

          <BloqueFicha titulo="Dieta actual">
            {/* ⚠️ PEDIDO EXPRESO (29 agosto): "no se pregunta qué come
                actualmente el perro. Eso es muy importante para la
                transición también". Al dueño se le pregunta en el generador;
                en la ficha clínica es un dato del paciente -- de aquí sale
                si hace falta un plan de cambio gradual y desde qué. */}
            <OpcionesFicha
              opciones={[{ key: "pienso", label: "Pienso" },
                         { key: "cocinada", label: "Cocinada" },
                         { key: "barf_otra", label: "BARF / cruda" }]}
              valor={dietaActual}
              onElegir={(v) => setDietaActual(v)}
              columnas={3} />
            {dietaActual && dietaActual !== "barf_otra" && (
              <p className="text-xs mt-2 leading-snug" style={{ color: MALVA, fontFamily: fontBody }}>
                Con este cambio hace falta transición gradual: sale en la pauta.
              </p>
            )}
          </BloqueFicha>

          <BloqueFicha titulo="Tutor">
            <input
              type="text" value={perfil.tutorNombre || ""}
              onChange={(e) => set("tutorNombre", e.target.value)}
              placeholder="Nombre del tutor"
              className="w-full py-2.5 px-3 rounded-xl outline-none mb-2"
              style={{ background: PAPEL, border: "1.5px solid #E3DAF0", color: TINTA, fontFamily: fontBody }} />
            <input
              type="text" value={perfil.tutorContacto || ""}
              onChange={(e) => set("tutorContacto", e.target.value)}
              placeholder="Teléfono o correo"
              className="w-full py-2.5 px-3 rounded-xl outline-none"
              style={{ background: PAPEL, border: "1.5px solid #E3DAF0", color: TINTA, fontFamily: fontBody }} />
          </BloqueFicha>

          {!puedeGuardar && (
            <p className="text-xs mb-2" style={{ color: ROSA, fontFamily: fontBody }}>
              Falta: {faltan.join(", ")}.
            </p>
          )}
          <BotonContinuar activo={puedeGuardar} texto="Guardar ficha" onClick={() => {
            if (bloqueantes.length > 0) {
              setMenuError(bloqueantes.map((pat) => pat.aviso).join(" "));
              setNecesitaVeterinario(true);
              setFase("generador");
              setPantalla("veterinario_requerido");
            } else {
              setPaso(TOTAL_PASOS + 1);
              setEditandoLaFicha(false);
            }
          }} />
        </div>
        {drawerLigero}
      </div>
    );
  }

  if (paso === 1) {
    const puedeContinuar = perfil.nombre.trim().length > 0 && perfil.sexo !== null;
    return (
      <div className="cnl-pantalla-completa w-full flex flex-col" style={{ background: PAPEL }}>
        <Fuentes />
        <Cabecera onAbrirMenu={() => setMenuLigeroAbierto(true)} paso={1} titulo={<>Empecemos por<br />lo esencial.</>} />
        <div className="flex-1 px-6 pt-8 pb-6 flex flex-col">
          <div className="mb-8">
            <Etiqueta>{enModoProfesional ? "Nombre del paciente" : "Nombre del perro"}</Etiqueta>
            <input
              type="text"
              value={perfil.nombre}
              onChange={(e) => set("nombre", e.target.value)}
              placeholder={enModoProfesional ? "Nombre del paciente" : "Nombre de tu perro"}
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

    // ─── LA MISMA PREGUNTA, EN EL IDIOMA DEL VETERINARIO ────────────────
    //
    // ⚠️ PEDIDO EXPRESO (29 agosto): "para un veterinario es mejor poner el
    // BCS... no tiene que ser rollo te lo hago divertido". Y tiene razón más
    // allá del tono: el BCS de 9 puntos es lo que él anota en la historia
    // clínica, y los cinco escalones cariñosos son cinco valores sueltos de
    // esa escala (2, 4, 5, 7 y 9). Un BCS 6 -- el más común en consulta --
    // no cabe entre ellos sin redondearlo, y redondearlo mueve el peso
    // objetivo un 10 %, que es de donde salen las kcal.
    //
    // El número exacto se guarda aparte, en su columna, y es el que manda
    // para calcular; el escalón se sigue rellenando para que la misma ficha
    // se entienda desde el lado del dueño. La FÓRMULA es una sola, en
    // `bcs.js`: si cada pantalla calculara su objetivo, el mismo perro
    // tendría dos.
    if (enModoProfesional) {
      const elegido = bcsVigente(perfil);
      const puesto = perfil.condicionTocado ? elegido : null;
      const fila = ESCALA_BCS.find((b) => b.n === puesto) || null;
      const objetivoBcs = puesto ? pesoIdealDesdeBcs(Number(perfil.pesoActual), puesto) : null;
      const ponerBcs = (n) => {
        set("bcs", n);
        // El escalón del dueño se deriva, nunca se pregunta dos veces.
        set("condicionIdx", condicionDesdeBcs(n));
        set("condicionTocado", true);
        // ⚠️ AQUÍ SE FIJA EL OBJETIVO (25 agosto). La condición es una
        // observación hecha EN UN MOMENTO, junto a un peso: de las dos
        // juntas sale el objetivo, y a partir de ahí ya no se mueve aunque
        // el perro sí. Antes se recalculaba en cada pantalla dividiendo el
        // peso de hoy, y por eso la dieta no podía terminar nunca.
        set("pesoObjetivoKg", pesoIdealDesdeBcs(Number(perfil.pesoActual), n));
      };
      return (
        <div className="cnl-pantalla-completa w-full flex flex-col" style={{ background: PAPEL }}>
          <Fuentes />
          <Cabecera onAbrirMenu={() => setMenuLigeroAbierto(true)} paso={4} titulo="Peso y condición corporal" />
          <div className="flex-1 px-6 pt-8 pb-6 flex flex-col">
            <BotonAtras onClick={atras} />
            <div className="mb-7">
              <Etiqueta>Peso actual</Etiqueta>
              <div className="flex items-baseline gap-2">
                <input
                  type="number" inputMode="decimal" value={perfil.pesoActual}
                  onChange={(e) => {
                    set("pesoActual", e.target.value);
                    if (puesto) set("pesoObjetivoKg", pesoIdealDesdeBcs(Number(e.target.value), puesto));
                  }}
                  placeholder="0"
                  className="text-3xl pb-2 outline-none bg-transparent w-28"
                  style={{ color: TINTA, fontFamily: fontDisplay, borderBottom: `2px solid ${perfil.pesoActual ? VIOLETA : "#E3DAF0"}` }}
                />
                <span style={{ color: MALVA, fontFamily: fontBody }}>kg</span>
              </div>
            </div>
            <Etiqueta>Condición corporal (BCS 1-9)</Etiqueta>
            <div className="grid grid-cols-9 gap-1 mt-2 mb-3">
              {ESCALA_BCS.map((b) => {
                const activo = puesto === b.n;
                return (
                  <button key={b.n} onClick={() => ponerBcs(b.n)}
                    aria-label={`BCS ${b.n}`}
                    className="py-3 rounded-lg text-center"
                    style={{ background: activo ? VIOLETA : "#FFFFFF",
                             border: `1.5px solid ${activo ? VIOLETA : "#E3DAF0"}`,
                             color: activo ? "#FFFFFF" : TINTA,
                             fontFamily: fontDisplay, fontSize: 15, cursor: "pointer" }}>
                    {b.n}
                  </button>
                );
              })}
            </div>
            <div className="rounded-2xl px-4 py-4 mb-3"
                 style={{ background: "#FFFFFF", border: "1.5px solid #E3DAF0" }}>
              {fila ? (
                <>
                  <p style={{ color: TINTA, fontFamily: fontDisplay, fontSize: 16 }}>
                    {fila.n} · {fila.titulo}
                  </p>
                  <p className="text-sm mt-1 leading-snug" style={{ color: MALVA, fontFamily: fontBody }}>
                    {fila.detalle}
                  </p>
                </>
              ) : (
                <p className="text-sm" style={{ color: MALVA, fontFamily: fontBody }}>
                  Marca el BCS observado. De ahí sale el peso objetivo, y del
                  peso objetivo las kcal de la ración.
                </p>
              )}
            </div>
            {objetivoBcs && (
              <p className="text-sm" style={{ color: MALVA, fontFamily: fontBody }}>
                Peso objetivo estimado:{" "}
                <span style={{ color: VIOLETA, fontWeight: 700 }}>{objetivoBcs} kg</span>
                {puesto === 9 && " (cota inferior: la escala se satura en 9)"}
              </p>
            )}
            <div className="flex-1" />
            <BotonContinuar activo={puedeContinuar} onClick={siguiente} />
          </div>
          {drawerLigero}
        </div>
      );
    }
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
                onChange={(e) => {
                  // ⚠️ EN LA FICHA el peso y la condición se dicen JUNTOS
                  // -- el deslizador está dos dedos más abajo -- así que
                  // aquí el objetivo se recalcula. En Evolución NO: allí
                  // una pesada es una pesada, y si el objetivo se moviera
                  // con ella volveríamos al fallo del 25 de agosto.
                  set("pesoActual", e.target.value);
                  set("pesoObjetivoKg",
                      pesoIdealDesdeCondicion(Number(e.target.value), perfil.condicionIdx));
                }}
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
              onChange={(e) => {
                const idx = Number(e.target.value);
                set("condicionIdx", idx);
                // ⚠️ Y EL BCS EQUIVALENTE (29 agosto). Los cinco escalones
                // SON cinco valores del BCS (2, 4, 5, 7 y 9): escribir los
                // dos deja la ficha diciendo una sola cosa. Si solo se
                // escribiera el escalón, un perro al que un veterinario le
                // puso un 6 y luego un dueño marca "Rellenito" se quedaría
                // con el 6 viejo mandando sobre la respuesta nueva -- y el
                // peso objetivo guardado no cuadraría con el que se
                // recalcula. Un fallo sin error, de los de esta casa.
                set("bcs", bcsDesdeCondicion(idx));
                set("condicionTocado", true);
                // ⚠️ AQUÍ SE FIJA EL OBJETIVO (25 agosto). La condición es
                // una observación hecha EN UN MOMENTO, junto a un peso: de
                // las dos juntas sale el objetivo, y a partir de ahí el
                // objetivo ya no se mueve aunque el perro sí. Antes se
                // recalculaba en cada pantalla dividiendo el peso de hoy,
                // y por eso la dieta no podía terminar nunca.
                set("pesoObjetivoKg", pesoIdealDesdeCondicion(Number(perfil.pesoActual), idx));
              }}
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
        esDemo={PAYWALL_ES_DEMO}
        onActivarDemo={() => cambiarPremiumDemo(true)}
      />
    );
  }

  // ⚠️ AÑADIDO — Evolución y Analizar, abiertas desde el perfil. Se
  // reutiliza VistaMenus en modo "sólo esta sección": el código de las dos
  // vive ahí dentro y no depende de que haya un menú generado, sólo estaba
  // fuera de alcance. `menus` va de relleno porque en este modo la vista de
  // menús ni se pinta.
  if (fase === "seccion" && seccionSuelta) {
    return (
      <>
      <VistaMenus
        enModoProfesional={enModoProfesional}
        soloSeccion={seccionSuelta}
        menus={MENUS_EJEMPLO}
        onVolver={() => { setSeccionSuelta(null); setFase("onboarding"); }}
        modo={modo}
        alimentosEvitados={alimentosEvitados}
        patologias={perfil?.patologias || []}
        nombrePerro={nombreMostrar}
        necesitaTransicion={false}
        dietaActual={dietaActual}
        categoriasDisponibles={categoriasDisponibles}
        perfil={perfil}
        derReal={derReal}
        etapaLabel={etapaLabel}
        etapaCalculada={etapaCalculada}
        especiesExcluidas={especiesExcluidas}
        pesoAdultoEsperado={pesoAdultoEsperado} pesoObjetivoKg={pesoObjetivoKg}
        edad={edad}
        set={set}
        setFase={setFase}
        avisoNoForzado={false}
        diagnosticoPersonalizar={null}
        avisoExtraEspecie={null}
        // Estas dos (Evolución y Analizar abiertas desde el perfil) tampoco
        // la tenían: mismo caso, mismo arreglo.
        burbuja={burbujaDePerfil(true)} onAbrirPanel={() => setMenuLigeroAbierto(true)}
        burbujaClara={burbujaDePerfil(false)}
        onAbrirLaCompra={abrirLaCompra}
        premium={premium}
        onMostrarSuscripcion={() => setMostrarSuscripcion(true)}
        // ⚠️ AQUÍ HABÍA UN `() => {}` (25 agosto). Evolución abierta
        // desde el panel es la MISMA pantalla, con el mismo botón de
        // "Regenerar menú adaptado al nuevo peso" -- y por este camino no
        // reventaba: no hacía absolutamente nada, en silencio. Peor.
        // Ahora los dos caminos llaman a lo mismo.
        onRegenerarConAlimentos={regenerarConAlimentos}
        usuario={usuario}
        onPerroGuardado={onPerroGuardado}
      />
      {/* VistaMenus pinta su propio panel lateral, no `drawerLigero`, así
          que los avisos hay que colgarlos aquí a mano. */}
      {/* ⚠️ AÑADIDO (24 agosto) — esta rama no pintaba el panel porque
          VistaMenus traía el suyo. Al borrar el interno (uno solo, pedido
          expreso) se quedó sin ninguno: la hamburguesa de Evolución y
          Analizar no abría NADA. Era justo lo que ella describía -- "cuando
          me meto en evolución y crecimiento cambia el menú lateral". */}
      {panelLigero}
      {pantallaDeLaCompra}
      {avisoCambiarDePerro}
      {avisoBorrarPerro}
      {avisoDescartarLocal}
      {hojaDePerros}
      {pantallaAjustes}
      </>
    );
  }

  // ⚠️ AÑADIDO — pantalla para los menús ya guardados en Supabase. Antes
  // no existía ninguna: se guardaban y no había forma de volver a verlos.
  // ─── EL HISTORIAL DE PAUTAS FIRMADAS ──────────────────────────────────
  // Una lista de documentos, ordenados por fecha. No se edita ninguno: si
  // hay que cambiar algo se firma otra pauta, y ésta se queda. Es además la
  // única forma de poder mirar atrás y ver qué se le pautó y cuándo.
  if (fase === "pautas") {
    return (
      <div className="cnl-pantalla-completa w-full flex flex-col" style={{ background: PAPEL }}>
        <Fuentes />
        <div style={{ background: VIOLETA }} className="w-full px-6 pt-10 pb-8">
          <div className="flex items-center justify-between mb-3">
            <BotonMenu onClick={() => setMenuLigeroAbierto(true)} color="#FFFFFF" />
            {burbujaDePerfil(true)}
          </div>
          <p className="text-[11px] tracking-[0.18em] uppercase mb-2"
             style={{ color: MALVA, fontFamily: "monospace" }}>Pautas firmadas</p>
          <h1 className="text-3xl leading-tight"
              style={{ color: "#FFFFFF", fontFamily: fontDisplay, fontWeight: 500 }}>
            {nombreMostrar}
          </h1>
        </div>
        <div className="flex-1 px-6 pt-6 pb-6 overflow-y-auto">
          {pautasFirmadas.length === 0 ? (
            <p className="text-sm leading-snug" style={{ color: MALVA, fontFamily: fontBody }}>
              Todavía no hay ninguna pauta firmada de este paciente. Se firman desde el
              formulador, cuando la ración cumple todo.
            </p>
          ) : pautasFirmadas.map((fila) => {
            const doc = fila.documento || {};
            const alimentos = Object.entries(doc.menu || {});
            return (
              <div key={fila.id} className="rounded-2xl px-4 py-4 mb-3"
                   style={{ background: "#FFFFFF", border: "1.5px solid #E3DAF0" }}>
                <p style={{ color: TINTA, fontFamily: fontDisplay, fontSize: 16 }}>
                  {new Date(fila.firmada_en).toLocaleDateString("es-ES",
                    { day: "numeric", month: "long", year: "numeric" })}
                </p>
                <p className="text-sm" style={{ color: MALVA, fontFamily: fontBody }}>
                  {fila.nombre_firmante} · nº {fila.num_colegiado}
                </p>
                <div className="mt-2">
                  {alimentos.map(([nombre, g]) => (
                    <p key={nombre} className="text-sm" style={{ color: TINTA, fontFamily: fontBody }}>
                      {nombre} <span style={{ color: MALVA }}>· {g} g</span>
                    </p>
                  ))}
                </div>
                {doc.contexto && (
                  <p className="text-xs mt-2" style={{ color: MALVA, fontFamily: fontBody }}>
                    {Math.round(doc.contexto.der_objetivo || 0)} kcal/día ·{" "}
                    {doc.contexto.etapa_requisitos}
                    {doc.contexto.patologias?.length > 0 && ` · ${doc.contexto.patologias.join(", ")}`}
                  </p>
                )}
                {/* Los huecos van EN el documento, no solo en pantalla: si se
                    firmó con datos incompletos, eso se lee un año después. */}
                {Object.keys(doc.huecos?.sin_dato || {}).length > 0 && (
                  <p className="text-xs mt-1 leading-snug" style={{ color: MALVA, fontFamily: fontBody }}>
                    Firmada con huecos del catálogo en:{" "}
                    {Object.keys(doc.huecos.sin_dato).join(", ")}
                  </p>
                )}
                <p className="text-[11px] mt-2" style={{ color: MALVA, fontFamily: "monospace" }}>
                  sello {fila.sello}
                </p>
              </div>
            );
          })}
        </div>
        {drawerLigero}
      </div>
    );
  }

  if (fase === "misMenus") {
    const ETIQUETAS_MODO = { automatico: "Automático", personalizar: "Personalizado",
                             formulado: "Formulado" };
    return (
      <div className="cnl-pantalla-completa w-full flex flex-col" style={{ background: PAPEL }}>
        <Fuentes />
        <div style={{ background: VIOLETA }} className="w-full px-6 pt-10 pb-8">
          <div className="flex items-center justify-between mb-3">
            <BotonMenu onClick={() => setMenuLigeroAbierto(true)} color="#FFFFFF" />
            {burbujaDePerfil(true)}
          </div>
          <p className="text-[11px] tracking-[0.18em] uppercase mb-2" style={{ color: MALVA, fontFamily: "monospace" }}>
            {enModoProfesional ? "Menús" : "Mis menús"}
          </p>
          <h1 className="text-3xl leading-tight" style={{ color: "#FFFFFF", fontFamily: fontDisplay, fontWeight: 500 }}>
            {enModoProfesional ? <>Los menús de<br />tus pacientes</> : <>Los menús de<br />{nombreMostrar}</>}
          </h1>
        </div>

        <div className="flex-1 px-6 pt-6 pb-6 flex flex-col">
          {/* ⚠️ AÑADIDO (25 agosto) — PEDIDO EXPRESO: "cuando entras en mis
              menús, tiene que haber un botón para generar otro nuevo menú".
              Tiene todo el sentido: es la pantalla donde ves los que ya
              tienes, o sea justo donde piensas "pues me hace falta otro".
              Antes había que salir a la ficha del perro para eso, que es
              donde nadie lo va a buscar. */}
          <button
            // ⚠️ La MISMA función que el botón del asistente. Aquí había
            // una versión propia que solo navegaba, y por eso entrando por
            // este camino la ficha se guardaba sin su etapa.
            onClick={() => { setMenuGuardadoAbierto(null); irAlGeneradorDeMenus(true); }}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl mb-4"
            style={{ background: ROSA, color: "#FFFFFF", fontFamily: fontBody, fontWeight: 700 }}
          >
            <Plus size={17} /> Hacer otro menú
          </button>

          {/* ─── EL BUSCADOR DEL VETERINARIO ─────────────────────────────
              Un solo campo que mira el nombre del paciente, el del tutor y la
              raza. Se pidieron tres filtros; una caja que busca en los tres
              hace lo mismo y no obliga a elegir por cuál buscar antes de
              saber qué buscas. Sin tildes, como el resto (ver texto.js). */}
          {enModoProfesional && (
            <div className="mb-3">
              <div className="relative">
                <Search size={16} style={{ position: "absolute", left: 12, top: 13, color: MALVA }} />
                <input
                  value={filtroMenus}
                  onChange={(e) => setFiltroMenus(e.target.value)}
                  placeholder="Buscar por paciente, tutor o raza"
                  aria-label="Buscar menús"
                  className="w-full py-2.5 pl-9 pr-3 rounded-xl outline-none"
                  style={{ background: "#FFFFFF", border: "1.5px solid #E3DAF0",
                           color: TINTA, fontFamily: fontBody }} />
              </div>
            </div>
          )}

          {enModoProfesional ? (
            menusDeTodos === null ? (
              <p className="text-sm" style={{ color: MALVA, fontFamily: fontBody }}>Cargando...</p>
            ) : menusDeTodos === undefined ? (
              <p className="text-sm" style={{ color: ROSA, fontFamily: fontBody }}>
                No se han podido cargar los menús. Vuelve a entrar en un momento.
              </p>
            ) : (() => {
              const porPerro = Object.fromEntries((perros || []).map((p) => [p.id, p]));
              const filas = menusDeTodos.filter((m) => {
                if (!filtroMenus.trim()) return true;
                const p = porPerro[m.perro_id] || {};
                return contiene(p.nombre || "", filtroMenus)
                    || contiene(p.tutor_nombre || "", filtroMenus)
                    || contiene(nombreDeRaza(p.raza) || "", filtroMenus)
                    || contiene(m.nombre || "", filtroMenus);
              });
              if (filas.length === 0) {
                return (
                  <p className="text-sm" style={{ color: MALVA, fontFamily: fontBody }}>
                    {menusDeTodos.length === 0
                      ? "Todavía no has hecho ningún menú. En cuanto formules uno, aparecerá aquí."
                      : `Ningún menú de tus pacientes cuadra con «${filtroMenus}».`}
                  </p>
                );
              }
              return (
                <div className="flex flex-col gap-2">
                  {filas.map((fila) => {
                    const p = porPerro[fila.perro_id] || {};
                    return (
                      <button key={fila.id} onClick={() => abrirMenuGuardado(fila)}
                        className="flex items-center gap-3 p-4 rounded-2xl text-left"
                        style={{ background: "#FFFFFF", border: "1.5px solid #E3DAF0",
                                 cursor: "pointer" }}>
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                             style={{ background: VIOLETA }}>
                          <ClipboardList size={16} style={{ color: ROSA }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p style={{ color: TINTA, fontFamily: fontDisplay, fontSize: 16 }}>
                            {p.nombre || "Paciente"}
                          </p>
                          <p className="text-[11px] mt-0.5" style={{ color: MALVA, fontFamily: fontBody }}>
                            {[nombreDeRaza(p.raza), p.tutor_nombre, fecha(fila.created_at)]
                              .filter(Boolean).join(" · ")}
                          </p>
                          <p className="text-[10px] tracking-[0.1em] uppercase mt-0.5"
                             style={{ color: MALVA, fontFamily: "monospace" }}>
                            {ETIQUETAS_MODO[fila.modo] || "Automático"}
                            {fila.der_real ? ` · ${Math.round(fila.der_real)} kcal` : ""}
                          </p>
                        </div>
                        <ChevronRight size={16} style={{ color: "#C9BEDD" }} />
                      </button>
                    );
                  })}
                </div>
              );
            })()
          ) : cargandoMenusGuardados ? (
            <p className="text-sm" style={{ color: MALVA, fontFamily: fontBody }}>Cargando...</p>
          ) : menusGuardados.length === 0 ? (
            <p className="text-sm" style={{ color: MALVA, fontFamily: fontBody }}>
              Todavía no hay ningún menú guardado. En cuanto hagas uno, aparecerá aquí.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {menusGuardados.map((fila) => (
                <div
                  key={fila.id}
                  className="flex items-center gap-2 p-4 rounded-2xl"
                  style={{ background: "#FFFFFF", border: "1.5px solid #E3DAF0" }}
                >
                  <button
                    onClick={() => abrirMenuGuardado(fila)}
                    className="flex items-center gap-3 flex-1 min-w-0 text-left"
                  >
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: VIOLETA }}>
                      <ClipboardList size={16} style={{ color: ROSA }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p style={{ color: TINTA, fontFamily: fontDisplay, fontSize: 16 }}>
                        {fila.nombre || fecha(fila.created_at)}
                      </p>
                      <p className="text-[10px] tracking-[0.1em] uppercase mt-0.5" style={{ color: MALVA, fontFamily: "monospace" }}>
                        {ETIQUETAS_MODO[fila.modo] || "Automático"}
                        {fila.num_menus > 1 ? ` · ${fila.num_menus} menús` : ""}
                        {fila.der_real ? ` · ${Math.round(fila.der_real)} kcal` : ""}
                      </p>
                    </div>
                    <ChevronRight size={16} style={{ color: "#C9BEDD" }} />
                  </button>
                  {/* ⚠️ CAMBIADO (26 agosto) — LA PAPELERA PASA A SER TRES
                      PUNTOS. Pedido expreso: "en vez de la papelera debería
                      haber tres puntitos para poder renombrar y borrar".
                      Un icono de papelera solo puede hacer una cosa, y hacen
                      falta dos -- y desde el mismo sitio. */}
                  <button
                    onClick={() => setAccionesDeMenu({ fila })}
                    aria-label={`Opciones del menú ${fila.nombre || fecha(fila.created_at)}`}
                    className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center"
                    style={{ background: PAPEL }}
                  >
                    <MoreVertical size={16} style={{ color: MALVA }} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex-1" />
        </div>
        {/* Confirmación de borrado. Borrar sin preguntar un menú que
            costó una llamada al servidor y que la usuaria puede estar
            usando esta semana es demasiado fácil de hacer sin querer. */}
        {/* ⚠️ `indice == null` (26 agosto): desde que los tres puntos también
            existen DENTRO de un menú, `menuAConfirmarBorrado` puede referirse
            a un menú de la semana en vez de al conjunto. Ese caso tiene su
            propio diálogo (`dialogoDeBorrarMenuInterno`), porque lo que se
            borra y lo que hay que decir no son lo mismo. */}
        {menuAConfirmarBorrado?.indice == null && menuAConfirmarBorrado && (
          <div
            className="fixed inset-0 z-[70] flex items-center justify-center px-6"
            style={{ background: "rgba(35,21,57,0.45)" }}
            onClick={() => !borrandoMenu && setMenuAConfirmarBorrado(null)}
          >
            <div
              className="w-full max-w-sm rounded-2xl p-6"
              style={{ background: "#FFFFFF" }}
              onClick={(e) => e.stopPropagation()}
            >
              <p className="mb-2" style={{ color: TINTA, fontFamily: fontDisplay, fontSize: 19 }}>
                {((menuAConfirmarBorrado.fila || menuAConfirmarBorrado).menus_data || []).length > 1
                  ? "¿Borrar el menú guardado entero?"
                  : "¿Borrar este menú?"}
              </p>
              <p className="text-sm mb-1" style={{ color: MALVA, fontFamily: fontBody }}>
                {(() => {
                  // ⚠️ `.fila` (26 agosto): desde los tres puntos esto llega
                  // envuelto. Sin el desenvuelto, el diálogo enseñaba el
                  // nombre en blanco -- y preguntar "¿borro esto?" sin decir
                  // qué es exactamente lo que no puede pasar aquí.
                  const f = menuAConfirmarBorrado.fila || menuAConfirmarBorrado;
                  const cuantos = (f.menus_data || []).length;
                  const nombre = f.nombre || fecha(f.created_at);
                  return cuantos > 1 ? `${nombre} · ${cuantos} menús dentro` : nombre;
                })()}
              </p>
              <p className="text-sm mb-5" style={{ color: MALVA, fontFamily: fontBody }}>
                No se puede deshacer.
              </p>
              {menuAConfirmarBorrado.error && (
                <p className="text-sm mb-4" style={{ color: ROSA, fontFamily: fontBody }}>
                  {menuAConfirmarBorrado.error}
                </p>
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => setMenuAConfirmarBorrado(null)}
                  disabled={borrandoMenu}
                  className="flex-1 py-3 rounded-xl text-sm"
                  style={{ background: PAPEL, color: TINTA, fontFamily: fontBody, fontWeight: 600 }}
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmarBorrarMenu}
                  disabled={borrandoMenu}
                  className="flex-1 py-3 rounded-xl text-sm"
                  style={{ background: borrandoMenu ? MALVA : ROSA, color: "#FFFFFF", fontFamily: fontBody, fontWeight: 700 }}
                >
                  {borrandoMenu ? "Borrando..." : "Borrar"}
                </button>
              </div>
            </div>
          </div>
        )}
        {hojaDeAccionesDeMenu}
        {dialogoDeRenombrar}
        {drawerLigero}
      </div>
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
      {/* ⚠️ AÑADIDO — esta pantalla era la única sin botón de menú, algo
          que no importaba cuando solo se veía al terminar el onboarding,
          pero que ahora sí: siendo la pantalla de inicio, sin menú te
          quedas sin poder ir a ningún otro sitio. */}
      <div style={{ background: VIOLETA }} className="w-full px-6 pt-10 pb-8 text-center">
        <div className="flex items-center justify-between mb-4">
          <BotonMenu onClick={() => setMenuLigeroAbierto(true)} color="#FFFFFF" />
          {burbujaDePerfil(true)}
        </div>
        <p className="text-[11px] tracking-[0.18em] uppercase mb-3" style={{ color: MALVA, fontFamily: "monospace" }}>Perfil</p>
        <Dog size={36} strokeWidth={1.4} style={{ color: ROSA, margin: "0 auto" }} />
        {/* ⚠️ El mismo sitio sirve para dos momentos muy distintos, y el
            texto tiene que notarlo: justo después de rellenar el perfil
            por primera vez (celebración), o cada vez que entras con un
            perro ya guardado (pantalla de inicio). "¡Listo, Cairo!" está
            bien lo primero y raro lo segundo. */}
        <p className="text-2xl mt-4" style={{ color: "#FFFFFF", fontFamily: fontDisplay, fontWeight: 500 }}>
          {yaTienePerroGuardado ? nombreMostrar : `¡Listo, ${nombreMostrar}!`}
        </p>
        <p className="text-xs mt-1" style={{ color: MALVA, fontFamily: fontBody }}>
          {yaTienePerroGuardado
            ? "Sus datos y lo que necesita al día — toca el lápiz para cambiar algo"
            : "Revisa que todo esté bien — toca el lápiz para cambiar algo"}
        </p>
        {/* ⚠️ QUITADAS LAS PASTILLAS DE PERRO (24 agosto). Estaban aquí
            porque cambiar de perro solo vivía dentro del panel lateral y
            era invisible. Ahora eso lo hace la BURBUJA de la cabecera, que
            está en todas las pantallas y no solo en ésta -- tener las dos
            cosas era ofrecer lo mismo dos veces en el mismo sitio. */}
      </div>

      <div className="flex-1 px-6 pt-6 pb-6 flex flex-col">
        {/* ⚠️ AÑADIDO — aviso de que el menú guardado ya no le encaja al
            perro con sus datos de ahora (típicamente porque ha dejado de
            ser cachorro). Es un AVISO, no un cambio: el menú de la
            usuaria no se toca hasta que ella diga. */}
        {revision.estado === "caducado" && (
          <div className="rounded-2xl p-4 mb-6" style={{ background: "#FFF7E8", border: `1.5px solid #F5DFA8` }}>
            <div className="flex gap-2 items-start mb-2">
              <AlertCircle size={16} style={{ color: "#B37A00", flexShrink: 0, marginTop: 2 }} />
              <p className="text-sm" style={{ color: "#7A5C00", fontFamily: fontBody, fontWeight: 700 }}>
                {revision.revisados > 1
                  ? `${revision.caducados} de los ${revision.revisados} menús de ${nombreMostrar} se le han quedado cortos`
                  : `El menú de ${nombreMostrar} se le ha quedado corto`}
              </p>
            </div>
            <p className="text-xs mb-2" style={{ color: "#7A5C00", fontFamily: fontBody }}>
              Con sus datos de ahora ({etapaLabel.toLowerCase()}, {Math.round(derReal)} kcal al día),
              {revision.revisados > 1
                ? " parte de su semana ya no cubre todo lo que necesita."
                : " el menú que tiene guardado ya no cubre todo lo que necesita."}
            </p>
            {revision.porQue?.length > 0 && (
              <ul className="text-xs mb-3 pl-4" style={{ color: "#7A5C00", fontFamily: fontBody, listStyle: "disc" }}>
                {revision.porQue.slice(0, 4).map((motivo, i) => (
                  <li key={i} className="mb-0.5">{motivo}</li>
                ))}
              </ul>
            )}

            {revision.menusNuevos?.length ? (
              <>
                <p className="text-xs mb-3" style={{ color: "#7A5C00", fontFamily: fontBody }}>
                  {revision.revisados > 1
                    ? "Hemos corregido sólo los que hacía falta; los que seguían valiendo se quedan igual."
                    : "Hemos preparado uno corregido cambiando lo mínimo."}
                  {revision.cambios?.quitados?.length > 0 &&
                    ` Cambia ${revision.cambios.quitados.join(", ")}`}
                  {revision.cambios?.anadidos?.length > 0 &&
                    ` por ${revision.cambios.anadidos.join(", ")}`}
                  {revision.cambios?.quitados?.length > 0 && "."}
                </p>
                <button
                  onClick={verMenuRevalidado}
                  className="w-full py-3 rounded-xl text-sm"
                  style={{ background: ROSA, color: "#FFFFFF", fontFamily: fontBody, fontWeight: 700 }}
                >
                  {revision.revisados > 1 ? "Ver la semana corregida →" : "Ver el menú corregido →"}
                </button>
              </>
            ) : (
              <>
                <p className="text-xs mb-3" style={{ color: "#7A5C00", fontFamily: fontBody }}>
                  {revision.motivo || "No hemos podido arreglarlo conservando sus alimentos, hace falta un menú nuevo."}
                </p>
                <button
                  onClick={() => { setPantalla("elegir"); setFase("generador"); }}
                  className="w-full py-3 rounded-xl text-sm"
                  style={{ background: ROSA, color: "#FFFFFF", fontFamily: fontBody, fontWeight: 700 }}
                >
                  Hacer un menú nuevo →
                </button>
              </>
            )}
          </div>
        )}

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
        {/* Solo al TERMINAR el asistente. Abriendo la ficha para editarla
            no sale: para hacer un menú está "Mis menús", que es donde ves
            los que ya tienes. */}
        {!editandoLaFicha && (
        <button
          // ⚠️ `() => irAlGeneradorDeMenus()` y NO `irAlGeneradorDeMenus` a
          // secas: React le pasa el EVENTO como primer argumento, y un
          // evento es truthy -- o sea que terminar de crear el perfil
          // habría pedido el menú de un solo perro sin que nadie lo dijera.
          onClick={() => irAlGeneradorDeMenus()}
          className="w-full py-4 rounded-2xl text-base"
          style={{ background: ROSA, color: "#FFFFFF", fontFamily: fontBody, fontWeight: 700 }}
        >
          Todo bien, ir al generador de menús →
        </button>
        )}
        {/* ⚠️ AÑADIDO — LA INVITACIÓN A AÑADIR OTRO PERRO.
            Pedido expreso: "cuando entras por primera vez tendría que
            verse algún botón de tengo más de un perro". Tenía razón: la
            función existía pero solo dentro del panel lateral, o sea que
            para descubrirla había que saber ya que estaba.

            Se pinta con UN solo perro, incluida LA PRIMERA VEZ: ése es
            justo el momento en que estás pensando en tus perros y sabes
            cuántos tienes. Si la ficha todavía no está guardada, se
            guarda antes de empezar la siguiente (ver
            anadirOtroPerroGuardandoEste). Con dos o más ya no hace falta
            invitar a nada — para eso están las pestañas de arriba. */}
        {/* ⚠️ NUNCA EN MODO VETERINARIO (29 agosto). "¿Tienes más perros? Añade
            a otro y podréis hacer sus menús lo más parecidos posible: una sola
            compra para los dos" es una idea de casa. Los pacientes de un
            veterinario no viven juntos ni comen de la misma bolsa. Es lo mismo
            que ya se quitó de "¿para quién es el menú?" */}
        {!enModoProfesional && listaDePerros.length === 1 && (
          <div className="mt-3">{invitacionAOtroPerro}</div>
        )}

        {/* ⚠️ AÑADIDO — borrar perro. Hasta ahora un perro creado por
            error se quedaba en la cuenta para siempre: no había forma de
            quitarlo desde la app. Va aquí abajo, en gris y pequeño, y no
            en el selector: borrar no es una forma de cambiar de perro.
            El aviso de confirmación explica que se van también sus menús
            (ver eliminarPerro en supabase.js). */}
        {perfil._id && (
          <button
            onClick={() => {
              setErrorAlBorrarPerro(null);
              setPerroABorrar({ id: perfil._id, nombre: nombreMostrar });
            }}
            className="w-full text-center py-3 mt-2"
            style={{ color: MALVA, fontFamily: fontBody, fontSize: 13, background: "none", border: "none" }}
          >
            Borrar a {nombreMostrar} de mi cuenta
          </button>
        )}
      </div>
      {drawerLigero}
    </div>
  );
  }

  // ⚠️ AÑADIDO — LOS MENÚS DE TODA LA CASA.
  //
  // Pantalla propia, y no la de siempre con pestañas, porque lo que se
  // enseña aquí es distinto: no es "tus menús de la semana", es "cómo de
  // parecidos han salido y qué tienes que comprar". El menú de cada perro
  // se guarda en SU ficha, así que después se ve donde se ve siempre.
  if (fase === "casa") {
    if (cargandoCasa) {
      return (
        <div className="cnl-pantalla-completa w-full flex flex-col items-center justify-center px-8 text-center" style={{ background: PAPEL }}>
          <Fuentes />
          <Dog size={36} strokeWidth={1.4} style={{ color: VIOLETA }} />
          <p className="mt-4" style={{ color: TINTA, fontFamily: fontDisplay, fontSize: 18 }}>
            Calculando los menús de {nombresDeLosPerros(listaDePerros)}...
          </p>
          <p className="text-sm mt-3" style={{ color: MALVA, fontFamily: fontBody }}>
            {paraQuien === "parecidos"
              ? "Buscando la combinación que le sirva a todos con los menos cambios posibles."
              : "Cada uno con sus medidas, su etapa y sus necesidades."}
          </p>
          <div className="flex items-center gap-2 mt-4 px-4 py-3 rounded-xl" style={{ background: "#FFF7E8", border: "1px solid #F5DFA8" }}>
            <span style={{ fontSize: 16 }}>☝️</span>
            <p className="text-xs text-left" style={{ color: "#7A5C00", fontFamily: fontBody }}>
              No cierres esta pantalla ni salgas de la app — si lo haces, habrá que empezar de cero.
            </p>
          </div>
        </div>
      );
    }
    if (errorCasa || !menusDeLaCasa) {
      return (
        <div className="cnl-pantalla-completa w-full flex flex-col items-center justify-center px-8 text-center" style={{ background: PAPEL }}>
          <Fuentes />
          <AlertCircle size={36} strokeWidth={1.4} style={{ color: ROSA }} />
          <p className="mt-4 mb-2" style={{ color: TINTA, fontFamily: fontDisplay, fontSize: 18 }}>
            No hemos podido hacer los menús de todos
          </p>
          <p className="text-sm mb-6" style={{ color: MALVA, fontFamily: fontBody, maxWidth: 340 }}>
            {errorCasa || "Inténtalo otra vez."}
          </p>
          {/* Que falle para todos no puede dejarte sin poder hacer el de
              uno: el camino de siempre sigue ahí, a un toque. */}
          <button
            onClick={() => { setParaQuien("solo"); setFase("generador"); setPantalla("elegir"); }}
            className="py-3 px-6 rounded-xl"
            style={{ background: ROSA, color: "#FFFFFF", fontFamily: fontBody, fontWeight: 700, border: "none" }}
          >
            Hacer solo el de {nombreMostrar} →
          </button>
          {drawerLigero}
        </div>
      );
    }

    const sonParecidos = menusDeLaCasa.modo_conjunto === "parecidos";
    return (
      <div className="cnl-pantalla-completa w-full flex flex-col" style={{ background: PAPEL }}>
        <Fuentes />
        <div style={{ background: VIOLETA }} className="w-full px-6 pt-10 pb-7">
          <div className="flex items-center justify-between mb-3">
            <BotonMenu onClick={() => setMenuLigeroAbierto(true)} color="#FFFFFF" />
            <BotonAtras onClick={() => { setFase("generador"); setPantalla("elegir"); }} texto="Volver" />
          </div>
          <h1 className="text-3xl leading-tight" style={{ color: "#FFFFFF", fontFamily: fontDisplay, fontWeight: 500 }}>
            {(menusDeLaCasa.numero_de_menus || 1) === 1
              ? <>Los menús de<br />la casa</>
              : <>La semana de<br />la casa</>}
          </h1>
          {sonParecidos && (
            <p className="text-sm mt-3" style={{ color: MALVA, fontFamily: fontBody }}>
              {menusDeLaCasa.compra_unica
                ? "Todos comen lo mismo, en cantidades distintas. Una sola compra."
                : `Se han hecho lo más parecidos posible: ${menusDeLaCasa.cambios_totales} ` +
                  `${menusDeLaCasa.cambios_totales === 1 ? "alimento distinto" : "alimentos distintos"} en total.`}
            </p>
          )}
        </div>

        <div className="flex-1 px-6 pt-6 pb-6 flex flex-col">
          {menusDeLaCasa.perros.map((p) => {
            const necesitaTransicion = p.dietaActual === "pienso" || p.dietaActual === "cocinada";
            return (
            <div key={p.indice} className="rounded-2xl p-5 mb-4" style={{ background: "#FFFFFF", border: "1.5px solid #E3DAF0" }}>
              <div className="flex items-center gap-2 mb-1">
                <Dog size={17} strokeWidth={1.7} style={{ color: VIOLETA }} />
                <p style={{ color: TINTA, fontFamily: fontDisplay, fontSize: 18 }}>{p.nombre}</p>
                {p.es_la_base && sonParecidos && (
                  <span className="text-[9px] px-2 py-0.5 rounded-full" style={{ background: PAPEL, color: VIOLETA, fontFamily: "monospace" }}>
                    de referencia
                  </span>
                )}
              </div>
              {!p.factible ? (
                <p className="text-sm mt-2" style={{ color: ROSA, fontFamily: fontBody }}>
                  {p.motivo || "No hemos encontrado un menú que cumpla para este perro."}
                </p>
              ) : (
                <>
                  <p className="text-[10px] tracking-[0.1em] uppercase mb-1" style={{ color: MALVA, fontFamily: "monospace" }}>
                    {p.necesitaKcal ? `Necesita ${p.necesitaKcal} kcal al día` : "Su ración diaria"}
                    {p.menus.length > 1 ? ` · ${p.menus.length} menús` : ""}
                  </p>
                  {/* ⚠️ Las DOS cifras, con la diferencia explicada. El
                      motor admite un 3% arriba o abajo, así que el menú
                      casi nunca da la cifra exacta; enseñar solo el total
                      del menú hacía que pareciera un fallo. */}
                  <p className="text-xs mb-3" style={{ color: MALVA, fontFamily: fontBody }}>
                    Este menú aporta <b style={{ color: TINTA }}>{Math.round(p.menus[0].kcal_total || 0)} kcal</b>
                    {" "}en {Math.round(p.menus[0].gramos_total || 0)} g
                    {p.necesitaKcal && Math.abs(Math.round(p.menus[0].kcal_total || 0) - p.necesitaKcal) >= 1 ? (
                      <>{" — "}
                        {Math.abs(Math.round(100 * ((p.menus[0].kcal_total || 0) - p.necesitaKcal) / p.necesitaKcal))}
                        {"% "}
                        {(p.menus[0].kcal_total || 0) < p.necesitaKcal ? "menos" : "más"}
                        {" de lo justo, dentro del margen normal."}
                      </>
                    ) : null}
                  </p>

                  {/* ⚠️ AÑADIDO — la transición, POR PERRO. Uno puede venir
                      de pienso y el otro llevar años en BARF: el aviso no
                      puede ser de la casa, tiene que ser de cada animal. */}
                  {necesitaTransicion && (
                    <div className="rounded-xl p-3 mb-3" style={{ background: "#FFF7E8", border: "1px solid #F5DFA8" }}>
                      <p className="text-xs leading-snug" style={{ color: "#7A5C00", fontFamily: fontBody }}>
                        <b>{p.nombre} necesita transición.</b> Viene de{" "}
                        {p.dietaActual === "pienso" ? "pienso" : "comida cocinada"}, así que el
                        cambio se hace poco a poco a lo largo de unos días, no de golpe.
                      </p>
                    </div>
                  )}

                  {p.menus.map((mm, k) => (
                    <div key={k} className={k > 0 ? "mt-3 pt-3" : ""}
                         style={k > 0 ? { borderTop: "1px solid #F0EAF8" } : undefined}>
                      {p.menus.length > 1 && (
                        <p className="text-[10px] tracking-[0.1em] uppercase mb-1" style={{ color: MALVA, fontFamily: "monospace" }}>
                          Menú {k + 1} · {mm.dias} {mm.dias === 1 ? "día" : "días"}
                        </p>
                      )}
                      <div className="flex flex-col gap-1">
                        {Object.entries(mm.menu || {}).map(([alimento, gramos]) => {
                          const esNuevo = (mm.cambios?.anadidos || []).includes(alimento);
                          return (
                            <div key={alimento} className="flex items-baseline justify-between gap-3">
                              <span className="text-sm" style={{ color: esNuevo ? VIOLETA : TINTA, fontFamily: fontBody, fontWeight: esNuevo ? 700 : 400 }}>
                                {alimento}
                                {esNuevo && sonParecidos && (
                                  <span className="text-[10px] ml-1" style={{ color: MALVA, fontFamily: "monospace" }}>solo suyo</span>
                                )}
                              </span>
                              <span className="text-sm shrink-0" style={{ color: MALVA, fontFamily: fontBody }}>
                                {gramos < 1 ? gramos.toFixed(2) : Math.round(gramos)} g
                              </span>
                            </div>
                          );
                        })}
                      </div>
                      {mm.aviso_composicion && (
                        <p className="text-xs leading-snug mt-2" style={{ color: "#6B4E9E", fontFamily: fontBody }}>
                          {mm.aviso_composicion}
                        </p>
                      )}
                      {/* ⚠️ AÑADIDO (24 agosto) — CASO REAL: "este menú de
                          personalizar me ha metido 3 verduras, no debería".
                          Parte del problema era del motor (ya arreglado: ahora
                          respeta las seis categorías que dejas elegir). La otra
                          parte era ESTA pantalla: con un perro, "hizo falta
                          añadir algo" y "no se pudo con lo elegido" salen en un
                          cartel; aquí estaban puestos a null a mano, así que con
                          dos perros el motor podía añadir cosas y nadie lo decía.
                          Van como texto y no como cartel a propósito: con varios
                          perros y varios menús, un modal por cada uno sería una
                          cadena de ventanas que se cierran sin leer. */}
                      {mm.aviso && (
                        <p className="text-xs leading-snug mt-2" style={{ color: "#6B4E9E", fontFamily: fontBody }}>
                          {mm.aviso}
                        </p>
                      )}
                      {mm.no_se_pudo_forzar && (
                        <p className="text-xs leading-snug mt-2" style={{ color: "#6B4E9E", fontFamily: fontBody }}>
                          Con lo que elegiste a mano no había una combinación viable para
                          {" "}{p.nombre}, así que este menú se ha calculado libremente para que
                          sí cumpla los 30 requisitos.
                        </p>
                      )}
                    </div>
                  ))}

                  {p.resumen_parecido && (
                    <p className="text-xs leading-snug mt-3 pt-3" style={{ color: MALVA, fontFamily: fontBody, borderTop: "1px solid #F0EAF8" }}>
                      {p.resumen_parecido}
                    </p>
                  )}

                  {/* ⚠️ AÑADIDO — PEDIDO EXPRESO: "no puedes ni editar
                      alimentos". Se puede, pero no aquí: se abre el menú de
                      ese perro en la pantalla de siempre, que es donde vive
                      el editor entero (cambiar, añadir, quitar, regenerar
                      conservando lo demás). Duplicarlo aquí sería tener dos
                      editores que se van separando con el tiempo, y uno de
                      los dos acabaría sin los arreglos del otro.

                      Hay que guardar antes: esa pantalla lee de la ficha. */}
                  {usuario && p.perroId && (
                    <button
                      onClick={async () => {
                        if (!guardadosCasa) await guardarMenusDeLaCasa();
                        if (p.perroId === perfil._id) setFase("misMenus");
                        else onCambiarDePerro(p.perroId);   // remonta la app con ese perro
                      }}
                      className="w-full flex items-center justify-center gap-2 py-3 rounded-xl mt-3"
                      style={{ background: PAPEL, color: VIOLETA, fontFamily: fontBody, fontSize: 13, fontWeight: 700, border: "none" }}
                    >
                      {guardandoCasa ? "Guardando..." : `Ver y editar el menú de ${p.nombre}`}
                      <ChevronRight size={15} />
                    </button>
                  )}
                </>
              )}
            </div>
          );})}

          <div className="flex-1" />
          {usuario && (
            <button
              onClick={guardarMenusDeLaCasa}
              disabled={guardandoCasa || guardadosCasa}
              className="w-full py-4 rounded-2xl text-base"
              style={{
                background: guardadosCasa ? "#E8E0F4" : ROSA,
                color: guardadosCasa ? VIOLETA : "#FFFFFF",
                fontFamily: fontBody, fontWeight: 700, border: "none",
              }}
            >
              {guardadosCasa
                ? "✓ Guardado — cada menú en la ficha de su perro"
                : guardandoCasa ? "Guardando..." : "Guardar los menús"}
            </button>
          )}
          <button
            onClick={() => { setFase("generador"); setPantalla("elegir"); }}
            className="w-full text-center py-3 mt-1"
            style={{ color: MALVA, fontFamily: fontBody, fontSize: 13, background: "none", border: "none" }}
          >
            Volver
          </button>
        </div>
        {drawerLigero}
      </div>
    );
  }

  // ─── EL VETERINARIO NO ELIGE MODO: FORMULA ────────────────────────────
  //
  // ⚠️ PEDIDO EXPRESO (29 agosto): "ellos no tienen que tener automático
  // personalizar, ellos tienen su propio modo de crear el menú... van
  // poniendo los alimentos y los gramos y van viendo todos los nutrientes
  // por categorías en tiempo real... y lo del botón de autocompletar".
  //
  // "Automático" y "Personalizar" son para quien quiere que le resuelvan la
  // ración. Un profesional pone las cantidades porque las ha decidido, y lo
  // que necesita del motor es ver lo que va saliendo y que le cierre lo que
  // falte cuando él lo pida. La pantalla vive en `formulador.jsx`; aquí solo
  // se decide quién la ve y con qué paciente.
  if (fase === "generador" && pantalla === "elegir" && enModoProfesional) {
    return (
      <>
        <Fuentes />
        <Formulador
          perfil={perfil}
          derObjetivo={derReal}
          etapaRequisitos={ETAPA_A_SUFIJO_API[etapaCalculada] || "Adulto"}
          pesoPerroKg={perfil?.pesoActual ? Number(perfil.pesoActual) : null}
          pesoAdultoEsperadoKg={pesoAdultoEsperado || null}
          pesoObjetivoKg={pesoObjetivoKg}
          patologias={perfil?.patologias || []}
          especiesExcluidas={Array.from(especiesExcluidas || [])}
          nombresExcluidos={Array.from(alimentosEvitados || [])}
          categoriasExcluidas={perfil?.categoriasExcluidas || []}
          onVolver={() => setFase("onboarding")}
          onAbrirPanel={() => setMenuLigeroAbierto(true)}
          dietaActual={dietaActual}
          firmante={perfilProfesional}
          onFirmar={async (documento) => {
            // Se guarda TAL CUAL lo que selló la API. La seguridad por fila
            // de Supabase es lo que impide que firme quien no está
            // acreditado: la API todavía no autentica (VETERINARIOS.md §10).
            const fila = await firmarPauta({
              documento,
              profesionalId: usuario.id,
              perroId: perfil._id || null,
              // Hoy el paciente vive en la cuenta del veterinario, así que
              // el tutor es él mismo. En la fase 3, cuando el perro sea de
              // otro, aquí irá el dueño -- y por eso se guarda la columna
              // desde ya en vez de deducirla al leer.
              tutorId: usuario.id,
            });
            return fila;
          }}
          onGuardar={(gramosFormulados, estadoFinal, indicaciones) => {
            const comoUnMenu = {
              factible: true,
              menu: gramosFormulados,
              ficha: estadoFinal?.ficha || null,
              problemas_seguridad: estadoFinal?.problemas_seguridad || [],
              kcal_total: estadoFinal?.kcal ?? null,
              gramos_total: estadoFinal?.gramos_total ?? null,
              formulado_por_el_profesional: true,
              // Lo que él ha escrito para el tutor se guarda con el menú:
              // una pauta son los gramos Y qué hacer con ellos.
              indicaciones: indicaciones || "",
            };
            // ⚠️ NO SE NAVEGA A NINGUNA PARTE (29 agosto). Antes esto hacía
            // `setPantalla("resultado")` y el veterinario acababa en la
            // pantalla del dueño: la del menú con "editar", "cómo darlo",
            // la cesta y el plan de transición para casa. CASO REAL de la
            // usuaria: "te lleva a una pantalla igual que el generador de
            // menú del usuario, y eso no me gusta... no tiene sentido, tiene
            // que ser profesional".
            //
            // Se queda donde está, con lo que acaba de formular delante, y
            // el propio formulador dice que está guardada y dónde mirarla.
            if (usuario && !sinCuenta) {
              guardarMenu(usuario.id, perfil._id || null, {
                modo: "formulado",
                derReal,
                etapaLabel,
                menusData: [comoUnMenu],
                numMenus: 1,
              })
                .then((fila) => { if (fila) setMenusGuardados((previos) => [fila, ...previos]); })
                .catch((err) => capturarError(err, { donde: "guardarPautaFormulada" }));
            }
          }}
        />
        {drawerLigero}
      </>
    );
  }

  if (fase === "generador" && pantalla === "elegir") {
    return (
      <div className="cnl-pantalla-completa w-full flex flex-col" style={{ background: PAPEL }}>
        <Fuentes />
        <div style={{ background: VIOLETA }} className="w-full px-6 pt-10 pb-8">
          <div className="flex items-center justify-between mb-3">
            <BotonMenu onClick={() => setMenuLigeroAbierto(true)} color="#FFFFFF" />
            {burbujaDePerfil(true)}
          </div>
          <p className="text-[11px] tracking-[0.18em] uppercase mb-2" style={{ color: MALVA, fontFamily: "monospace" }}>Menú semanal</p>
          <h1 className="text-3xl leading-tight mb-2" style={{ color: "#FFFFFF", fontFamily: fontDisplay, fontWeight: 500 }}>
            {/* ⚠️ CASO REAL (23 agosto): con UN solo perro esto pasó a
                decir "los menús de la casa". El título miraba la opción
                elegida, y al quitar "Solo para X" el valor de partida dejó
                de ser "solo" -- así que con un perro, que ni siquiera ve
                esa elección, salía el texto de varios. Lo que decide el
                título es cuántos perros hay, no qué se haya elegido. */}
            {!enModoProfesional && listaDePerros.length > 1 && paraQuien !== "solo"
              ? <>¿Cómo quieres<br />hacer los menús<br />de la casa?</>
              : <>¿Cómo quieres<br />hacer el menú de<br />{nombreMostrar}?</>}
          </h1>
        </div>
        <div className="flex-1 px-6 pt-8 pb-6 flex flex-col">
          {/* ⚠️ AÑADIDO — ¿PARA QUIÉN ES ESTE MENÚ?
              Pedido expreso: poder hacer los menús de todos los perros de
              la casa lo más PARECIDOS posible ("si cuadra cambiando solo
              las cantidades, perfecto; y si no, los menos cambios de
              alimento posibles"), o dejar que cada uno tenga el suyo.
              Con un solo perro esto no se pinta: no hay nada que elegir. */}
          {!enModoProfesional && listaDePerros.length > 1 && (
            <>
              {/* ⚠️ El rótulo vuelve a ser "¿Para quién?" (26 agosto). Pasó
                  a "¿Cómo?" el 23 de agosto, cuando para quién dejó de
                  elegirse -- eran todos. Ahora se elige otra vez, así que la
                  primera pregunta vuelve a ser esa. "¿Cómo?" no desaparece:
                  baja a su sitio, encima de las dos formas de hacer los de
                  la casa, que es lo único a lo que se refería. */}
              <p className="text-[11px] tracking-[0.14em] uppercase mb-2" style={{ color: MALVA, fontFamily: "monospace" }}>
                ¿Para quién?
              </p>
              {/* ⚠️ REHECHO (26 agosto) — PEDIDO EXPRESO: "no quiero las
                  tres opciones siempre. Si dice solo para Cairo, no tienes
                  por qué estar leyendo el que sea igual para los dos o
                  distinto, no tienes por qué leer eso".

                  Tiene razón: son DOS preguntas, no tres respuestas a la
                  misma. Primero PARA QUIÉN, en una fila de botoncitos; y
                  solo si es para todos aparece CÓMO, que es donde vive el
                  párrafo largo de la compra. Eligiendo "Solo para Cairo" ese
                  párrafo ni se pinta, porque no le afecta.

                  Un botón por perro, no uno solo del que estás mirando:
                  "para todos los perros que tengan". El que no está montado
                  obliga a remontar con intención (ver `arrancarEn`) -- sin
                  eso, esos botones te sacaban de la pantalla. */}
              <div className="flex flex-wrap gap-2 mb-5">
                {[
                  ...listaDePerros.map((p) => ({
                    key: `solo:${p.id ?? "__nuevo__"}`,
                    etiqueta: `Solo para ${p.nombre}`,
                    activo: paraQuien === "solo" && p.esElDeAhora,
                    elegir: () => {
                      // El que ya está montado: basta con cambiar la
                      // elección, no hay nada que remontar.
                      if (p.esElDeAhora) { setParaQuien("solo"); return; }
                      onCambiarDePerro(p.id, "generador_solo");
                    },
                  })),
                  { key: "todos",
                    etiqueta: listaDePerros.length === 2 ? "Para los dos" : "Para todos",
                    activo: paraQuien !== "solo",
                    // Se vuelve al valor de partida de la casa. Si ya se
                    // había elegido "cada uno con lo suyo" y se va y se
                    // vuelve, se recupera abajo: aquí solo se sale de "solo".
                    elegir: () => setParaQuien((q) => (q === "solo" ? "parecidos" : q)) },
                ].map((op) => (
                  <button
                    key={op.key}
                    onClick={op.elegir}
                    aria-pressed={op.activo}
                    className="rounded-full px-4 py-2 text-sm"
                    style={{ background: op.activo ? VIOLETA : "#FFFFFF",
                             color: op.activo ? "#FFFFFF" : TINTA,
                             border: `1.5px solid ${op.activo ? VIOLETA : "#E3DAF0"}`,
                             fontFamily: fontBody, fontWeight: op.activo ? 700 : 600 }}
                  >
                    {op.etiqueta}
                  </button>
                ))}
              </div>

              {paraQuien === "solo" ? (
                <p className="text-xs mb-6 leading-snug" style={{ color: MALVA, fontFamily: fontBody }}>
                  Se rehace el menú de <b>{nombreMostrar}</b> y el de {nombresDeLosPerros(listaDePerros.filter((p) => !p.esElDeAhora))} se queda como está.
                </p>
              ) : (<>
              {/* ⚠️ AÑADIDO — pedido expreso: "creo que tendrías que
                  explicar mejor la diferencia". Los títulos solos no la
                  explicaban: "lo más parecidos posible" y "cada uno el
                  suyo" suenan a mejor y peor, y no es eso. Ninguna de las
                  dos da un menú peor -- las dos cumplen los 30 requisitos
                  igual. Lo que cambia es la COMPRA, y eso es lo primero
                  que hay que decir, antes de los dos botones. */}
              <p className="text-[11px] tracking-[0.14em] uppercase mb-1" style={{ color: MALVA, fontFamily: "monospace" }}>
                ¿Cómo?
              </p>
              <p className="text-xs mb-3 leading-snug" style={{ color: TINTA, fontFamily: fontBody }}>
                Los dos cumplen igual los 30 requisitos de cada perro. Lo que cambia es <b>la compra</b>.
              </p>
              <div className="flex flex-col gap-2 mb-6">
                {[
                  { key: "parecidos", titulo: "Los mismos alimentos para todos",
                    nota: `Compras una vez y pesas ${listaDePerros.length}: lo mismo para ${nombresDeLosPerros(listaDePerros)}, cambiando solo las cantidades. Si con los mismos no le cuadran a alguno, Rawku cambia los menos alimentos posibles.` },
                  { key: "cada_uno", titulo: "Cada uno con lo suyo",
                    nota: `${listaDePerros.length} menús independientes, con los alimentos que mejor le van a cada perro. Comen más variado, y la lista de la compra es más larga.` },
                ].map((op) => {
                  const activo = paraQuien === op.key;
                  return (
                    <button
                      key={op.key}
                      onClick={() => setParaQuien(op.key)}
                      className="text-left rounded-xl p-4"
                      style={{ background: activo ? "#F3EDFB" : "#FFFFFF",
                               border: `1.5px solid ${activo ? VIOLETA : "#E3DAF0"}` }}
                    >
                      <p className="text-sm" style={{ color: TINTA, fontFamily: fontBody, fontWeight: activo ? 700 : 600 }}>
                        {op.titulo}
                      </p>
                      <p className="text-xs mt-0.5 leading-snug" style={{ color: MALVA, fontFamily: fontBody }}>
                        {op.nota}
                      </p>
                    </button>
                  );
                })}
              </div>
              </>)}
            </>
          )}

          {/* ⚠️ REHECHO (21 agosto) — PEDIDO EXPRESO: "cuando generas los
              menús para los dos perros no tienes ni el automático ni el
              personalizar, solo te crea un menú y punto. Tiene que ser
              todo igual que cuando lo generas para un perro, pero para
              dos. Tendría que aparecer también qué está comiendo el
              perro, si tiene que hacer transición o no, todo eso."

              Tenía razón, y el fallo era de planteamiento: lo de varios
              perros lo monté como un camino APARTE, y por eso perdió todo
              lo demás. Ya no hay camino aparte. Para varios perros se pasa
              por estas mismas pantallas -- qué come cada uno, automático o
              personalizar, cuántos menús -- y lo único que cambia es que
              "¿qué come?" se pregunta UNA VEZ POR PERRO, porque uno puede
              venir de pienso y el otro llevar años en BARF. */}
          <p className="text-[11px] tracking-[0.14em] uppercase mb-2" style={{ color: MALVA, fontFamily: "monospace" }}>
            Antes de nada
          </p>
          {paraQuien !== "solo" && listaDePerros.length > 1 ? (
            <div className="mb-6">
              {fichasDeLaCasa().map((f) => (
                <div key={f.id ?? "__nuevo__"} className="mb-4"
                     role="group" aria-label={`Qué come ${f.nombre}`}>
                  <p className="text-sm mb-2" style={{ color: TINTA, fontFamily: fontBody }}>
                    ¿Qué come <b>{f.nombre}</b> ahora mismo?
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { key: "pienso", label: "Pienso" },
                      { key: "barf_otra", label: "BARF" },
                      { key: "cocinada", label: "Comida cocinada" },
                    ].map((op) => {
                      const activo = dietasDeLaCasa[f.id] === op.key;
                      return (
                        <button
                          key={op.key}
                          onClick={() => {
                            setDietasDeLaCasa((d) => ({ ...d, [f.id]: op.key }));
                            // el perro que se está mirando comparte estado
                            // con el recorrido de un solo perro
                            if (f.id === perfil._id) setDietaActual(op.key);
                          }}
                          className="py-3 px-4 rounded-xl text-center text-sm"
                          style={{ background: activo ? VIOLETA : "#FFFFFF", border: `1.5px solid ${activo ? VIOLETA : "#E3DAF0"}`, color: activo ? "#FFFFFF" : TINTA, fontFamily: fontBody, fontWeight: 600 }}
                        >
                          {op.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : (
          <>
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
          </>
          )}

          {/* ⚠️ El aviso de transición de la CASA: se dice de quién es,
              porque puede tocarle a uno y al otro no. */}
          {paraQuien !== "solo" && listaDePerros.length > 1 && (() => {
            const enTransicion = fichasDeLaCasa()
              .filter((f) => ["pienso", "cocinada"].includes(dietasDeLaCasa[f.id]))
              .map((f) => f.nombre);
            if (!enTransicion.length) return null;
            return (
              <div className="rounded-xl p-3 mb-6 flex gap-2 items-start" style={{ background: "#F0ECF7" }}>
                <Info size={14} style={{ color: VIOLETA, flexShrink: 0, marginTop: 2 }} />
                <p className="text-xs" style={{ color: TINTA, fontFamily: fontBody }}>
                  {enTransicion.length === 1
                    ? `${enTransicion[0]} viene de otra dieta, así que luego te sugerimos un plan de transición gradual para ${enTransicion[0]} en vez de cambiar de golpe.`
                    : `${enTransicion.slice(0, -1).join(", ")} y ${enTransicion.slice(-1)} vienen de otra dieta, así que luego te sugerimos un plan de transición gradual para cada uno en vez de cambiar de golpe.`}
                </p>
              </div>
            );
          })()}

          <div className="flex flex-col gap-3 mb-6">
            {MODOS.map((m) => {
              const Icono = m.Icono;
              return (
                <button
                  key={m.key}
                  onClick={() => { if (dietasContestadas) irAModo(m.key); }}
                  disabled={!dietasContestadas}
                  className="text-left rounded-2xl p-5 transition-all"
                  style={{ background: "#FFFFFF", border: "1.5px solid #E3DAF0", opacity: dietasContestadas ? 1 : 0.45 }}
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
          {!dietasContestadas && (
            <p className="text-xs text-center -mt-4 mb-4" style={{ color: ROSA, fontFamily: fontBody }}>
              {paraQuien !== "solo" && listaDePerros.length > 1
                ? "Elige primero qué come cada perro ahora"
                : `Elige primero qué come ${nombreMostrar} ahora`}
            </p>
          )}
          {/* ⚠️ AÑADIDO — la misma invitación, aquí. Pedido expreso: que
              se pueda decir "tengo más de un perro" también en la
              pantalla en la que te pide lo del menú, no solo en la ficha.
              Es el otro momento en que se piensa en ello: estás a punto
              de hacer un menú y te acuerdas de que en casa hay dos. */}
          {!enModoProfesional && listaDePerros.length === 1 && invitacionAOtroPerro}
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
              } else if (paraQuien !== "solo" && listaDePerros.length > 1) {
                // El recorrido es EL MISMO hasta aquí; solo cambia a
                // quién se le pide el menú.
                generarMenusDeLaCasa(paraQuien, numMenus);
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

  // ⚠️ "menuGuardado" reutiliza toda esta pantalla, pero es una pantalla
  // DISTINTA a propósito: el useEffect que genera menús se dispara con
  // pantalla === "resultado", así que si un menú guardado se abriera ahí,
  // se regeneraría encima y perderíamos justo el que se quería ver.
  if (fase === "generador" && (pantalla === "resultado" || pantalla === "menuGuardado")) {
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
            {necesitaVeterinario
              ? "Esto lo tiene que pautar tu veterinario"
              : "No hemos encontrado un menú que cumpla"}
          </p>
          <p className="text-sm mb-4" style={{ color: MALVA, fontFamily: fontBody }}>{menuError}</p>

          {/* ⚠️ AÑADIDO — el motor ahora rechaza menús que antes sí daba,
              a propósito: verifica los 30 requisitos y los límites de
              seguridad, y prefiere no dar menú a dar uno que no cumple.
              Sin esta explicación, "no se pudo calcular" se lee como una
              app rota, cuando en realidad es la app haciendo su trabajo. */}
          {!necesitaVeterinario && (
            <div className="rounded-xl p-4 mb-6 text-left" style={{ background: "#F0ECF7", maxWidth: 340 }}>
              <p className="text-xs mb-2" style={{ color: TINTA, fontFamily: fontBody, fontWeight: 700 }}>
                Esto no es un fallo de la app
              </p>
              <p className="text-xs mb-2" style={{ color: TINTA, fontFamily: fontBody }}>
                Cada menú se comprueba contra los 30 requisitos nutricionales de
                la etapa de {nombreMostrar} y contra los límites de seguridad.
                Si no encontramos una combinación que los cumpla todos,
                preferimos no darte un menú antes que darte uno que se queda
                corto — es comida de verdad para tu perro, no una sugerencia.
              </p>
              <p className="text-xs" style={{ color: MALVA, fontFamily: fontBody }}>
                Suele arreglarse quitando alguna restricción (alergias,
                categorías excluidas) o dejando más alimentos disponibles.
              </p>
            </div>
          )}

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
    // Un menú guardado se enseña con las kcal y la etapa que tenía CUANDO
    // se generó: el perro puede haber cambiado de peso desde entonces, y
    // repintarlo con los números de hoy diría algo que nunca fue verdad.
    const derParaMostrar = menuGuardadoAbierto?.der_real || derReal;
    const etapaParaMostrar = menuGuardadoAbierto?.etapa_label || etapaLabel;
    const menus = menuReal ? respuestaApiAMenu(menuReal, derParaMostrar) : MENUS_EJEMPLO;
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
        <VistaMenus enModoProfesional={enModoProfesional} menus={menus} onVolver={menuGuardadoAbierto ? salirDeMenuGuardado : volverAElegir} modo={modo} alimentosEvitados={alimentosEvitados} patologias={perfil?.patologias || []} nombrePerro={nombreMostrar} necesitaTransicion={dietaActual === "pienso" || dietaActual === "cocinada"} dietaActual={dietaActual} categoriasDisponibles={categoriasDisponibles} perfil={perfil} derReal={derParaMostrar} etapaLabel={etapaParaMostrar} etapaCalculada={etapaCalculada} especiesExcluidas={especiesExcluidas} pesoAdultoEsperado={pesoAdultoEsperado} pesoObjetivoKg={pesoObjetivoKg} edad={edad} set={set} setFase={setFase} avisoNoForzado={avisoNoForzado} diagnosticoPersonalizar={diagnosticoPersonalizar} avisoExtraEspecie={avisoExtraEspecie} onAccionesDeMenu={menuGuardadoAbierto ? ((i) => setAccionesDeMenu({ fila: menuGuardadoAbierto, indice: i })) : null} onAbrirLaCompra={abrirLaCompra} onMenuEditado={(idMenu, gramos) => {
          // `idMenu` es 1, 2, 3... (ver respuestaApiAMenu), así que el
          // índice del array es uno menos.
          setMenuReal((previos) => {
            if (!previos) return previos;
            const i = idMenu - 1;
            if (i < 0 || i >= previos.length) return previos;
            const copia = previos.slice();
            copia[i] = { ...copia[i], menu: gramos, gramos };
            return copia;
          });
        }} premium={premium} onMostrarSuscripcion={() => setMostrarSuscripcion(true)} onRegenerarConAlimentos={regenerarConAlimentos} usuario={usuario} onPerroGuardado={onPerroGuardado} onCrearCuenta={onCrearCuenta} burbuja={burbujaDePerfil(true)} onAbrirPanel={() => setMenuLigeroAbierto(true)} burbujaClara={burbujaDePerfil(false)} />
        {/* ⚠️ AÑADIDO (24 agosto) — la pantalla de la compra colgaba SOLO
            de `drawerLigero`, y ésta es la única pantalla que no lo pinta
            (VistaMenus trae su propio panel). Resultado: el botón "La
            compra" cerraba el panel y no pasaba nada. Va aquí también. */}
        {pantallaDeLaCompra}
        {/* Mismo motivo (26 agosto): los tres puntos de cada menú de la
            semana se pulsan AQUÍ DENTRO, así que la hoja que abren y el
            diálogo de renombrar tienen que dibujarse aquí también. Estando
            solo en la lista de fuera, el botón se veía y no pasaba nada. */}
        {hojaDeAccionesDeMenu}
        {dialogoDeRenombrar}
        {menuAConfirmarBorrado?.indice != null && dialogoDeBorrarMenuInterno}
        {/* El panel que abre la hamburguesa de la compra. El de VistaMenus
            vive dentro de VistaMenus y desde aquí no se puede abrir, así
            que en esta pantalla se usa el ligero -- que lleva las mismas
            secciones y funciona desde cualquier sitio. */}
        {panelLigero}
        {avisoCambiarDePerro}
        {avisoBorrarPerro}
      {avisoDescartarLocal}
      {hojaDePerros}
      {pantallaAjustes}
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
                          aria-label={`${cat.nombre}: no usar`}
                          style={{ background: c.modo === "no" ? VIOLETA : "transparent", color: c.modo === "no" ? "#FFFFFF" : MALVA, fontFamily: fontBody, fontWeight: 600 }}>
                          No usar
                        </button>
                        <button onClick={() => setModoCat(cat.nombre, "manual")} className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs"
                          aria-label={`${cat.nombre}: elijo yo`}
                          style={{ background: c.modo === "manual" ? VIOLETA : "transparent", color: c.modo === "manual" ? "#FFFFFF" : MALVA, fontFamily: fontBody, fontWeight: 600 }}>
                          <Hand size={11} /> Elegir uno
                        </button>
                      </div>
                    ) : (
                    <div className="flex rounded-full p-0.5" style={{ background: PAPEL }}>
                      <button onClick={() => setModoCat(cat.nombre, "auto")} className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs"
                        aria-label={`${cat.nombre}: que elija Rawku`}
                        style={{ background: c.modo === "auto" ? VIOLETA : "transparent", color: c.modo === "auto" ? "#FFFFFF" : MALVA, fontFamily: fontBody, fontWeight: 600 }}>
                        <Sparkles size={11} /> Auto
                      </button>
                      <button onClick={() => setModoCat(cat.nombre, "manual")} className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs"
                        aria-label={`${cat.nombre}: elijo yo`}
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
                          aria-label={`${cat.nombre}: elegir alimento`}
                          className="px-3 py-2 rounded-lg text-sm" style={{ background: PAPEL, color: MALVA, fontFamily: fontBody, border: "1.5px dashed #C9BEDD" }}>
                          {c.elegido.length > 0 ? "+ Añadir otro" : "Elegir alimento"}
                        </button>
                      )}
                      {categoriaAbierta && !especieAbierta && (
                        <div className="rounded-xl p-3" style={{ background: PAPEL }}>
                          <p className="text-xs mb-2" style={{ color: MALVA, fontFamily: "monospace" }}>ESPECIE</p>
                          <div className="flex flex-col gap-1.5 max-h-56 overflow-y-auto">
                            <ListaDeEspecies
                              porEspecie={categoriasDisponibles[cat.nombre]}
                              onElegir={(alimento) => elegirAlimento(cat.nombre, alimento)}
                              onAbrir={(especie) => setEstadoAbiertoPersonalizar({ categoria: cat.nombre, especie })}
                            />
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
              } else if (paraQuien !== "solo" && listaDePerros.length > 1) {
                // ⚠️ Personalizar para varios perros: lo elegido se aplica
                // a la CASA, no a un perro suelto. El motor se lo fuerza al
                // perro que manda y los demás se amoldan a su menú, así que
                // acaba en todos. Elegirlo perro por perro sería otra cosa
                // -- y pelearía con que los menús se parezcan, que es justo
                // lo que se ha pedido al entrar por aquí.
                generarMenusDeLaCasa(paraQuien, numMenus, configsPorMenu.slice(0, numMenus));
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
            <ListaDeEspecies
              porEspecie={CATS[abierto.categoria]}
              ocultar={(especie) => especiesYaExcluidas.has(especie)}
              onElegir={(alimento) => onAnadir({ categoria: abierto.categoria, alimento })}
              onAbrir={(especie) => elegirEspecie(abierto.categoria, especie)}
              fondo={PAPEL}
            />
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

// Dónde se recuerda, por cuenta, con qué perro se estaba. Que al volver
// a abrir la app salga otro perro distinto del que dejaste es
// desconcertante cuando tienes dos o tres.
const CLAVE_PERRO_ACTIVO = (userId) => `rawku:perro-activo:${userId}`;

function leerPerroActivoRecordado(userId) {
  try {
    return window.localStorage.getItem(CLAVE_PERRO_ACTIVO(userId)) || null;
  } catch {
    // Navegador con el almacenamiento capado (modo privado en algunos
    // iOS). No es motivo para romper el login: se cae al primer perro.
    return null;
  }
}

function recordarPerroActivo(userId, perroId) {
  try {
    if (perroId) window.localStorage.setItem(CLAVE_PERRO_ACTIVO(userId), perroId);
    else window.localStorage.removeItem(CLAVE_PERRO_ACTIVO(userId));
  } catch {
    // Igual que arriba: si no se puede recordar, se sigue igual.
  }
}

function AuthGate() {
  const [usuario, setUsuario] = useState(undefined);
  // ⚠️ AMPLIADO — antes aquí sólo vivía UN perro (`perroInicial`), porque
  // la app daba por hecho que cada cuenta tenía uno: getPerros devolvía
  // la lista entera y se cogía `perros[0]`, tirando el resto. Ahora se
  // guarda la lista completa y cuál de ellos se está mirando.
  const [perros, setPerros] = useState(undefined); // undefined=cargando, []=no hay ninguno
  // Los accesos: qué perros de esta cuenta son PACIENTES y no perros
  // propios. Va aparte de `perros` porque no es un dato del perro, es de la
  // relación. Ver `pacientes.js`. Si la tabla no existe todavía llega vacío
  // y todo son perros propios, que es el lado seguro del error.
  const [accesos, setAccesos] = useState(null);   // null = todavía sin leer
  //
  // Estos dos van SEPARADOS a propósito:
  //   · `perroMontadoId` dice qué perro se le pasa al componente de dentro.
  //   · `montaje` es lo único que entra en su `key`, o sea lo único que
  //     lo hace montarse de cero.
  //
  // Hacen falta separados porque RawkuOnboardingInterna calcula TODOS sus
  // estados (paso, fase, perfil, menús...) una única vez al montarse. Para
  // cambiar de perro de verdad hay que remontarlo — de ahí `montaje`.
  // Pero justo después de CREAR un perro no se puede remontar: en ese
  // momento la usuaria acaba de pulsar "ir al generador de menús" y un
  // remonte la devolvería a la pantalla de perfil, deshaciendo lo que
  // acaba de hacer. Ahí sólo se apunta el id (sin tocar `montaje`), y el
  // componente sigue vivo exactamente donde estaba.
  const [perroMontadoId, setPerroMontadoId] = useState(null);
  // ⚠️ La MISMA información, en una referencia viva (25 agosto). Hace falta
  // porque el componente que se desmonta al cambiar de perro se lleva una
  // copia CONGELADA de `onPerroGuardado`, con el `perroMontadoId` que había
  // cuando se montó. Si su guardado contesta tarde, ese callback viejo mira
  // un valor viejo y no puede saber que ya estás en otro perro. La
  // referencia siempre dice quién está en pantalla AHORA.
  const perroMontadoRef = useRef(null);
  const apuntarPerroMontado = (id) => { perroMontadoRef.current = id; setPerroMontadoId(id); };
  const [montaje, setMontaje] = useState(0);

  // ⚠️ AÑADIDO — ENTRAR SIN CUENTA. Pedido expreso: "necesito poder
  // entrar a la aplicación sin que me pidan iniciar sesión".
  //
  // Se lee de localStorage al arrancar, no se empieza en false: si no,
  // recargar la página devolvería a la pantalla de login y el "entrar
  // sin cuenta" no serviría para nada más que para esa sesión.
  //
  // Va SEPARADO de `usuario` a propósito. Mientras es true, `usuario`
  // sigue siendo null (no hay sesión de Supabase, y eso es verdad); lo
  // que se le pasa al componente de dentro es USUARIO_LOCAL. Mezclarlos
  // haría creer al resto de la app que hay sesión donde no la hay.
  const [sinCuenta, setSinCuenta] = useState(() => estaSinCuenta());
  const [migrando, setMigrando] = useState(false);
  // Los perros del móvil que NO subieron porque ya estaban en la cuenta.
  // Se enseña una vez, al entrar. Ver migrarLocalACuenta en almacen.js.
  const [perrosNoSubidos, setPerrosNoSubidos] = useState(null);

  // ⚠️ CORREGIDO — había DOS caminos distintos cargando el perro a la vez
  // y pisándose el uno al otro:
  //   1. el listener de onAuthChange (se dispara solo al hacer login), y
  //   2. onAutenticado, el callback que <Auth> llama tras el login.
  // Se veían literalmente dos GET /rest/v1/perros seguidos por cada
  // login. Además el listener hacía `setUsuario(user)` y sólo DESPUÉS
  // (tras un await) tocaba el perro: en esa rendija, usuario ya
  // valía "hay sesión" mientras el perro seguía valiendo el `null`
  // viejo de "aquí no hay nadie logueado". Si React pintaba justo ahí,
  // el componente principal se montaba creyendo que la usuaria NO tiene
  // perro -- y como sus estados iniciales se calculan una única vez al
  // montar, se quedaba en el onboarding para siempre aunque el perro
  // llegase medio segundo después.
  //
  // Ahora hay UN solo cargador. Pone usuario y perros JUNTOS y sin
  // ningún await entre medias, así que nunca existe un render con esa
  // pareja de valores incoherente. Y lleva un contador de peticiones,
  // para que una respuesta lenta de una sesión vieja no pise a otra más
  // nueva (login → logout → login rápido).
  const cargaRef = useRef({ token: 0, userIdEnCurso: null });

  const cargarSesion = (user) => {
    if (!user) {
      cargaRef.current = { token: cargaRef.current.token + 1, userIdEnCurso: null };
      identificarUsuarioEnSentry(null);
      setUsuario(null);
      // ⚠️ CASO REAL ENCONTRADO (23 agosto): al entrar sin cuenta salía
      // "PERFIL NUEVO" aunque el perro estuviera guardado en el navegador.
      //
      // No es que no se cargara: se cargaba y esta línea lo borraba medio
      // segundo después. onAuthChange avisa de "no hay sesión" al arrancar
      // SIEMPRE -- que es verdad, sin cuenta no hay sesión -- y esto lo
      // traducía a "no hay perros", que sin cuenta es falso.
      //
      // Se lee de localStorage y no del estado `sinCuenta` a propósito:
      // esta función la llama un listener registrado en el primer render,
      // así que su clausura ve el valor viejo.
      if (estaSinCuenta()) {
        setPerros(undefined);          // los carga el efecto de los locales
        return;
      }
      setPerros([]);
      apuntarPerroMontado(null);
      return;
    }

    identificarUsuarioEnSentry(user);

    // Ya estamos cargando (o hemos cargado) el perro de este mismo
    // usuario: refrescar el objeto de sesión es suficiente. Evita el
    // GET duplicado del login y los refetch inútiles cada vez que
    // Supabase renueva el token.
    if (cargaRef.current.userIdEnCurso === user.id) {
      setUsuario(user);
      return;
    }

    const token = cargaRef.current.token + 1;
    cargaRef.current = { token, userIdEnCurso: user.id };

    // ⚠️ MIGRACIÓN — lo que se usó SIN cuenta sube a la cuenta.
    //
    // Sin esto, registrarse después de una semana usando la app borraría
    // esa semana: la app pasaría a mirar Supabase, que está vacío, y lo
    // del navegador se quedaría ahí sin que nada lo lea. Ningún error,
    // ningún aviso -- justo la clase de fallo de CLAUDE.md.
    //
    // Va ANTES de getPerros y no en paralelo: si no, la lista se leería
    // antes de que los perros hayan subido y saldría vacía.
    const traerLoLocal = hayDatosLocales()
      ? (setMigrando(true), migrarLocalACuenta(user.id).then((r) => {
          // ⚠️ Los perros que ya estaban en la cuenta NO suben (ver
          // almacen.js). Eso hay que DECIRLO: lo del móvil se ha borrado y
          // quien lo hizo tiene derecho a enterarse ahora, no días después
          // al no encontrar su ficha.
          if (r && r.noSubidos && r.noSubidos.length) setPerrosNoSubidos(r.noSubidos);
          return r;
        }).catch((err) => {
          // Que falle no puede dejar a nadie fuera de su cuenta. Lo local
          // NO se borra (vaciarLocal sólo corre si todo subió), así que
          // se puede reintentar entrando otra vez.
          capturarError(err, { donde: "migrarLocalACuenta", userId: user.id });
        }))
      : Promise.resolve();

    // ── Los dos juntos, sin await de por medio ──
    setUsuario(user);
    setPerros(undefined);
    migaDePan("AuthGate: sesión iniciada, cargando perros");

    traerLoLocal
      .then(() => {
        setMigrando(false);
        setSinCuenta(false);
        salirDeSinCuenta();
        // ⚠️ LOS TRES A LA VEZ, Y SE ESPERA A LOS TRES (29 agosto).
        //
        // Antes los accesos se pedían "en paralelo y sin esperar", porque
        // solo servían para repartir la lista. Pero también deciden CON QUÉ
        // PERRO se abre la app, y eso se decidía aquí abajo sin mirarlos:
        // se cogía `perrosCargados[0]`, el primero de la cuenta.
        //
        // FALLO REAL: un veterinario con su propio perro y un paciente
        // entraba directamente DENTRO del perro que no toca -- el suyo
        // estando en modo veterinario, o su paciente estando en modo tutor
        // --, y encima ese perro no aparecía en la lista de al lado. Las dos
        // listas no se mezclaban, pero la puerta de entrada sí.
        //
        // Van en paralelo (Promise.all), así que la espera es la del más
        // lento, no la suma. Y si alguno falla se sigue con lo que hay: sin
        // accesos se ven todos los perros (que es lo que ya hacía
        // `pacientes.js` con null) y sin rol se entra como tutor.
        return Promise.all([
          getPerros(user.id),
          getAccesos(user.id).catch(() => null),
          esProfesional(user.id).catch(() => false),
        ]);
      })
      .then(([lista, filasAccesos, cuentaAcreditada]) => {
        if (cargaRef.current.token !== token) return; // respuesta obsoleta
        const perrosCargados = lista ?? [];
        // Se guarda TAL CUAL, incluido el null: distingue "no se han podido
        // leer" de "no hay ninguno", y de eso depende que un veterinario
        // vea sus perros o una lista vacía. Ver `pacientes.js`.
        setAccesos(filasAccesos);
        // El modo se calcula con la MISMA función que la pantalla de dentro
        // (`modo.js`), no con una copia: si se separaran, la app abriría un
        // perro que su propia lista no enseña.
        const enModo = calcularModoProfesional(cuentaAcreditada, leerEleccionModo());
        const delModo = perrosDelModo(perrosCargados, filasAccesos, enModo);
        // Se recupera el perro con el que se estaba. Si ese perro ya no
        // existe (se borró desde otro móvil) o es del otro modo, se cae al
        // primero de este modo en vez de dejar la app sin perro teniendo
        // perros -- y en vez de abrir uno que no toca.
        const recordado = leerPerroActivoRecordado(user.id);
        const elegido =
          delModo.find((p) => p.id === recordado) ??
          delModo[0] ??
          null;
        migaDePan("AuthGate: perros cargados", {
          cuantos: perrosCargados.length,
          deEsteModo: delModo.length,
          enModoProfesional: enModo,
          seRecuperoElRecordado: Boolean(recordado && elegido && elegido.id === recordado),
        });
        setPerros(perrosCargados);
        apuntarPerroMontado(elegido ? elegido.id : null);
      })
      .catch((err) => {
        if (cargaRef.current.token !== token) return;
        // Antes esto era un `catch {}` mudo: si Supabase fallaba, la
        // usuaria acababa en el onboarding sin que quedara rastro en
        // ningún sitio. Ahora el fallo llega a Sentry.
        capturarError(err, { donde: "AuthGate.getPerros", userId: user.id });
        setMigrando(false);
        setPerros([]);
        apuntarPerroMontado(null);
      });
  };

  // La cuenta con la que trabaja el resto de la app: la de verdad si hay
  // sesión, y la local (USUARIO_LOCAL) si se entró sin cuenta. Vale null
  // sólo mientras no se ha decidido ninguna de las dos cosas.
  const cuentaEfectiva = usuario ?? (sinCuenta ? USUARIO_LOCAL : null);

  // ─── Cambiar de perro ──────────────────────────────────────────────
  // Remonta el componente de dentro (sube `montaje`), que es la única
  // forma de que recalcule perfil, menús, pantalla de arranque... con
  // los datos del perro nuevo. Ver el comentario largo de arriba.
  // ⚠️ AÑADIDO (26 agosto) — ELEGIR "SOLO PARA <EL OTRO PERRO>" SIN PERDER
  // LA PANTALLA.
  //
  // El generador calcula perfil, kcal, etapa y menús UNA SOLA VEZ, al
  // montarse, así que cambiar de perro obliga a remontar (ver `montaje`) --
  // y eso te devolvía al perfil. Sin esto, en la fila de "¿para quién?" solo
  // se podía elegir el perro que ya estabas mirando: el resto de botones te
  // sacaban de la pantalla.
  //
  // Con esto, cambiar de perro puede llevar una intención, y al remontar el
  // componente de dentro arranca donde toca. Se guarda SIEMPRE (null cuando
  // no hay) para que un cambio normal desde la burbuja no herede la
  // intención de la vez anterior.
  const [arranqueTrasCambio, setArranqueTrasCambio] = useState(null);

  const cambiarDePerro = (perroId, arranque = null) => {
    // ⚠️ Antes esto era `if (!usuario ...)`: sin cuenta no se podía
    // cambiar de perro, aunque los perros existieran en el navegador.
    // `cuentaEfectiva` es la cuenta de verdad si la hay y la local si no.
    //
    // ⚠️ QUITADA LA COMPARACIÓN `perroId === perroMontadoId` (25 agosto).
    // CASO REAL: "cuando cambio de perro la primera vez se cambia sin
    // problema pero si quiero cambiarlo otra vez de perro sin cambiar de
    // pantalla primero no me deja".
    //
    // Esa comparación no protegía de nada -- la hoja de perros ya devuelve
    // sin hacer nada si tocas el perro que estás mirando -- y en cambio
    // convertía cualquier desajuste de `perroMontadoId` en un botón muerto,
    // sin error ni aviso. Si alguien elige un perro a mano, se monta ese
    // perro y punto.
    if (!cuentaEfectiva) return;
    recordarPerroActivo(cuentaEfectiva.id, perroId);
    apuntarPerroMontado(perroId);
    setArranqueTrasCambio(arranque);
    setMontaje((m) => m + 1);
  };

  // Empezar un perro nuevo: mismo remonte, pero sin perro de partida, así
  // que el componente arranca en el paso 1 del asistente.
  const anadirPerro = () => {
    if (!cuentaEfectiva) return;
    recordarPerroActivo(cuentaEfectiva.id, null);
    apuntarPerroMontado(null);
    setMontaje((m) => m + 1);
  };

  // Un perro se acaba de guardar (creado o editado). Se refresca la lista
  // para que el selector enseñe el nombre y el peso al día. NO se remonta:
  // ver el comentario de `montaje`.
  const perroGuardado = (perro) => {
    if (!perro?.id) return;
    setPerros((prev) => {
      const lista = prev ?? [];
      return lista.some((p) => p.id === perro.id)
        ? lista.map((p) => (p.id === perro.id ? { ...p, ...perro } : p))
        : [...lista, perro];
    });

    // ⚠️ AQUÍ ESTABA EL FALLO (25 agosto). CASO REAL: "cuando cambio de
    // perro la primera vez se cambia sin problema pero si quiero cambiarlo
    // otra vez de perro sin cambiar de pantalla primero no me deja".
    //
    // Esto apuntaba `perroMontadoId` al perro guardado SIEMPRE. Y guardar
    // tarda: si mientras la respuesta viaja cambias de perro, esa respuesta
    // llega de un componente que ya no está en pantalla y mueve el puntero
    // al perro de ANTES. A partir de ahí el padre cree que estás en Nala
    // mientras miras a Cairo, y pedir Nala no hace nada -- botón muerto,
    // sin error, sin aviso. Reproducido con el guardado a 2,5 segundos.
    //
    // Adoptar el id solo tiene sentido en su caso original: acabas de CREAR
    // un perro y todavía no hay ninguno montado. Con uno ya montado, quien
    // decide qué perro se mira es `cambiarDePerro`, no una respuesta que
    // llega tarde.
    // Se mira la REFERENCIA, no el estado: este callback puede venir de un
    // componente ya desmontado, con el estado de hace dos perros.
    if (perroMontadoRef.current !== null && perroMontadoRef.current !== perro.id) return;

    if (cuentaEfectiva) recordarPerroActivo(cuentaEfectiva.id, perro.id);
    apuntarPerroMontado(perro.id);
  };

  // Un perro se acaba de borrar. Aquí SÍ hay que remontar: el perro que
  // se estaba mirando ya no existe.
  const perroEliminado = (perroId) => {
    const restantes = (perros ?? []).filter((p) => p.id !== perroId);
    const siguiente = restantes[0] ?? null;
    setPerros(restantes);
    if (cuentaEfectiva) recordarPerroActivo(cuentaEfectiva.id, siguiente ? siguiente.id : null);
    apuntarPerroMontado(siguiente ? siguiente.id : null);
    setMontaje((m) => m + 1);
  };

  useEffect(() => {
    const { data: { subscription } } = onAuthChange(cargarSesion);
    return () => subscription.unsubscribe();
  }, []);

  // Sin cuenta los perros están en el navegador. Se cargan igual que los
  // de Supabase — misma forma de fila, mismo estado — para que de aquí
  // hacia dentro no haya dos caminos distintos.
  useEffect(() => {
    if (!sinCuenta || usuario) return;
    let vivo = true;
    getPerros(USUARIO_LOCAL.id)
      .then((lista) => {
        if (!vivo) return;
        const perrosLocales = lista ?? [];
        setPerros(perrosLocales);
        apuntarPerroMontado(perrosLocales[0]?.id ?? null);
      })
      .catch((err) => {
        if (!vivo) return;
        capturarError(err, { donde: "AuthGate.getPerros(local)" });
        setPerros([]);
        apuntarPerroMontado(null);
      });
    return () => { vivo = false; };
  }, [sinCuenta, usuario, montaje]);

  const empezarSinCuenta = () => {
    entrarSinCuenta();
    setPerros(undefined);       // que el efecto de arriba los cargue
    setSinCuenta(true);
  };

  // Mientras carga usuario O perros (o se está subiendo lo local a una
  // cuenta recién creada, que puede tardar unos segundos)
  if (usuario === undefined || perros === undefined || migrando) {
    return (
      <div style={{ minHeight: '100dvh', background: '#FBF7FC', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <Dog size={32} strokeWidth={1.4} style={{ color: '#5A4088' }} />
        <p style={{ color: '#9A8CB8', fontFamily: '"DM Sans", sans-serif', fontSize: 15 }}>Cargando...</p>
      </div>
    );
  }

  // ⚠️ Sin sesión ya NO se acaba siempre en el login: sólo si tampoco se
  // ha elegido entrar sin cuenta. Ése era el muro que pedía quitar.
  if (usuario === null && !sinCuenta) {
    // Pasa por el MISMO cargador que el listener. Es idempotente: si el
    // listener de onAuthChange ya arrancó la carga de este usuario (que
    // es lo normal), esto no lanza una segunda petición.
    return <Auth onAutenticado={cargarSesion} onSinCuenta={empezarSinCuenta} hayDatosSinCuenta={hayDatosLocales()} />;
  }

  const perroMontado = (perros ?? []).find((p) => p.id === perroMontadoId) ?? null;

  return (
    <ErrorBoundary>
      {/* ⚠️ AÑADIDO (24 agosto) — CASO REAL: "tenía dos Cairo y un Rufo".
          Los perros del móvil que ya estaban en la cuenta no suben, para no
          duplicarlos. Pero eso NO puede pasar en silencio: lo del móvil se
          ha borrado, y enterarse días después de que tu ficha de prueba no
          está es justo la clase de fallo que este proyecto persigue.
          Va como cartel y no como línea de texto porque es sobre DATOS. */}
      {perrosNoSubidos && perrosNoSubidos.length > 0 && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center px-6"
             style={{ background: "rgba(35,21,57,0.55)" }}>
          <div className="flex flex-col items-center gap-2 px-6 py-6 rounded-2xl max-w-sm"
               style={{ background: "#FFFFFF" }}>
            <p className="text-sm text-center" style={{ color: "#231539", fontFamily: '"DM Sans", sans-serif', fontWeight: 700 }}>
              {perrosNoSubidos.length === 1
                ? `A ${perrosNoSubidos[0]} ya lo tenías en tu cuenta`
                : "Algunos ya los tenías en tu cuenta"}
            </p>
            <p className="text-xs text-center mb-2" style={{ color: "#231539", fontFamily: '"DM Sans", sans-serif', lineHeight: 1.5 }}>
              {perrosNoSubidos.length === 1
                ? `La ficha que hiciste en este móvil no se ha subido, para no dejarte dos ${perrosNoSubidos[0]}. Se ha quedado la de tu cuenta, que es la que tiene sus menús y sus pesos.`
                : `Las fichas que hiciste en este móvil de ${perrosNoSubidos.join(", ")} no se han subido, para no dejarte dos de cada uno. Se han quedado las de tu cuenta, que son las que tienen sus menús y sus pesos.`}
            </p>
            <button
              onClick={() => setPerrosNoSubidos(null)}
              className="px-6 py-2.5 rounded-xl text-sm w-full"
              style={{ background: "#5A4088", color: "#FFFFFF", fontFamily: '"DM Sans", sans-serif', fontWeight: 700, border: "none", cursor: "pointer" }}
            >
              Entendido
            </button>
          </div>
        </div>
      )}
      {/* key por cuenta Y por montaje: si se cambia de usuario o de perro,
          el componente se monta de cero en vez de heredar el estado del
          anterior. Sin esto, cambiar de perro dejaría el perfil, los
          menús y hasta la pantalla en la que estás del perro de antes:
          todos esos estados se calculan una sola vez, al montar. */}
      <RawkuOnboardingInterna
        key={`${cuentaEfectiva.id}:${montaje}`}
        usuario={cuentaEfectiva}
        onCrearCuenta={() => { salirDeSinCuenta(); setSinCuenta(false); }}
        onDescartarLocal={() => { vaciarLocal(); salirDeSinCuenta(); setSinCuenta(false); }}
        perroInicial={perroMontado}
        perros={perros ?? []}
        accesos={accesos}
        onCambiarDePerro={cambiarDePerro}
        arrancarEn={arranqueTrasCambio}
        onAnadirPerro={anadirPerro}
        onPerroGuardado={perroGuardado}
        onPerroEliminado={perroEliminado}
      />
    </ErrorBoundary>
  );
}

export default function RawkuOnboarding() {
  return <AuthGate />;
}
