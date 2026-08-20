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

## Revalidación del menú cuando cambia el perro

Un menú calculado para un cachorro **deja de cumplir** cuando ese perro es
adulto: los requisitos FEDIAF cambian por etapa, no basta con escalar las
calorías, y el multivitamínico de cachorro sigue dentro del menú.

El backend tiene `/menu/revalidar` para esto, pero la web no lo llamaba desde
ningún sitio: el menú guardado se seguía enseñando tal cual.

**Cómo funciona ahora.** Al entrar en el perfil, si hay un menú guardado se
comprueba contra el DER y la etapa de *ahora*. Si ya no cumple, sale un aviso
con el motivo concreto (*"manganeso se queda en el 68%"*) y un botón para ver
el menú corregido — que `/menu/revalidar` ya devuelve hecho, conservando
todos los alimentos que puede.

> **La app avisa; no cambia el menú por su cuenta.** Cambiarle el menú a
> alguien sin preguntar, cuando puede tener la compra hecha y la comida
> porcionada en el congelador, no es una decisión de la app. Hay un test que
> fija esta regla.

Sólo se comprueba el menú más reciente, y sólo desde el perfil, con una
huella (menú + DER + etapa) para no repetir la llamada: es un aviso para que
decida la usuaria, no una auditoría del historial, y la API se duerme.

### Los tres casos que pasan por verificación completa

Comprobado en el código de `canislab-api`, no supuesto:

| Caso | Endpoint | Verificación |
|---|---|---|
| Añadir/quitar alimento | `/menu/anadir`, `/menu/quitar` | `_recalcular_con_motor` → `_garantizar_verificado` |
| Elegir un alimento distinto | `/menu/cambiar` | `_recalcular_con_motor` → `_garantizar_verificado` |
| El perro cambia de etapa | `/menu/revalidar` | `verificar_v2` + `_menu_precalculado_es_seguro` |

Los tres rehacen el menú entero con el motor y pasan por el mismo filtro
final, que recalcula la ficha sobre los gramos que de verdad se devuelven y
rechaza el menú si no sale verde.

### "No hemos encontrado un menú que cumpla"

La API puede rechazar menús que antes daba. Es intencionado: prefiere no dar
menú a dar uno que no cumple. La pantalla de error lo explica ahora en esos
términos y sugiere qué aflojar, en vez de parecer que la app está rota.

### Borrar menús guardados

