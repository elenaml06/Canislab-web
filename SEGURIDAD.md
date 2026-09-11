# Rawku web — las cabeceras de seguridad

Escrito el 11 de septiembre de 2026, cuando se auditó la API y de paso se
miró qué contestaba rawku.app. Esto vive en un archivo aparte porque el
sitio donde se configura, `vercel.json`, es **JSON estricto y no admite
comentarios** — y una lista de cinco cabeceras sin una línea de por qué es
exactamente el tipo de cosa que alguien borra en seis meses pensando que no
hacía nada.

## Qué se midió

Peticiones a la rawku.app que estaba sirviendo Vercel ese día:

```
$ curl -s -D - -o /dev/null https://rawku.app/
HTTP/2 200
strict-transport-security: max-age=63072000
```

Y nada más. HTTPS forzado sí, que es lo importante y ya estaba. De las
demás, ninguna.

## Lo que faltaba, y cuál importa de verdad

**`X-Frame-Options` y `frame-ancestors`. Esta es la que importa.** Sin
ellas, cualquier página del mundo puede meter rawku.app dentro de un
`<iframe>` invisible, ponerle encima sus propios botones, y quien crea que
está pulsando «aceptar cookies» en la web del atacante está pulsando de
verdad lo que haya debajo en la suya — con su sesión iniciada, porque es su
navegador. Se llama *clickjacking*. No hace falta robar ninguna contraseña:
la persona hace el trabajo, sin verlo.

Aquí hay sesión iniciada, hay perros guardados y hay botones que borran.
Eso es todo lo que hace falta para que esto deje de ser teórico.

Se ponen **las dos** a propósito, que parece redundante y no lo es:
`frame-ancestors` es la moderna y la que entienden los navegadores de hoy;
`X-Frame-Options` es la antigua y la única que entiende un navegador viejo.
Quien entra desde un móvil de hace años es justo quien menos va a notar que
le han puesto una página encima.

**`X-Content-Type-Options: nosniff`.** Impide que el navegador se invente
el tipo de un archivo cuando el servidor ya se lo ha dicho. Sin ella, algo
servido como texto puede acabar ejecutándose como JavaScript.

**`Referrer-Policy: strict-origin-when-cross-origin`.** Cuando desde aquí
se sale a otro sitio, el navegador cuenta de dónde vienes. Con esto cuenta
el dominio y no la dirección entera. Importa porque las direcciones de esta
app llevan cosas dentro (`?pago=ok&session_id=...`, que lo pone el vuelta
de Stripe) y una dirección completa no tiene por qué viajar a terceros.

**`Permissions-Policy`.** Apaga cámara, micrófono, ubicación, pagos y USB.
La app **no usa ninguna** — comprobado, no hay ni un `geolocation` ni un
`getUserMedia` en `src/` —, así que apagarlas no quita nada y cierra la
puerta por si algún día entra una dependencia que sí las pida.

## Lo que NO se ha puesto, y por qué

**Una `Content-Security-Policy` completa.** La que hay solo dice
`frame-ancestors`, que es la parte que no puede romper nada: no limita lo
que la página CARGA, solo quién puede meterla en un marco.

Una CSP de verdad (`script-src`, `connect-src`, `style-src`…) sí valdría la
pena, y también es la forma más fácil de romper un sitio en producción sin
enterarse. Esta app habla con cuatro sitios y hay que permitirlos todos, o
lo que se cae es el inicio de sesión:

| Adónde llama | Para qué |
|---|---|
| `https://kvtkdpgpmrvwmvymyqof.supabase.co` (y `wss://` del mismo) | cuentas y datos |
| `https://canislab-api.onrender.com` | el motor |
| el host que lleve dentro `VITE_SENTRY_DSN` | los errores, solo si esa variable está puesta. **Hay que mirarlo, no suponerlo**: Sentry usa `*.ingest.sentry.io` o `*.ingest.de.sentry.io` según en qué región se creara el proyecto, y el DSN de verdad solo está en Vercel |
| `https://fonts.googleapis.com` y `https://fonts.gstatic.com` | las tipografías: `App.jsx` trae DM Sans con un `@import` dentro del CSS, y esa hoja se descarga a su vez las letras de `gstatic` |

Y además `index.html` lleva un `<script>` **en línea** (la limpieza del
service worker que ya no se usa), así que una `script-src` estricta lo
bloquearía: hay que sacarlo a un archivo o darle un hash primero.

Eso es un cambio que hay que **probar en una vista previa de Vercel con la
consola abierta**, no escribir a ojo. Queda pendiente, escrito aquí para
que no se pierda.

## Cómo se comprueba que llegó

Después de desplegar:

```
curl -s -D - -o /dev/null https://rawku.app/ | grep -i "x-frame\|content-security\|nosniff\|referrer\|permissions"
```

Tienen que salir las cinco. Si no salen, el `vercel.json` no se ha
aplicado — mira que el despliegue sea posterior al commit.

## Por qué no hay una prueba automática de esto

Porque no se puede, no porque se olvidara. Los tests de Playwright levantan
la app con Vite en local, y **Vite no lee `vercel.json`**: esas cabeceras
las pone Vercel al servir, así que en local no existen y una prueba que las
buscara ahí fallaría siempre o no probaría nada. La comprobación de verdad
es el `curl` de arriba contra el sitio desplegado.
