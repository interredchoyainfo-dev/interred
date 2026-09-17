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
 * Formatea cualquier número de teléfono argentino al formato oficial de WhatsApp (549 + código de área + número)
 * Corrige prefijos como 9385..., 0385..., 15..., 5499..., +54...
 */
export function formatWhatsAppNumber(phone) {
    if (!phone) return '';
    let digits = phone.toString().replace(/\D/g, '');
    if (!digits) return '';

    // Si empieza con 0 (ej: 03856...), quitar el 0 inicial
    if (digits.startsWith('0')) {
        digits = digits.substring(1);
    }

    // Si empieza con 5499 (bug de doble 9 ej: 5499385...), corregir a 549
    if (digits.startsWith('5499') && digits.length >= 13) {
        digits = '549' + digits.substring(4);
    }

    // Si ya empieza con 549 (ej: 5493856...), ya está en formato internacional
    if (digits.startsWith('549')) {
        return digits;
    }

    // Si empieza con 54 seguido de código de área (ej: 543856...), insertar 9 para celular
    if (digits.startsWith('54') && digits.length >= 12) {
        return '549' + digits.substring(2);
    }

    // Si empieza con 9 y tiene 11 dígitos (ej: 93856979378 -> 9 + 10 dígitos)
    if (digits.startsWith('9') && digits.length === 11) {
        return '549' + digits.substring(1);
    }

    // Si tiene 10 dígitos estándar (ej: 3856979378)
    if (digits.length === 10) {
        return '549' + digits;
    }

    // Si tiene más de 10 dígitos y empieza con 9
    if (digits.startsWith('9') && digits.length > 10) {
        return '549' + digits.substring(1);
    }

    // Fallback general asegurando prefijo 549
    return digits.startsWith('54') 
        ? (digits.startsWith('549') ? digits : `549${digits.substring(2)}`) 
        : `549${digits}`;
}

/**
 * Genera el link de WhatsApp para un número y mensaje
 */
export function generateWhatsAppLink(phone, message) {
    const formatted = formatWhatsAppNumber(phone);
    if (!formatted) return '';
    return `https://api.whatsapp.com/send?phone=${formatted}&text=${encodeURIComponent(message || '')}`;
}

/**
 * Abre WhatsApp para un cliente individual y guarda el log
 */
export function sendWhatsApp(phone, message, clientName = '') {
    if (!phone || phone.toString().trim() === '') {
        if (window.App && window.App.showToast) {
            window.App.showToast('⚠️ El cliente no tiene teléfono registrado', 'warning');
        } else {
            alert('El cliente no tiene teléfono registrado');
        }
        return false;
    }
    const link = generateWhatsAppLink(phone, message);
    if (!link) {
        if (window.App && window.App.showToast) {
            window.App.showToast('⚠️ Número de teléfono inválido', 'error');
        } else {
            alert('Número de teléfono inválido');
        }
        return false;
    }
    window.open(link, '_blank');
    saveMessageLog({ phone, message, client: clientName, timestamp: Date.now() });
    return true;
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
