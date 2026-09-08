// ─── El muro de pago: en qué modo está ─────────────────────────────────────
//
// Se cambia sin tocar código, con VITE_PAYWALL en Vercel. Está aparte para
// que lo pueda leer cualquier pantalla sin importar App.jsx entero — que
// crearía un ciclo, porque App.jsx importa las pantallas.


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
export const PAYWALL_MODO = import.meta.env.VITE_PAYWALL || "off";

export const PAYWALL_ACTIVO = PAYWALL_MODO !== "off";

export const PAYWALL_ES_DEMO = PAYWALL_MODO === "demo";
