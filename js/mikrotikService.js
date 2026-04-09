// js/mikrotikService.js
import DB from './db.js';
import { API_URL } from './config.js';

const TIMEOUT = 5000;

function withTimeout(promise) {
    return Promise.race([
        promise,
        new Promise((_, reject) =>
            setTimeout(() => {
                const msg = "Timeout MikroTik (5s)";
                if (window.showServerStatus) window.showServerStatus("offline");
                console.error(msg);
                reject(new Error(msg));
            }, TIMEOUT)
        )
    ]);
}

const log = (...args) => { if (window.log) window.log("[MKT]", ...args); else console.log("[MKT]", ...args); };

function getMikrotikConfig() {
    const settings = DB.getSettings();
    return {
        host: settings.mikrotikHost || '',
        port: parseInt(settings.mikrotikPort || '8728'),
        user: settings.mikrotikUser || '',
        password: settings.mikrotikPassword || '',
        addressListName: settings.mikrotikAddressList || 'morosos'
    };
}

// ---- Name Based Helpers (New) ----
function getQueueName(client) {
    return client.nombre || '';
}

function matchQueue(queue, client) {
    if (!queue) return false;
    const nameMatch = queue.name?.toLowerCase().includes(client.nombre?.toLowerCase());
    // Normalize target IP (remove mask if present)
    const targetIP = queue.target?.split('/')[0];
    const ipMatch = targetIP === client.ip;
    return nameMatch && ipMatch;
}

async function findQueue(client) {
    try {
        const fetchFunc = window.safeFetch || fetch;
        const config = getMikrotikConfig();
        const res = await withTimeout(fetchFunc(`${API_URL}/api/queues`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ config })
        }));
        if (!res || !res.success || !Array.isArray(res.data)) return null;
        return res.data.find(q => matchQueue(q, client)) || null;
    } catch (e) {
        log("Error buscando queue:", e.message);
        return null;
    }
}

export async function activateClient(client) {
    const config = getMikrotikConfig();
    try {
        const fetchFunc = window.safeFetch || fetch;
        const data = await withTimeout(fetchFunc(`${API_URL}/activate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ config, ip: client.ip })
        }));
        return data;
    } catch (e) {
        log('Error al conectar con API MikroTik:', e.message);
        return { success: false, message: 'Error de conexión o Timeout con MikroTik' };
    }
}

export async function reduceClient(client) {
    const config = getMikrotikConfig();
    try {
        const fetchFunc = window.safeFetch || fetch;
        const data = await withTimeout(fetchFunc(`${API_URL}/suspend`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                config, 
                ip: client.ip,
                clientName: client.nombre 
            })
        }));
        return data;
    } catch (e) {
        log('Error al conectar con API MikroTik:', e.message);
        return { success: false, message: 'Error de conexión o Timeout con MikroTik' };
    }
}

export async function testMikrotikConnection(config) {
    try {
        const fetchFunc = window.safeFetch || fetch;
        const data = await withTimeout(fetchFunc(`${API_URL}/api/mikrotik/test`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config)
        }));
        return data;
    } catch (e) {
        return { success: false, message: 'Error de conexión o Timeout.' };
    }
}

async function getMikrotikStatus(config) {
    try {
        // Forzamos a que la petición vaya al Backend (interred.onrender.com)
        const response = await fetch(`${API_URL}/api/mikrotik/status`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                host: config.host,
                port: config.port || 9728, // Usamos el puerto que configuramos en el router
                user: config.user,
                password: config.password
            })
        });

        if (!response.ok) {
            throw new Error('Error en la respuesta del servidor');
        }

        return await response.json();
    } catch (error) {
        console.error('❌ Error conectando a la API:', error);
        return { success: false, message: error.message };
    }
}
export { getMikrotikStatus };

export async function rebootMikrotik(config) {
    try {
        const fetchFunc = window.safeFetch || fetch;
        const data = await withTimeout(fetchFunc(`${API_URL}/api/mikrotik/reboot`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config)
        }));
        return data;
    } catch (e) {
        return { success: false, message: 'Error al reiniciar o Timeout.' };
    }
}
