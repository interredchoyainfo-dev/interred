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
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
        const res = await fetch(`${API_URL}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user, pass }),
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        
        const data = await res.json();
        if (data.success && data.token) {
            setAuthToken(data.token);
            return { success: true };
        }
        return { success: false, message: data.message || 'Credenciales incorrectas' };
    } catch (e) {
        clearTimeout(timeoutId);
        if (e.name === 'AbortError') {
            return { success: false, message: 'El servidor tarda demasiado en responder (Timeout)' };
        }
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

export function normalizeZoneName(zone) {
    if (!zone) return '';
    return String(zone)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toUpperCase();
}

/**
 * Parsea el script de conexión MikroTik/RemoteMikrotik (en inglés o español)
 * para extraer host, puertos (API, Winbox, Web), usuario y contraseñas.
 */
export function parseMikrotikScript(scriptText) {
    if (!scriptText || typeof scriptText !== 'string') return null;

    const result = {};

    // 1. Extraer connect-to (Host VPN SSTP)
    const connectToMatch = scriptText.match(/connect-to=([^\s;]+)/i);
    if (connectToMatch) {
        result.host = connectToMatch[1].replace(/["']/g, '');
        result.sstpHost = result.host;
    }

    // 2. Extraer usuario y password de SSTP
    const sstpUserMatch = scriptText.match(/(?:interface\s+sstp-client|interfaz\s+cliente\s+sstp).*?(?:user|usuario)="?([^"\s;]+)"?/i);
    if (sstpUserMatch) result.sstpUser = sstpUserMatch[1];

    const sstpPassMatch = scriptText.match(/(?:interface\s+sstp-client|interfaz\s+cliente\s+sstp).*?(?:password|contrase[ñn]a)="?([^"\s;]+)"?/i);
    if (sstpPassMatch) result.sstpPassword = sstpPassMatch[1];

    // 3. Extraer usuario y password de la API (/user add o /usuario agregar)
    const apiUserMatch = scriptText.match(/\/(?:user\s+add|usuario\s+agregar)\s+.*?(?:name|nombre)="?([^"\s;]+)"?/i);
    if (apiUserMatch) result.user = apiUserMatch[1];

    const apiPassMatch = scriptText.match(/\/(?:user\s+add|usuario\s+agregar)\s+.*?(?:password|contrase[ñn]a)="?([^"\s;]+)"?/i);
    if (apiPassMatch) result.password = apiPassMatch[1];

    // Fallbacks si sólo vino uno
    if (!result.user && result.sstpUser) result.user = result.sstpUser;
    if (!result.password && result.sstpPassword) result.password = result.sstpPassword;

    // 4. Extraer puertos
    // Buscar menciones explícitas de puertos
    const apiPortMatch = scriptText.match(/(?:puerto\s+api|api\s+port|puertos\s+api)[=:\s]+(\d+)/i);
    if (apiPortMatch) result.port = apiPortMatch[1];

    const winboxPortMatch = scriptText.match(/(?:winbox|puerto\s+winbox)[=:\s]+(\d+)/i);
    if (winboxPortMatch) result.winboxPort = winboxPortMatch[1];

    const webPortMatch = scriptText.match(/(?:puerto\s+web|web\s+port|puersto\s+web)[=:\s]+(\d+)/i);
    if (webPortMatch) result.webPort = webPortMatch[1];

    // Si aún no se detectó puerto API, inferir por convención de RemoteMikrotik (7xxx = API, 1xxx = Winbox, 4xxx = Web)
    const allNumbers = (scriptText.match(/\b\d{4}\b/g) || []);
    for (const num of allNumbers) {
        if (!result.port && num.startsWith('7')) result.port = num;
        if (!result.winboxPort && num.startsWith('1')) result.winboxPort = num;
        if (!result.webPort && num.startsWith('4')) result.webPort = num;
    }

    // 5. Detectar Pueblo/Zona si está en el texto
    const lower = scriptText.toLowerCase();
    if (lower.includes('choya')) result.zone = 'CHOYA';
    else if (lower.includes('fria') || lower.includes('fría')) result.zone = 'FRIAS';
    else if (lower.includes('sol de mayo')) result.zone = 'SOL DE MAYO';
    else if (lower.includes('punta')) result.zone = 'VILLA LA PUNTA';

    return result;
}

export function formatRouterConfig(router) {
    if (!router) return null;
    const port = parseInt(router.port || 8728);
    const connectionHost = router.host || router.ip;
    if (!connectionHost) return null;
    return {
        id: router.id,
        name: router.name || 'Router MikroTik',
        zone: router.zone || router.zona || 'TODOS',
        host: connectionHost,
        port: port,
        winboxPort: router.winboxPort || '',
        webPort: router.webPort || '',
        user: router.user,
        password: router.password,
        sstpHost: router.sstpHost || connectionHost,
        sstpUser: router.sstpUser || '',
        sstpPassword: router.sstpPassword || '',
        addressList: router.addressList || 'morosos',
        active: router.active !== false,
        ssl: port === 8729
    };
}

// ---- Obtener routers activos para un cliente según su zona ----
export function getRoutersForClient(client = null) {
    const settings = DB.getSettings();
    const routers = (settings.routers || [])
        .map(formatRouterConfig)
        .filter(r => r && r.host && r.active);

    if (routers.length === 0) return [];

    if (client && client.zona) {
        const clientZone = normalizeZoneName(client.zona);
        const matches = routers.filter(r => {
            const rZone = normalizeZoneName(r.zone);
            return rZone === clientZone || rZone === 'TODOS';
        });
        if (matches.length > 0) return matches;
    }

    // Si no tiene zona o la zona no coincide, devolver el router activo seleccionado o todos
    const activeRouter = routers[settings.activeRouterIndex || 0] || routers[0];
    return activeRouter ? [activeRouter] : routers;
}

// ---- Config del router según el cliente o zona activa (retrocompatible) ----
export function getMikrotikConfig(client = null) {
    const routers = getRoutersForClient(client);
    return routers.length > 0 ? routers[0] : null;
}

// 🔴 REDUCIR / CORTAR (Aplica en los routers correspondientes)
export async function reduceClient(client) {
    if (!client.ip || client.ip === '0.0.0.0') {
        return { success: false, message: 'Cliente sin IP válida' };
    }

    const targetRouters = getRoutersForClient(client);
    if (targetRouters.length === 0) {
        return { success: false, message: 'No hay routers MikroTik activos configurados para esta zona.' };
    }

    const fullName = `${client.nombre} ${client.apellido || ''}`.trim();
    const results = [];

    for (const config of targetRouters) {
        console.log(`📡 [${config.name} (${config.zone})] Reduciendo/Cortando:`, fullName, client.ip);
        try {
            const res = await fetchWithTimeout(`${API_URL}/api/queue/enable`, {
                method: 'POST',
                body: JSON.stringify({ config, ip: client.ip, clientName: fullName })
            });
            results.push({ router: config.name, ...res });
        } catch (e) {
            console.error(`❌ Error en router ${config.name}:`, e.message);
            results.push({ router: config.name, success: false, message: e.message });
        }
    }

    const anySuccess = results.some(r => r.success);
    const messages = results.map(r => `${r.router}: ${r.success ? '✅ OK' : '❌ ' + (r.message || 'Fallo')}`).join(' | ');
    return {
        success: anySuccess,
        message: messages,
        details: results
    };
}

// 🟢 ACTIVAR (Aplica en los routers correspondientes)
export async function activateClient(client) {
    if (!client.ip || client.ip === '0.0.0.0') {
        return { success: false, message: 'Cliente sin IP válida' };
    }

    const targetRouters = getRoutersForClient(client);
    if (targetRouters.length === 0) {
        return { success: false, message: 'No hay routers MikroTik activos configurados para esta zona.' };
    }

    const fullName = `${client.nombre} ${client.apellido || ''}`.trim();
    const results = [];

    for (const config of targetRouters) {
        console.log(`📡 [${config.name} (${config.zone})] Activando:`, fullName, client.ip);
        try {
            const res = await fetchWithTimeout(`${API_URL}/api/queue/disable`, {
                method: 'POST',
                body: JSON.stringify({ config, ip: client.ip, clientName: fullName })
            });
            results.push({ router: config.name, ...res });
        } catch (e) {
            console.error(`❌ Error en router ${config.name}:`, e.message);
            results.push({ router: config.name, success: false, message: e.message });
        }
    }

    const anySuccess = results.some(r => r.success);
    const messages = results.map(r => `${r.router}: ${r.success ? '✅ OK' : '❌ ' + (r.message || 'Fallo')}`).join(' | ');
    return {
        success: anySuccess,
        message: messages,
        details: results
    };
}

// Test de conexión individual
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

// Probar TODOS los routers MikroTik configurados
export async function testAllRouters(routers = null) {
    const list = routers || (DB.getSettings().routers || []);
    const results = await Promise.all(
        list.map(async (router) => {
            const config = formatRouterConfig(router);
            if (!config || !config.host || !config.user || !config.password) {
                return {
                    id: router.id,
                    name: router.name,
                    success: false,
                    message: 'Datos incompletos'
                };
            }
            const res = await testMikrotikConnection(config);
            return {
                id: router.id,
                name: router.name,
                ...res
            };
        })
    );
    return results;
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
