import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    // Genera los .map del bundle. Sin esto, un error en Sentry se ve como
    // "index-CVJji2Yf.js:1:48210", que no dice absolutamente nada; con
    // ellos se ve el fichero y la línea del código original.
    //
    // Contrapartida a tener en cuenta: los .map se publican junto a la
    // app, así que cualquiera puede leer el código fuente desde el
    // navegador. Para una app de frontend el bundle ya es público de
    // todas formas, pero si prefieres no exponerlo, pon esto en false y
    // sube los sourcemaps a Sentry con su CLI y un auth token.
    sourcemap: true,
  },
});
