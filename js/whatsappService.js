import { getSettings } from './db.js';
import { getPriorityDebtors } from './collectionService.js';

const logKey = 'interred_whatsapp_log';

// Reemplazo de variables dinámicas
export function generateMessage(template, data) {
    if (!template) return '';
    return template
        .replace(/{nombre}/g, data.nombre || '')
        .replace(/{monto}/g, data.monto || '')
        .replace(/{telefono}/g, data.telefono || '');
}

// Generar link de WhatsApp
export function generateWhatsAppLink(phone, message) {
    // Limpiar el teléfono (dejar solo números)
    let cleanPhone = phone.replace(/\D/g, '');

    // Si el número es de 10 dígitos (ej: 3855374835), es un celular de Argentina sin prefijo
    if (cleanPhone.length === 10) {
        cleanPhone = '549' + cleanPhone;
    }
    // Si es de 11 dígitos empezando con 9385... (ej: 93855374835), es formato celular local
    else if (cleanPhone.length === 11 && cleanPhone.startsWith('9')) {
        cleanPhone = '54' + cleanPhone;
    }
    // Si ya tiene el 54 pero no el 9 y es largo (ej: 54385...), le falta el 9 para WhatsApp
    else if (cleanPhone.startsWith('54') && cleanPhone.length === 12) {
        // Insertamos el 9 después del 54
        cleanPhone = '549' + cleanPhone.substring(2);
    }

    const encodedMessage = encodeURIComponent(message);
    return `https://wa.me/${cleanPhone}?text=${encodedMessage}`;
}

// Abrir WhatsApp e individualmente guardar log
export function sendWhatsApp(phone, message, clientName = '') {
    const url = generateWhatsAppLink(phone, message);

    // Guardar en log
    saveMessageLog({
        timestamp: new Date().toISOString(),
        client: clientName,
        phone: phone,
        message: message
    });

    window.open(url, '_blank');
}

// Obtener plantilla por tipo
export function getMessageByType(client, settings, type) {
    // Mapear los tipos de la interfaz a las claves de settings existentes
    const keyMap = {
        '10': 'message10',
        '13': 'message13',
        'default': 'message10' // Usamos el del día 10 como predeterminado
    };

    const key = keyMap[type] || type;
    const template = settings[key] || settings.message10;

    return generateMessage(template, {
        nombre: `${client.nombre} ${client.apellido || ''}`.trim(),
        monto: settings.defaultAmount,
        telefono: settings.phone
    });
}

// Envío masivo a deudores
export function sendMassMessages(month, year, type = '10') {
    const settings = getSettings();
    const debtors = safeArray(getPriorityDebtors(month, year));

    if (debtors.length === 0) return 0;

    debtors.forEach(client => {
        if (client.whatsapp) {
            const message = getMessageByType(client, settings, type);
            const url = generateWhatsAppLink(client.whatsapp, message);

            // En envío masivo, window.open puede ser bloqueado por pop-up blockers
            // pero seguimos la lógica solicitada.
            window.open(url, '_blank');

            saveMessageLog({
                timestamp: new Date().toISOString(),
                client: `${client.nombre} ${client.apellido}`,
                phone: client.whatsapp,
                message: message,
                type: 'mass'
            });
        }
    });

    return debtors.length;
}

export function saveMessageLog(entry) {
    try {
        const log = safeLocalGet(logKey, []);
        log.push(entry);
        // Limitar log a los últimos 50 mensajes
        if (log.length > 50) log.shift();
        safeLocalSet(logKey, log);
    } catch (e) {
        if (window.log) window.log('Error saving log:', e);
    }
}

export function getMessageLog() {
    return safeLocalGet(logKey, []);
}

function safeLocalGet(key, fallback = null) {
    try {
        const val = localStorage.getItem(key);
        return val ? JSON.parse(val) : fallback;
    } catch { return fallback; }
}

function safeLocalSet(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); }
    catch (e) { console.warn("localStorage error", e); }
}

function safeArray(data) {
    if (!data || !Array.isArray(data)) return [];
    return data;
}
