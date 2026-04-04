import { getClients, getPayments } from './db.js';

function safeArray(data) {
    if (!data || !Array.isArray(data)) return [];
    return data;
}

// Calcular cantidad de pagos (proxy de deuda)
function getDebt(clientId) {
    const payments = getPayments();
    return payments.filter(p => p.clientId === clientId).length;
}

// Calcular meses sin pagar
function getMissedMonths(clientId, currentMonth, currentYear) {
    const payments = getPayments();

    const paidMonths = safeArray(payments)
        .filter(p => p.clientId === clientId)
        .map(p => `${p.month}-${p.year}`);

    let missed = 0;

    for (let i = 1; i <= currentMonth; i++) {
        const key = `${i}-${currentYear}`;
        if (!paidMonths.includes(key)) missed++;
    }

    return missed;
}

// Obtener deudores ordenados por prioridad
export function getPriorityDebtors(month, year) {
    const clients = getClients();
    const payments = getPayments();

    const paidIds = new Set(
        safeArray(payments)
            .filter(p => p.month === month && p.year === year)
            .map(p => p.clientId)
    );

    const debtors = safeArray(clients).filter(c => !paidIds.has(c.id));

    return debtors
        .map(client => ({
            ...client,
            debt: getDebt(client.id),
            missed: getMissedMonths(client.id, month, year)
        }))
        .sort((a, b) => {
            // Prioridad: más meses perdidos primero, luego menos historial de pagos (para deudores nuevos o crónicos)
            if (b.missed !== a.missed) return b.missed - a.missed;
            return b.debt - a.debt;
        });
}

// Obtener siguiente deudor
export function getNextDebtor(month, year) {
    const list = getPriorityDebtors(month, year);
    return list[0] || null;
}
