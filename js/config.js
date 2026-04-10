// Configuración centralizada de entorno

const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";

// URL del backend:
// Si es local (Vite en 5173), apunta al backend en 3000.
// Si está en producción (Render), usa el mismo dominio de la página (ya que frontend y backend se sirven del mismo lugar).
export const API_URL = isLocal ? "http://localhost:3000" : window.location.origin;

export const API_TIMEOUT = 30000;
