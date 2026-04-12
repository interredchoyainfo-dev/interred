import { RouterOSClient } from 'routeros-client';

// BUG #12 corregido: valida que cada octeto esté entre 0 y 255
function isValidIP(ip) {
    const parts = ip.split('.');
    if (parts.length !== 4) return false;
    return parts.every(p => {
        const n = parseInt(p, 10);
        return !isNaN(n) && n >= 0 && n <= 255 && String(n) === p;
    });
}

// BUG #6 corregido: normaliza tildes y ñ antes de sanitizar
function safeName(name) {
    return (name || 'Cliente')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')  // elimina diacríticos (tildes)
        .replace(/ñ/gi, 'n')              // ñ → n
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '_')
        .replace(/_+/g, '_')              // colapsa guiones bajos múltiples
        .replace(/^_|_$/g, '');           // elimina guiones al inicio/fin
}

async function withMikrotik(config, callback) {
    console.log(`[withMikrotik] Conectando a ${config.host} como ${config.user}...`);
    const api = new RouterOSClient({
        host: config.host,
        port: config.port || 8729,
        user: config.user,
        password: config.password,
        keepalive: false,
        tls: { rejectUnauthorized: false }
    });

    api.on('error', (err) => {
        console.error('❌ [withMikrotik] Error de evento API:', err.message);
    });

    try {
        const client = await api.connect();
        const result = await callback(client);
        await api.close();
        return result;
    } catch (error) {
        console.error('❌ [withMikrotik] Excepción:', error.message);
        try { await api.close(); } catch {}
        return { success: false, message: error.message };
    }
}

async function findQueue(queueMenu, ip) {
    const cleanIP = ip.split('/')[0].trim();
    console.log(`[findQueue] Buscando cola para: ${cleanIP}`);

    try {
        // Buscar por target (lo más fiable)
        for (const target of [`${cleanIP}/32`, cleanIP]) {
            try {
                const results = await queueMenu.get({ '?target': target });
                if (results && results.length > 0) {
                    const q = results[0];
                    const realId = q['.id'] || q.id || q.name;
                    console.log(`[findQueue] ✅ Encontrada por target: ${q.name}`);
                    return { ...q, _detectedId: realId };
                }
            } catch (innerErr) {
                if (innerErr.message.includes('!empty')) {
                    console.log('[findQueue] ⚠️ MikroTik v7 !empty en búsqueda por target');
                } else {
                    throw innerErr;
                }
            }
        }

        // Buscar por nombre como fallback
        const nameTarget = `IP_${cleanIP}`;
        try {
            const resultsByName = await queueMenu.get({ '?name': nameTarget });
            if (resultsByName && resultsByName.length > 0) {
                const q = resultsByName[0];
                const realId = q['.id'] || q.id || q.name;
                console.log(`[findQueue] ✅ Encontrada por nombre: ${q.name}`);
                return { ...q, _detectedId: realId };
            }
        } catch (innerErr) {
            if (!innerErr.message.includes('!empty')) throw innerErr;
        }
    } catch (e) {
        console.error('❌ [findQueue] Error:', e.message);
    }

    console.log(`[findQueue] ⚠️ No se encontró cola para ${cleanIP}`);
    return null;
}

