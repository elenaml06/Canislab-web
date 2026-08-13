// Service worker de CANISLAB — versión 1.
//
// Solo cachea el "cascarón" de la app (HTML/JS/CSS que sirve Vercel),
// para que abra rápido y funcione aunque no haya buena conexión un
// instante. Las llamadas de verdad al servidor (canislab-api, en otro
// dominio) NUNCA se cachean aquí -- van siempre a la red, tal cual,
// porque necesitan datos frescos del perro cada vez.
//
// Para forzar que los usuarios reciban una versión nueva del sitio
// tras un despliegue, basta con subir el número de CACHE_NAME (v1 -> v2).
const CACHE_NAME = "canislab-v1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((claves) =>
      Promise.all(
        claves
          .filter((clave) => clave !== CACHE_NAME)
          .map((clave) => caches.delete(clave))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // solo el propio origen (el sitio de Vercel) -- nunca las llamadas
  // a la API, que viven en otro dominio y necesitan ir siempre a la red
  if (url.origin !== self.location.origin) return;
  if (event.request.method !== "GET") return;

  event.respondWith(
    caches.match(event.request).then((enCache) => {
      const porRed = fetch(event.request)
        .then((respuesta) => {
          if (respuesta && respuesta.status === 200) {
            const copia = respuesta.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copia));
          }
          return respuesta;
        })
        .catch(() => enCache); // sin conexión: lo que hubiera en caché, si hay algo

      // si ya había algo en caché, se sirve al instante y se actualiza
      // en segundo plano; si no, se espera a la red
      return enCache || porRed;
    })
  );
});
