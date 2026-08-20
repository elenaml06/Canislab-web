// ─── SENTRY — captura automática de errores en producción ────────────────────
//
// Objetivo: que cualquier fallo que le ocurra a una usuaria real en
// rawku.app llegue solo al panel de Sentry, sin tener que pedirle a
// nadie que abra la consola (F12) y copie el mensaje a mano.
//
// Qué se captura automáticamente una vez inicializado:
//   · Excepciones de JavaScript no capturadas (window.onerror)
//   · Promesas rechazadas sin .catch() (unhandledrejection)
//   · Errores de render de React (via el ErrorBoundary de App.jsx, que
//     llama a capturarError con el component stack)
//   · Llamadas a console.error(...)  ← esto es lo que sustituye al
//     "cópiame lo que pone en la consola"
//
// CONFIGURACIÓN (una sola variable):
//   Vercel → Project → Settings → Environment Variables
//   Nombre:  VITE_SENTRY_DSN
//   Valor:   el DSN que da Sentry al crear el proyecto (React)
//
// Si esa variable NO existe, Sentry queda desactivado y la app funciona
// exactamente igual que antes. Así el `npm run dev` local no ensucia la
// cuota del plan gratuito ni manda ruido de desarrollo.

import * as Sentry from "@sentry/react";

const DSN = import.meta.env.VITE_SENTRY_DSN;

export const sentryActivo = Boolean(DSN);

export function iniciarSentry() {
  if (!sentryActivo) {
    // Ni error ni warning: es el estado normal en local.
    return;
  }

  Sentry.init({
    dsn: DSN,

    // "production" en el deploy de Vercel, "development" en local.
    // Permite filtrar en Sentry y no mezclar pruebas con fallos reales.
    environment: import.meta.env.VITE_SENTRY_ENV || import.meta.env.MODE,

    // Para saber QUÉ versión del código falló. En Vercel se puede poner
    // VITE_APP_RELEASE = $VERCEL_GIT_COMMIT_SHA (opcional).
    release: import.meta.env.VITE_APP_RELEASE || undefined,

    integrations: [
      // Recoge los console.error() que ya existen por toda la app
      // (el ErrorBoundary, los catch de Supabase, los del generador...)
      // y los convierte en eventos de Sentry.
      Sentry.captureConsoleIntegration({ levels: ["error"] }),
    ],

    // Sin trazas de rendimiento: no hacen falta para cazar errores y
    // consumen cuota del plan gratuito.
    tracesSampleRate: 0,

    // No mandes datos personales del navegador (IP, cookies).
    sendDefaultPii: false,

    // Ruido conocido que no es un fallo de la app: extensiones del
    // navegador, fallos de red al perder cobertura, y el aborto normal
    // de peticiones cuando se cambia de pantalla.
    ignoreErrors: [
      "ResizeObserver loop limit exceeded",
      "ResizeObserver loop completed with undelivered notifications",
      "Non-Error promise rejection captured with value: undefined",
      "AbortError",
      "Failed to fetch",
      "NetworkError when attempting to fetch resource",
      "Load failed",
    ],
    denyUrls: [/extensions\//i, /^chrome:\/\//i, /^moz-extension:\/\//i],
  });
}

// ─── Ayudas usadas desde la app ──────────────────────────────────────────────

// Manda un error a Sentry a mano, desde un catch, con contexto extra.
export function capturarError(error, contexto) {
  if (!sentryActivo) return;
  Sentry.withScope((scope) => {
    if (contexto) scope.setContext("rawku", contexto);
    Sentry.captureException(error);
  });
}

// Deja una miga de pan en la línea de tiempo del error: cuando algo
// falle, en Sentry se verá la secuencia de pasos que llevó hasta ahí
// (login, perfil cargado, fase cambiada...), no solo el error suelto.
export function migaDePan(mensaje, datos) {
  if (!sentryActivo) return;
  Sentry.addBreadcrumb({ category: "rawku", message: mensaje, level: "info", data: datos });
}

// Asocia los errores a la cuenta que los sufrió (solo id y email, que
// es lo que ya identifica a la usuaria en Supabase).
export function identificarUsuarioEnSentry(usuario) {
  if (!sentryActivo) return;
  if (!usuario) {
    Sentry.setUser(null);
    return;
  }
  Sentry.setUser({ id: usuario.id, email: usuario.email });
}
