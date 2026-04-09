// Configuración centralizada de entorno

const isLocal =
  window.location.hostname === "localhost";

// URL del backend (Render API para producción)
export const API_URL = isLocal
  ? "http://localhost:3000"
  : "https://interred-api.onrender.com";

// Timeout estándar para fetch
export const API_TIMEOUT = 30000;
