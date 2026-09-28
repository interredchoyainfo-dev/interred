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
import { 
    safeArray, 
    safeObject, 
    normalizeCliente, 
    clienteExiste, 
    safeLocalGet, 
    safeLocalSet,
    generateId 
} from './utils.js';

// ========================================
// HELPERS & HARDENING
// ========================================

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
        console.log('🔥 Initializing Firebase Cloud Sync...');

        try {
            // Listen for Clients
            onSnapshot(collection(db, "clients"), (snapshot) => {
                const cloudData = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
                CACHE.clients = safeArray(cloudData).map(normalizeCliente);
                safeLocalSet('interred_clients', CACHE.clients);
                console.log('👥 Clients synced from Firebase:', CACHE.clients.length);
                if (window.App && window.App.refreshCurrentView) window.App.refreshCurrentView();
            }, (err) => console.warn('Firebase clients listener error:', err.message));

            // Listen for Payments
            onSnapshot(collection(db, "payments"), (snapshot) => {
                const cloudData = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
                CACHE.payments = safeArray(cloudData);
                safeLocalSet('interred_payments', CACHE.payments);
                console.log('💰 Payments synced from Firebase:', CACHE.payments.length);
                if (window.App && window.App.refreshCurrentView) window.App.refreshCurrentView();
            }, (err) => console.warn('Firebase payments listener error:', err.message));

            // Listen for Morosos
            onSnapshot(collection(db, "morosos"), (snapshot) => {
                const cloudData = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
                CACHE.morosos = safeArray(cloudData);
                safeLocalSet('interred_morosos', CACHE.morosos);
                console.log('⚠️ Morosos synced from Firebase:', CACHE.morosos.length);
                if (window.App && window.App.refreshCurrentView) window.App.refreshCurrentView();
            }, (err) => console.warn('Firebase morosos listener error:', err.message));

            // Listen for Settings
            onSnapshot(doc(db, "config", "settings"), (snapshot) => {
                if (snapshot.exists()) {
                    CACHE.settings = safeObject(snapshot.data());
                    safeLocalSet('interred_settings', CACHE.settings);
                    console.log('⚙️ Settings synced from Firebase');
                    if (window.App && window.App.loadSettings) window.App.loadSettings();
                }
            }, (err) => console.warn('Firebase settings listener error:', err.message));
        } catch (e) {
            console.error('🔥 Firebase init failed:', e.message);
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


    // ---- Clients ----
    getClients() {
        return safeArray(CACHE.clients).map(normalizeCliente);
    },

    getClientById(id) {
        return CACHE.clients.find(c => c.id === id) || null;
    },

    // ---- Internal Write Helper with Timeout ----
    async _write(ref, data, options = { merge: true }) {
        const timeout = 8000; // 8 seconds timeout for cloud sync
        
        try {
            const writePromise = setDoc(ref, data, options);
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('TIMEOUT_FIRESTORE')), timeout)
            );

            await Promise.race([writePromise, timeoutPromise]);
            return true;
        } catch (e) {
            if (e.message === 'TIMEOUT_FIRESTORE' || e.message.includes('blocked') || e.code === 'unavailable') {
                console.warn('⚠️ Cloud sync blocked or timeout. Data saved locally only.', e.message);
                if (window.App && window.App.showToast) {
                    window.App.showToast('⚠️ Error de conexión con la nube. El cambio se guardó localmente.', 'warning');
                }
                return false;
            }
            throw e;
        }
    },

    async saveClient(client) {
        // Prevent manual or automatic duplication
        const existing = this.getClients();
        if (!client.id && clienteExiste(existing, client)) {
            console.log('🚫 Cliente duplicado evitado:', client.nombre);
            return existing.find(c => c.nombre?.toLowerCase() === client.nombre?.toLowerCase() && c.ip === client.ip);
        }

        const id = client.id || generateId();
        const clientRef = doc(db, "clients", id);
        
        const data = {
            ...client,
            id: id,
            updatedAt: new Date().toISOString()
        };
        if (!client.createdAt) data.createdAt = new Date().toISOString();

        await this._write(clientRef, data);
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
        const id = payment.id || generateId();
        const paymentRef = doc(db, "payments", id);
        
        const data = {
            ...payment,
            id: id
        };

        await this._write(paymentRef, data);
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
        const DEFAULT_ROUTERS = [
            {
                id: 'router_choya',
                name: 'Choya',
                zone: 'CHOYA',
                host: 'server3.remotemikrotik.com',
                port: '7123',
                winboxPort: '1123',
                webPort: '4123',
                user: 'RDEzsi9e',
                password: 'KTU0jNfC',
                sstpHost: 'server3.remotemikrotik.com',
                sstpUser: 'RM17897139173291',
                sstpPassword: 'uEBljNhlSO',
                addressList: 'morosos',
                active: true,
                comment: 'Choya - RemoteMikrotik RM17897139173291'
            },
            {
                id: 'router_frias',
                name: 'Frías',
                zone: 'FRIAS',
                host: 'server3.remotemikrotik.com',
                port: '7062',
                winboxPort: '1062',
                webPort: '4062',
                user: 'uGI51319',
                password: 'EkJlv1Kb',
                sstpHost: 'server3.remotemikrotik.com',
                sstpUser: 'RM17904066944449',
                sstpPassword: 'hstdmWHnWV',
                addressList: 'morosos',
                active: true,
                comment: 'Frías - RemoteMikrotik RM17904066944449'
            }
        ];

        const DEFAULT_ZONES = ['SOL DE MAYO', 'VILLA LA PUNTA', 'CHOYA', 'FRIAS'];

        const defaultSettings = {
            defaultAmount: 30000,
            phone: '3855374835',
            reminder10Enabled: true,
            reminder13Enabled: true,
            message10: 'Hola {nombre}, te saludamos de INTER RED 🌐. Te recordamos que hoy día 10 vence tu abono mensual de internet por un valor de ${monto}.\n\nEvitá recargos y cortes en el servicio. Si ya realizaste el pago, por favor enviá el comprobante por este medio.\n\n📍 Ubicación: Choya, Sgo. del Estero.\n📞 Dudas: {telefono}.',
            message13: '⚠️ AVISO IMPORTANTE - INTER RED ⚠️\n\nHola {nombre}, no hemos registrado el pago de tu servicio este mes.\n\nTe informamos que a partir de este momento tu velocidad de navegación ha sido reducida. Para normalizar tu servicio, por favor regularizá tu deuda de ${monto}.\n\nContacto: {telefono}. ¡Gracias!',
            routers: DEFAULT_ROUTERS,
            zones: DEFAULT_ZONES,
            activeRouterIndex: 0
        };

        if (!CACHE.settings.zones || !Array.isArray(CACHE.settings.zones) || CACHE.settings.zones.length === 0) {
            CACHE.settings.zones = DEFAULT_ZONES;
        }

        if (!CACHE.settings.routers || !Array.isArray(CACHE.settings.routers) || CACHE.settings.routers.length === 0) {
            return defaultSettings;
        }

        // Filtramos routers obsoletos (ej. IPs o dominios viejos que ya no se usan)
        const isObsolete = (r) => {
            if (!r || !r.host) return true;
            const h = (r.host || '').toLowerCase();
            const u = (r.user || '').toLowerCase();
            return h.includes('mynetname.net') || h === '190.136.126.129' || h === '179.238.45.72' || u === 'mamitamamita' || r.name === 'Router Principal' && !h.includes('remotemikrotik');
        };

        const cleanedRouters = CACHE.settings.routers.filter(r => !isObsolete(r));

        // Si después de limpiar no queda ninguno o falta alguno de los principales, aseguramos Choya y Frías
        if (cleanedRouters.length === 0) {
            CACHE.settings.routers = DEFAULT_ROUTERS;
        } else {
            // Asegurar que cada router tenga active: true si no está especificado
            cleanedRouters.forEach(r => {
                if (r.active === undefined) r.active = true;
            });

            // Si no está Choya, agregarlo
            if (!cleanedRouters.some(r => (r.zone || '').toUpperCase() === 'CHOYA' || (r.name || '').toLowerCase().includes('choya'))) {
                cleanedRouters.unshift(DEFAULT_ROUTERS[0]);
            }
            // Si no está Frías, agregarlo
            if (!cleanedRouters.some(r => (r.zone || '').toUpperCase() === 'FRIAS' || (r.name || '').toLowerCase().includes('frias') || (r.name || '').toLowerCase().includes('frías'))) {
                cleanedRouters.push(DEFAULT_ROUTERS[1]);
            }
            CACHE.settings.routers = cleanedRouters;
        }

        if (CACHE.settings.activeRouterIndex >= CACHE.settings.routers.length) {
            CACHE.settings.activeRouterIndex = 0;
        }

        return CACHE.settings;
    },

    getZones() {
        const settings = this.getSettings();
        const setZones = (settings.zones && Array.isArray(settings.zones) && settings.zones.length > 0)
            ? settings.zones
            : ['SOL DE MAYO', 'VILLA LA PUNTA', 'CHOYA', 'FRIAS'];
        
        // Incluir cualquier zona que tengan clientes existentes para que nunca se pierda nada
        const clientZones = (CACHE.clients || []).map(c => c.zona).filter(Boolean);
        const combined = [...new Set([...setZones, ...clientZones])];
        return combined.map(z => String(z).trim().toUpperCase()).filter(Boolean);
    },

    async saveZones(zones) {
        const settings = this.getSettings();
        settings.zones = [...new Set((zones || []).map(z => String(z).trim().toUpperCase()).filter(Boolean))];
        await this.saveSettings(settings);
        return settings.zones;
    },

    async addZone(zoneName) {
        if (!zoneName || typeof zoneName !== 'string') return false;
        const normalized = zoneName.trim().toUpperCase();
        if (!normalized) return false;
        const current = this.getZones();
        if (!current.includes(normalized)) {
            current.push(normalized);
            await this.saveZones(current);
        }
        return true;
    },

    async updateZone(oldName, newName) {
        if (!oldName || !newName) return false;
        const oldNorm = String(oldName).trim().toUpperCase();
        const newNorm = String(newName).trim().toUpperCase();
        if (oldNorm === newNorm) return true;

        const current = this.getZones();
        const idx = current.indexOf(oldNorm);
        if (idx >= 0) {
            current[idx] = newNorm;
        } else {
            current.push(newNorm);
        }
        await this.saveZones(current);

        // Migrar clientes con la zona antigua
        let clientsUpdated = 0;
        for (const client of (CACHE.clients || [])) {
            if (String(client.zona || '').trim().toUpperCase() === oldNorm) {
                client.zona = newNorm;
                await this.saveClient(client);
                clientsUpdated++;
            }
        }

        // Migrar routers con la zona antigua
        const settings = this.getSettings();
        if (settings.routers && Array.isArray(settings.routers)) {
            let routerUpdated = false;
            settings.routers.forEach(r => {
                if (String(r.zone || '').trim().toUpperCase() === oldNorm) {
                    r.zone = newNorm;
                    routerUpdated = true;
                }
            });
            if (routerUpdated) {
                await this.saveSettings(settings);
            }
        }

        return { success: true, clientsUpdated };
    },

    async deleteZone(zoneName) {
        if (!zoneName) return false;
        const norm = String(zoneName).trim().toUpperCase();
        const current = this.getZones().filter(z => z !== norm);
        await this.saveZones(current);
        return true;
    },

    async saveSettings(settings) {
        await this._write(doc(db, "config", "settings"), settings);
    },

    // ---- Morosos ----
    getMorosos() {
        return CACHE.morosos;
    },

    async addMoroso(clientId) {
        if (this.isMoroso(clientId)) return null;
        
        const id = generateId();
        const entry = {
            id,
            clientId,
            addedAt: new Date().toISOString(),
            isSuspended: false,
            month: new Date().getMonth() + 1,
            year: new Date().getFullYear(),
        };
        
        await this._write(doc(db, "morosos", id), entry);
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
            await this._write(doc(db, "morosos", moroso.id), updates);
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
        const zones = this.getZones();
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