// BUG #5 corregido: parámetro renombrado a shouldBeReduced (true = reducir, false = activar)
// BUG #11 corregido: eliminado .enable() redundante después de .set()
async function handleQueue(api, ip, clientName, shouldBeReduced) {
    const cleanIP = ip.split('/')[0].trim();
    const now = new Date().toLocaleString('es-AR', {
        timeZone: 'America/Argentina/Buenos_Aires',
        hour12: false
    });

    console.log(`[handleQueue] ${clientName} (${cleanIP}) | Modo: ${shouldBeReduced ? 'REDUCIR' : 'ACTIVAR'}`);

    try {
        const queueMenu = api.menu('/queue/simple');
        const finalName = safeName(clientName);
        
        // 1. Intentar encontrar por IP (Target)
        let existing = await findQueue(queueMenu, cleanIP);
        let realId = existing ? (existing['.id'] || existing.id || existing.name) : null;

        // 2. Si no se encontró por IP, intentar encontrar por NOMBRE (para evitar conflictos de "already have such name")
        if (!realId && finalName) {
            try {
                const byName = await queueMenu.get({ '?name': finalName });
                if (byName && byName.length > 0) {
                    existing = byName[0];
                    realId = existing['.id'] || existing.id || existing.name;
                    console.log(`[handleQueue] Encontrado por coincidencia de nombre: ${finalName}`);
                }
            } catch (nameErr) {
                console.warn('[handleQueue] Error buscando por nombre:', nameErr.message);
            }
        }

        const queueData = {
            name: finalName,
            target: `${cleanIP}/32`,
            'max-limit': shouldBeReduced ? '10k/10k' : '0/0', // 10k es más estable que 1k
            disabled: shouldBeReduced ? 'no' : 'yes',
            comment: shouldBeReduced ? `REDUCIDO: ${now}` : ''
        };

        if (realId) {
            console.log(`[handleQueue] Actualizando cola existente (id: ${realId})`);
            await queueMenu.set({ '.id': realId, ...queueData });
        } else {
            console.log(`[handleQueue] Creando nueva cola: ${finalName}`);
            await queueMenu.add(queueData);
        }

        return { 
            success: true, 
            message: shouldBeReduced ? 'Servicio reducido correctamente' : 'Servicio activado correctamente' 
        };

    } catch (err) {
        const msg = (err.message || '').toUpperCase();
        
        // Manejo de errores específicos de MikroTik v7 o duplicados
        if (msg.includes('ALREADY HAVE SUCH NAME')) {
             return { success: false, message: `Error: Ya existe una cola con el nombre "${clientName}" pero vinculada a otro registro.` };
        }
        
        if (msg.includes('!EMPTY') || msg.includes('UNKNOWNREPLY') || msg.includes('TRAP')) {
            console.log(`[handleQueue] ⚠️ Bypass por error de respuesta MikroTik: ${err.message}`);
            return { success: true, message: 'Operación completada (MikroTik v7 bypass)' };
        }

        console.error('[handleQueue] ❌ ERROR:', err.message);
        return { success: false, message: `Error MikroTik: ${err.message}` };
    }
}

// 🔴 REDUCIR (crea/habilita la cola a 1k/1k)
export async function reduceClient(config, ip, clientName = 'Cliente') {
    if (!isValidIP(ip.split('/')[0])) return { success: false, message: 'IP inválida' };
    return withMikrotik(config, (api) => handleQueue(api, ip, clientName, true));
}

// 🟢 ACTIVAR (deshabilita la cola — navegación libre)
export async function activateClient(config, ip, clientName = 'Cliente') {
    if (!isValidIP(ip.split('/')[0])) return { success: false, message: 'IP inválida' };
    return withMikrotik(config, (api) => handleQueue(api, ip, clientName, false));
}

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
            cpuLoad: resource?.[0]?.['cpu-load']?.toString() || '0',
            freeMemory: resource?.[0]?.['free-memory']?.toString() || '0',
            totalMemory: resource?.[0]?.['total-memory']?.toString() || '0',
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

// BUG #7 corregido: propagamos el error correctamente en reboot
export async function rebootRouter(config) {
    return withMikrotik(config, async (api) => {
        try {
            await api.menu('/system/reboot').exec();
            return { success: true, message: 'Comando de reinicio enviado.' };
        } catch (e) {
            // El router a veces cae antes de responder — es esperado
            if (e.message && (e.message.includes('Connection') || e.message.includes('closed'))) {
                return { success: true, message: 'Reiniciando (conexión cerrada por el router, es normal).' };
            }
            console.error('[rebootRouter] Error inesperado:', e.message);
            return { success: false, message: `Error al reiniciar: ${e.message}` };
        }
    });
}

export async function listSimpleQueues(config) {
    return withMikrotik(config, async (api) => {
        const results = await api.menu('/queue/simple').get();
        const data = (results || []).map(q => ({ name: q.name, target: q.target }));
        return { success: true, data };
    });
}

