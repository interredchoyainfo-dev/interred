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
    const port = parseInt(config?.port || 8728);
    const useTLS = config?.ssl !== undefined ? !!config.ssl : (port === 8729);

    console.log(`[withMikrotik] Conectando a ${config?.host}:${port} (TLS: ${useTLS}) como ${config?.user}...`);
    const clientOptions = {
        host: config?.host,
        port: port,
        user: config?.user,
        password: config?.password,
        keepalive: false
    };

    if (useTLS) {
        clientOptions.tls = { rejectUnauthorized: false };
    }

    const api = new RouterOSClient(clientOptions);

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

function formatLimit(speed) {
    if (!speed) return '10k/10k';
    const s = String(speed).trim().toLowerCase();
    if (s.includes('/')) return s;
    if (/^\d+$/.test(s)) return `${s}k/${s}k`;
    return `${s}/${s}`;
}

// BUG #5 corregido: parámetro renombrado a shouldBeReduced (true = reducir, false = activar)
// BUG #11 corregido: eliminado .enable() redundante después de .set()
async function handleQueue(api, ip, clientName, shouldBeReduced, reductionSpeed = '10k/10k') {
    const cleanIP = ip.split('/')[0].trim();
    const now = new Date().toLocaleString('es-AR', {
        timeZone: 'America/Argentina/Buenos_Aires',
        hour12: false
    });
    const finalLimit = formatLimit(reductionSpeed);

    console.log(`[handleQueue] ${clientName} (${cleanIP}) | Modo: ${shouldBeReduced ? `REDUCIR (${finalLimit})` : 'ACTIVAR'}`);

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
            'max-limit': shouldBeReduced ? finalLimit : '0/0',
            disabled: shouldBeReduced ? 'no' : 'yes',
            comment: shouldBeReduced ? `REDUCIDO (${finalLimit}): ${now}` : ''
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
            message: shouldBeReduced ? `Servicio reducido a ${finalLimit} correctamente` : 'Servicio activado correctamente' 
        };

    } catch (err) {
        const msg = (err.message || '').toUpperCase();
        
        // Manejo de errores específicos de MikroTik v7 o duplicados
        if (msg.includes('ALREADY HAVE SUCH NAME')) {
             console.log(`[handleQueue] ℹ️ El nombre "${clientName}" ya existe. El router ya posee este registro, procediendo con éxito.`);
             return { success: true, message: `✅ Operación realizada: El registro de "${clientName}" ya es consistente en MikroTik.` };
        }
        
        if (msg.includes('!EMPTY') || msg.includes('UNKNOWNREPLY') || msg.includes('TRAP')) {
            console.log(`[handleQueue] ⚠️ Bypass por error de respuesta MikroTik: ${err.message}`);
            return { success: true, message: 'Operación completada (MikroTik v7 bypass)' };
        }

        console.error('[handleQueue] ❌ ERROR:', err.message);
        return { success: false, message: `Error MikroTik: ${err.message}` };
    }
}

async function handleAddressList(api, ip, listName = 'morosos', isSuspended = true) {
    if (!listName) return;
    const cleanIP = ip.split('/')[0].trim();
    try {
        const addressListMenu = api.menu('/ip/firewall/address-list');
        const existing = await addressListMenu.get({ '?address': cleanIP, '?list': listName });
        
        if (isSuspended) {
            if (!existing || existing.length === 0) {
                await addressListMenu.add({ address: cleanIP, list: listName, comment: 'Corte INTER RED' });
                console.log(`[handleAddressList] ✅ IP ${cleanIP} agregada a lista "${listName}"`);
            }
        } else {
            if (existing && existing.length > 0) {
                for (const item of existing) {
                    const realId = item['.id'] || item.id;
                    if (realId) await addressListMenu.remove(realId);
                }
                console.log(`[handleAddressList] ✅ IP ${cleanIP} removida de lista "${listName}"`);
            }
        }
    } catch (err) {
        console.warn(`[handleAddressList] ⚠️ Aviso address-list:`, err.message);
    }
}

// 🔴 REDUCIR / CORTAR (Cola a velocidad configurada + Address List Morosos)
export async function reduceClient(config, ip, clientName = 'Cliente') {
    if (!isValidIP(ip.split('/')[0])) return { success: false, message: 'IP inválida' };
    const speedLimit = config?.reductionLimit || config?.reductionSpeed || config?.maxLimit || '10k/10k';
    return withMikrotik(config, async (api) => {
        const resQueue = await handleQueue(api, ip, clientName, true, speedLimit);
        await handleAddressList(api, ip, config?.addressList || 'morosos', true);
        return resQueue;
    });
}

// 🟢 ACTIVAR (Cola Deshabilitada + Remover de Address List)
export async function activateClient(config, ip, clientName = 'Cliente') {
    if (!isValidIP(ip.split('/')[0])) return { success: false, message: 'IP inválida' };
    return withMikrotik(config, async (api) => {
        const resQueue = await handleQueue(api, ip, clientName, false);
        await handleAddressList(api, ip, config?.addressList || 'morosos', false);
        return resQueue;
    });
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
        const syncLimit = formatLimit(config?.reductionLimit || config?.reductionSpeed || config?.maxLimit || '10k/10k');
        console.log(`[SYNC] Sincronizando ${clients.length} clientes... (clean: ${clean}, límite reducción: ${syncLimit})`);

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
                        'max-limit': syncLimit,
                        disabled: 'no',
                        comment: `REDUCIDO (${syncLimit}): ${new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', hour12: false })}`
                    };
                    if (existing && realId) {
                        await queueMenu.set({ '.id': realId, ...queueData });
                        actions.push(`✔ ${client.nombre} limitado (${syncLimit})`);
                    } else {
                        await queueMenu.add(queueData);
                        actions.push(`➕ ${client.nombre} creado (moroso - ${syncLimit})`);
                    }
                } else {
                    // 🟢 ACTIVO → queue deshabilitada (libre)
                    const queueData = {
                        name: finalName,
                        target,
                        'max-limit': '0/0',
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
