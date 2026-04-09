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
        port: 8728,
        user: config.user,
        password: config.password,
        keepalive: false
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
    const target1 = ip;
    const target2 = ip.includes('/') ? ip : `${ip}/32`;
    const nameUpper = name.toUpperCase();
    
    console.log(`🔍 Buscando queue: IP=${target1}, Name=${name}`);

    // 1. Intento por filtros API (Rápido)
    let q = await queueMenu.where('target', target1).get();
    if (!q || q.length === 0) q = await queueMenu.where('target', target2).get();
    if (!q || q.length === 0) q = await queueMenu.where('name', name).get();
    if (!q || q.length === 0) q = await queueMenu.where('name', nameUpper).get();

    if (q && q.length > 0) return q[0];

    // 2. Intento por Búsqueda Manual (Fuerza Bruta)
    console.log("⚠️ Búsqueda por filtro falló. Iniciando escaneo manual...");
    const all = await queueMenu.get();
    const found = all.find(item => {
        const t = item.target || '';
        const n = item.name || '';
        return t.includes(target1) || n === name || n === nameUpper;
    });

    return found || null;
}

// 🔴 REDUCIR
export async function reduceClient(config, ip, clientName = "Cliente") {
    if (!isValidIP(ip.split('/')[0])) return { success: false, message: 'IP inválida' };

    return withMikrotik(config, async (api) => {
        const queueMenu = api.menu('/queue/simple');
        const q = await getQueueByAnyMeans(queueMenu, ip, clientName);

        if (q) {
            console.log(`✅ Queue encontrada: ${q.name}. Aplicando reducción...`);
            await queueMenu.set({
                ".id": q[".id"],
                "max-limit": "1k/1k",
                disabled: "no",
                comment: `InterRed | LIMITADO | ${clientName} | ${new Date().toLocaleString()}`
            });
            return { success: true, message: "Cliente reducido con éxito" };
        }

        // SI NO EXISTE -> CREAR
        console.log(`➕ No se encontró queue. Creando nueva para: ${clientName}`);
        await queueMenu.add({
            name: clientName.toUpperCase(),
            target: ip.includes('/') ? ip : `${ip}/32`,
            "max-limit": "1k/1k",
            disabled: "no",
            comment: `InterRed | LIMITADO | ${clientName} | Creado ${new Date().toLocaleString()}`
        });

        return { success: true, message: "Cliente creado y reducido" };
    });
}

// 🟢 ACTIVAR
export async function activateClient(config, ip, clientName = "Cliente") {
    if (!isValidIP(ip.split('/')[0])) return { success: false, message: 'IP inválida' };

    return withMikrotik(config, async (api) => {
        const queueMenu = api.menu('/queue/simple');
        const q = await getQueueByAnyMeans(queueMenu, ip, clientName);

        if (q) {
            console.log(`✅ Queue encontrada: ${q.name}. Activando servicio...`);
            await queueMenu.set({
                ".id": q[".id"],
                "max-limit": "0/0", // Ilimitado
                disabled: "no",
                comment: `InterRed | ACTIVO | ${new Date().toLocaleString()}`
            });

            return { success: true, message: "Cliente activado con éxito" };
        }

        return { success: false, message: "No se encontró la cola del cliente en MikroTik" };
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
