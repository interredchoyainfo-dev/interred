import DB from './db.js';
import { API_URL } from './config.js';

const TIMEOUT = 30000;

async function withTimeout(fetchPromise) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT);

    try {
        const response = await fetchPromise(controller.signal);

        // 🔴 VALIDACIÓN FUERTE
        if (!(response instanceof Response)) {
            throw new Error("La respuesta no es válida (no es Response)");
        }

        return response;

    } catch (error) {
        if (error.name === 'AbortError') {
            throw new Error("Timeout MikroTik (30s)");
        }
        throw error;
    } finally {
        clearTimeout(timeoutId);
    }
}

function getMikrotikConfig() {
    const settings = DB.getSettings();
    return {
        host: settings.mikrotikHost || '181.209.118.162', // 🔥 USAR IP DIRECTA (NO DNS)
        port: 8728, // 🔥 FIJO
        user: settings.mikrotikUser || 'interred_api',
        password: settings.mikrotikPassword || 'InterRed2026'
    };
}

// 🔴 REDUCIR
export async function reduceClient(client) {
    const config = getMikrotikConfig();

    try {
        console.log(`📡 Reduciendo: ${client.nombre}`);

        const response = await withTimeout((signal) => fetch(`${API_URL}/api/queue/enable`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal,
            body: JSON.stringify({
                config,
                ip: client.ip,
                clientName: client.nombre
            })
        }));

        // 🔴 VALIDACIÓN CLAVE
        if (!response.ok) {
            const text = await response.text();
            throw new Error(`HTTP ${response.status} - ${text}`);
        }

        const text = await response.text();
        try {
            return JSON.parse(text);
        } catch {
            console.error("❌ RESPUESTA NO JSON:", text);
            throw new Error("El backend no devolvió JSON válido");
        }

    } catch (error) {
        console.error("❌ ERROR REDUCIR:", error.message);
        return { success: false, message: error.message };
    }
}

// 🟢 ACTIVAR
export async function activateClient(client) {
    const config = getMikrotikConfig();

    try {
        console.log(`📡 Activando: ${client.nombre}`);

        const response = await withTimeout((signal) => fetch(`${API_URL}/api/queue/disable`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal,
            body: JSON.stringify({
                config,
                ip: client.ip
            })
        }));

        // 🔴 VALIDACIÓN CLAVE
        if (!response.ok) {
            const text = await response.text();
            throw new Error(`HTTP ${response.status} - ${text}`);
        }

        const text = await response.text();
        try {
            return JSON.parse(text);
        } catch {
            console.error("❌ RESPUESTA NO JSON:", text);
            throw new Error("El backend no devolvió JSON válido");
        }

    } catch (error) {
        console.error("❌ ERROR ACTIVAR:", error.message);
        return { success: false, message: error.message };
    }
}

/**
 * TEST DE CONEXIÓN AL CLOUD
 */
export async function testMikrotikConnection(config) {
    try {
        // Si el host viene vacío en el test, usamos el DNS por defecto
        const testConfig = {
            ...config,
            host: config.host || '181.209.118.162'
        };
        const res = await withTimeout((signal) => fetch(`${API_URL}/api/mikrotik/test`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal,
            body: JSON.stringify(testConfig)
        }));
        const text = await res.text();
        try {
            return JSON.parse(text);
        } catch {
            console.error("❌ RESPUESTA NO JSON:", text);
            throw new Error("El backend no devolvió JSON válido");
        }
    } catch (e) {
        return { success: false, message: e.message || 'Error: El DNS no resolvió o el puerto está cerrado.' };
    }
}

// Exportamos la función de estado para el Dashboard
export async function getMikrotikStatus(config) {
    try {
        const response = await fetch(`${API_URL}/api/mikrotik/status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                host: config.host || '181.209.118.162',
                port: parseInt(config.port || 8728),
                user: config.user || 'interred_api',
                password: config.password || 'InterRed2026'
            })
        });
        const text = await response.text();
        try {
            return JSON.parse(text);
        } catch {
            console.error("❌ RESPUESTA NO JSON:", text);
            throw new Error("El backend no devolvió JSON válido");
        }
    } catch (error) {
        return { success: false, message: error.message };
    }
}

export async function rebootMikrotik(config) {
    try {
        const res = await withTimeout((signal) => fetch(`${API_URL}/api/mikrotik/reboot`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal,
            body: JSON.stringify({ ...config, host: config.host || '181.209.118.162' })
        }));
        const text = await res.text();
        try {
            return JSON.parse(text);
        } catch {
            console.error("❌ RESPUESTA NO JSON:", text);
            throw new Error("El backend no devolvió JSON válido");
        }
    } catch (e) {
        return { success: true, message: 'Reinicio enviado.' };
    }
}
