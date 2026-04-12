import DB from './db.js';
import { API_URL } from './config.js';

const TIMEOUT = 30000;

// ---- Token de sesión ----
// Se guarda en sessionStorage tras el login exitoso
function getAuthToken() {
    try {
        return sessionStorage.getItem('interred_api_token') || '';
    } catch {
        return '';
    }
}

export function setAuthToken(token) {
    try {
        sessionStorage.setItem('interred_api_token', token);
    } catch {}
}

export function clearAuthToken() {
    try {
        sessionStorage.removeItem('interred_api_token');
    } catch {}
}

// ---- Login contra el backend (BUG #1 y #2 corregidos) ----
// Reemplaza el checkLogin() que tenía las credenciales en el frontend
export async function loginBackend(user, pass) {
    try {
        const res = await fetch(`${API_URL}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user, pass })
        });
        const data = await res.json();
        if (data.success && data.token) {
            setAuthToken(data.token);
            return { success: true };
        }
        return { success: false, message: data.message || 'Credenciales incorrectas' };
    } catch (e) {
        return { success: false, message: 'No se pudo conectar al servidor' };
    }
}

// ---- Fetch con timeout y Bearer token ----
async function fetchWithTimeout(url, options = {}) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), TIMEOUT);

    const token = getAuthToken();

    try {
        const response = await fetch(url, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
                ...(options.headers || {})
            },
            signal: controller.signal
        });

        if (response.status === 401) {
            clearAuthToken();
            throw new Error('Sesión expirada. Por favor, volvé a iniciar sesión.');
        }

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`HTTP ${response.status} - ${text}`);
        }

        const text = await response.text();
        try {
            return JSON.parse(text);
        } catch {
            console.error('❌ Backend no devolvió JSON:', text);
            throw new Error('Respuesta inválida del servidor (no JSON)');
        }

    } catch (error) {
        if (error.name === 'AbortError') {
            throw new Error('Timeout MikroTik (30s)');
        }
        throw error;
    } finally {
        clearTimeout(id);
    }
}

// ---- Config del router activo (sin credenciales hardcodeadas) ----
function getMikrotikConfig() {
    const settings = DB.getSettings();
    const routers = settings.routers || [];
    const activeRouter = routers[settings.activeRouterIndex || 0] || null;

    if (!activeRouter || !activeRouter.host) {
        // Sin config en DB — el backend usará sus variables de entorno como fallback
        return null;
    }

    return {
        host: activeRouter.host,
        port: parseInt(activeRouter.port || 8729),
        user: activeRouter.user,
        password: activeRouter.password,
        ssl: true
    };
}

// 🔴 REDUCIR
export async function reduceClient(client) {
    if (!client.ip || client.ip === '0.0.0.0') {
        return { success: false, message: 'Cliente sin IP válida' };
    }
    try {
        const config = getMikrotikConfig();
        const fullName = `${client.nombre} ${client.apellido || ''}`.trim();
        console.log('📡 Reduciendo:', fullName);
        return await fetchWithTimeout(`${API_URL}/api/queue/enable`, {
            method: 'POST',
            body: JSON.stringify({ config, ip: client.ip, clientName: fullName })
        });
    } catch (e) {
        console.error('❌ ERROR REDUCIR:', e.message);
        return { success: false, message: e.message };
    }
}

// 🟢 ACTIVAR
export async function activateClient(client) {
    if (!client.ip || client.ip === '0.0.0.0') {
        return { success: false, message: 'Cliente sin IP válida' };
    }
    try {
        const config = getMikrotikConfig();
        const fullName = `${client.nombre} ${client.apellido || ''}`.trim();
        console.log('📡 Activando:', fullName);
        return await fetchWithTimeout(`${API_URL}/api/queue/disable`, {
            method: 'POST',
            body: JSON.stringify({ config, ip: client.ip, clientName: fullName })
        });
    } catch (e) {
        console.error('❌ ERROR ACTIVAR:', e.message);
        return { success: false, message: e.message };
    }
}

// Test de conexión
export async function testMikrotikConnection(config) {
    try {
        return await fetchWithTimeout(`${API_URL}/api/mikrotik/test`, {
            method: 'POST',
            body: JSON.stringify(config)
        });
    } catch (e) {
        return { success: false, message: e.message };
    }
}

// Status del sistema
export async function getMikrotikStatus(config) {
    try {
        return await fetchWithTimeout(`${API_URL}/api/mikrotik/status`, {
            method: 'POST',
            body: JSON.stringify(config)
        });
    } catch (error) {
        return { success: false, message: error.message };
    }
}

// Reiniciar router
export async function rebootMikrotik(config) {
    try {
        return await fetchWithTimeout(`${API_URL}/api/mikrotik/reboot`, {
            method: 'POST',
            body: JSON.stringify(config)
        });
    } catch (e) {
        return { success: true, message: 'Reinicio enviado.' };
    }
}

// Sync masivo
export async function syncMikrotik(config, clients, morosos, clean = false) {
    try {
        return await fetchWithTimeout(`${API_URL}/api/mikrotik/sync`, {
            method: 'POST',
            body: JSON.stringify({ config, clients, morosos, clean })
        });
    } catch (e) {
        return { success: false, message: e.message };
    }
}
