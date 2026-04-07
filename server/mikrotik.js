import { RouterOSClient } from 'routeros-client';

function isValidIP(ip) {
    return /^(\d{1,3}\.){3}\d{1,3}$/.test(ip);
}

/**
 * Connects to MikroTik and executes a callback with the API handle.
 */
async function withMikrotik(config, callback) {
    const port = parseInt(config.port) || 9728;
    const api = new RouterOSClient({
        host: config.host,
        port: port,
        user: config.user,
        password: config.password,
        keepalive: false
    });

    try {
        console.log(`📡 Conectando a MikroTik en ${config.host}:${port}...`);
        const client = await api.connect();
        const result = await callback(client);
        await api.close();
        return result;
    } catch (error) {
        console.error(`❌ MikroTik ERROR en ${config.host}:`, error.message);
        try { await api.close(); } catch (e) {}
        return { success: false, message: error.message };
    }
}

export async function suspendClient(config, ip, clientName = 'Desconocido') {
    if (!isValidIP(ip)) throw new Error('IP inválida');
    const cleanIp = ip.split('/')[0];
    const targetIp = ip.includes('/') ? ip : `${ip}/32`;

    return withMikrotik(config, async (api) => {
        const queueMenu = api.menu('/queue/simple');
        
        console.log(`🔍 Iniciando búsqueda para: ${clientName} (${cleanIp})`);

        // 1. INTENTO POR IP (El más preciso)
        let queues = await queueMenu.where('target', targetIp).get();

        if (queues && queues.length > 0) {
            console.log(`✅ Cliente encontrado por IP: ${queues[0].name}`);
        } else {
            // 2. INTENTO POR NOMBRE (Respaldo)
            console.log(`⚠️ No se encontró por IP, intentando por nombre exacto: ${clientName}`);
            queues = await queueMenu.where('name', clientName).get();
        }

        // 3. INTENTO POR NOMBRE PARCIAL (Último recurso)
        if (!queues || queues.length === 0) {
            console.log(`🔎 Buscando coincidencias parciales de nombre...`);
            const allQueues = await queueMenu.get();
            queues = (allQueues || []).filter(q => q.name && q.name.toLowerCase().includes(clientName.toLowerCase()));
        }

        if (queues && queues.length > 0) {
            try {
                // Una vez encontrado, lo metemos a la lista de morosos para el límite de 1k
                await api.menu('/ip/firewall/address-list').add({
                    list: config.addressListName || 'morosos',
                    address: cleanIp,
                    comment: `Corte Automático: ${clientName}`
                });

                return { 
                    success: true, 
                    message: `Servicio reducido para ${queues[0].name} (Encontrado por ${queues[0].target.includes(cleanIp) ? 'IP' : 'Nombre'})` 
                };
            } catch (error) {
                if (error.message && error.message.includes("already exists")) {
                    return { 
                        success: true, 
                        message: `Servicio reducido para ${queues[0].name} (Ya estaba limitado)` 
                    };
                }
                throw error;
            }
        } else {
            throw new Error(`Imposible encontrar al cliente. Verificá que la IP ${cleanIp} o el nombre coincidan en el MikroTik.`);
        }
    });
}

export async function activateClient(config, ip) {
    if (!isValidIP(ip)) throw new Error('IP inválida');
    const cleanIp = ip.split('/')[0];

    return withMikrotik(config, async (api) => {
        const addressListMenu = api.menu('/ip/firewall/address-list');
        const listName = config.addressListName || 'morosos';
        const results = await addressListMenu.where('address', cleanIp).where('list', listName).get();

        if (results.length === 0) {
            // No estaba en la lista, consideramos que está activo
            return { success: true, message: `El cliente ya estaba activo` };
        }

        const itemId = results[0]['.id'];
        await addressListMenu.remove(itemId);

        return { 
            success: true, 
            action: 'activated', 
            ip, 
            message: `Servicio restaurado (Removido de morosos).` 
        };
    });
}

// ---- Name Based Control (New Logic) ----

export async function suspendQueueByName(config, name, clientName = 'Desconocido') {
    if (!name) throw new Error('Nombre de queue requerido');

    return withMikrotik(config, async (api) => {
        const queueMenu = api.menu('/queue/simple');
        const results = await queueMenu.where('name', name).get();

        if (results.length === 0) {
            return { success: false, message: `No se encontró Simple Queue con nombre: ${name}` };
        }

        const queueId = results[0]['.id'];
        await queueMenu.set({
            '.id': queueId,
            disabled: 'no',
            comment: `InterRed | LIMITADO | ${clientName} | ${new Date().toLocaleString()}`
        });

        return { 
            success: true, 
            action: 'suspended', 
            name, 
            message: `Queue ${name} limitada exitosamente.` 
        };
    });
}

export async function activateQueueByName(config, name) {
    if (!name) throw new Error('Nombre de queue requerido');

    return withMikrotik(config, async (api) => {
        const queueMenu = api.menu('/queue/simple');
        const results = await queueMenu.where('name', name).get();

        if (results.length === 0) {
            return { success: false, message: `No se encontró Simple Queue con nombre: ${name}` };
        }

        const queueId = results[0]['.id'];
        await queueMenu.set({
            '.id': queueId,
            disabled: 'yes',
            comment: `InterRed | ACTIVO | ${new Date().toLocaleString()}`
        });

        return { 
            success: true, 
            action: 'activated', 
            name, 
            message: `Queue ${name} activada exitosamente.` 
        };
    });
}

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

export async function getMorososList(config) {
    return withMikrotik(config, async (api) => {
        const addressListMenu = api.menu('/ip/firewall/address-list');
        const listName = config.addressListName || 'morosos';
        const results = await addressListMenu.where('list', listName).get();

        const suspended = (results || []).map(item => ({
            id: item['.id'],
            name: item.comment || 'Desconocido', // guardamos el nombre en comment
            target: item.address,
            comment: item.comment
        }));

        return { success: true, count: suspended.length, clients: suspended };
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

export async function updateClientQueue(config, clientIp, clientName, action) {
    if (!clientIp) throw new Error('IP de cliente requerida');
    
    return withMikrotik(config, async (api) => {
        const queueMenu = api.menu('/queue/simple');
        const ahora = new Date().toLocaleString('es-AR');
        
        // 1. Buscamos la cola (Prioridad IP, luego Nombre)
        const targetIp = clientIp.includes('/') ? clientIp : `${clientIp}/32`;
        let queues = await queueMenu.where('target', targetIp).get();

        if (!queues || queues.length === 0) {
            queues = await queueMenu.where('name', clientName).get();
        }

        if (queues && queues.length > 0) {
            const queueId = queues[0]['.id'];
            const esCorte = action === 'suspend';
            
            // 2. Definimos el formato del comentario que pediste
            // Ej: InterRed | LIMITADO | CECILIA | 30/3/2026, 2:00:16
            const estado = esCorte ? 'LIMITADO' : 'ACTIVO';
            const clientNameUpper = clientName ? clientName.toUpperCase() : 'DESCONOCIDO';
            const nuevoComentario = `InterRed | ${estado} | ${clientNameUpper} | ${ahora}`;

            // 3. Aplicamos el cambio en la Simple Queue
            await queueMenu.set({
                '.id': queueId,
                disabled: esCorte ? 'yes' : 'no',
                comment: nuevoComentario
            });

            console.log(`✅ ${clientNameUpper} marcado como ${estado}`);
            return { success: true, action: action, message: `Cliente ${estado} con éxito` };
        } else {
            throw new Error("No se encontró la cola del cliente en el MikroTik");
        }
    });
}
