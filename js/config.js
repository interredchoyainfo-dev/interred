// Configuración centralizada de entorno

const isLocal =
  window.location.hostname === "localhost";

// URL del backend (Render API para producción)
export const API_URL = isLocal
  ? "http://localhost:3000"
  : "";

// Timeout estándar para fetch
export const API_TIMEOUT = 10000;
