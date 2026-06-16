/**
 * config.js — configuración del frontend.
 *
 * Como el backend (Pages Functions) vive en el mismo origen que el frontend,
 * usamos rutas relativas y nos ahorramos el tema CORS.
 */
(function () {
  window.APP_CONFIG = {
    API_BASE: "/api",
    TIENDA_NOMBRE: "Semilla",
    MONEDA: "EUR",
  };
})();
