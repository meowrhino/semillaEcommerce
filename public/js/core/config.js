/**
 * core/config.js — configuración del frontend.
 */
export const CONFIG = {
  API_BASE: "/api",
  TIENDA_NOMBRE: "Semilla",
  MONEDA: "EUR",

  // Idiomas activos. Con UN solo idioma el selector se oculta y el i18n queda inerte.
  // Para multi-idioma: añade códigos aquí, traduce STRINGS en core/i18n.js y usa objetos
  // {es, en, ...} en los campos de los JSON (nombre, descripcion). Ver README §i18n.
  LANGS: ["es", "en"],
};
