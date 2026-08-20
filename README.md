# Rawku — web

Frontend de [rawku.app](https://rawku.app): calculadora de dietas BARF para
perros. React + Vite, desplegado en Vercel. Las cuentas y los datos van por
Supabase. El cálculo de menús lo hace un backend aparte
(`canislab-api`, FastAPI en Render).

```bash
npm install
npm run dev      # desarrollo en http://localhost:5173
npm run build    # build de producción
npm test         # tests automáticos (Playwright + Chromium)
```

---

## Sentry — errores de producción

Con Sentry configurado, **cualquier fallo que le ocurra a una usuaria real
llega solo al panel de Sentry**, sin tener que pedirle a nadie que abra la
consola del navegador y copie el mensaje a mano.

Se captura automáticamente:

| Qué | Cómo |
|---|---|
| Excepciones de JavaScript no capturadas | por defecto del SDK |
| Promesas rechazadas sin `.catch()` | por defecto del SDK |
| Errores de render de React | el `ErrorBoundary` de `App.jsx` los manda con el árbol de componentes donde reventó |
| Llamadas a `console.error(...)` | `captureConsoleIntegration` |

Además, los errores llegan con:

- **la cuenta que lo sufrió** (id y email), vía `identificarUsuarioEnSentry`
- **una línea de tiempo de lo que pasó antes** (login, perro cargado,
  pantalla inicial elegida...), vía `migaDePan` — que es justo lo que hacía
  falta para diagnosticar el bug de navegación de más abajo.

### Falta un paso para activarlo

El código ya está puesto, pero **necesita el DSN de tu cuenta de Sentry**:

1. Crear cuenta gratis en [sentry.io](https://sentry.io) → nuevo proyecto →
   plataforma **React**.
2. Copiar el DSN que da (algo como `https://abc123@o12345.ingest.sentry.io/678`).
3. Vercel → Project → Settings → Environment Variables:
   - `VITE_SENTRY_DSN` = ese DSN
   - (opcional) `VITE_SENTRY_ENV` = `production`
   - (opcional) `VITE_APP_RELEASE` = `$VERCEL_GIT_COMMIT_SHA`, para saber qué
     versión del código falló
4. Redeploy.

**Si esa variable no existe, Sentry queda desactivado y la app funciona
exactamente igual que antes.** Por eso el `npm run dev` local no gasta cuota
del plan gratuito ni mete ruido de desarrollo.

Toda la configuración está en un solo sitio: [`src/sentry.js`](src/sentry.js).

> **Nota sobre los sourcemaps.** `vite.config.js` genera los `.map` del
> bundle para que en Sentry se vea el fichero y la línea del código original
> en vez de `index-abc123.js:1:48210`. La contrapartida es que los `.map` se
> publican junto a la app, así que el código fuente se puede leer desde el
> navegador. Si prefieres no exponerlo, pon `sourcemap: false` y sube los
> sourcemaps a Sentry con su CLI y un auth token.

---

## Tests automáticos

```bash
npm test                 # todo
npm run test:informe     # con informe HTML
REPETIR=5 npm test       # repite cada test 5 veces (para bugs de timing)
```

Los tests **nunca tocan la base de datos real ni crean cuentas de verdad**.
Levantan un Supabase de mentira en local
([`tests/fake-supabase.js`](tests/fake-supabase.js)) que habla el mismo
idioma que el de verdad (GoTrue para `/auth/v1/*`, PostgREST para
`/rest/v1/*`). El cliente `@supabase/supabase-js` que corre en la app es el
auténtico, con su orden real de eventos — sólo la red es local.

Eso permite algo que contra el Supabase real no se puede hacer: **decir
"getPerros tarda 2 segundos"** y reproducir un bug de orden de carga el 100%
de las veces, en vez de depender de la suerte.

---

## Pantalla de inicio: el perfil del perro

Al entrar con un perro ya guardado, la app aterriza en el **perfil del perro**
(sus datos, con un lápiz por fila para corregir cualquier cosa, y la tarjeta
con sus kcal/día), no directamente en el generador de menús. Desde ahí se va
al generador con un toque: *"Hacer el menú de la semana →"*.

Es la misma pantalla que se ve al terminar el onboarding, así que los textos
cambian según el momento (`yaTienePerroGuardado`): en el primer registro
celebra (*"¡Listo, Cairo!"*), y al volver cada día informa (*"Cairo — sus
datos y lo que necesita al día"*). Antes decía siempre lo primero, que leído
a diario sonaba a que la app creía que acababas de darte de alta.

> **Pendiente.** El menú lateral de esta pantalla es el *ligero*
> (`drawerLigero`): "Evolución y crecimiento", "Mis menús" y "Analizar la
> dieta actual" salen en gris con *"aún no"*, porque esas secciones viven
> dentro de `VistaMenus` y sólo existen cuando ya hay un menú generado.
> Para que el perfil funcione del todo como pantalla de inicio, harían falta
> alcanzables desde aquí — es un cambio aparte, no trivial.

---

## Bug arreglado: "el perfil carga pero no navega al generador"

**Síntoma.** Al entrar con una cuenta que ya tenía un perro guardado, los
datos llegaban bien desde Supabase, pero la app se quedaba en el onboarding
pidiendo otra vez el perfil desde cero, en lugar de ir al generador de menús.

**Causa.** `RawkuOnboardingInterna` decide qué pintar mirando **primero
`paso` y sólo después `fase`**:

```js
if (paso === 1) { ...asistente, pantalla 1 de 6... }   // línea ~3697
...
if (fase === "onboarding") { ...resumen del perfil... }
if (fase === "generador" && pantalla === "elegir") { ...generador... }
```

`fase` **sí** se inicializaba mirando el perro cargado
(`perroInicial ? "generador" : "onboarding"`), pero `paso` se inicializaba
**siempre a 1**. Así que al volver con un perro guardado, `fase` valía
`"generador"` (correcto) mientras `paso` valía `1`, y como el `if (paso === 1)`
va antes, ganaba él: se pintaba el asistente y **la pantalla del generador
era literalmente inalcanzable**. No faltaba ningún dato — simplemente nunca
se llegaba a mirar `fase`.

Terminar el onboarding a mano deja `paso` en `TOTAL_PASOS + 1`, así que ése
es el valor que significa "asistente ya completado".

**Arreglo.** Los tres estados que describen por dónde va la usuaria (`paso`,
`fase` y `pantalla`) se derivan ahora de una única fuente de verdad
(`yaTienePerroGuardado`), para que no puedan volver a contradecirse.

**Y de camino, en `AuthGate`:** había dos caminos cargando el perro a la vez
y pisándose el estado (el listener de `onAuthChange` y el callback
`onAutenticado` de `<Auth>`) — se veían dos `GET /rest/v1/perros` por cada
login. Peor: el listener ponía `usuario` y sólo *después de un `await`*
tocaba `perroInicial`, dejando una rendija en la que `usuario` ya decía "hay
sesión" mientras `perroInicial` seguía valiendo el `null` viejo de "no hay
nadie logueado". Si React pintaba justo ahí, el componente se montaba
creyendo que no había perro — y como sus estados iniciales se calculan una
sola vez al montar, se quedaba en el onboarding para siempre.

Ahora hay **un solo cargador**, que pone `usuario` y `perroInicial` juntos y
sin `await` entre medias, con un contador de peticiones para que una
respuesta lenta de una sesión vieja no pise a otra más nueva.

El caso está cubierto por
[`tests/login-va-al-generador.spec.js`](tests/login-va-al-generador.spec.js),
que incluye un contrapeso explícito: una cuenta nueva **sin** perro sí debe
empezar por el asistente.
