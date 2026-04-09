import DB from './db.js';
import { API_URL } from './config.js';

const TIMEOUT = 30000;

function withTimeout(promise) {
    return Promise.race([
        promise,
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Timeout MikroTik")), TIMEOUT)
        )
    ]);
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

    const res = await withTimeout(fetch(`${API_URL}/api/queue/enable`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            config,
            ip: client.ip,
            clientName: `${client.nombre} ${client.apellido || ''}`.trim()
        })
    }));

    return await res.json();
}

// 🟢 ACTIVAR
export async function activateClient(client) {
    const config = getMikrotikConfig();

    const res = await withTimeout(fetch(`${API_URL}/api/queue/disable`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            config,
            ip: client.ip
        })
    }));

    return await res.json();
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
        const res = await withTimeout(fetch(`${API_URL}/api/mikrotik/test`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(testConfig)
        }));
        return await res.json();
    } catch (e) {
        return { success: false, message: 'Error: El DNS no resolvió o el puerto está cerrado.' };
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
        return await response.json();
    } catch (error) {
        return { success: false, message: error.message };
    }
}

export async function rebootMikrotik(config) {
    try {
        const res = await withTimeout(fetch(`${API_URL}/api/mikrotik/reboot`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...config, host: config.host || '181.209.118.162' })
        }));
        return await res.json();
    } catch (e) {
        return { success: true, message: 'Reinicio enviado.' };
    }
}