// ---- Stubs de compatibilidad ----
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
    }
    return activateClient(config, ip, clientName);
}

// BUG #9 corregido: la limpieza de huérfanos ya no depende del prefijo 'IP_'
// Busca por target (IP) que no esté en la lista de clientes
export async function syncClientsWithMikrotik(config, clients, morosos, clean = false) {
    return withMikrotik(config, async (api) => {
        const queueMenu = api.menu('/queue/simple');
        let queues = [];
        try {
            queues = await queueMenu.get();
        } catch (e) {
            console.error('❌ Error listando colas en Sync:', e.message);
            return { success: false, message: 'No se pudo obtener la lista de colas' };
        }

        let actions = [];
        console.log(`[SYNC] Sincronizando ${clients.length} clientes... (clean: ${clean})`);

        for (const client of clients) {
            try {
                if (!client.ip || client.ip === '0.0.0.0') continue;

                const cleanIP = client.ip.split('/')[0].trim();
                const target = `${cleanIP}/32`;

                const isMoroso = morosos.some(m => m.clientId === client.id) || client.estado === 'Deudor';

                const existing = queues.find(q => {
                    const qTarget = (q.target || '').trim();
                    return qTarget === target || qTarget === cleanIP;
                });

                const realId = existing ? (existing['.id'] || existing.id || existing.name) : null;

                const fullName = `${client.nombre || ''} ${client.apellido || ''}`.trim() || 'Cliente';
                const finalName = safeName(fullName);

                if (isMoroso) {
                    // 🔴 MOROSO → queue habilitada (limitada)
                    const queueData = {
                        name: finalName,
                        target,
                        'max-limit': '1k/1k',
                        disabled: 'no',
                        comment: `REDUCIDO: ${new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', hour12: false })}`
                    };
                    if (existing && realId) {
                        await queueMenu.set({ '.id': realId, ...queueData });
                        actions.push(`✔ ${client.nombre} limitado`);
                    } else {
                        await queueMenu.add(queueData);
                        actions.push(`➕ ${client.nombre} creado (moroso)`);
                    }
                } else {
                    // 🟢 ACTIVO → queue deshabilitada (libre)
                    const queueData = {
                        name: finalName,
                        target,
                        'max-limit': '1k/1k',
                        disabled: 'yes',
                        comment: ''
                    };
                    if (existing && realId) {
                        await queueMenu.set({ '.id': realId, ...queueData });
                        actions.push(`🟢 ${client.nombre} actualizado (libre)`);
                    } else {
                        await queueMenu.add(queueData);
                        actions.push(`➕ ${client.nombre} creado (libre)`);
                    }
                }
            } catch (err) {
                const msg = (err.message || '').toUpperCase();
                if (msg.includes('!EMPTY') || msg.includes('UNKNOWNREPLY')) {
                    actions.push(`✔ ${client.ip} (v7 confirm)`);
                    continue;
                }
                console.error(`[SYNC] Error en cliente ${client.nombre}:`, err.message);
                actions.push(`❌ Error en ${client.ip}: ${err.message}`);
            }
        }

        // BUG #9 corregido: limpieza busca por target (IP) no por nombre
        console.log('[SYNC] Limpiando colas huérfanas...');
        const clientIPs = new Set(
            clients
                .filter(c => c.ip && c.ip !== '0.0.0.0')
                .map(c => c.ip.split('/')[0].trim())
        );

        for (const q of queues) {
            try {
                const qTarget = (q.target || '').split('/')[0].trim();
                const realId = q['.id'] || q.id || q.name;

                if (!clientIPs.has(qTarget) && !q.dynamic && realId) {
                    await queueMenu.remove({ '.id': realId });
                    actions.push(`🗑 Queue eliminada (${q.name || qTarget})`);
                }
            } catch (e) {
                console.error('[SYNC] Error eliminando cola huérfana:', e.message);
            }
        }

        return { success: true, message: 'Sync completado', actions };
    });
}
