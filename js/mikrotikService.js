import DB from './db.js';
import { API_URL } from './config.js';

// Tiempo de espera aumentado para dar margen al DNS y a la conexión (30 segundos)
const TIMEOUT = 30000; 

function withTimeout(promise) {
    return Promise.race([
        promise,
        new Promise((_, reject) =>
            setTimeout(() => {
                const msg = "Timeout MikroTik: El router no respondió a tiempo.";
                if (window.showServerStatus) window.showServerStatus("offline");
                console.error(msg);
                reject(new Error(msg));
            }, TIMEOUT)
        )
    ]);
}

const log = (...args) => { 
    if (window.log) window.log("[MKT]", ...args); 
    else console.log("[MKT]", ...args); 
};

/**
 * CONFIGURACIÓN CON DNS CLOUD MIKROTIK
 */
function getMikrotikConfig() {
    const settings = DB.getSettings();
    return {
        // PRIORIDAD: Usamos el DNS Name de MikroTik Cloud para estabilidad total
        host: settings.mikrotikHost || 'ae370bdc8cbe.sn.mynetname.net', 
        port: parseInt(settings.mikrotikPort || '9728'), 
        user: settings.mikrotikUser || 'interred_api',
        password: settings.mikrotikPassword || 'InterRed2026',
        addressListName: settings.mikrotikAddressList || 'morosos'
    };
}

/**
 * REDUCIR CLIENTE (Corte por falta de pago)
 */
export async function reduceClient(client) {
    const config = getMikrotikConfig();
    try {
        const fetchFunc = window.safeFetch || fetch;
        console.log(`📡 Intentando reducir a: ${client.nombre} vía DNS...`);
        
        const res = await withTimeout(fetchFunc(`${API_URL}/api/queue/enable`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                config, 
                ip: client.ip,
                clientName: `${client.nombre} ${client.apellido || ''}`.trim()
            })
        }));

        const data = await res.json();
        return data;
    } catch (e) {
        log('Error al reducir cliente:', e.message);
        return { success: false, message: 'Error de conexión: Verifique el estado del MikroTik.' };
    }
}

/**
 * ACTIVAR CLIENTE (Restaurar servicio normal)
 */
export async function activateClient(client) {
    const config = getMikrotikConfig();
    try {
        const fetchFunc = window.safeFetch || fetch;
        console.log(`📡 Intentando activar a: ${client.nombre} vía DNS...`);

        const res = await withTimeout(fetchFunc(`${API_URL}/api/queue/disable`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                config, 
                ip: client.ip
            })
        }));
        
        const data = await res.json();
        return data;
    } catch (e) {
        log('Error al activar cliente:', e.message);
        return { success: false, message: 'Error de conexión: Verifique el estado del MikroTik.' };
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
            host: config.host || 'ae370bdc8cbe.sn.mynetname.net'
        };
        
        const fetchFunc = window.safeFetch || fetch;
        const res = await withTimeout(fetchFunc(`${API_URL}/api/mikrotik/test`, {
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
                host: config.host || 'ae370bdc8cbe.sn.mynetname.net',
                port: parseInt(config.port || 9728),
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
        const fetchFunc = window.safeFetch || fetch;
        const res = await withTimeout(fetchFunc(`${API_URL}/api/mikrotik/reboot`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...config, host: config.host || 'ae370bdc8cbe.sn.mynetname.net' })
        }));
        return await res.json();
    } catch (e) {
        return { success: true, message: 'Reinicio enviado.' };
    }
}
