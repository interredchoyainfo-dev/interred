// Configuración centralizada de entorno

const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";

// URL del backend (si es el mismo server que da la web usa window.location.origin)
export const API_URL = isLocal ? "http://localhost:3000" : window.location.origin;

export const API_TIMEOUT = 30000;
