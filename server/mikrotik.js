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

// 🔴 REDUCIR
export async function reduceClient(config, ip, clientName = "Cliente") {
    if (!isValidIP(ip.split('/')[0])) return { success: false, message: 'IP inválida' };

    return withMikrotik(config, async (api) => {
        const queue = api.menu('/queue/simple');
        const target1 = ip;
        const target2 = ip + "/32";

        let q = await queue.where('target', target1).get();

        if (!q || q.length === 0) {
            q = await queue.where('target', target2).get();
        }

        if (!q || q.length === 0) {
            q = await queue.where('name', clientName.toUpperCase()).get();
        }

        if (q && q.length > 0) {
            await queue.set({
                ".id": q[0][".id"],
                "max-limit": "1k/1k",
                disabled: "no",
                comment: `InterRed | LIMITADO | ${clientName}`
            });

            return { success: true, message: "Cliente reducido" };
        }

        // SI NO EXISTE -> CREAR
        await queue.add({
            name: clientName.toUpperCase(),
            target: target2,
            "max-limit": "1k/1k",
            disabled: "no",
            comment: `InterRed | LIMITADO | ${clientName}`
        });

        return { success: true, message: "Cliente creado y reducido" };
    });
}

// 🟢 ACTIVAR
export async function activateClient(config, ip, clientName = "Cliente") {
    if (!isValidIP(ip.split('/')[0])) return { success: false, message: 'IP inválida' };

    return withMikrotik(config, async (api) => {
        const queue = api.menu('/queue/simple');
        const target1 = ip;
        const target2 = ip + "/32";

        let q = await queue.where('target', target1).get();

        if (!q || q.length === 0) {
            q = await queue.where('target', target2).get();
        }

        if (!q || q.length === 0) {
            q = await queue.where('name', clientName.toUpperCase()).get();
        }

        if (q && q.length > 0) {
            await queue.set({
                ".id": q[0][".id"],
                "max-limit": "0/0",
                disabled: "no",
                comment: `InterRed | ACTIVO | ${new Date().toLocaleDateString()}`
            });

            return { success: true, message: "Cliente activado" };
        }

        return { success: false, message: "No se encontró la cola para activar" };
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
        
        return {
            success: true,
            identity: identity?.[0]?.name || 'MikroTik',
            cpuLoad: resource?.[0]?.['cpu-load'] || '0',
            freeMemory: resource?.[0]?.['free-memory'] || '0',
            totalMemory: resource?.[0]?.['total-memory'] || '0',
            uptime: resource?.[0]?.uptime || '0s',
            version: resource?.[0]?.version || '',
            interfaces: (interfaces || []).map(i => ({
                name: i.name,
                type: i.type,
                disabled: i.disabled === 'true' || i.disabled === true,
                rxByte: i['rx-byte'] || '0',
                txByte: i['tx-byte'] || '0',
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
