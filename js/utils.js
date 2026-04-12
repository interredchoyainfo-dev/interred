// ============================================================
// INTER RED — utils.js
// Funciones compartidas entre db.js, app.js y otros módulos
// Importar desde cada archivo con: import { ... } from './utils.js'
// ============================================================

/**
 * Devuelve un array seguro (nunca null/undefined)
 */
export function safeArray(data) {
    if (!data || !Array.isArray(data)) return [];
    return data;
}

/**
 * Devuelve un objeto seguro (nunca null/undefined)
 */
export function safeObject(obj) {
    if (!obj || typeof obj !== 'object') return {};
    return obj;
}

/**
 * Normaliza un cliente con valores por defecto
 */
export function normalizeCliente(c) {
    return {
        nombre: c?.nombre ?? 'Sin nombre',
        ip: c?.ip ?? '0.0.0.0',
        estado: c?.estado ?? 'desconocido',
        ...c
    };
}

/**
 * Detecta si un cliente ya existe en la lista
 * Considera duplicado si nombre completo + IP coinciden
 */
export function clienteExiste(lista, cliente) {
    if (!lista || !Array.isArray(lista)) return false;
    const newFullName = `${cliente.nombre || ''} ${cliente.apellido || ''}`.trim().toLowerCase();
    return lista.some(c => {
        const existingFullName = `${c.nombre || ''} ${c.apellido || ''}`.trim().toLowerCase();
        return (
            existingFullName === newFullName &&
            (c.ip === cliente.ip || (c.ip === '0.0.0.0' && cliente.ip === '0.0.0.0'))
        );
    });
}

/**
 * Lee un valor de localStorage parseando JSON
 */
export function safeLocalGet(key, fallback = null) {
    try {
        const val = localStorage.getItem(key);
        return val ? JSON.parse(val) : fallback;
    } catch {
        return fallback;
    }
}

/**
 * Guarda un valor en localStorage como JSON
 */
export function safeLocalSet(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
        console.warn('localStorage error:', e);
    }
}

/**
 * Formatea un número con separador de miles (ej: 30000 → "30.000")
 */
export function formatNumber(num) {
    if (num === null || num === undefined) return '0';
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/**
 * Formatea un monto como moneda (ej: 30000 → "$30.000")
 */
export function formatCurrency(amount) {
    return '$' + formatNumber(amount);
}

/**
 * Formatea una fecha ISO a dd/mm/yyyy
 */
export function formatDate(dateStr) {
    if (!dateStr) return '-';
    const [year, month, day] = dateStr.split('-');
    return `${day}/${month}/${year}`;
}

/**
 * Genera un ID único basado en timestamp + random
 */
export function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}
