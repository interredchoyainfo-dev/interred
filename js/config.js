// Configuración centralizada de entorno

const hostname = window.location.hostname;

// Detecta si está en entorno local
const isLocal =
  hostname === "localhost" ||
  hostname === "127.0.0.1";

// URL del backend
// ⚠️ IMPORTANTE: sin puerto en producción, usando proxy/api
export const API_URL = isLocal
  ? "http://localhost:3000"
  : "https://www.interred.com.ar/api";

// Timeout estándar para fetch
export const API_TIMEOUT = 10000;
