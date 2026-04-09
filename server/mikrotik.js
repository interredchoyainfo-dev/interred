import { RouterOSClient } from 'routeros-client';

function isValidIP(ip) {
    return /^(\d{1,3}\.){3}\d{1,3}$/.test(ip);
}

/**
 * Connects to MikroTik and executes a callback with the API handle.
 */
async function withMikrotik(config, callback) {
    const port = parseInt(config.port) || 8728;
    const api = new RouterOSClient({
        host: config.host,
        port: port,
        user: config.user,
        password: config.password,
        keepalive: true,
        timeout: 30
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

export async function reduceClient(config, ip, clientName) {
    if (!isValidIP(ip)) throw new Error('IP inválida');
    return withMikrotik(config, async (api) => {
        const queue = api.menu('/queue/simple');
        const target = ip.includes('/') ? ip : `${ip}/32`;

        let q = await queue.where('target', target).get();

        if (!q || q.length === 0) {
            // 🔥 SI NO EXISTE → CREAR
            await queue.add({
                name: clientName || ip,
                target: target,
                "max-limit": "1k/1k"
            });

            return { success: true, message: "Cliente creado y reducido" };
        }

        // 🔥 SI EXISTE → MODIFICAR
        await queue.set({
            ".id": q[0][".id"],
            "max-limit": "1k/1k",
            disabled: "no"
        });

        return { success: true, message: "Cliente reducido correctamente" };
    });
}

export async function activateClient(config, ip) {
    if (!isValidIP(ip)) throw new Error('IP inválida');
    return withMikrotik(config, async (api) => {
        const queue = api.menu('/queue/simple');
        const target = ip.includes('/') ? ip : `${ip}/32`;

        let q = await queue.where('target', target).get();

        if (!q || q.length === 0) {
            return { success: false, message: "No existe queue" };
        }

        await queue.set({
            ".id": q[0][".id"],
            "max-limit": "0/0"
        });

        return { success: true, message: "Cliente activado" };
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

        const esCorte = action === 'suspend';
        const estado = esCorte ? 'LIMITADO' : 'ACTIVO';
        const clientNameUpper = clientName ? clientName.toUpperCase() : 'DESCONOCIDO';
        const nuevoComentario = `InterRed | ${estado} | ${clientNameUpper} | ${ahora}`;

        let queueId;

        if (queues && queues.length > 0) {
            // Ya existe
            queueId = queues[0]['.id'];
            await queueMenu.set({
                '.id': queueId,
                "max-limit": "1k/1k",
                disabled: esCorte ? 'no' : 'yes', // Si cortamos, la regla 1k se HABILITA (disabled: no).
                comment: nuevoComentario
            });
            console.log(`✅ ${clientNameUpper} status actualizado a ${estado}`);
        } else {
            // 🚀 NO EXISTE -> CREAMOS LA COLA
            console.log(`⚠️ Cola no encontrada para ${clientNameUpper}. Creándola...`);
            const created = await queueMenu.add({
                name: clientNameUpper,
                target: targetIp,
                "max-limit": "1k/1k", // Limitado a 1k para reducir el servicio al 100%
                disabled: esCorte ? 'no' : 'yes', // Habilitamos la regla si es corte
                comment: nuevoComentario
            });
            console.log(`✅ Cola creada para ${clientNameUpper} con 1k/1k`);
        }

        return { success: true, action: action, message: `Cliente ${estado} con éxito` };
    });
}
