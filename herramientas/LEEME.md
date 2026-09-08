# Herramientas sueltas

Cuatro programas que **no son pruebas** y que nadie llama solo: se ejecutan
a mano, cuando quieres mirar algo concreto. Estaban tirados en la raíz del
repo, mezclados con `vite.config.js` y `package.json`, y desde fuera no
había forma de saber si eran código de la app o basura de una tarde.

No están en `package.json` a propósito: `npm test` no debe tardar diez
minutos ni depender de que Render esté despierto.

| Herramienta | Qué mira | Cómo se lanza |
|---|---|---|
| `barrido.mjs` | Un repaso ancho a la API **de producción**: que cada endpoint conteste y conteste algo con sentido. Es lo primero que se corre cuando «algo va raro en la app y no sé qué» | `node herramientas/barrido.mjs` |
| `determinismo.mjs` | Que la misma petición a `/menu/v2` dé el mismo menú. El motor MILP tiene un `time_limit`, así que puede cambiar de respuesta si tarda distinto — esto lo enseña en vez de sospecharlo | `node herramientas/determinismo.mjs` |
| `tiempos.mjs` | Cuánto tarda cada caso (sano, pancreatitis, renal…) contra la API de producción. Para decidir el `presupuesto_segundos` con datos, no a ojo | `node herramientas/tiempos.mjs` |
| `mirar-vet.mjs` | Recorre el flujo del veterinario con Playwright y hace una captura de cada pantalla. Para ver el diseño entero de un vistazo sin clicar veinte veces | `node herramientas/mirar-vet.mjs` |

**Las tres primeras hablan con `https://canislab-api.onrender.com`**, o sea
con lo que están usando las usuarias ahora mismo. Solo leen (`GET` y
`POST /menu/*`, que no guarda nada), pero conviene saberlo: si Render está
dormido, la primera petición tarda cerca de un minuto.
