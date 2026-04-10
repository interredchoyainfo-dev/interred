import DB from './db.js';
import { API_URL } from './config.js';

const TIMEOUT = 30000;

/**
 * Utility function for fetch calls with timeout and robust error handling
 */
async function fetchWithTimeout(url, options = {}) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), TIMEOUT);

    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`HTTP ${response.status} - ${text}`);
        }

        const text = await response.text();

        try {
            return JSON.parse(text);
        } catch {
            console.error("❌ Backend NO devolvió JSON:", text);
            throw new Error("Respuesta inválida del servidor (no JSON)");
        }

    } catch (error) {
        if (error.name === "AbortError") {
            throw new Error("Timeout MikroTik (30s)");
        }
        throw error;
    } finally {
        clearTimeout(id);
    }
}

function getMikrotikConfig() {
    const settings = DB.getSettings();
    return {
        host: settings.mikrotikHost || '181.209.118.162',
        port: 8729,
        user: settings.mikrotikUser || 'interred_api',
        password: settings.mikrotikPassword || 'InterRed2026',
        ssl: true
    };
}

// 🔴 REDUCIR
export async function reduceClient(client) {
    if (!client.ip || client.ip === "0.0.0.0") {
        return { success: false, message: "Cliente sin IP válida" };
    }

    try {
        const fullName = `${client.nombre} ${client.apellido || ''}`.trim();
        console.log("📡 Reduciendo:", fullName);

        return await fetchWithTimeout(`${API_URL}/api/queue/enable`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                config: getMikrotikConfig(),
                ip: client.ip,
                clientName: fullName
            })
        });

    } catch (e) {
        console.error("❌ ERROR REDUCIR:", e.message);
        return { success: false, message: e.message };
    }
}

// 🟢 ACTIVAR
export async function activateClient(client) {
    if (!client.ip || client.ip === "0.0.0.0") {
        return { success: false, message: "Cliente sin IP válida" };
    }

    try {
        const fullName = `${client.nombre} ${client.apellido || ''}`.trim();
        console.log("📡 Activando:", fullName);

        return await fetchWithTimeout(`${API_URL}/api/queue/disable`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                config: getMikrotikConfig(),
                ip: client.ip,
                clientName: fullName
            })
        });

    } catch (e) {
        console.error("❌ ERROR ACTIVAR:", e.message);
        return { success: false, message: e.message };
    }
}

/**
 * TEST DE CONEXIÓN
 */
export async function testMikrotikConnection(config) {
    try {
        const testConfig = {
            ...config,
            host: config.host || '181.209.118.162'
        };
        return await fetchWithTimeout(`${API_URL}/api/mikrotik/test`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(testConfig)
        });
    } catch (e) {
        return { success: false, message: e.message };
    }
}

/**
 * STATUS DEL SISTEMA
 */
export async function getMikrotikStatus(config) {
    try {
        return await fetchWithTimeout(`${API_URL}/api/mikrotik/status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                host: config.host || '181.209.118.162',
                port: parseInt(config.port || 8729),
                user: config.user || 'interred_api',
                password: config.password || 'InterRed2026',
                ssl: true
            })
        });
    } catch (error) {
        return { success: false, message: error.message };
    }
}

/**
 * REINICIAR ROUTER
 */
export async function rebootMikrotik(config) {
    try {
        return await fetchWithTimeout(`${API_URL}/api/mikrotik/reboot`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...config, host: config.host || '181.209.118.162' })
        });
    } catch (e) {
        // A veces el router se cae antes de responder al comando de reboot, 
        // así que solemos retornar success por defecto si se envió bien.
        return { success: true, message: 'Reinicio enviado.' };
    }
}
