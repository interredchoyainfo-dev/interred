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

async function findQueue(queueMenu, ip) {
    const cleanIP = ip.split('/')[0].trim();
    const targetExact = `${cleanIP}/32`;
    const name = `IP_${cleanIP}`;

    let queues = [];
    try {
        queues = await queueMenu.get();
        if (!queues) return null;
    } catch { return null; }

    return queues.find(q => {
        let qTarget = (q.target || '').trim();
        if (!qTarget.includes('/')) qTarget = `${qTarget}/32`;

        return (
            qTarget === targetExact ||
            q.name === name
        );
    });
}

// 🛠️ Función unificada para gestionar el estado de la cola
async function handleQueue(api, ip, clientName, shouldBeActive) {
    const queueMenu = api.menu('/queue/simple');
    const cleanIP = ip.split('/')[0].trim();
    const target = `${cleanIP}/32`;
    const now = new Date().toLocaleString('es-AR');
    
    // Buscamos si ya existe
    const existing = await findQueue(queueMenu, cleanIP);

    if (shouldBeActive) {
        // 🔴 MODO REDUCIDO (La cola debe existir y estar ENABLED)
        const queueData = {
            name: `IP_${cleanIP}`,
            target: target,
            "max-limit": "1k/1k",
            comment: `REDUCIDO: ${clientName} - ${now}`
        };

        if (existing) {
            await queueMenu.set({ ".id": existing['.id'], ...queueData });
            await queueMenu.enable({ ".id": existing['.id'] });
        } else {
            await queueMenu.add(queueData);
        }
        return { success: true, message: 'Servicio reducido (1k/1k)' };
    } else {
        // 🟢 MODO ACTIVO (La cola debe estar DISABLED para no limitar)
        if (existing) {
            await queueMenu.set({
                ".id": existing['.id'],
                comment: `ACTIVO: ${clientName} - ${now}`
            });
            await queueMenu.disable({ ".id": existing['.id'] });
            return { success: true, message: 'Servicio liberado' };
        }
        // Si no existe y el cliente está activo, no hace falta crearla 
        // porque el cliente ya navega libre sin cola.
        return { success: true, message: 'Cliente ya navega libre (sin cola)' };
    }
}

// 🔴 REDUCIR (Crea/Habilita la cola a 1k/1k)
export async function reduceClient(config, ip, clientName = "Cliente") {
    if (!isValidIP(ip.split('/')[0])) return { success: false, message: 'IP inválida' };

    return withMikrotik(config, async (api) => {
        return await handleQueue(api, ip, clientName, true);
    });
}

// 🟢 ACTIVAR (Deshabilita la cola)
export async function activateClient(config, ip, clientName = "Cliente") {
    if (!isValidIP(ip.split('/')[0])) return { success: false, message: 'IP inválida' };

    return withMikrotik(config, async (api) => {
        return await handleQueue(api, ip, clientName, false);
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
export async function updateClientQueue(config, ip, clientName, action) {
    if (action === 'suspend' || action === 'reduce' || action === 'enable') {
        return reduceClient(config, ip, clientName);
    } else {
        return activateClient(config, ip, clientName);
    }
}
export async function syncClientsWithMikrotik(config, clients, morosos) {
    return withMikrotik(config, async (api) => {
        const queueMenu = api.menu('/queue/simple');
        const queues = await queueMenu.get();
        let actions = [];

        for (const client of clients) {
            if (!client.ip || client.ip === "0.0.0.0") continue;

            const cleanIP = client.ip.split('/')[0].trim();
            const target = `${cleanIP}/32`;

            const isMoroso = morosos.some(m => m.clientId === client.id) || client.estado === 'Deudor';

            const existing = queues.find(q => {
                let qTarget = (q.target || '').trim();
                if (!qTarget.includes('/')) qTarget = `${qTarget}/32`;
                return qTarget === target;
            });

            // 🔴 MOROSO → DEBE TENER QUEUE ACTIVA
            if (isMoroso) {
                if (existing) {
                    // asegurar estado
                    await queueMenu.enable({ ".id": existing['.id'] });
                    await queueMenu.set({
                        ".id": existing['.id'],
                        "max-limit": "1k/1k",
                        comment: `SYNC: MOROSO | ${new Date().toLocaleDateString()}`
                    });
                    actions.push(`✔ ${cleanIP} limitado`);
                } else {
                    await queueMenu.add({
                        name: `IP_${cleanIP}`,
                        target: target,
                        "max-limit": "1k/1k",
                        comment: `SYNC: MOROSO`
                    });
                    actions.push(`➕ ${cleanIP} creado y limitado`);
                }
            }
            // 🟢 ACTIVO → NO DEBE LIMITAR
            else {
                if (existing) {
                    await queueMenu.disable({ ".id": existing['.id'] });
                    actions.push(`🟢 ${cleanIP} liberado`);
                }
            }
            // Pequeña espera para no saturar CPU del router
            await new Promise(r => setTimeout(r, 300));
        }

        // 💣 BONUS: LIMPIEZA AUTOMÁTICA
        for (const q of queues) {
            const qTarget = (q.target || '').split('/')[0].trim();
            const existsInClients = clients.some(c => {
                const ip = (c.ip || '').split('/')[0].trim();
                return ip === qTarget;
            });

            if (!existsInClients && !q.dynamic) {
                try {
                    await queueMenu.remove(q['.id']);
                    actions.push(`🗑 Queue eliminada (${q.name || q.target})`);
                } catch (e) {
                    console.error(`Error removing orphan queue ${q.name}:`, e.message);
                }
            }
        }

        return {
            success: true,
            message: "Sync completado",
            actions
        };
    });
}
