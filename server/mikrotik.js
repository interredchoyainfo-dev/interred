import { RouterOSClient } from 'routeros-client';

function isValidIP(ip) {
    return /^(\d{1,3}\.){3}\d{1,3}$/.test(ip);
}

/**
 * Connects to MikroTik and executes a callback with the API handle.
 */
async function withMikrotik(config, callback) {
    const api = new RouterOSClient({
        host: config.host,
        port: config.port || 8729,
        user: config.user,
        password: config.password,
        keepalive: false,
        tls: {
            rejectUnauthorized: false
        }
    });

    try {
        const client = await api.connect();
        const result = await callback(client);
        await api.close();
        return result;
    } catch (error) {
        try { await api.close(); } catch {}
        return { success: false, message: error.message };
    }
}

/**
 * Super Destructor de Queues
 * Borra cualquier queue estática que tenga el mismo nombre exacto o la misma IP.
 * Libera la cancha para poder recrear limpiamente.
 */
async function obliterateQueues(queueMenu, ip, name) {
    if (!ip) return;
    
    const target1 = ip.trim();
    const target2 = target1.includes('/') ? target1 : `${target1}/32`;
    const nameUpper = (name || '').trim().toUpperCase();
    
    let allQueues = [];
    try {
        allQueues = await queueMenu.get();
    } catch (err) {
        console.error("❌ Error fetching all queues:", err.message);
        return;
    }

    if (!allQueues || allQueues.length === 0) return;

    // Buscar colas para eliminar
    const toDelete = allQueues.filter(q => {
        // Ignorar colas dinámicas (las de PPPoE/Hotspot, no se pueden modificar ni borrar sin error)
        if (q.dynamic === 'true' || q.dynamic === true) return false;

        const qTarget = (q.target || '').trim();
        const qName = (q.name || '').trim().toUpperCase();
        
        // Si tiene el mismo nombre, SE BORRA para evitar 'already have such name'
        if (qName === nameUpper) return true;
        
        // Si tiene el destino IP coincidente, SE BORRA para no saturar 
        if (qTarget === target1 || qTarget === target2) return true;
        
        return false;
    });

    for (const q of toDelete) {
        console.log(`🗑️ Eliminando queue estática encontrada: ${q.name} (ID: ${q['.id']})`);
        try { 
            await queueMenu.remove(q['.id']); 
        } catch (e) {
            console.warn(`⚠️ No se pudo borrar queue ${q['.id']}: ${e.message}`);
        }
    }
}

// 🔴 REDUCIR
export async function reduceClient(config, ip, clientName = "Cliente") {
    if (!isValidIP(ip.split('/')[0])) return { success: false, message: 'IP inválida' };

    return withMikrotik(config, async (api) => {
        const queueMenu = api.menu('/queue/simple');
        
        // 1. Destruimos cualquier conflicto viejo
        await obliterateQueues(queueMenu, ip, clientName);

        const params = {
            "max-limit": "1k/1k",
            disabled: "no",
            comment: `InterRed | LIMITADO | ${clientName} | ${new Date().toLocaleDateString()}`
        };

        // 2. Creamos de 0 con los valores estrictos
        console.log(`➕ Creando queue LIMPIA para reducir: ${clientName}`);
        try {
            await queueMenu.add({
                name: clientName.toUpperCase().trim(),
                target: ip.includes('/') ? ip.trim() : `${ip.trim()}/32`,
                ...params
            });
            return { success: true, message: "Cliente reducido con éxito (Recreado limipito)" };
        } catch (addErr) {
            console.error("❌ Error fatal al crear/reducir queue:", addErr.message);
            throw addErr;
        }
    });
}

