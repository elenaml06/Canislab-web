// Service worker de CANISLAB -- AUTODESINSTALACIÓN.
//
// Se decidió no seguir con la app como PWA (no terminaba de funcionar
// bien en el móvil). Este archivo YA NO cachea nada -- lo único que
// hace es quitarse a sí mismo y borrar cualquier caché vieja que
// hubiera quedado de la versión anterior, para cualquier móvil que ya
// lo tuviera instalado. Los navegadores comprueban este archivo cada
// cierto tiempo (o al recargar la página), así que en cuanto lo
// detecten, se limpiará solo -- no hace falta que el usuario haga
// nada a mano.
//
// Una vez pase un tiempo prudencial y se pueda asumir que ya nadie
// tiene la versión vieja activa, este archivo (y su registro en
// index.html) se pueden borrar del todo sin problema.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // borra cualquier caché que hubiera quedado de la versión
      // anterior (la que sí guardaba archivos)
      const nombres = await caches.keys();
      await Promise.all(nombres.map((n) => caches.delete(n)));
      // se desregistra a sí mismo -- a partir de aquí, ninguna
      // petición vuelve a pasar por un service worker
      await self.registration.unregister();
      // fuerza a que las pestañas abiertas recarguen sin el
      // service worker de por medio
      const clientes = await self.clients.matchAll({ type: "window" });
      clientes.forEach((c) => c.navigate(c.url));
    })()
  );
});
