// QUIÉN ES VETERINARIO — que decirlo no baste.
//
// ⚠️ POR QUÉ EXISTE. De este rol va a colgar lo más delicado de Rawku:
// pautar por debajo de los mínimos de FEDIAF y firmar la pauta con un
// número de colegiado (ver VETERINARIOS.md en el repo de la API). O sea que
// la pregunta "¿esta cuenta es de un veterinario?" tiene que contestarse
// igual desde todas partes y no poder contestarse que sí sola.
//
// La regla son DOS condiciones: rol = 'profesional' Y rol_verificado_en con
// fecha. La primera es lo que la persona PIDE; la segunda es que alguien
// miró su número y lo aprobó. El caso que de verdad vigila esta prueba es
// el de en medio -- pedido y no aprobado --, porque es el único que un
// atacante puede provocar y el único que "parece" que debería funcionar.
//
// Se prueba la lógica pura, sin app y sin red, igual que der-contrato: son
// cuatro líneas de las que depende todo lo demás, y tienen que poder
// comprobarse sin levantar nada.
import { test, expect } from "@playwright/test";
import { esProfesional, colegiadoDe } from "../src/rol.js";

const ACREDITADO = {
  rol: "profesional",
  num_colegiado: "COLVET-12345",
  rol_verificado_en: "2026-08-28T10:00:00.000Z",
};

test("una cuenta acreditada es profesional", () => {
  expect(esProfesional(ACREDITADO)).toBe(true);
});

test("decir que eres veterinario NO basta: sin verificar, no es profesional", () => {
  // ⚠️ ÉSTE ES EL CASO. Es lo que consigue quien se escriba el rol a sí
  // mismo desde la consola del navegador, y tiene que dar false.
  expect(esProfesional({ ...ACREDITADO, rol_verificado_en: null })).toBe(false);
  expect(esProfesional({ ...ACREDITADO, rol_verificado_en: "" })).toBe(false);
  expect(esProfesional({ ...ACREDITADO, rol_verificado_en: undefined })).toBe(false);
});

test("estar verificado con rol de tutor tampoco basta", () => {
  // El otro lado de la misma moneda: una fecha suelta no asciende a nadie.
  expect(esProfesional({ ...ACREDITADO, rol: "tutor" })).toBe(false);
  expect(esProfesional({ ...ACREDITADO, rol: "veterinario" })).toBe(false);
});

test("un perfil normal de hoy no es profesional", () => {
  expect(esProfesional({ id: "x", plan: "premium" })).toBe(false);
  expect(esProfesional({ id: "x", rol: "tutor" })).toBe(false);
});

test("sin perfil, y sin la migración ejecutada, no es profesional", () => {
  // Si el código llega a producción antes que el ALTER TABLE, getPerfil
  // devuelve el perfil SIN esas columnas. Tiene que salir false y no
  // reventar: la app sigue funcionando igual para todo el mundo.
  expect(esProfesional(null)).toBe(false);
  expect(esProfesional(undefined)).toBe(false);
  expect(esProfesional({ id: "x", nombre: "Elena" })).toBe(false);
});

test("el número de colegiado sólo sale de una cuenta acreditada", () => {
  // Lo que se imprime en una pauta firmada no puede salir de un campo que
  // cualquiera rellenó: si la cuenta no está acreditada, aquí no hay número.
  expect(colegiadoDe(ACREDITADO)).toBe("COLVET-12345");
  expect(colegiadoDe({ ...ACREDITADO, rol_verificado_en: null })).toBe(null);
  expect(colegiadoDe({ ...ACREDITADO, rol: "tutor" })).toBe(null);
  expect(colegiadoDe({ rol: "profesional", rol_verificado_en: "2026-08-28" })).toBe(null);
  expect(colegiadoDe(null)).toBe(null);
});
