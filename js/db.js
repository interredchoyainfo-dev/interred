/* ========================================
   INTER RED - Firebase Database Layer
   Replacing LocalStorage with Cloud Firestore
   ======================================== */

import { db } from './firebase.js';
import { 
    collection, 
    doc, 
    setDoc, 
    getDoc, 
    getDocs, 
    onSnapshot, 
    updateDoc, 
    deleteDoc, 
    query, 
    where,
    writeBatch
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";

// ========================================
// HELPERS & HARDENING
// ========================================
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

function safeObject(obj) {
    if (!obj || typeof obj !== "object") return {};
    return obj;
}

function normalizeCliente(c) {
    return {
        nombre: c?.nombre ?? "Sin nombre",
        ip: c?.ip ?? "0.0.0.0",
        estado: c?.estado ?? "desconocido",
        ...c
    };
}

function clienteExiste(lista, cliente) {
    if (!lista || !Array.isArray(lista)) return false;
    const newFullName = `${cliente.nombre || ''} ${cliente.apellido || ''}`.trim().toLowerCase();
    
    return lista.some(c => {
        const existingFullName = `${c.nombre || ''} ${c.apellido || ''}`.trim().toLowerCase();
        // Return true ONLY if name AND IP match (this identifies a duplicate)
        // If IP is different, it's allowed even if name is the same.
        return existingFullName === newFullName && 
               (c.ip === cliente.ip || (c.ip === "0.0.0.0" && cliente.ip === "0.0.0.0"));
    });
}

// Local cache to keep synchronous functions working for the legacy UI
let CACHE = {
    clients: safeLocalGet('interred_clients', []),
    payments: safeLocalGet('interred_payments', []),
    morosos: safeLocalGet('interred_morosos', []),
    settings: safeLocalGet('interred_settings', {})
};

const DB = {
    // Legacy storage keys for backward compatibility and migration
    KEYS: {
        CLIENTS: 'interred_clients',
        PAYMENTS: 'interred_payments',
        MOROSOS: 'interred_morosos',
        SETTINGS: 'interred_settings'
    },

    // ---- Listeners setup ----
    init() {
        console.log('🔥 Initializing Firebase Sync...');
        this.checkMigrationNeeded();

        try {
            // Listen for Clients
            onSnapshot(collection(db, "clients"), (snapshot) => {
                const cloudData = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
                const isMigrated = localStorage.getItem('interred_firebase_migrated');
                const hasLocal = JSON.parse(localStorage.getItem('interred_clients') || '[]').length > 0;

                if (isMigrated || (cloudData.length > 0 && !hasLocal)) {
                    CACHE.clients = safeArray(cloudData).map(normalizeCliente);
                    safeLocalSet('interred_clients', CACHE.clients);
                    console.log('👥 Clients synced:', CACHE.clients.length);
                    if (window.App && window.App.refreshCurrentView) window.App.refreshCurrentView();
                }
            }, (err) => console.warn('Firebase clients listener error:', err.message));

            // Listen for Payments
            onSnapshot(collection(db, "payments"), (snapshot) => {
                const cloudData = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
                const isMigrated = localStorage.getItem('interred_firebase_migrated');
                const hasLocal = JSON.parse(localStorage.getItem('interred_payments') || '[]').length > 0;

                if (isMigrated || (cloudData.length > 0 && !hasLocal)) {
                    CACHE.payments = safeArray(cloudData);
                    safeLocalSet('interred_payments', CACHE.payments);
                    console.log('💰 Payments synced:', CACHE.payments.length);
                    if (window.App && window.App.refreshCurrentView) window.App.refreshCurrentView();
                }
            }, (err) => console.warn('Firebase payments listener error:', err.message));

            // Listen for Morosos
            onSnapshot(collection(db, "morosos"), (snapshot) => {
                const cloudData = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
                const isMigrated = localStorage.getItem('interred_firebase_migrated');
                const hasLocal = JSON.parse(localStorage.getItem('interred_morosos') || '[]').length > 0;

                if (isMigrated || (cloudData.length > 0 && !hasLocal)) {
                    CACHE.morosos = safeArray(cloudData);
                    safeLocalSet('interred_morosos', CACHE.morosos);
                    console.log('⚠️ Morosos synced:', CACHE.morosos.length);
                    if (window.App && window.App.refreshCurrentView) window.App.refreshCurrentView();
                }
            }, (err) => console.warn('Firebase morosos listener error:', err.message));

            // Listen for Settings
            onSnapshot(doc(db, "config", "settings"), (snapshot) => {
                if (snapshot.exists()) {
                    const isMigrated = localStorage.getItem('interred_firebase_migrated');
                    const hasLocal = localStorage.getItem('interred_settings') !== null;
                    
                    if (isMigrated || !hasLocal) {
                        CACHE.settings = safeObject(snapshot.data());
                        safeLocalSet('interred_settings', CACHE.settings);
                        console.log('⚙️ Settings synced');
                    }
                }
            }, (err) => console.warn('Firebase settings listener error:', err.message));
        } catch (e) {
            console.error('🔥 Firebase init failed (will use local data):', e.message);
        }
    },

    async checkMigrationNeeded() {
        const localClients = JSON.parse(localStorage.getItem('interred_clients') || '[]');
        const isMigrated = localStorage.getItem('interred_firebase_migrated');
        
        if (localClients.length > 0 && !isMigrated) {
            console.warn('⚡ Local data detected. Migration to Cloud recommended.');
            // We wait a bit to avoid modal flashing during load
            setTimeout(() => {
                if (window.App && window.App.showConfirm) {
                    window.App.showConfirm(
                        'Migración a Firebase',
                        `He detectado ${localClients.length} clientes en tu PC. ¿Querés subirlos a la nube de Firebase ahora?`,
                        () => this.migrateLocalToFirestore()
                    );
                }
            }, 3000);
        }
    },

    async migrateLocalToFirestore() {
        console.log('🚀 Starting Migration to Firebase...');
        if (window.App) window.App.showToast('Migrando datos a la nube... (esto puede tardar)', 'info');

        try {
            // Fetch current cloud state to avoid duplicates
            const snapshot = await getDocs(collection(db, "clients"));
            const cloudClients = snapshot.docs.map(d => d.data());

            // Collect all pending operations
            const operations = [];
            
            // Clients
            CACHE.clients.forEach(c => {
                // Prevent duplication during migration
                const exist = cloudClients.find(cc => 
                    cc.nombre?.toLowerCase() === c.nombre?.toLowerCase() && 
                    cc.ip === c.ip
                );
                
                if (exist) return; // Skip if already there

                const id = c.id || this.generateId();
                if (!c.id) c.id = id; 
                operations.push({ collection: 'clients', id: id, data: c });
            });
            
            // Payments
            CACHE.payments.forEach(p => {
                const id = p.id || this.generateId();
                if (!p.id) p.id = id;
                operations.push({ collection: 'payments', id: id, data: p });
            });
            
            // Morosos
            CACHE.morosos.forEach(m => {
                const id = m.id || this.generateId();
                if (!m.id) m.id = id;
                operations.push({ collection: 'morosos', id: id, data: m });
            });
            
            // Settings
            operations.push({ collection: 'config', id: 'settings', data: CACHE.settings });

            console.log(`📦 Total operations to migrate: ${operations.length}`);

            // Chunk operations in batches of 400 (limit is 500)
            for (let i = 0; i < operations.length; i += 400) {
                const chunk = operations.slice(i, i + 400);
                const batch = writeBatch(db);
                
                chunk.forEach(op => {
                    const ref = doc(db, op.collection, op.id);
                    batch.set(ref, op.data, { merge: true });
                });

                console.log(`⏳ Committing batch ${Math.floor(i/400) + 1}...`);
                await batch.commit();
            }
            
            safeLocalSet('interred_firebase_migrated', 'true');
            if (window.App) {
                window.App.showToast('✅ Migración exitosa. Tus datos ya están en la nube.', 'success');
                setTimeout(() => window.location.reload(), 2000);
            }
            console.log('✅ Migration COMPLETE');
        } catch (e) {
            console.error('Migration failed:', e);
            let msg = 'Error en la migración: ' + e.message;
            if (e.message.includes('not found')) {
                msg = '⚠️ Error: Debes crear la base de datos Firestore en el panel de Firebase primero.';
            }
            if (window.App) window.App.showToast(msg, 'error');
        }
    },

    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    },

    // ---- Clients ----
    getClients() {
        return safeArray(CACHE.clients).map(normalizeCliente);
    },

    getClientById(id) {
        return CACHE.clients.find(c => c.id === id) || null;
    },

    async saveClient(client) {
        // Prevent manual or automatic duplication
        const existing = this.getClients();
        if (!client.id && clienteExiste(existing, client)) {
            console.log('🚫 Cliente duplicado evitado:', client.nombre);
            return existing.find(c => c.nombre?.toLowerCase() === client.nombre?.toLowerCase() && c.ip === client.ip);
        }

        const id = client.id || this.generateId();
        const clientRef = doc(db, "clients", id);
        
        const data = {
            ...client,
            id: id,
            updatedAt: new Date().toISOString()
        };
        if (!client.createdAt) data.createdAt = new Date().toISOString();

        await setDoc(clientRef, data, { merge: true });
        return data;
    },

    async deleteClient(id) {
        await deleteDoc(doc(db, "clients", id));
        
        // Also delete related payments in a batch
        const batch = writeBatch(db);
        const paymentsToDelete = CACHE.payments.filter(p => p.clientId === id);
        paymentsToDelete.forEach(p => {
            batch.delete(doc(db, "payments", p.id));
        });
        await batch.commit();
    },

    // ---- Payments ----
    getPayments() {
        return CACHE.payments;
    },

    getPaymentsByClient(clientId) {
        return CACHE.payments.filter(p => p.clientId === clientId);
    },

    getPaymentForMonth(clientId, month, year) {
        return CACHE.payments.find(
            p => p.clientId === clientId && p.month === month && p.year === year
        ) || null;
    },

    async savePayment(payment) {
        const id = payment.id || this.generateId();
        const paymentRef = doc(db, "payments", id);
        
        const data = {
            ...payment,
            id: id
        };

        await setDoc(paymentRef, data, { merge: true });
        return data;
    },

    async deletePayment(id) {
        await deleteDoc(doc(db, "payments", id));
    },

    hasPaymentForMonth(clientId, month, year) {
        return CACHE.payments.some(
            p => p.clientId === clientId && p.month === month && p.year === year
        );
    },

    // ---- Settings ----
    getSettings() {
        const defaultSettings = {
            defaultAmount: 30000,
            phone: '3855374835',
            reminder10Enabled: true,
            reminder13Enabled: true,
            message10: 'Hola {nombre}, te saludamos de INTER RED \uD83C\uDF10. Te recordamos que hoy d\u00EDa 10 vence tu abono mensual de internet por un valor de ${monto}.\n\nEvit\u00E1 recargos y cortes en el servicio. Si ya realizaste el pago, por favor envi\u00E1 el comprobante por este medio.\n\n\uD83D\uDCCD Ubicaci\u00F3n: Choya, Sgo. del Estero.\n\uD83D\uDCDE Dudas: {telefono}.',
            message13: '\u26A0\uFE0F AVISO IMPORTANTE - INTER RED \u26A0\uFE0F\n\nHola {nombre}, no hemos registrado el pago de tu servicio este mes.\n\nTe informamos que a partir de este momento tu velocidad de navegaci\u00F3n ha sido reducida. Para normalizar tu servicio, por favor regulariz\u00E1 tu deuda de ${monto}.\n\nContacto: {telefono}. \u00A1Gracias!',
            routers: [
              {
                name: 'Router Principal',
                host: '',
                port: '8728',
                user: '',
                password: '',
                addressList: 'morosos'
              }
            ],
            activeRouterIndex: 0
        };

        if (!CACHE.settings.routers) {
            // Legacy migration: if they have old settings, put them into the first router
            if (CACHE.settings.mikrotikHost) {
                defaultSettings.routers[0] = {
                    name: 'Router Principal',
                    host: CACHE.settings.mikrotikHost,
                    port: CACHE.settings.mikrotikPort || '8728',
                    user: CACHE.settings.mikrotikUser || '',
                    password: CACHE.settings.mikrotikPassword || '',
                    addressList: CACHE.settings.mikrotikAddressList || 'morosos'
                };
            }
            return defaultSettings;
        }
        return CACHE.settings;
    },

    async saveSettings(settings) {
        await setDoc(doc(db, "config", "settings"), settings);
    },

    // ---- Morosos ----
    getMorosos() {
        return CACHE.morosos;
    },

    async addMoroso(clientId) {
        if (this.isMoroso(clientId)) return null;
        
        const id = this.generateId();
        const entry = {
            id,
            clientId,
            addedAt: new Date().toISOString(),
            isSuspended: false,
            month: new Date().getMonth() + 1,
            year: new Date().getFullYear(),
        };
        
        await setDoc(doc(db, "morosos", id), entry);
        return entry;
    },

    async removeMoroso(clientId) {
        const moroso = CACHE.morosos.find(m => m.clientId === clientId);
        if (moroso) {
            await deleteDoc(doc(db, "morosos", moroso.id));
        }
    },

    async updateMoroso(clientId, updates) {
        const moroso = CACHE.morosos.find(m => m.clientId === clientId);
        if (moroso) {
            await updateDoc(doc(db, "morosos", moroso.id), updates);
        }
    },

    isMoroso(clientId) {
        return CACHE.morosos.some(m => m.clientId === clientId);
    },

    // ---- Stats (Keep synchronous as it uses CACHE) ----
    getStatsForMonth(month, year) {
        const clients = this.getClients();
        const payments = this.getPayments();
        const morosos = this.getMorosos();

        const totalClients = clients.length;
        const paidClients = [];
        const debtClients = [];
        let totalRevenue = 0;
        let revenueCash = 0;
        let revenueTransfer = 0;

        const suspendedCount = morosos.filter(m => m.isSuspended).length;

        clients.forEach(client => {
            const payment = safeArray(payments).find(
                p => p.clientId === client.id && p.month === month && p.year === year
            );
            if (payment) {
                paidClients.push(client);
                totalRevenue += payment.amount;
                if (payment.medio === 'Efectivo' || payment.method === 'Efectivo') revenueCash += payment.amount;
                else revenueTransfer += payment.amount;
            } else {
                debtClients.push(client);
            }
        });

        // Zones breakdown
        const zones = ['SOL DE MAYO', 'VILLA LA PUNTA', 'CHOYA', 'FRIAS'];
        const zoneStats = zones.map(zone => {
            const zoneClients = clients.filter(c => c.zona === zone);
            const zonePaid = zoneClients.filter(c =>
                payments.some(p => p.clientId === c.id && p.month === month && p.year === year)
            );
            const zoneDebt = zoneClients.filter(c =>
                !payments.some(p => p.clientId === c.id && p.month === month && p.year === year)
            );
            
            let zoneCash = 0;
            let zoneTransfer = 0;
            zonePaid.forEach(c => {
                const p = payments.find(pay => pay.clientId === c.id && pay.month === month && pay.year === year);
                if (p) {
                    if (p.medio === 'Efectivo' || p.method === 'Efectivo') zoneCash += p.amount;
                    else zoneTransfer += p.amount;
                }
            });

            return {
                zone,
                total: zoneClients.length,
                paid: zonePaid.length,
                debt: zoneDebt.length,
                cash: zoneCash,
                transfer: zoneTransfer
            };
        });

        return {
            totalClients,
            paidCount: paidClients.length,
            debtCount: debtClients.length,
            suspendedCount,
            totalRevenue,
            revenueCash,
            revenueTransfer,
            zoneStats,
            debtClients,
            suspendedClients: clients.filter(c => morosos.some(m => m.clientId === c.id && m.isSuspended))
        };
    },

    async clearAllPayments() {
        const batch = writeBatch(db);
        CACHE.payments.forEach(p => batch.delete(doc(db, "payments", p.id)));
        CACHE.morosos.forEach(m => batch.delete(doc(db, "morosos", m.id)));
        await batch.commit();
    },

    async cleanupDatabase() {
        console.log("🧹 Iniciando limpieza de base de datos...");
        const clients = this.getClients();
        const payments = this.getPayments();
        
        const uniqueClientsMap = new Map(); // key: name_ip, value: first_client_object
        const clientsToDelete = [];
        const paymentRemapping = {}; // old_client_id -> new_client_id

        clients.forEach(c => {
            const fullName = `${c.nombre || ''} ${c.apellido || ''}`.trim().toLowerCase();
            const key = `${fullName}_${c.ip}`;
            
            if (!uniqueClientsMap.has(key)) {
                uniqueClientsMap.set(key, c);
            } else {
                const original = uniqueClientsMap.get(key);
                clientsToDelete.push(c.id);
                paymentRemapping[c.id] = original.id;
                console.log(`Duplicate client found: ${fullName} (${c.id}) -> merging into ${original.id}`);
            }
        });

        // Deduplicate Payments (same clientId, month, year)
        const uniquePaymentsMap = new Map(); // key: clientid_month_year, value: payment_object
        const paymentsToDelete = [];

        // First, remap survivor payments to updated client IDs
        const processedPayments = payments.map(p => {
            if (paymentRemapping[p.clientId]) {
                const newP = { ...p, clientId: paymentRemapping[p.clientId] };
                // Also update the database entry for this payment if it's not a duplicate
                return newP;
            }
            return p;
        });

        processedPayments.forEach(p => {
            const key = `${p.clientId}_${p.month}_${p.year}`;
            if (!uniquePaymentsMap.has(key)) {
                uniquePaymentsMap.set(key, p);
            } else {
                paymentsToDelete.push(p.id);
                console.log(`Duplicate payment found for client ${p.clientId} on ${p.month}/${p.year} (${p.id})`);
            }
        });

        // Execute deletions and updates
        if (clientsToDelete.length > 0 || paymentsToDelete.length > 0 || Object.keys(paymentRemapping).length > 0) {
            const batch = writeBatch(db);
            
            // Delete duplicate clients
            clientsToDelete.forEach(id => {
                batch.delete(doc(db, "clients", id));
            });

            // Delete duplicate payments
            paymentsToDelete.forEach(id => {
                batch.delete(doc(db, "payments", id));
            });

            // Update/Set unique payments (handles remapped clientIds)
            uniquePaymentsMap.forEach((p) => {
                batch.set(doc(db, "payments", p.id), p, { merge: true });
            });

            await batch.commit();
            console.log(`✅ Cleaned up: ${clientsToDelete.length} clients, ${paymentsToDelete.length} payments deleted.`);
            return { 
                clientsDeleted: clientsToDelete.length, 
                paymentsDeleted: paymentsToDelete.length 
            };
        } else {
            console.log("✨ Base de datos limpia, no se requirieron cambios.");
            return { clientsDeleted: 0, paymentsDeleted: 0 };
        }
    },

    // ---- Import/Export (Still works for backup) ----
    exportData() {
        return JSON.stringify({
            clients: CACHE.clients,
            payments: CACHE.payments,
            settings: CACHE.settings,
            exportedAt: new Date().toISOString(),
            version: '2.0 (Firebase)',
        }, null, 2);
    }
};

// Start sync immediately
DB.init();

// ---- Global access for legacy script support ----
window.DB = DB;
window.getClients = () => DB.getClients();
window.getPayments = () => DB.getPayments();
window.getSettings = () => DB.getSettings();
window.saveSettings = (s) => DB.saveSettings(s);

// Named exports for backward compatibility with other services
export const getClients = () => DB.getClients();
export const getPayments = () => DB.getPayments();
export const getSettings = () => DB.getSettings();
export const getMorosos = () => DB.getMorosos();

export default DB;
