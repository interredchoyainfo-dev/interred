// Configuración centralizada de entorno

const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";

// URL del backend (Render API para producción)
export const API_URL = isLocal ? "http://localhost:3000" : window.location.origin;

export const API_TIMEOUT = 30000;
