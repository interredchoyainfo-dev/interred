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
 * Super Robust Finder for Queues
 */
async function getQueueByAnyMeans(queueMenu, ip, name) {
    if (!ip) return null;
    
    const target1 = ip.trim();
    const target2 = target1.includes('/') ? target1 : `${target1}/32`;
    const nameClean = (name || '').trim();
    const nameUpper = nameClean.toUpperCase();
    
    console.log(`🔍 [MikroTik Search] Target IP: ${target2}, Name: ${nameUpper}`);

    // 1. Fetch ALL queues once to avoid multiple API calls and handle matching manually
    // This is the most reliable way to avoid "no such item" on filter failures
    let allQueues = [];
    try {
        allQueues = await queueMenu.get();
    } catch (err) {
        console.error("❌ Error fetching all queues:", err.message);
        return null;
    }

    if (!allQueues || allQueues.length === 0) return null;

    // Search by IP (most reliable)
    let found = allQueues.find(q => {
        const qTarget = (q.target || '').trim();
        return qTarget === target1 || qTarget === target2 || qTarget.includes(target1);
    });

    // Search by Name (fallback)
    if (!found) {
        found = allQueues.find(q => {
            const qName = (q.name || '').trim().toUpperCase();
            return qName === nameUpper || qName.includes(nameUpper) || nameUpper.includes(qName);
        });
    }

    if (found) {
        console.log(`✅ Queue encontrada localmente: ${found.name} (ID: ${found['.id']})`);
    }

    return found || null;
}

// 🔴 REDUCIR
export async function reduceClient(config, ip, clientName = "Cliente") {
    if (!isValidIP(ip.split('/')[0])) return { success: false, message: 'IP inválida' };

    return withMikrotik(config, async (api) => {
        const queueMenu = api.menu('/queue/simple');
        const q = await getQueueByAnyMeans(queueMenu, ip, clientName);

        const params = {
            "max-limit": "1k/1k",
            disabled: "no",
            comment: `InterRed | LIMITADO | ${clientName} | ${new Date().toLocaleDateString()}`
        };

        if (q && q['.id']) {
            try {
                console.log(`📡 Aplicando REDUCCIÓN a ID: ${q['.id']} (${q.name})`);
                await queueMenu.set({
                    ".id": q['.id'],
                    ...params
                });
                return { success: true, message: "Cliente reducido con éxito" };
            } catch (err) {
                console.warn(`⚠️ Error set ID: ${err.message}. Intentando recrear...`);
                // If set fails with "no such item", it might be a stale ID. We continue to "SI NO EXISTE" logic.
            }
        }

        // SI NO EXISTE -> CREAR (O si el set falló)
        console.log(`➕ Creando/Recreando queue para: ${clientName}`);
        try {
            await queueMenu.add({
                name: clientName.toUpperCase().trim(),
                target: ip.includes('/') ? ip.trim() : `${ip.trim()}/32`,
                ...params
            });
            return { success: true, message: "Cliente reducido (nueva cola creada)" };
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
        const q = await getQueueByAnyMeans(queueMenu, ip, clientName);

        const params = {
            "max-limit": "0/0", // Ilimitado
            disabled: "no",
            comment: `InterRed | ACTIVO | ${new Date().toLocaleDateString()}`
        };

        if (q && q['.id']) {
            try {
                console.log(`📡 Aplicando ACTIVACIÓN a ID: ${q['.id']} (${q.name})`);
                await queueMenu.set({
                    ".id": q['.id'],
                    ...params
                });
                return { success: true, message: "Cliente activado con éxito" };
            } catch (err) {
                console.warn(`⚠️ Error set ID en activación: ${err.message}. Intentando recrear...`);
            }
        }

        // Si no existe, lo creamos activo
        console.log(`➕ No se encontró queue para activar. Creando nueva para: ${clientName}`);
        try {
            await queueMenu.add({
                name: clientName.toUpperCase().trim(),
                target: ip.includes('/') ? ip.trim() : `${ip.trim()}/32`,
                ...params
            });
            return { success: true, message: "Cliente activado (cola creada)" };
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
