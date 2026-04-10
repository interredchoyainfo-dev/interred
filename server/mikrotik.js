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

// 🔍 FIX: Buscar queue existente sin borrar (SAFE MODE)
async function findQueue(queueMenu, ip, name) {
    const target1 = ip.trim();
    const target2 = target1.includes('/') ? target1 : `${target1}/32`;
    const nameUpper = (name || '').trim().toUpperCase();

    let queues = [];
    try {
        queues = await queueMenu.get();
    } catch (err) {
        console.error("❌ Error fetching all queues:", err.message);
        return null;
    }

    if (!queues || queues.length === 0) return null;

    return queues.find(q => {
        // Ignorar colas dinámicas (las de PPPoE/Hotspot, no se pueden modificar)
        if (q.dynamic === 'true' || q.dynamic === true) return false;

        const qTarget = (q.target || '').trim();
        const qName = (q.name || '').trim().toUpperCase();

        return (
            qName === nameUpper ||
            qTarget === target1 ||
            qTarget === target2
        );
    });
}

// 🔴 FIX: reduceClient (SIN BORRAR)
export async function reduceClient(config, ip, clientName = "Cliente") {
    if (!isValidIP(ip.split('/')[0])) return { success: false, message: 'IP inválida' };

    return withMikrotik(config, async (api) => {
        const queueMenu = api.menu('/queue/simple');

        const existing = await findQueue(queueMenu, ip, clientName);

        const params = {
            "max-limit": "1k/1k",
            disabled: "no",
            comment: `InterRed | LIMITADO | ${clientName} | ${new Date().toLocaleDateString()}`
        };

        if (existing) {
            console.log(`✏️ Editando queue existente: ${existing.name}`);
            try {
                await queueMenu.set({
                    ".id": existing['.id'],
                    ...params
                });
            } catch (err) {
                console.error(`⚠️ Error al editar ID: ${err.message}`);
                return { success: false, message: `Error actualizando queue: ${err.message}` };
            }
        } else {
            console.log(`➕ Creando nueva queue: ${clientName}`);
            try {
                await queueMenu.add({
                    name: clientName.toUpperCase().trim(),
                    target: ip.includes('/') ? ip.trim() : `${ip.trim()}/32`,
                    ...params
                });
            } catch (addErr) {
                console.error("❌ Error fatal al crear queue:", addErr.message);
                throw addErr;
            }
        }

        return { success: true, message: "Cliente reducido (Estado in-place guardado)" };
    });
}

// 🟢 FIX: activateClient (SIN BORRAR)
export async function activateClient(config, ip, clientName = "Cliente") {
    if (!isValidIP(ip.split('/')[0])) return { success: false, message: 'IP inválida' };

    return withMikrotik(config, async (api) => {
        const queueMenu = api.menu('/queue/simple');

        const existing = await findQueue(queueMenu, ip, clientName);

        const params = {
            disabled: "yes",
            comment: `InterRed | ACTIVO | ${new Date().toLocaleDateString()}`
        };

        if (existing) {
            console.log(`✏️ Editando queue existente: ${existing.name}`);
            try {
                await queueMenu.set({
                    ".id": existing['.id'],
                    ...params
                });
            } catch (err) {
                console.error(`⚠️ Error al editar ID: ${err.message}`);
                return { success: false, message: `Error actualizando queue: ${err.message}` };
            }
        } else {
            console.log(`➕ Creando nueva queue: ${clientName}`);
            try {
                await queueMenu.add({
                    name: clientName.toUpperCase().trim(),
                    target: ip.includes('/') ? ip.trim() : `${ip.trim()}/32`,
                    ...params
                });
            } catch (addErr) {
                console.error("❌ Error fatal al crear queue:", addErr.message);
                throw addErr;
            }
        }

        return { success: true, message: "Cliente activado (Estado in-place guardado)" };
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
