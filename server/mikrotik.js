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

    return withMikrotik(config, async (api) => {
        try {
            console.log(`📉 Aplicando reducción de servicio a: ${clientName} (${cleanIp})`);
            
            await api.menu('/ip/firewall/address-list').add({
                list: config.addressListName || 'morosos',
                address: cleanIp,
                comment: `Moroso: ${clientName}`
            });

            return { success: true, message: 'Reducción de servicio aplicada' };
        } catch (error) {
            // Si ya está en la lista, el MikroTik dará error
            if (error.message && error.message.includes("already exists")) {
                return { success: true, message: 'El cliente ya estaba limitado' };
            }
            throw error;
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
