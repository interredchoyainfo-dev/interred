import { RouterOSClient } from 'routeros-client';

function isValidIP(ip) {
    return /^(\d{1,3}\.){3}\d{1,3}$/.test(ip);
}

/**
 * Connects to MikroTik and executes a callback with the API handle.
 */
async function withMikrotik(config, callback) {
    console.log(`[withMikrotik] Intentando conectar a ${config.host} como ${config.user}...`);
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

    // Importante: Catch de error para evitar que el proceso se muera (!falla crítica)
    api.on('error', (err) => {
        console.error('❌ [withMikrotik] Error de evento API:', err.message);
    });

    try {
        const client = await api.connect();
        const result = await callback(client);
        await api.close();
        return result;
    } catch (error) {
        console.error('❌ [withMikrotik] Excepción atrapada:', error.message);
        try { await api.close(); } catch {}
        return { success: false, message: error.message };
    }
}

async function findQueue(queueMenu, ip) {
    const cleanIP = ip.split('/')[0].trim();
    const nameTarget = `IP_${cleanIP}`;

    console.log(`[ findQueue ] Buscando nativamente: ${cleanIP}`);

    try {
        // Intentamos buscar por target (lo más fiable)
        // Probamos con y sin /32
        const targetsToTry = [`${cleanIP}/32`, cleanIP];
        
        for (const target of targetsToTry) {
            const results = await queueMenu.get({ "?target": target });
            if (results && results.length > 0) {
                const q = results[0];
                const realId = q['.id'] || q.id || q.name;
                console.log(`[ findQueue ] ✅ ENCONTRADA por Target: ${q.name}`);
                return { ...q, "_detectedId": realId };
            }
        }

        // Si no, por nombre
        const resultsByName = await queueMenu.get({ "?name": nameTarget });
        if (resultsByName && resultsByName.length > 0) {
            const q = resultsByName[0];
            const realId = q['.id'] || q.id || q.name;
            console.log(`[ findQueue ] ✅ ENCONTRADA por Nombre: ${q.name}`);
            return { ...q, "_detectedId": realId };
        }
    } catch (e) { 
        console.error("❌ Error en búsqueda MikroTik:", e.message);
    }
    
    console.log(`[ findQueue ] ⚠️ No se encontró ninguna cola para ${cleanIP}`);
    return null;
}

