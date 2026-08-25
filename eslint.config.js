// ─── EL ÚNICO AVISO QUE NOS INTERESA: UN NOMBRE QUE NO EXISTE ────────────────
//
// POR QUÉ EXISTE ESTE ARCHIVO
// El 25 de agosto llegó a Sentry un "ReferenceError: setMenuReal is not
// defined", sin manejar, de una usuaria de verdad. Pesabas al perro en
// Evolución, pulsabas "Regenerar menú adaptado al nuevo peso" y reventaba:
// esa línea llamaba a un `setMenuReal` que vive en el componente de FUERA.
//
// Y no era la primera vez. Doce líneas más arriba, en esa misma pantalla,
// hay otro comentario igual: `usuario` tampoco existía ahí y el peso se
// perdía al recargar.
//
// La familia es siempre la misma: JavaScript no dice nada de un nombre que
// no existe hasta que ejecuta esa línea, y esa línea solo se ejecuta
// pulsando ese botón concreto. Compila, se despliega, y lo encuentra quien
// usa la app. Las pruebas tampoco lo cazan salvo que alguna pulse justo ahí.
//
// `no-undef` lo caza ENTERO, leyendo, en segundos.
//
// POR QUÉ SOLO ESA REGLA
// Porque un linter con doscientos avisos de estilo no se mira, y a los tres
// días se ignora entero. Aquí no hay opiniones sobre comillas ni sobre
// hooks: solo nombres que no existen, que son fallos de verdad. Si algún
// día se añade otra regla, que sea porque ha roto algo en producción.
//
// Se ejecuta con `npm run lint`, y va dentro de `npm run build`: así no se
// puede desplegar sin haber pasado por aquí.
import globals from "globals";
// Solo para que los `eslint-disable-next-line react-hooks/exhaustive-deps`
// que ya había en el código sigan siendo comentarios válidos. La regla NO
// se enciende: encenderla hoy daría decenas de avisos de dependencias que
// están puestas a mano y a propósito, y eso es justo lo que hace que un
// linter se deje de mirar.
import reactHooks from "eslint-plugin-react-hooks";

export default [
  {
    files: ["src/**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.es2021 },
    },
    plugins: { "react-hooks": reactHooks },
    // Esos disable siguen sirviendo de documentación aunque la regla esté
    // apagada; avisar de ellos solo añadiría ruido al único aviso que sí
    // importa.
    linterOptions: { reportUnusedDisableDirectives: "off" },
    rules: { "no-undef": "error" },
  },
];
