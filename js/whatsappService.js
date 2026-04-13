// ============================================================
// INTER RED — whatsappService.js
// ============================================================
import DB from './db.js';
import { safeArray } from './utils.js';

const MAX_LOG = 50;

/**
 * Reemplaza variables en el template del mensaje
 */
export function generateMessage(template, data) {
    if (!template) return '';
    return template
        .replace(/\{nombre\}/g, data.nombre || '')
        .replace(/\{apellido\}/g, data.apellido || '')
        .replace(/\{monto\}/g, data.monto || '')
        .replace(/\{telefono\}/g, data.telefono || '');
}

/**
 * Genera el link de WhatsApp para un número y mensaje
 */
export function generateWhatsAppLink(phone, message) {
    const cleaned = phone.replace(/\D/g, '');
    const number = cleaned.startsWith('54') ? cleaned : `549${cleaned}`;
    return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

/**
 * Abre WhatsApp para un cliente individual y guarda el log
 */
export function sendWhatsApp(phone, message, clientName = '') {
    const link = generateWhatsAppLink(phone, message);
    window.open(link, '_blank');
    saveMessageLog({ phone, message, client: clientName, timestamp: Date.now() });
}

/**
 * Obtiene el mensaje según el tipo (día 10 o día 13)
 */
export function getMessageByType(client, settings, type) {
    const template = type === '13' ? settings.message13 : settings.message10;
    return generateMessage(template, {
        nombre: client.nombre,
        apellido: client.apellido || '',
        monto: settings.defaultAmount?.toString() || '0',
        telefono: settings.phone || ''
    });
}

/**
 * BUG #17 CORREGIDO
 * En lugar de abrir N ventanas en loop (bloqueadas por el browser),
 * genera y devuelve la lista de deudores con su link de WhatsApp.
 * El componente en app.js renderiza un botón por cliente.
 */
export function buildMassMessageList(monthOrClients, yearOrSettings, type) {
    let debtors = [];
    const settings = DB.getSettings();
    const today = new Date().getDate();
    const msgType = type || (today >= 13 ? '13' : '10');

    if (Array.isArray(monthOrClients)) {
        // Si recibimos directamente la lista (App.js la manda así)
        debtors = monthOrClients;
    } else {
        // Si lo usamos de forma general (month, year)
        const clients = DB.getClients();
        debtors = clients.filter(c =>
            !DB.hasPaymentForMonth(c.id, monthOrClients, yearOrSettings) &&
            c.whatsapp &&
            c.whatsapp.trim() !== ''
        );
    }

    return debtors.map(client => {
        const message = getMessageByType(client, settings, msgType);
        const link = generateWhatsAppLink(client.whatsapp, message);
        return {
            id: client.id,
            nombre: client.nombre,
            apellido: client.apellido || '',
            clientName: `${client.nombre} ${client.apellido || ''}`.trim(),
            zona: client.zona,
            whatsapp: client.whatsapp,
            phone: client.whatsapp,
            message,
            link
        };
    });
}

/**
 * Envía un mensaje y marca como enviado en el log
 * (llamado desde el botón individual en la lista masiva)
 */
export function sendOneFromList(item) {
    window.open(item.link, '_blank');
    saveMessageLog({
        phone: item.whatsapp,
        message: item.message,
        client: `${item.nombre} ${item.apellido}`.trim(),
        timestamp: Date.now()
    });
}

/**
 * Guarda entrada en el log de mensajes (localStorage, max 50)
 */
export function saveMessageLog(entry) {
    try {
        const log = getMessageLog();
        log.unshift(entry);
        localStorage.setItem('interred_msg_log', JSON.stringify(log.slice(0, MAX_LOG)));
    } catch {}
}

/**
 * Devuelve el log completo de mensajes enviados
 */
export function getMessageLog() {
    try {
        return JSON.parse(localStorage.getItem('interred_msg_log') || '[]');
    } catch {
        return [];
    }
}