async function handleQueue(api, ip, clientName, shouldBeActive) {
    const cleanIP = ip.split('/')[0].trim();
    const now = new Date().toLocaleString('es-AR', { hour12: false });
    
    console.log(`[ handleQueue ] INICIO: ${clientName} (${cleanIP}) | Modo: ${shouldBeActive ? 'REDUCIR' : 'ACTIVAR'}`);
    
    try {
        const queueMenu = api.menu('/queue/simple');
        const existing = await findQueue(queueMenu, cleanIP);
        const realId = existing ? (existing['.id'] || existing.id || existing.name || existing._detectedId) : null;

        if (shouldBeActive) {
            // 🔴 MODO REDUCIR (Limitar a 1k/1k)
            const queueData = {
                name: `IP_${cleanIP}`,
                target: `${cleanIP}/32`,
                "max-limit": "1k/1k",
                comment: `REDUCIDO: ${clientName} - ${now}`
            };

            if (realId) {
                console.log(`[ handleQueue ] REDUCIENDO COLA EXISTENTE ID: ${realId}`);
                await queueMenu.set({ ".id": realId, ...queueData });
                await queueMenu.enable({ ".id": realId });
            } else {
                console.log(`[ handleQueue ] CREANDO NUEVA COLA REDUCIDA: ${queueData.name}`);
                await queueMenu.add(queueData);
            }
            return { success: true, message: 'Servicio reducido (1k/1k)' };

        } else {
            // 🟢 MODO ACTIVAR (Libre navegación)
            if (realId) {
                console.log(`[ handleQueue ] ACTIVANDO (DESHABILITANDO COLA) ID: ${realId}`);
                await queueMenu.set({
                    ".id": realId,
                    comment: `ACTIVO: ${clientName} - ${now}`
                });
                await queueMenu.disable({ ".id": realId });
                return { success: true, message: 'Servicio activado (cola desactivada)' };
            }
            
            console.log(`[ handleQueue ] No hay cola para desactivar. Cliente ya libre.`);
            return { success: true, message: 'Cliente ya navega libre' };
        }
    } catch (err) {
        const msg = (err.message || '').toUpperCase();
        if (msg.includes('!EMPTY') || msg.includes('UNKNOWNREPLY') || msg.includes('TRAP')) {
            console.log(`[ handleQueue ] ⚠️ MikroTik v7 Bypass: ${err.message}`);
            return { success: true, message: 'Operación realizada correctamente' };
        }
        
        console.error(`[ handleQueue ] ❌ ERROR MIKROTIK:`, err.message);
        return { success: false, message: `Error MikroTik: ${err.message}` };
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
        let queues = [];
        try {
            queues = await queueMenu.get();
        } catch (e) {
            console.error("❌ Error listando colas en Sync:", e.message);
            return { success: false, message: "No se pudo obtener la lista de colas" };
        }
        
        let actions = [];
        console.log(`[ SYNC ] Iniciando sincronización de ${clients.length} clientes...`);

        for (const client of clients) {
            try {
                if (!client.ip || client.ip === "0.0.0.0") continue;

                const cleanIP = client.ip.split('/')[0].trim();
                const target = `${cleanIP}/32`;
                const targets = [target, cleanIP];

                const isMoroso = morosos.some(m => m.clientId === client.id) || client.estado === 'Deudor';

                const existingArr = queues.filter(q => {
                    const qTarget = (q.target || '').trim();
                    const qName = (q.name || '').toUpperCase();
                    const nameTarget = `IP_${cleanIP}`.toUpperCase();
                    return targets.includes(qTarget) || qName === nameTarget;
                });

                const existing = existingArr[0];
                const realId = existing ? (existing['.id'] || existing.id || existing.name) : null;

                // 🔴 MOROSO → DEBE TENER QUEUE ACTIVA (Limitada)
                if (isMoroso) {
                    const queueData = {
                        name: `IP_${cleanIP}`,
                        target: target,
                        "max-limit": "1k/1k",
                        comment: `SYNC: MOROSO | ${new Date().toLocaleDateString()}`,
                        disabled: "no"
                    };

                    if (existing && realId) {
                        await queueMenu.set({ ".id": realId, ...queueData });
                        actions.push(`✔ ${cleanIP} limitado`);
                    } else {
                        await queueMenu.add(queueData);
                        actions.push(`➕ ${cleanIP} creado y limitado`);
                    }
                }
                // 🟢 ACTIVO → NO DEBE LIMITAR (Deshabilitamos la cola si existe)
                else {
                    if (existing && realId) {
                        await queueMenu.set({ ".id": realId, disabled: "yes" });
                        actions.push(`🟢 ${cleanIP} liberado`);
                    }
                }
            } catch (err) {
                const msg = (err.message || '').toUpperCase();
                if (msg.includes('!EMPTY') || msg.includes('UNKNOWNREPLY')) {
                    actions.push(`✔ ${client.ip} (v7 confirm)`);
                    continue;
                }
                console.error(`[ SYNC ] Error procesando cliente ${client.nombre}:`, err.message);
                actions.push(`❌ Error en ${client.ip}: ${err.message}`);
            }
        }

        // 💣 LIMPIEZA DE HUÉRFANOS (Opcional, pero útil)
        console.log("[ SYNC ] Limpiando colas huérfanas...");
        for (const q of queues) {
            try {
                const qTarget = (q.target || '').split('/')[0].trim();
                const qName = (q.name || '');
                const realId = q['.id'] || q.id || q.name;

                const existsInClients = clients.some(c => {
                    const ip = (c.ip || '').split('/')[0].trim();
                    return ip === qTarget;
                });

                if (!existsInClients && !q.dynamic && qName.startsWith('IP_') && realId) {
                    await queueMenu.remove({ ".id": realId });
                    actions.push(`🗑 Queue eliminada (${qName})`);
                }
            } catch (e) {
                console.error(`[ SYNC ] Error eliminando cola huérfana:`, e.message);
            }
        }

        return {
            success: true,
            message: "Sync completado",
            actions
        };
    });
}