// 🟢 ACTIVAR
export async function activateClient(config, ip, clientName = "Cliente") {
    if (!isValidIP(ip.split('/')[0])) return { success: false, message: 'IP inválida' };

    return withMikrotik(config, async (api) => {
        const queueMenu = api.menu('/queue/simple');
        
        // 1. Destruimos conflictos
        await obliterateQueues(queueMenu, ip, clientName);

        const params = {
            disabled: "yes", // Cola apagada, el cliente vuela libre
            comment: `InterRed | ACTIVO | ${new Date().toLocaleDateString()}`
        };

        // 2. Creamos apagada
        console.log(`➕ Creando queue LIMPIA desactivada para liberar: ${clientName}`);
        try {
            await queueMenu.add({
                name: clientName.toUpperCase().trim(),
                target: ip.includes('/') ? ip.trim() : `${ip.trim()}/32`,
                ...params
            });
            return { success: true, message: "Cliente activado con éxito (Recreado apagado)" };
        } catch (addErr) {
            console.error("❌ Error fatal al crear/activar queue:", addErr.message);
            throw addErr;
        }
    });
}

// Alias para compatibilidad
export const suspendClient = reduceClient;

export async function testConnection(config) {
    return withMikrotik(config, async (api) => {
        const identity = await api.menu('/system/identity').get();
        const resource = await api.menu('/system/resource').get();
        return {
            success: true,
            identity: identity?.[0]?.name || 'Unknown',
            version: resource?.[0]?.version || 'Unknown',
            uptime: resource?.[0]?.uptime || 'Unknown',
            message: 'Conexión exitosa con MikroTik'
        };
    });
}

export async function getSystemStatus(config) {
    return withMikrotik(config, async (api) => {
        const identity = await api.menu('/system/identity').get();
        const resource = await api.menu('/system/resource').get();
        const interfaces = await api.menu('/interface').get();
        
        console.log('[MIKROTIK] Resource:', resource?.[0]);
        if (interfaces && interfaces.length > 0) {
            console.log('[MIKROTIK] First Interface Sample:', interfaces[0]);
        }
        
        return {
            success: true,
            identity: identity?.[0]?.name || 'MikroTik',
            cpuLoad: resource?.[0]?.['cpu-load'] !== undefined ? resource[0]['cpu-load'].toString() : '0',
            freeMemory: resource?.[0]?.['free-memory'] !== undefined ? resource[0]['free-memory'].toString() : '0',
            totalMemory: resource?.[0]?.['total-memory'] !== undefined ? resource[0]['total-memory'].toString() : '0',
            uptime: resource?.[0]?.uptime || '0s',
            version: resource?.[0]?.version || '',
            interfaces: (interfaces || []).map(i => ({
                name: i.name,
                type: i.type,
                disabled: i.disabled === 'true' || i.disabled === true,
                rxByte: i['rx-byte'] || i['rx-bytes'] || i['rx-byte-64'] || '0',
                txByte: i['tx-byte'] || i['tx-bytes'] || i['tx-byte-64'] || '0',
                running: i.running === 'true' || i.running === true
            })).filter(i => !i.disabled)
        };
    });
}

export async function rebootRouter(config) {
    return withMikrotik(config, async (api) => {
        try { await api.menu('/system/reboot').exec(); } catch (e) {}
        return { success: true, message: 'Comando de reinicio enviado.' };
    });
}

export async function listSimpleQueues(config) {
    return withMikrotik(config, async (api) => {
        const results = await api.menu('/queue/simple').get();
        const data = (results || []).map(q => ({
            name: q.name,
            target: q.target
        }));
        return { success: true, data };
    });
}

// ---- COMPATIBILITY STUBS ----
// (Funciones requeridas por server/index.js que no estaban definidas para evitar el crash status 1)
export async function getMorososList(config) {
    return { success: false, data: [], message: 'No implementado' };
}
export async function suspendQueueByName(config, name) {
    return { success: false, message: 'No implementado' };
}
export async function activateQueueByName(config, name) {
    return { success: false, message: 'No implementado' };
}
export async function updateClientQueue(config, clientIp, clientName, action) {
    return { success: false, message: 'No implementado' };
}