Papelera por fila en "Mis menús", con confirmación (*"no se puede
deshacer"*). Si el borrado falla, se dice — no se quita de la pantalla
fingiendo que funcionó.

---

## Muro de pago: en modo prueba

El cobro de verdad todavía no está montado (`/stripe/checkout` no responde),
pero Premium **no se quita de la app**. Hay tres modos, y se cambian sin
tocar código: variable `VITE_PAYWALL` en Vercel + redeploy.

| Modo | Qué hace |
|---|---|
| **`demo`** *(por defecto)* | Premium se ve y se puede encender al momento, **sin pago**. Para probar cómo queda la app como Premium y como no-Premium. |
| `off` | Nada bloqueado y Premium no se ofrece por ningún lado. |
| `on` | El de verdad: plan consultado en Supabase y pago por Stripe. |

En modo `demo` la activación se guarda **sólo en ese navegador**
(`localStorage`): nunca toca Supabase, así no deja cuentas de verdad
marcadas como `plan="premium"` que luego haya que limpiar a mano. Y se
puede **volver a apagar** desde el menú lateral — si no, en cuanto lo
enciendes una vez ya no hay forma de ver la app como la ve alguien que no
es Premium.

La pantalla avisa en amarillo de que no se cobra nada: un botón que diga
*"prueba gratis"* y active una suscripción sin más se lee como que va a
haber un cargo más adelante.

> Antes de poner `on`, comprobar que `/stripe/checkout` responde de verdad
> en `canislab-api`. El botón se quedaba colgado en *"Un momento..."* porque
> su `fetch` no tenía timeout (ya arreglado), pero eso sólo hace visible el
> fallo — no arregla el endpoint.

---

## Tres bugs de producción arreglados

**"Calculando el menú de Cairo..." infinito.** Ninguna petición a la API
tenía límite de tiempo — no había un solo `AbortController` en la app. El
servidor de `canislab-api` (plan gratuito de Render) se duerme tras un rato
sin uso, y un `fetch` sin timeout ante un servidor que no contesta se queda
esperando indefinidamente: ni resuelve ni lanza error. Reproducido: 2
minutos sin un solo cambio en pantalla.

El reintento que ya existía (*"Despertando el servidor..."*) era **código
muerto**: sólo salta cuando el `fetch` lanza error, y un servidor mudo no
lanza nada. Ahora hay timeout (`TIEMPO_MAXIMO_PETICION_MS`, 45 s, holgado
para un arranque en frío) y el error de timeout se deja subir hasta el
bucle de reintentos en vez de tragárselo, que es justo para lo que estaba.
Si se agotan los reintentos, el fallo va a Sentry.

**La raza salía como texto ilegible.** No era codificación: se guardaba el
**objeto entero** de la raza (`{nombre, tamano, pesoMin, pesoMax,
pesoMedio}`) en una columna que sólo debía llevar el nombre, y al leerlo se
volvía a envolver, así que `perfil.raza.nombre` acababa siendo otro objeto.
Ahora se guarda sólo el nombre y se lee venga como venga — las filas viejas
incluidas, sin necesidad de migración — recuperando la raza completa del
catálogo para no perder el tamaño ni el peso de referencia.

**El año de nacimiento por defecto era 2024.** Había dos años escritos en
duro (`2024` y `2026`). Ahora se usa el año actual.

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

Desde el menú lateral se llega a **Mis menús** (ver abajo). *"Evolución y
crecimiento"* y *"Analizar la dieta actual"* siguen en gris con *"aún no"*:
esas dos viven dentro de `VistaMenus` y sólo existen cuando hay un menú
recién generado.

---

## Menús guardados

Los menús se guardan en Supabase al generarlos y se pueden volver a
consultar desde **Menú lateral → Mis menús**. Al abrir uno se ve tal y como
se generó, con las kcal y la etapa que tenía **entonces** — no las de hoy:
el perro puede haber cambiado de peso, y repintarlo con los números
actuales diría algo que nunca fue verdad.

Esto estaba roto de tres formas a la vez:

1. **Se guardaban sin dueño.** La llamada era `guardarMenu(usuario.id, null, …)`
   y ese `null` era el `perro_id`. Como `getMenus(perroId)` filtra justo por
   esa columna, ningún menú guardado se podía encontrar jamás.
2. **Nunca se leían.** `getMenus` estaba escrita en `src/supabase.js` y no se
   llamaba desde ningún sitio. Los menús entraban en la base de datos y no
   volvían a salir: cerrabas la app y los perdías de vista para siempre.
3. **No había pantalla** donde verlos. La sección "Mis menús" que ya existía
   vive dentro de `VistaMenus` y lista sólo los de la sesión actual, recién
   generados — no los guardados.

### Migración pendiente para los menús viejos

El código ya guarda el `perro_id` correcto, pero **los menús guardados antes
de este cambio tienen la columna vacía** y no aparecerán en "Mis menús"
hasta que se adopten. Hay que ejecutar una vez, en Supabase → SQL Editor:

[`supabase/migracion-menus-perro-id.sql`](supabase/migracion-menus-perro-id.sql)

Asigna cada menú huérfano al perro de su propia cuenta (el `user_id` sí se
guardaba bien). Es seguro repetirla: sólo toca filas con `perro_id` vacío.

Se eligió arreglar la columna de verdad, en vez de filtrar por `user_id`,
porque más adelante habrá **varias mascotas por cuenta** y entonces
`user_id` dejaría de identificar de quién es cada menú.

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
