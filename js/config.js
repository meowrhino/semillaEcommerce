/**
 * config.js — configuración del frontend.
 *
 * GitHub Pages no tiene variables de entorno, así que detectamos el entorno
 * por hostname. Ajusta las URLs cuando despliegues tu backend.
 */
(function () {
  const host = window.location.hostname;
  const isLocal = host === "localhost" || host === "127.0.0.1" || host === "";

  window.APP_CONFIG = {
    API_BASE: isLocal
      ? "http://localhost:3000"
      : "https://TU-BACKEND.onrender.com",
    TIENDA_NOMBRE: "Semilla",
    MONEDA: "EUR",
  };
})();
