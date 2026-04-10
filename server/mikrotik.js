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

// 🔍 Función para ubicar la queue exacta del cliente por IP
async function findExactQueueByIp(queueMenu, ip) {
    const cleanIP = ip.split('/')[0].trim();
    const targetExact = `${cleanIP}/32`;

    let queues = [];
    try {
        queues = await queueMenu.get();
    } catch { return null; }

    if (!queues || queues.length === 0) return null;

    return queues.find(q => {
        if (q.dynamic === 'true' || q.dynamic === true) return false;

        let qTarget = (q.target || '').trim();
        if (!qTarget.includes('/')) qTarget = `${qTarget}/32`;

        return qTarget === targetExact;
    });
}

// 🛡️ Bucle de seguridad para Forzar Estado de la Cola
async function enforceQueueState(api, ip, clientName, params, isReducing) {
    const queueMenu = api.menu('/queue/simple');
    const cleanIP = ip.split('/')[0].trim();
    const targetExact = `${cleanIP}/32`;
    
    // 1. Buscamos el estado actual
    const existing = await findExactQueueByIp(queueMenu, cleanIP);

    const fullParams = {
        name: clientName.toUpperCase().trim(),
        target: targetExact,
        comment: `SYS:INTERRED:${cleanIP} | ${isReducing ? 'LIMITADO' : 'ACTIVO'} | ${clientName} | ${new Date().toLocaleDateString()}`,
        ...params
    };

    if (existing && existing['.id']) {
        console.log(`✏️ Intentando actualizar queue en caliente ID: ${existing['.id']}`);
        try {
            // Intentamos in-place mutation (lo más sano para el router)
            // Forma 1 de enviar params a MikroTik JS API:
            await queueMenu.set({ ".id": existing['.id'], ...fullParams });
            return { success: true, message: `Cliente ${isReducing ? 'reducido' : 'activado'} (Actualizado)` };
        } catch (err) {
            console.warn(`⚠️ Falló el in-place set (${err.message}). Cambiando a borrado duro...`);
            // Si el 'set' falla (ej. "no such item"), procedemos a borrar y recrear
            try { await queueMenu.remove(existing['.id']); } catch(e) {}
        }
    }

    // 2. Esperamos medio segundo para evitar el bug de MikroTik "already have such name" (Race condition)
    await new Promise(r => setTimeout(r, 500));

    // 3. Recreamos la cola limpia
    console.log(`➕ Recreando queue desde cero: ${fullParams.name}`);
    try {
        await queueMenu.add(fullParams);
        return { success: true, message: `Cliente ${isReducing ? 'reducido' : 'activado'} (Recreado)` };
    } catch (addErr) {
        console.error("❌ Error definitivo en MikroTik:", addErr.message);
        throw addErr;
    }
}

// 🔴 REDUCIR
export async function reduceClient(config, ip, clientName = "Cliente") {
    if (!isValidIP(ip.split('/')[0])) return { success: false, message: 'IP inválida' };

    return withMikrotik(config, async (api) => {
        return await enforceQueueState(api, ip, clientName, {
            "max-limit": "1k/1k",
            disabled: "no"
        }, true);
    });
}

// 🟢 ACTIVAR
export async function activateClient(config, ip, clientName = "Cliente") {
    if (!isValidIP(ip.split('/')[0])) return { success: false, message: 'IP inválida' };

    return withMikrotik(config, async (api) => {
        return await enforceQueueState(api, ip, clientName, {
            disabled: "yes"  // Al activar, NO mandamos max-limit para liberar el tubo entero
        }, false);
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
