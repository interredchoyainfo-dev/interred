import DB from './db.js';
import SEED_DATA from './seed-data.js';
import { API_URL } from './config.js';
import { getNextDebtor, getPriorityDebtors } from './collectionService.js';
import { 
    sendWhatsApp, 
    getMessageByType, 
    buildMassMessageList, 
    sendOneFromList, 
    generateMessage, 
    getMessageLog 
} from './whatsappService.js';
import { activateClient, reduceClient, loginBackend } from './mikrotikService.js';
import { 
    safeArray, 
    safeObject, 
    normalizeCliente, 
    clienteExiste, 
    formatNumber, 
    formatCurrency, 
    formatDate 
} from './utils.js';

// ========================================
// UTILS & HARDENING (Final Version)
// ========================================
const DEBUG = true;
const log = (...args) => { if (DEBUG) console.log("[INTER RED]", ...args); };
window.log = log;

const actionLocks = {};
function lockAction(key) {
    if (actionLocks[key]) return true;
    actionLocks[key] = true;
    setTimeout(() => { delete actionLocks[key]; }, 3000);
    return false;
}
window.lockAction = lockAction;

const $ = (selector) => document.querySelector(selector);
const safeHTML = (el, html) => { if (el) el.innerHTML = html; };

let serverStatusInitialized = false;
function showServerStatus(status) {
    let el = document.getElementById("server-status");
    if (!serverStatusInitialized) {
        el = document.createElement("div");
        el.id = "server-status";
        document.body.appendChild(el);
        serverStatusInitialized = true;
    }
    if (!el) return;
    el.style.position = "fixed";
    el.style.bottom = "10px";
    el.style.right = "10px";
    el.style.padding = "8px 12px";
    el.style.borderRadius = "8px";
    el.style.fontSize = "12px";
    el.style.zIndex = "9999";
    el.style.transition = "all 0.3s ease";
    if (status === "offline") {
        el.innerText = "🔴 Servidor desconectado";
        el.style.background = "#ff4d4f";
        el.style.color = "#fff";
        el.style.boxShadow = "0 2px 8px rgba(255, 77, 79, 0.4)";
    }
    if (status === "online") {
        el.innerText = "🟢 Servidor operativo";
        el.style.background = "#52c41a";
        el.style.color = "#fff";
        el.style.boxShadow = "0 2px 8px rgba(82, 196, 26, 0.4)";
    }
}
window.showServerStatus = showServerStatus;

async function safeFetch(url, options = {}) {
    try {
        const res = await fetch(url, options);
        if (!res.ok) throw new Error("HTTP error " + res.status);
        const contentType = res.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
            showServerStatus("online");
            return await res.json();
        } else {
            const text = await res.text();
            log("Respuesta no JSON:", text);
            return { success: false, error: "Respuesta inválida del servidor", message: "Respuesta inválida del servidor" };
        }
    } catch (err) {
        log("Backend offline or error:", err);
        showServerStatus("offline");
        return { success: false, error: "Servidor no disponible", message: "Servidor no disponible" };
    }
}
window.safeFetch = safeFetch;

function preventDoubleClick(target) {
    const button = target.closest("button");
    if (!button) return false;
    if (button.disabled) return true;
    button.disabled = true;
    const originalContent = button.innerHTML;
    button.innerHTML = '...';
    setTimeout(() => { 
        button.disabled = false; 
        button.innerHTML = originalContent;
    }, 1500);
    return false;
}
window.preventDoubleClick = preventDoubleClick;

async function checkLogin(user, pass) {
    const result = await loginBackend(user, pass);
    if (!result.success) {
        alert(result.message || 'Credenciales incorrectas');
        return false;
    }
    const session = {
        auth: true,
        time: Date.now()
    };
    sessionStorage.setItem('auth', JSON.stringify(session));
    return true;
}

function isAuthenticated() {
    try {
        const session = JSON.parse(sessionStorage.getItem('auth'));
        if (!session || !session.auth) return false;
        const maxTime = 6 * 60 * 60 * 1000; // 6 horas
        if ((Date.now() - session.time) > maxTime) return false;
        // También verificar que tengamos token de API
        const token = sessionStorage.getItem('interred_api_token');
        return !!token;
    } catch {
        return false;
    }
}

let clientesInitialized = false;


const App = {
    currentView: 'dashboard',
    currentMonth: new Date().getMonth() + 1,
    currentYear: new Date().getFullYear(),
    currentZoneFilter: 'ALL',
    currentPaymentZoneFilter: 'ALL',
    currentPaymentStatusFilter: 'ALL',
    confirmCallback: null,
    mkChart: null,
    mkSelectedInterface: 'ALL',
    mkTrafficData: { labels: [], rx: [], tx: [] },

    MONTHS: [
        '', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
        'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ],

    ZONE_COLORS: {
        'SOL DE MAYO': { avatar: 'avatar-sol', badge: 'badge-sol' },
        'VILLA LA PUNTA': { avatar: 'avatar-villa', badge: 'badge-villa' },
        'CHOYA': { avatar: 'avatar-choya', badge: 'badge-choya' },
        'FRIAS': { avatar: 'avatar-frias', badge: 'badge-frias' },
    },

    // ========================================
    // Initialization
    // ========================================
    async init() {
        if (clientesInitialized) {
            log("App ya inicializada, bloqueando re-render innecesario.");
            return;
        }
        clientesInitialized = true;

        // Auth Check V2
        if (!isAuthenticated()) {
            const user = prompt('Usuario:');
            const pass = prompt('Contraseña:');
            if (!await checkLogin(user, pass)) {
                window.location.href = 'login.html';
                return;
            }
        }

        // ===== STEP 1: Bind all UI elements FIRST (synchronous, never fails) =====
        this.injectModernUI();
        this.loadSettings();
        this.bindNavigation();
        this.bindHeaderActions();
        this.bindModals();
        this.bindForms();
        this.bindFilters();
        this.bindSettings();
        this.bindIntelligentCollection();
        this.bindMorosos();
        this.bindMikrotik();
        
        // Bind Sync Buttons
        this._bind('btn-sync-morosos', () => this.syncMikrotik());
        this._bind('btn-sync-mikrotik-main', () => this.syncMikrotik());

        // 🟢 HEARTBEAT SERVIDOR (Check every 10s)
        setInterval(async () => {
            try {
                await fetch(`${API_URL}/api/health`);
                showServerStatus("online");
            } catch {
                showServerStatus("offline");
            }
        }, 10000);

        // FASE 4: Auto-reduction at Day 13, 23:00+
        setInterval(() => this.checkCutDate(), 60000);

        // Router initialization
        this.initRouter();

        // ===== STEP 2: Async operations (may fail if Firebase is not ready) =====
        showServerStatus("online");
        let wasSeeded = false;
        try {
            wasSeeded = await SEED_DATA.run();
        } catch (e) {
            log('⚠️ Seed data failed (Firebase may not be configured yet):', e.message);
        }

        // Show splash for 1.8s then reveal app
        setTimeout(async () => {
            const splash = document.getElementById('splash-screen');
            const app = document.getElementById('app');
            
            if (splash) {
                splash.classList.add('fade-out');
                setTimeout(() => splash.remove(), 500);
            }
            if (app) app.classList.remove('hidden');
            this.initMikrotikChart();
        }, 1800);

        this.checkAutomationTriggers();

        if (wasSeeded) {
            setTimeout(() => {
                this.showToast('✅ 135 clientes precargados en la base de datos', 'success');
            }, 2500);
        }
    },

    // ========================================
    // UI Injection (Dynamic fixes)
    // ========================================
    injectModernUI() {
        // 1. Add Reset Button to Header (near notifications)
        const headerRight = document.querySelector('.header-right');
        if (headerRight && !document.getElementById('btn-reset-month')) {
            const resetBtn = document.createElement('button');
            resetBtn.id = 'btn-reset-month';
            resetBtn.className = 'header-btn';
            resetBtn.style.color = 'var(--accent-red)';
            resetBtn.title = 'Reiniciar Mes / Borrar deudas';
            resetBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/></svg>';
            headerRight.prepend(resetBtn);
        }

        // 2. Add Revenue Breakdown card below stats grid
        const dashboardView = document.getElementById('view-dashboard');
        if (dashboardView && !document.getElementById('revenue-breakdown-grid')) {
            const viewContent = dashboardView.querySelector('.view-content');
            const statsGrid = dashboardView.querySelector('.stats-grid');
            if (statsGrid) {
                const breakdown = document.createElement('div');
                breakdown.id = 'revenue-breakdown-grid';
                breakdown.className = 'revenue-breakdown-grid';
                statsGrid.parentNode.insertBefore(breakdown, statsGrid.nextSibling);
                
                // Add Suspended card into stats grid too
                if (!document.getElementById('stat-suspended')) {
                    const suspCard = document.createElement('div');
                    suspCard.className = 'stat-card stat-suspended';
                    suspCard.innerHTML = `
                        <div class="stat-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></div>
                        <div class="stat-info">
                            <span class="stat-number" id="stat-suspended">0</span>
                            <span class="stat-label">Suspendidos</span>
                        </div>
                    `;
                    statsGrid.appendChild(suspCard);
                }

                // 3. Add Suspended List Section below Debt List
                if (!document.getElementById('suspended-section')) {
                    const suspSection = document.createElement('div');
                    suspSection.id = 'suspended-section';
                    suspSection.className = 'dashboard-section mt-8';
                    suspSection.innerHTML = `
                        <div class="section-header">
                            <h3 class="section-title" style="color: var(--accent-amber);">Clientes Suspendidos (Mkt)</h3>
                            <button class="btn-action-sm" onclick="App.navigate('morosos')" style="color: var(--accent-amber); background: rgba(245, 158, 11, 0.1);">
                                Ver todos
                            </button>
                        </div>
                        <div id="suspended-list" class="debt-list">
                            <!-- Inyectado dinámicamente -->
                        </div>
                    `;
                    // Insert before notifications or at bottom
                    viewContent.appendChild(suspSection);
                }
            }
        }
    },
    bindNavigation() {
        const navItems = document.querySelectorAll('.nav-item');
        navItems.forEach(item => {
            item.addEventListener('click', () => {
                const view = item.dataset.view;
                this.navigate(view);
            });
        });
    },

    bindHeaderActions() {
        this._bind('btn-notifications', () => {
            this.navigate('notifications');
        });
        
        this._bind('btn-reset-month', () => this.confirmReset());
    },

    confirmReset() {
        this.confirmCallback = () => {
            DB.clearAllPayments();
            this.showToast('♻️ Base de datos reiniciada. Todos los pagos han sido borrados.', 'success');
            this.renderDashboard();
        };
        const modal = document.getElementById('modal-confirm');
        document.getElementById('confirm-message').textContent = '¿Estás seguro de reiniciar TODOS los cobros y morosos? Esta acción no se puede deshacer.';
        this.openModal('modal-confirm');
    },

    navigate(view, params = []) {
        const path = this.getPathFromView(view, params);
        if (window.location.pathname !== path) {
            window.history.pushState({ view, params }, '', path);
        }
        this.handleRoute(view, params);
    },

    getPathFromView(view, params) {
        const mapping = {
            dashboard: '/dashboard',
            clients: '/clientes',
            payments: '/cobros',
            morosos: '/morosos',
            settings: '/ajustes',
            notifications: '/notificaciones'
        };
        let path = mapping[view] || `/${view}`;
        if (params.length > 0) path += '/' + params.map(p => encodeURIComponent(p)).join('/');
        return path;
    },

    getViewFromPath(path) {
        const cleanPath = path.replace(/^\/+|\/+$/g, '');
        const segments = cleanPath.split('/');
        const segment = segments[0] || '';
        const params = segments.slice(1);

        const reverseMapping = {
            '': 'dashboard',
            'dashboard': 'dashboard',
            'dashnoard': 'dashboard', // Fallback para typo
            'clientes': 'clients',
            'cobros': 'payments',
            'morosos': 'morosos',
            'ajustes': 'settings',
            'notificaciones': 'notifications'
        };

        // Also support hashes as fallback
        if (window.location.hash) {
            const hashParts = window.location.hash.replace('#', '').split('/');
            return { view: reverseMapping[hashParts[0]] || hashParts[0], params: hashParts.slice(1) };
        }

        return { view: reverseMapping[segment] || segment || 'dashboard', params };
    },

    initRouter() {
        window.addEventListener('popstate', (e) => {
            const { view, params } = this.getViewFromPath(window.location.pathname);
            this.handleRoute(view, params);
        });

        // Handle initial route
        const { view, params } = this.getViewFromPath(window.location.pathname);
        this.handleRoute(view, params);
    },

    handleRoute(view, params) {
        // Handle specific route logic if needed (like zone filters)
        if (view === 'clients' && params[0]) {
            this.currentZoneFilter = decodeURIComponent(params[0]);
            // Update filter chip UI after transition
        }

        this.navigateTo(view, false);
    },

    navigateTo(viewName, updateURL = true) {
        // Validate view exists
        if (!document.getElementById(`view-${viewName}`)) {
            viewName = 'dashboard';
        }

        if (updateURL) {
            this.navigate(viewName);
            return;
        }
        // Update nav
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        const activeNav = document.querySelector(`.nav-item[data-view="${viewName}"]`);
        if (activeNav) activeNav.classList.add('active');

        // Update views
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        const view = document.getElementById(`view-${viewName}`);
        if (view) {
            view.classList.add('active');
            // Force re-animation
            view.style.animation = 'none';
            view.offsetHeight;
            view.style.animation = null;
        }

        // Update header subtitle
        const subtitles = {
            dashboard: 'Dashboard',
            clients: 'Clientes',
            payments: 'Cobros',
            morosos: 'Morosos',
            mikrotik: 'MikroTik',
            settings: 'Ajustes',
            notifications: 'Notificaciones'
        };
        document.getElementById('header-subtitle').textContent = subtitles[viewName] || '';

        this.currentView = viewName;

        // Render view content
        switch (viewName) {
            case 'dashboard': this.renderDashboard(); break;
            case 'clients': this.renderClients(); break;
            case 'payments': this.renderPayments(); break;
            case 'morosos': this.renderMorosos(); break;
            case 'mikrotik': this.loadMikrotikDashboard(); break;
            case 'settings': this.loadSettings(); break;
            case 'notifications': this.renderNotifications(); break;
        }
    },

    // ========================================
    // Dashboard
    // ========================================
    renderDashboard() {
        const stats = DB.getStatsForMonth(this.currentMonth, this.currentYear);

        // Update month label
        document.getElementById('current-month-label').textContent =
            `${this.MONTHS[this.currentMonth]} ${this.currentYear}`;

        // Update stat cards
        document.getElementById('stat-total-clients').textContent = stats.totalClients;
        document.getElementById('stat-paid').textContent = stats.paidCount;
        document.getElementById('stat-debt').textContent = stats.debtCount;
        document.getElementById('stat-revenue').textContent = formatCurrency(stats.totalRevenue);

        // NEW: Update Suspended card
        const suspendedStat = document.getElementById('stat-suspended');
        if (suspendedStat) {
            suspendedStat.textContent = stats.suspendedCount || '0';
        }

        // NEW: Revenue Breakdown
        const revenueGrid = document.getElementById('revenue-breakdown-grid');
        if (revenueGrid) {
            revenueGrid.innerHTML = `
                <div class="rev-card">
                    <span class="rev-label">Efectivo Total</span>
                    <span class="rev-value">${formatCurrency(stats.revenueCash)}</span>
                </div>
                <div class="rev-card">
                    <span class="rev-label">Transferencia Total</span>
                    <span class="rev-value" style="color: #3b82f6;">${formatCurrency(stats.revenueTransfer)}</span>
                </div>
            `;
        }

        // Update notification badge
        const badge = document.getElementById('notification-badge');
        if (stats.debtCount > 0) {
            badge.textContent = stats.debtCount;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }

        const zonesGrid = document.getElementById('zones-grid');
        if (!zonesGrid) return;
        zonesGrid.innerHTML = safeArray(stats.zoneStats).map(z => `
            <div class="zone-card" data-zone="${z.zone}">
                <div class="zone-name">${z.zone}</div>
                <div class="zone-count">${z.total} <small>clientes</small></div>
                <div class="zone-revenue-mini">
                    <div>💲 ${formatCurrency(z.cash)}</div>
                    <div style="color: #60a5fa;">💳 ${formatCurrency(z.transfer)}</div>
                </div>
                <div class="zone-debt-info">
                    <span class="zone-debt-count">${z.debt}</span>
                    <span class="zone-debt-label">con deuda</span>
                </div>
            </div>
        `).join('');

        // Render debt list
        const debtList = document.getElementById('debt-list');
        if (stats.debtClients.length === 0) {
            debtList.innerHTML = `
                <div class="empty-state">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                        <polyline points="22 4 12 14.01 9 11.01"/>
                    </svg>
                    <h3>¡Todos al día!</h3>
                    <p>No hay clientes con deuda este mes</p>
                </div>
            `;
        } else {
            debtList.innerHTML = safeArray(stats.debtClients).map(client => this.renderClientCard(normalizeCliente(client), true)).join('');
        }

        // NEW: Render Suspended List
        const suspendedList = document.getElementById('suspended-list');
        if (suspendedList) {
            if (stats.suspendedClients && stats.suspendedClients.length > 0) {
                suspendedList.innerHTML = safeArray(stats.suspendedClients).map(client => this.renderClientCard(normalizeCliente(client), false)).join('');
            } else {
                suspendedList.innerHTML = '<div class="empty-state"><p>No hay clientes suspendidos actualmente</p></div>';
            }
        }

        // Bind month navigation
        document.getElementById('btn-prev-month').onclick = () => this.changeMonth(-1);
        document.getElementById('btn-next-month').onclick = () => this.changeMonth(1);

        // Bind send reminders
        document.getElementById('btn-send-reminders').onclick = () => this.sendBulkReminders();
    },

    changeMonth(delta) {
        this.currentMonth += delta;
        if (this.currentMonth > 12) {
            this.currentMonth = 1;
            this.currentYear++;
        } else if (this.currentMonth < 1) {
            this.currentMonth = 12;
            this.currentYear--;
        }
        this.renderDashboard();
    },

    navigateToZone(zone) {
        this.currentZoneFilter = zone;
        this.navigate('clients', [zone]);
        // Set filter chip
        document.querySelectorAll('#filter-chips .chip').forEach(c => {
            c.classList.toggle('active', c.dataset.zone === zone);
        });
    },

    // ========================================
    // Clients View
    // ========================================
    renderClients() {
        const clients = DB.getClients();
        let filtered = clients;

        // Filter by zone
        if (this.currentZoneFilter !== 'ALL') {
            filtered = filtered.filter(c => c.zona === this.currentZoneFilter);
        }

        // Filter by search
        const searchTerm = document.getElementById('search-clients').value.toLowerCase();
        if (searchTerm) {
            filtered = filtered.filter(c =>
                `${c.nombre} ${c.apellido || ''}`.toLowerCase().includes(searchTerm) ||
                (c.whatsapp && c.whatsapp.includes(searchTerm))
            );
        }

        // Sort alphabetically
        filtered.sort((a, b) => `${a.apellido || ''} ${a.nombre}`.localeCompare(`${b.apellido || ''} ${b.nombre}`));

        const list = document.getElementById('clients-list');
        if (filtered.length === 0) {
            list.innerHTML = `
                <div class="empty-state">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                        <circle cx="9" cy="7" r="4"/>
                        <line x1="17" y1="11" x2="23" y2="11"/>
                    </svg>
                    <h3>Sin clientes</h3>
                    <p>Presioná + para agregar un cliente</p>
                </div>
            `;
        } else {
            list.innerHTML = safeArray(filtered).map(client => this.renderClientCard(normalizeCliente(client), false)).join('');
        }
    },

    renderClientCard(client, isDebtView) {
        const colors = this.ZONE_COLORS[client.zona] || { avatar: 'avatar-choya', badge: 'badge-choya' };
        const initial1 = client.nombre ? client.nombre[0] : '?';
        const initial2 = client.apellido ? client.apellido[0] : (client.nombre && client.nombre.length > 1 ? client.nombre[1] : '');
        const initials = (initial1 + initial2).toUpperCase();
        const displayName = client.apellido ? `${client.apellido}, ${client.nombre}` : client.nombre;
        const hasPaid = DB.hasPaymentForMonth(client.id, this.currentMonth, this.currentYear);

        let statusClass = '';
        let statusText = client.estado || 'Activo';
        if (!hasPaid) {
            statusClass = 'status-deudor';
            statusText = 'DEUDA';
        } else {
            statusClass = 'status-activo';
            statusText = 'AL DÍA';
        }

        const cardClass = hasPaid ? 'paid-card' : 'debt-card';

        return `
            <div class="client-card ${cardClass}" onclick="App.showClientDetail('${client.id}')">
                <div class="client-avatar ${colors.avatar}">${initials}</div>
                <div class="client-info">
                    <div class="client-name">${displayName}</div>
                    <div class="client-meta">
                        <span class="client-zone-badge ${colors.badge}">${client.zona}</span>
                        <span class="client-status ${statusClass}">${statusText}</span>
                    </div>
                </div>
                ${!hasPaid ? '<span class="debt-badge">DEUDA</span>' : ''}
                <div class="client-actions" onclick="event.stopPropagation()">
                    ${!hasPaid ? `
                        <button class="btn-client-action btn-pay" onclick="App.openPaymentModal('${client.id}')" title="Registrar Pago">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                        </button>
                    ` : ''}
                    <button class="btn-client-action btn-whatsapp" onclick="App.openWhatsApp('${client.id}')" title="WhatsApp">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                    </button>
                </div>
            </div>
        `;
    },

    // ========================================
    // Payments View
    // ========================================
    renderPayments() {
        this.renderRouteList();

        const clients = DB.getClients();
        let filtered = clients;

        // Filter by zone
        if (this.currentPaymentZoneFilter !== 'ALL') {
            filtered = filtered.filter(c => c.zona === this.currentPaymentZoneFilter);
        }

        // Filter by search
        const searchTerm = document.getElementById('search-payments').value.toLowerCase();
        if (searchTerm) {
            filtered = filtered.filter(c =>
                `${c.nombre} ${c.apellido || ''}`.toLowerCase().includes(searchTerm) ||
                (c.whatsapp && c.whatsapp.includes(searchTerm))
            );
        }

        // Filter by payment status
        if (this.currentPaymentStatusFilter === 'PAID') {
            filtered = filtered.filter(c => DB.hasPaymentForMonth(c.id, this.currentMonth, this.currentYear));
        } else if (this.currentPaymentStatusFilter === 'PENDING') {
            filtered = filtered.filter(c => !DB.hasPaymentForMonth(c.id, this.currentMonth, this.currentYear));
        }

        // Sort: unpaid first, then alphabetically
        filtered.sort((a, b) => {
            const aPaid = DB.hasPaymentForMonth(a.id, this.currentMonth, this.currentYear);
            const bPaid = DB.hasPaymentForMonth(b.id, this.currentMonth, this.currentYear);
            if (aPaid !== bPaid) return aPaid ? 1 : -1;
            return `${a.apellido || ''} ${a.nombre}`.localeCompare(`${b.apellido || ''} ${b.nombre}`);
        });

        const list = document.getElementById('payments-list');
        if (filtered.length === 0) {
            list.innerHTML = `
                <div class="empty-state">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
                        <line x1="1" y1="10" x2="23" y2="10"/>
                    </svg>
                    <h3>Sin resultados</h3>
                    <p>No se encontraron clientes con los filtros actuales</p>
                </div>
            `;
        } else {
            list.innerHTML = safeArray(filtered).map(client => {
                const hasPaid = DB.hasPaymentForMonth(client.id, this.currentMonth, this.currentYear);
                const payment = DB.getPaymentForMonth(client.id, this.currentMonth, this.currentYear);
                const normClient = normalizeCliente(client);
                const colors = this.ZONE_COLORS[normClient.zona] || { avatar: 'avatar-choya', badge: 'badge-choya' };
                const initials = ((normClient.nombre[0] || '?') + (normClient.apellido[0] || '')).toUpperCase();
                const displayName = normClient.apellido ? `${normClient.apellido}, ${normClient.nombre}` : normClient.nombre;

                return `
                    <div class="client-card ${hasPaid ? 'paid-card' : 'debt-card'}">
                        <div class="client-avatar ${colors.avatar}">${initials}</div>
                        <div class="client-info" onclick="App.showClientDetail('${normClient.id}')">
                            <div class="client-name">${displayName}</div>
                            <div class="client-meta">
                                <span class="client-zone-badge ${colors.badge}">${normClient.zona}</span>
                                ${hasPaid
                        ? `<span class="client-status status-activo">$${formatNumber(payment.amount)}</span>`
                        : '<span class="client-status status-deudor">PENDIENTE</span>'
                    }
                            </div>
                        </div>
                        <div class="client-actions">
                            ${!hasPaid ? `
                                <button class="btn-client-action btn-pay" onclick="if(!preventDoubleClick(this)) App.openPaymentModal('${normClient.id}')" title="Cobrar">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                                </button>
                            ` : `
                                <span style="color: var(--accent-green); font-size: 0.7rem; font-weight: 700;">✓ PAGADO</span>
                            `}
                        </div>
                    </div>
                `;
            }).join('');
        }
    },

    renderNotifications() {
        const log = getMessageLog().reverse();
        const container = document.getElementById('notifications-list');
        if (container) {
            if (log.length === 0) {
                container.innerHTML = `
                    <div class="empty-state">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                        </svg>
                        <h3>Sin actividad</h3>
                        <p>Aquí verás el historial de WhatsApp enviado.</p>
                    </div>
                `;
            } else {
                container.innerHTML = safeArray(log).map(entry => `
                    <div class="notification-item">
                        <div class="notification-icon">💬</div>
                        <div class="notification-info">
                            <div class="notification-title">Mensaje enviado a <b>${entry.client || entry.phone}</b></div>
                            <div class="notification-desc">${entry.message.substring(0, 80)}${entry.message.length > 80 ? '...' : ''}</div>
                            <div class="notification-time">${new Date(entry.timestamp).toLocaleTimeString()} - ${new Date(entry.timestamp).toLocaleDateString()}</div>
                        </div>
                    </div>
                `).join('');
            }
        }
    },

    // ========================================
    // Intelligent Collection (Phase 2)
    // ========================================
    bindIntelligentCollection() {
        const nextBtn = document.getElementById('next-debtor-btn');
        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                const next = getNextDebtor(this.currentMonth, this.currentYear);
                if (!next) {
                    this.showToast('🎉 ¡No quedan deudores este mes!', 'success');
                    return;
                }
                this.openPaymentModal(next.id);
            });
        }
    },

    renderRouteList() {
        const list = getPriorityDebtors(this.currentMonth, this.currentYear).slice(0, 5); // Top 5
        const container = document.getElementById('route-list');
        if (!container) return;

        if (list.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <p>No hay deudores prioritarios</p>
                </div>
            `;
            return;
        }

        container.innerHTML = list.map(client => `
            <div class="route-item" onclick="App.openPaymentModal('${client.id}')">
                <div class="route-item-info">
                    <span class="route-item-name">${client.apellido || ''}, ${client.nombre}</span>
                    <div class="route-item-meta">
                        <span class="route-priority-badge">${client.missed} meses adeudados</span>
                        <span>${client.zona}</span>
                    </div>
                </div>
                <button class="btn-primary-sm">
                    Cobrar
                </button>
            </div>
        `).join('');
    },

    // ========================================
    // Modals
    // ========================================
    // Helper to safely bind click events
    _bind(id, handler) {
        const el = document.getElementById(id);
        if (el) el.addEventListener('click', handler);
    },

    bindModals() {
        // Client modal
        this._bind('fab-add-client', () => this.openClientModal());
        this._bind('modal-client-close', () => this.closeModal('modal-client'));
        this._bind('modal-payment-close', () => this.closeModal('modal-payment'));
        this._bind('modal-detail-close', () => this.closeModal('modal-client-detail'));
        this._bind('modal-moroso-close', () => this.closeModal('modal-add-moroso'));
        this._bind('modal-mass-close', () => this.closeModal('modal-mass-whatsapp'));

        // Overlay clicks
        const modals = ['modal-client', 'modal-payment', 'modal-client-detail', 'modal-confirm', 'modal-add-moroso', 'modal-mass-whatsapp'];
        
        // Confirm modal
        this._bind('confirm-cancel', () => this.closeModal('modal-confirm'));
        this._bind('confirm-ok', () => {
            if (this.confirmCallback) this.confirmCallback();
            this.closeModal('modal-confirm');
        });

        // Close modal on overlay click
        document.querySelectorAll('.modal-overlay').forEach(overlay => {
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) this.closeModal(overlay.id);
            });
        });
    },

    openModal(id) {
        const modal = document.getElementById(id);
        if (!modal) return;
        modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    },

    closeModal(id) {
        const modal = document.getElementById(id);
        if (!modal) return;
        modal.classList.add('hidden');
        document.body.style.overflow = '';
    },

    // ---- Client Modal ----
    openClientModal(clientId = null) {
        const isEdit = !!clientId;
        document.getElementById('modal-client-title').textContent = isEdit ? 'Editar Cliente' : 'Nuevo Cliente';
        document.getElementById('btn-save-client').innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
            ${isEdit ? 'Actualizar' : 'Guardar Cliente'}
        `;

        if (isEdit) {
            const client = DB.getClientById(clientId);
            if (!client) return;
            document.getElementById('client-id').value = client.id;
            document.getElementById('client-nombre').value = client.nombre;
            document.getElementById('client-apellido').value = client.apellido;
            document.getElementById('client-whatsapp').value = client.whatsapp;
            document.getElementById('client-zona').value = client.zona;
            document.getElementById('client-estado').value = client.estado || 'Activo';
            document.getElementById('client-ip').value = client.ip || '';
            document.getElementById('client-mac').value = client.mac || '';
            document.getElementById('client-antena').value = client.antena || '';
            document.getElementById('client-router').value = client.router || '';
        } else {
            document.getElementById('form-client').reset();
            document.getElementById('client-id').value = '';
            document.getElementById('client-estado').value = 'Activo';
            document.getElementById('client-ip').value = '';
            document.getElementById('client-mac').value = '';
            document.getElementById('client-antena').value = '';
            document.getElementById('client-router').value = '';
        }

        this.openModal('modal-client');
    },

    // ---- Payment Modal ----
    openPaymentModal(clientId) {
        const client = DB.getClientById(clientId);
        if (!client) return;
        const settings = DB.getSettings();

        document.getElementById('payment-client-id').value = clientId;
        document.getElementById('payment-client-info').innerHTML = `
            <div class="client-avatar ${this.ZONE_COLORS[client.zona]?.avatar || 'avatar-choya'}">
                ${(client.nombre[0] + client.apellido[0]).toUpperCase()}
            </div>
            <div>
                <div class="payment-client-name">${client.nombre} ${client.apellido}</div>
                <div class="payment-client-zone">${client.zona}</div>
            </div>
        `;

        document.getElementById('payment-mes').value = this.currentMonth;
        document.getElementById('payment-anio').value = this.currentYear;
        document.getElementById('payment-monto').value = settings.defaultAmount;
        document.getElementById('payment-fecha').value = new Date().toISOString().split('T')[0];
        document.getElementById('payment-medio').value = 'Transferencia';

        // Set active quick amount
        document.querySelectorAll('.quick-amount-btn').forEach(btn => {
            btn.classList.toggle('active', parseInt(btn.dataset.amount) === settings.defaultAmount);
        });

        this.closeModal('modal-client-detail');
        this.openModal('modal-payment');
    },

    // ---- Client Detail Modal ----
    showClientDetail(clientId) {
        const client = DB.getClientById(clientId);
        if (!client) return;

        document.getElementById('detail-client-name').textContent = `${client.nombre} ${client.apellido}`;

        const payments = DB.getPaymentsByClient(clientId);
        payments.sort((a, b) => {
            if (a.year !== b.year) return b.year - a.year;
            return b.month - a.month;
        });

        const hasPaid = DB.hasPaymentForMonth(clientId, this.currentMonth, this.currentYear);
        const statusText = hasPaid ? 'AL DÍA' : 'CON DEUDA';
        const statusClass = hasPaid ? 'status-activo' : 'status-deudor';

        document.getElementById('detail-client-body').innerHTML = `
            <div class="detail-section">
                <div class="detail-info-grid">
                    <div class="detail-info-item">
                        <div class="detail-info-label">Zona</div>
                        <div class="detail-info-value">${client.zona}</div>
                    </div>
                    <div class="detail-info-item">
                        <div class="detail-info-label">Estado</div>
                        <div class="detail-info-value ${statusClass}">${statusText}</div>
                    </div>
                    <div class="detail-info-item">
                        <div class="detail-info-label">WhatsApp</div>
                        <div class="detail-info-value">+54 ${client.whatsapp}</div>
                    </div>
                    <div class="detail-info-item">
                        <div class="detail-info-label">Pagos totales</div>
                        <div class="detail-info-value">${payments.length}</div>
                    </div>
                </div>
            </div>

            <div class="detail-section">
                <div class="detail-section-title">Datos Técnicos</div>
                <div class="detail-info-grid">
                    <div class="detail-info-item">
                        <div class="detail-info-label">IP</div>
                        <div class="detail-info-value">${client.ip || '-'}</div>
                    </div>
                    <div class="detail-info-item">
                        <div class="detail-info-label">MAC</div>
                        <div class="detail-info-value">${client.mac || '-'}</div>
                    </div>
                    <div class="detail-info-item">
                        <div class="detail-info-label">Antena</div>
                        <div class="detail-info-value">${client.antena || '-'}</div>
                    </div>
                    <div class="detail-info-item">
                        <div class="detail-info-label">Router</div>
                        <div class="detail-info-value">${client.router || '-'}</div>
                    </div>
                </div>
            </div>

            <div class="detail-actions">
                <button class="detail-action-btn detail-btn-pay" onclick="App.openPaymentModal('${client.id}')">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                    Cobrar
                </button>
                <button class="detail-action-btn detail-btn-whatsapp" onclick="App.openWhatsApp('${client.id}')">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                    WhatsApp
                </button>
                <button class="detail-action-btn detail-btn-preview" onclick="App.previewWhatsAppMessage('${client.id}')">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    Vista Previa
                </button>
                <button class="detail-action-btn detail-btn-edit" onclick="App.closeModal('modal-client-detail'); App.openClientModal('${client.id}')">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    Editar
                </button>
                ${(() => {
                    const sinIP = !client.ip || client.ip === '0.0.0.0';
                    return `
                    <button class="detail-action-btn" onclick="App.activateService('${client.id}')" ${sinIP ? 'disabled title="Cliente sin IP"' : ''} style="color: var(--accent-green); border-color: var(--accent-green); opacity: ${sinIP ? '0.5' : '1'};">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
                        Activar Mkt
                    </button>
                    <button class="detail-action-btn" onclick="App.reduceService('${client.id}')" ${sinIP ? 'disabled title="Cliente sin IP"' : ''} style="color: var(--accent-red); border-color: var(--accent-red); opacity: ${sinIP ? '0.5' : '1'};">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                        Reducir Mkt
                    </button>`;
                })()}
                <button class="detail-action-btn detail-btn-delete" onclick="App.confirmDeleteClient('${client.id}')">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    Eliminar
                </button>
            </div>

            <div class="detail-section">
                <div class="detail-section-title">Historial de Pagos</div>
                ${payments.length === 0
                ? '<p style="color: var(--text-muted); font-size: 0.85rem; text-align: center; padding: 16px;">Sin pagos registrados</p>'
                : payments.map(p => `
                        <div class="payment-history-item">
                            <div class="payment-history-left">
                                <span class="payment-history-period">${this.MONTHS[p.month]} ${p.year}</span>
                                <span class="payment-history-date">${formatDate(p.paymentDate)}</span>
                            </div>
                            <div class="payment-history-right">
                                <span class="payment-history-amount">$${formatNumber(p.amount)}</span>
                                <span class="payment-history-method">${p.method}</span>
                            </div>
                            <button class="payment-delete-btn" onclick="App.confirmDeletePayment('${p.id}', '${client.id}')" title="Eliminar pago">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                            </button>
                        </div>
                    `).join('')
            }
            </div>
        `;

        this.openModal('modal-client-detail');
    },

    // ========================================
    // Forms
    // ========================================
    bindForms() {
        // Save client
        const formClient = document.getElementById('form-client');
        if (formClient) {
            formClient.addEventListener('submit', (e) => {
                e.preventDefault();
                this.saveClient();
            });
        }

        // Save payment
        const formPayment = document.getElementById('form-payment');
        if (formPayment) {
            formPayment.addEventListener('submit', (e) => {
                e.preventDefault();
                this.savePayment();
            });
        }

        // Quick amount buttons
        document.querySelectorAll('.quick-amount-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const amount = parseInt(btn.dataset.amount);
                const montoEl = document.getElementById('payment-monto');
                if (montoEl) montoEl.value = amount;
                document.querySelectorAll('.quick-amount-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });

        // Search inputs
        const searchClients = document.getElementById('search-clients');
        if (searchClients) searchClients.addEventListener('input', () => this.renderClients());
        const searchPayments = document.getElementById('search-payments');
        if (searchPayments) searchPayments.addEventListener('input', () => this.renderPayments());
    },

    async saveClient() {
        const id = document.getElementById('client-id').value;
        const client = {
            nombre: document.getElementById('client-nombre').value.trim(),
            apellido: document.getElementById('client-apellido').value.trim(),
            whatsapp: document.getElementById('client-whatsapp').value.trim(),
            zona: document.getElementById('client-zona').value,
            estado: document.getElementById('client-estado').value,
            ip: document.getElementById('client-ip').value.trim() || '0.0.0.0',
            mac: document.getElementById('client-mac').value.trim(),
            antena: document.getElementById('client-antena').value.trim(),
            router: document.getElementById('client-router').value.trim(),
        };

        if (!client.nombre || !client.apellido || !client.whatsapp || !client.zona) {
            this.showToast('Completá todos los campos obligatorios', 'error');
            return;
        }

        // Hardened duplicate check (only for new clients)
        if (!id) {
            const existentes = DB.getClients();
            if (clienteExiste(existentes, client)) {
                log("Intento de duplicación bloqueado:", client.nombre);
                this.showToast(`Error: El cliente ${client.nombre} con la IP ${client.ip} ya existe.`, 'error');
                return;
            }
        }

        if (id) client.id = id;
        await DB.saveClient(client);
        this.finishClientSave(id);
    },

    finishClientSave(isEdit) {
        this.closeModal('modal-client');
        this.showToast(isEdit ? 'Cliente actualizado' : 'Cliente registrado', 'success');
        this.refreshCurrentView();
    },

    async savePayment() {
        const clientId = document.getElementById('payment-client-id').value;
        const month = parseInt(document.getElementById('payment-mes').value);
        const year = parseInt(document.getElementById('payment-anio').value);
        const amount = parseInt(document.getElementById('payment-monto').value);
        const method = document.getElementById('payment-medio').value;
        const paymentDate = document.getElementById('payment-fecha').value;

        if (!amount || amount <= 0) {
            this.showToast('Ingresá un monto válido', 'error');
            return;
        }

        // Check if payment already exists for this month
        const existing = DB.getPaymentForMonth(clientId, month, year);
        if (existing) {
            this.showToast(`Ya hay un pago registrado para ${this.MONTHS[month]} ${year}`, 'warning');
            return;
        }

        await DB.savePayment({
            clientId,
            month,
            year,
            amount,
            method,
            paymentDate,
        });

        // update client status
        const client = DB.getClientById(clientId);
        if (client && client.estado !== 'Activo') {
            this.showToast('Actualizando MikroTik...', 'info');
            const mtRes = await activateClient(client);

            if (mtRes && mtRes.success) {
                client.estado = 'Activo';
                await DB.saveClient(client);
                console.log(`Servicio restaurado automáticamente tras el pago para ${client.nombre}`);
                this.showToast('Pago registrado y servicio activo en MikroTik', 'success');
            } else {
                client.estado = 'Activo'; 
                await DB.saveClient(client);
                this.showToast(`Pago guardado, pero falló MikroTik: ${mtRes?.message}`, 'warning');
            }
        } else {
            this.showToast('Pago registrado exitosamente', 'success');
        }

        // 🔄 SYNC AUTOMÁTICO
        this.syncMikrotik(true); // silent sync

        this.closeModal('modal-payment');
        this.refreshCurrentView();
    },

    // ========================================
    // Filters
    // ========================================
    bindFilters() {
        // Client zone chips
        document.querySelectorAll('#filter-chips .chip').forEach(chip => {
            chip.addEventListener('click', () => {
                document.querySelectorAll('#filter-chips .chip').forEach(c => c.classList.remove('active'));
                chip.classList.add('active');
                this.currentZoneFilter = chip.dataset.zone;
                this.renderClients();
            });
        });

        // Payment zone chips
        document.querySelectorAll('#payment-filter-chips .chip').forEach(chip => {
            chip.addEventListener('click', () => {
                document.querySelectorAll('#payment-filter-chips .chip').forEach(c => c.classList.remove('active'));
                chip.classList.add('active');
                this.currentPaymentZoneFilter = chip.dataset.zone;
                this.renderPayments();
            });
        });

        // Payment status chips
        document.querySelectorAll('.chip-status').forEach(chip => {
            chip.addEventListener('click', () => {
                document.querySelectorAll('.chip-status').forEach(c => c.classList.remove('active'));
                chip.classList.add('active');
                this.currentPaymentStatusFilter = chip.dataset.status;
                this.renderPayments();
            });
        });
    },

    // ========================================
    // Settings
    // ========================================
    bindSettings() {
        // Auto-save settings on change
        const settingInputs = [
            'setting-default-amount', 'setting-phone',
            'setting-reminder-10', 'setting-reminder-13',
            'setting-msg-10', 'setting-msg-13',
            'setting-mikrotik-host', 'setting-mikrotik-port',
            'setting-mikrotik-user', 'setting-mikrotik-password',
            'setting-mikrotik-list'
        ];

        settingInputs.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('change', () => this.saveSettingsFromForm());
                if (el.tagName === 'TEXTAREA' || el.type === 'text' || el.type === 'tel' || el.type === 'number') {
                    el.addEventListener('input', () => this.saveSettingsFromForm());
                }
            }
        });
        // Test MikroTik
        const btnTest = document.getElementById('btn-test-mikrotik');
        if (btnTest) {
            btnTest.addEventListener('click', async () => {
                const config = {
                    host: document.getElementById('setting-mikrotik-host').value,
                    port: parseInt(document.getElementById('setting-mikrotik-port').value) || 8728,
                    user: document.getElementById('setting-mikrotik-user').value,
                    password: document.getElementById('setting-mikrotik-password').value,
                };
                
                if (!config.host || !config.user || !config.password) {
                    this.showToast('Llená el host, el usuario y la contraseña', 'error');
                    return;
                }
                
                this.showToast('Probando conexión a MikroTik...', 'info');
                try {
                    const { testMikrotikConnection } = await import('./mikrotikService.js');
                    const res = await testMikrotikConnection(config);
                    
                    if (res.success) {
                        this.showToast(`✅ Conexión Ok! (${res.identity} - ${res.version})`, 'success');
                    } else {
                        this.showToast(`❌ Error: ${res.message}`, 'error');
                    }
                } catch (err) {
                    this.showToast('No se pudo conectar al Backend local', 'error');
                }
            });
        }

        // Export
        this._bind('btn-export-data', () => this.exportData());

        // Cleanup DB
        this._bind('btn-cleanup-db', async () => {
            if (confirm('¿Estás seguro de que deseas limpiar la base de datos de duplicados? Esta acción es irreversible.')) {
                this.showToast('Limpiando base de datos...', 'info');
                const result = await DB.cleanupDatabase();
                this.showToast(`✅ Limpieza completada: ${result.clientsDeleted} clientes y ${result.paymentsDeleted} pagos eliminados.`, 'success');
                this.renderDashboard();
            }
        });

        // Import
        this._bind('btn-import-data', () => {
            const fileInput = document.getElementById('import-file-input');
            if (fileInput) fileInput.click();
        });
        const importInput = document.getElementById('import-file-input');
        if (importInput) importInput.addEventListener('change', (e) => this.importData(e));
    },

    loadSettings() {
        const settings = DB.getSettings();
        document.getElementById('setting-default-amount').value = settings.defaultAmount;
        document.getElementById('setting-phone').value = settings.phone;
        document.getElementById('setting-reminder-10').checked = settings.reminder10Enabled;
        document.getElementById('setting-reminder-13').checked = settings.reminder13Enabled;
        document.getElementById('setting-msg-10').value = settings.message10;
        document.getElementById('setting-msg-13').value = settings.message13;
    },

    async saveSettingsFromForm() {
        const existingSettings = DB.getSettings();
        const settings = {
            ...existingSettings,
            defaultAmount: parseInt(document.getElementById('setting-default-amount').value) || 30000,
            phone: document.getElementById('setting-phone').value,
            reminder10Enabled: document.getElementById('setting-reminder-10').checked,
            reminder13Enabled: document.getElementById('setting-reminder-13').checked,
            message10: document.getElementById('setting-msg-10').value,
            message13: document.getElementById('setting-msg-13').value,
        };
        await DB.saveSettings(settings);

        // Update quick amount buttons
        const quickBtns = document.querySelectorAll('.quick-amount-btn');
        const hasDefault = Array.from(quickBtns).some(b => parseInt(b.dataset.amount) === settings.defaultAmount);
        if (!hasDefault) {
            quickBtns.forEach(b => b.classList.remove('active'));
        }
    },

    // ========================================
    // WhatsApp Integration
    // ========================================
    openWhatsApp(clientId) {
        const client = DB.getClientById(clientId);
        if (!client) return;

        const settings = DB.getSettings();
        const hasPaid = DB.hasPaymentForMonth(client.id, this.currentMonth, this.currentYear);

        let message;
        if (!hasPaid) {
            const today = new Date().getDate();
            const type = (today >= 13) ? '13' : '10';
            message = getMessageByType(client, settings, type);
        } else {
            message = `Hola ${client.nombre}, gracias por tu pago de INTER RED. ¡Que tengas un buen día!`;
        }

        sendWhatsApp(client.whatsapp, message, `${client.nombre} ${client.apellido || ''}`);
        this.showToast('Abriendo WhatsApp...', 'info');
    },

    previewWhatsAppMessage(clientId) {
        const client = DB.getClientById(clientId);
        if (!client) return;

        const settings = DB.getSettings();
        const today = new Date().getDate();
        const type = (today >= 13) ? '13' : '10';
        const message = getMessageByType(client, settings, type);

        this.showConfirm(
            'Vista Previa',
            `<div style="font-size: 0.9rem; white-space: pre-wrap; text-align: left; padding: 10px; background: rgba(0,0,0,0.2); border-radius: 8px;">${message}</div>`,
            () => this.openWhatsApp(clientId)
        );
        document.getElementById('confirm-ok').textContent = 'Enviar';
    },

    sendBulkReminders() {
        const stats = DB.getStatsForMonth(this.currentMonth, this.currentYear);
        if (stats.debtClients.length === 0) {
            this.showToast('No hay clientes con deuda este mes 🎉', 'success');
            return;
        }

        const settings = DB.getSettings();
        const massList = buildMassMessageList(stats.debtClients, settings);
        
        if (massList.length === 0) {
            this.showToast('No hay mensajes para enviar', 'info');
            return;
        }

        this.renderMassWhatsAppList(massList);
        this.openModal('modal-mass-whatsapp');
    },

    renderMassWhatsAppList(list) {
        const container = document.getElementById('mass-whatsapp-list');
        if (!container) return;

        container.innerHTML = list.map((item, index) => `
            <div style="background: var(--bg-hover); padding: 12px; border-radius: 10px; display: flex; justify-content: space-between; align-items: center; border: 1px solid var(--border-color);">
                <div style="flex: 1;">
                    <div style="font-weight: 600; font-size: 14px;">${item.clientName}</div>
                    <div style="font-size: 11px; opacity: 0.7; margin-top: 2px;">
                        Status: <span id="mass-status-${index}" style="color: var(--accent-blue)">Pendiente</span>
                    </div>
                </div>
                <button class="btn-primary-sm" onclick="App.sendOneMassMessage('${index}', '${item.phone}', '${encodeURIComponent(item.message)}', '${item.clientName}')" style="padding: 6px 12px; font-size: 12px;">
                    Enviar
                </button>
            </div>
        `).join('');
    },

    sendOneMassMessage(index, phone, messageEncoded, name) {
        const message = decodeURIComponent(messageEncoded);
        const success = sendOneFromList(phone, message, name);
        
        if (success) {
            const statusEl = document.getElementById(`mass-status-${index}`);
            if (statusEl) {
                statusEl.textContent = 'Enviado';
                statusEl.style.color = '#25D366';
            }
        }
    },

    refreshNotificationsLog() {
        this.renderNotifications();
    },

    // ========================================
    // Automation Triggers
    // ========================================
    checkAutomationTriggers() {
        const today = new Date();
        const day = today.getDate();
        const settings = DB.getSettings();
        const lastCheck = localStorage.getItem('interred_last_trigger_check');
        const todayStr = today.toISOString().split('T')[0];

        // Only check once per day
        if (lastCheck === todayStr) return;

        if (day === 10 && settings.reminder10Enabled) {
            const stats = DB.getStatsForMonth(this.currentMonth, this.currentYear);
            if (stats.debtClients.length > 0) {
                setTimeout(() => {
                    this.showToast(
                        `📢 Día 10: ${stats.debtClients.length} clientes sin pago. ¡Enviá los recordatorios!`,
                        'warning'
                    );
                }, 2500);
            }
        }

        if (day === 13 && settings.reminder13Enabled) {
            const stats = DB.getStatsForMonth(this.currentMonth, this.currentYear);
            if (stats.debtClients.length > 0) {
                setTimeout(() => {
                    this.showToast(
                        `⚠️ Día 13: ${stats.debtClients.length} clientes con deuda. Notificá el servicio reducido.`,
                        'error'
                    );
                }, 2500);
            }
        }

        localStorage.setItem('interred_last_trigger_check', todayStr);
    },

    async checkCutDate() {
        // FASE 4: Auto cut at Day 13, 23:00+ (checked every minute)
        const now = new Date();
        const todayStr = now.toISOString().split('T')[0];

        if (now.getDate() === 13 && now.getHours() >= 23) {
            const lastCut = localStorage.getItem('interred_last_auto_cut');
            if (lastCut === todayStr) return; // Ya se ejecutó hoy

            const debtors = getPriorityDebtors(this.currentMonth, this.currentYear);
            if (debtors.length > 0) {
                console.log(`Corte masivo aplicado a ${debtors.length} deudores`);
                this.showToast(`Iniciando corte automático a ${debtors.length} morosos...`, 'info');
                
                let fallos = 0;
                let exito = 0;

                for (const client of debtors) {
                    const res = await reduceClient(client);
                    if (res && res.success) {
                        client.estado = 'Reducido';
                        await DB.saveClient(client);
                        await DB.addMoroso(client.id); // Agregamos a morosos
                        exito++;
                    } else {
                        fallos++;
                    }
                }

                if (fallos > 0) {
                    this.showToast(`🔴 MikroTik: ${exito} reducidos, ${fallos} fallaron.`, 'warning');
                } else {
                    this.showToast(`🔴 Sistema MikroTik: ${exito} clientes reducidos automáticamente`, 'error');
                }
                
                this.refreshCurrentView();
            }

            localStorage.setItem('interred_last_auto_cut', todayStr);
        }
    },

    // ========================================
    // Automation Actions
    // ========================================
    async activateService(clientId) {
        const client = DB.getClientById(clientId);
        if (!client) return;

        this.showToast('Activando en MikroTik...', 'info');
        const res = await activateClient(client); // Llamada MikroTik
        
        if (res && res.success) {
            client.estado = 'Activo';
            await DB.saveClient(client);
            // Sync with morosos list
            if (DB.isMoroso(clientId)) {
                await DB.updateMoroso(clientId, { isSuspended: false });
            }
            this.showToast('✅ Servicio activado en MikroTik', 'success');
        } else {
            this.showToast(`❌ Error MikroTik: ${res?.message}`, 'error');
        }

        this.showClientDetail(clientId);
        this.refreshCurrentView();
    },

    async reduceService(clientId) {
        const client = DB.getClientById(clientId);
        if (!client) return;

        this.showToast('Suspendiendo en MikroTik...', 'info');
        const res = await reduceClient(client); // Llamada MikroTik
        
        if (res && res.success) {
            client.estado = 'Reducido';
            await DB.saveClient(client);
            // Sync with morosos list
            await DB.addMoroso(clientId); // Asegura que esté en la lista
            await DB.updateMoroso(clientId, { isSuspended: true });
            this.showToast('🔴 Servicio reducido en MikroTik', 'warning');
        } else {
            this.showToast(`❌ Error MikroTik: ${res?.message}`, 'error');
        }

        this.showClientDetail(clientId);
        this.refreshCurrentView();
    },

    // ========================================
    // Delete Actions
    // ========================================
    confirmDeleteClient(clientId) {
        const client = DB.getClientById(clientId);
        if (!client) return;
        this.showConfirm(
            'Eliminar Cliente',
            `¿Estás seguro de eliminar a ${client.nombre} ${client.apellido}? Se borrarán también todos sus pagos.`,
            async () => {
                await DB.deleteClient(clientId);
                this.closeModal('modal-client-detail');
                this.showToast('Cliente eliminado', 'success');
                this.refreshCurrentView();
            }
        );
    },

    confirmDeletePayment(paymentId, clientId) {
        this.showConfirm(
            'Eliminar Pago',
            '¿Estás seguro de eliminar este pago?',
            () => {
                DB.deletePayment(paymentId);
                this.showToast('Pago eliminado', 'success');
                this.showClientDetail(clientId);
                this.refreshCurrentView();
            }
        );
    },

    showConfirm(title, message, callback) {
        const titleEl = document.getElementById('confirm-title');
        const msgEl = document.getElementById('confirm-message');
        if (titleEl) titleEl.textContent = title;
        if (msgEl) msgEl.innerHTML = message;
        this.confirmCallback = callback;
        this.openModal('modal-confirm');
    },

    // ========================================
    // Data Export/Import
    // ========================================
    exportData() {
        const data = DB.exportData();
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `interred_backup_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        this.showToast('Datos exportados correctamente', 'success');
    },

    importData(event) {
        const file = event.target.files[0];
        if (!file) return;

        this.showConfirm(
            'Importar Datos',
            '¿Estás seguro? Esto reemplazará todos los datos actuales.',
            () => {
                const reader = new FileReader();
                reader.onload = (e) => {
                    const success = DB.importData(e.target.result);
                    if (success) {
                        this.showToast('Datos importados correctamente', 'success');
                        this.refreshCurrentView();
                        this.loadSettings();
                    } else {
                        this.showToast('Error al importar datos', 'error');
                    }
                };
                reader.readAsText(file);
            }
        );
        event.target.value = '';
    },

    // ========================================
    // Morosos Module
    // ========================================
    bindMorosos() {
        // "Agregar" button opens modal
        this._bind('btn-add-moroso-manual', () => {
            this.openAddMorosoModal();
        });

        // "Sincronizar Mora" button: auto-detect debtors for current month
        this._bind('btn-sync-morosos', () => {
            this.syncMorosos();
        });

        // Search inside morosos list
        const searchMorosos = document.getElementById('search-morosos');
        if (searchMorosos) {
            searchMorosos.addEventListener('input', () => {
                this.renderMorosos();
            });
        }

        // Close modal
        this._bind('modal-moroso-close', () => {
            this.closeModal('modal-add-moroso');
        });

        // Search inside modal
        const morosoSearch = document.getElementById('moroso-search-client');
        if (morosoSearch) {
            morosoSearch.addEventListener('input', (e) => {
                this.renderAddMorosoResults(e.target.value);
            });
        }
    },

    renderMorosos() {
        const morosos = DB.getMorosos();
        const searchTerm = (document.getElementById('search-morosos')?.value || '').toLowerCase();

        // Build enriched list with client data
        let morososList = morosos.map(m => {
            const client = DB.getClientById(m.clientId);
            if (!client) return null;
            return { ...m, client };
        }).filter(Boolean);

        // Filter by search
        if (searchTerm) {
            morososList = morososList.filter(m =>
                m.client.nombre.toLowerCase().includes(searchTerm) ||
                (m.client.apellido || '').toLowerCase().includes(searchTerm) ||
                (m.client.zona || '').toLowerCase().includes(searchTerm)
            );
        }

        // Update stat counters
        const totalCount = morosos.length;
        const suspendedCount = morosos.filter(m => m.isSuspended).length;
        document.getElementById('morosos-count').textContent = totalCount;
        document.getElementById('morosos-suspended-count').textContent = suspendedCount;

        const container = document.getElementById('morosos-list');

        if (morososList.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; padding: 40px 20px; color: var(--text-muted);">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin-bottom: 12px; opacity: 0.4;">
                        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                    </svg>
                    <h3 style="color: var(--text-secondary); font-size: 1rem; margin-bottom: 4px;">Sin morosos registrados</h3>
                    <p style="font-size: 0.85rem;">Usá "Agregar" para añadir manualmente o "Sincronizar" para detectar automáticamente.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = morososList.map(m => {
            const c = m.client;
            const zoneColors = this.ZONE_COLORS[c.zona] || { avatar: 'avatar-sol', badge: 'badge-sol' };
            const initials = (c.nombre?.[0] || '') + (c.apellido?.[0] || '');
            const addedDate = new Date(m.addedAt);
            const addedStr = `${addedDate.getDate()}/${addedDate.getMonth() + 1}/${addedDate.getFullYear()}`;

            return `
                <div class="moroso-card ${m.isSuspended ? 'is-suspended' : ''}">
                    <div class="moroso-card-header">
                        <div class="client-avatar ${zoneColors.avatar}">${initials}</div>
                        <div class="moroso-details">
                            <div class="moroso-name">${c.nombre} ${c.apellido || ''}</div>
                            <div class="moroso-meta">
                                <span class="client-zone-badge ${zoneColors.badge}">${c.zona}</span>
                                <span>IP: ${c.ip || 'Sin IP'}</span>
                                <span>Agregado: ${addedStr}</span>
                            </div>
                        </div>
                        <span class="moroso-status-indicator ${m.isSuspended ? 'status-indicator-suspended' : 'status-indicator-active'}">
                            ${m.isSuspended ? '🔴 Suspendido' : '🟢 Activo'}
                        </span>
                    </div>
                    <div class="moroso-actions">
                        ${(() => {
                            const sinIP = !c.ip || c.ip === '0.0.0.0';
                            return m.isSuspended
                                ? `<button class="btn-moroso-action btn-moroso-activate" ${sinIP ? 'disabled title="Cliente sin IP"' : ''} style="opacity: ${sinIP ? '0.5' : '1'}" onclick="App.toggleMorosoSuspension('${c.id}', false)">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
                                        Activar Mkt
                                   </button>`
                                : `<button class="btn-moroso-action btn-moroso-suspend" ${sinIP ? 'disabled title="Cliente sin IP"' : ''} style="opacity: ${sinIP ? '0.5' : '1'}" onclick="App.toggleMorosoSuspension('${c.id}', true)">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                                        Suspender Mkt
                                   </button>`;
                        })()}
                        <button class="btn-moroso-action" style="background: rgba(148,163,184,0.1); color: var(--text-secondary);" onclick="App.removeMorosoFromList('${c.id}')">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                            Quitar
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    },

    syncMorosos() {
        // Auto-detect: find all clients WITHOUT payment for current month and add them
        const clients = DB.getClients();
        let added = 0;

        clients.forEach(client => {
            const hasPaid = DB.hasPaymentForMonth(client.id, this.currentMonth, this.currentYear);
            if (!hasPaid && !DB.isMoroso(client.id)) {
                DB.addMoroso(client.id);
                added++;
            }
        });

        if (added > 0) {
            this.showToast(`⚠️ ${added} morosos detectados y agregados al listado`, 'warning');
        } else {
            this.showToast('✅ Todos los morosos ya estaban en la lista', 'success');
        }
        this.renderMorosos();
    },

    openAddMorosoModal() {
        document.getElementById('moroso-search-client').value = '';
        this.renderAddMorosoResults('');
        this.openModal('modal-add-moroso');
    },

    renderAddMorosoResults(query) {
        const container = document.getElementById('moroso-client-results');
        let clients = DB.getClients();
        const morosos = DB.getMorosos();
        const morosoIds = new Set(morosos.map(m => m.clientId));

        // Exclude clients already in morosos list
        clients = clients.filter(c => !morosoIds.has(c.id));

        // Filter by search query
        if (query) {
            const q = query.toLowerCase();
            clients = clients.filter(c =>
                c.nombre.toLowerCase().includes(q) ||
                (c.apellido || '').toLowerCase().includes(q) ||
                (c.zona || '').toLowerCase().includes(q)
            );
        }

        if (clients.length === 0) {
            container.innerHTML = `<p style="color: var(--text-muted); text-align: center; padding: 16px; font-size: 0.85rem;">
                ${query ? 'Sin resultados para "' + query + '"' : 'Todos los clientes ya están en la lista de morosos'}
            </p>`;
            return;
        }

        // Show max 20 results
        container.innerHTML = clients.slice(0, 20).map(c => {
            const zoneColors = this.ZONE_COLORS[c.zona] || { avatar: 'avatar-sol', badge: 'badge-sol' };
            const initials = (c.nombre?.[0] || '') + (c.apellido?.[0] || '');
            return `
                <div class="client-card" style="cursor: pointer;" onclick="App.addMorosoManual('${c.id}')">
                    <div class="client-avatar ${zoneColors.avatar}">${initials}</div>
                    <div class="client-info">
                        <div class="client-name">${c.nombre} ${c.apellido || ''}</div>
                        <div class="client-meta">
                            <span class="client-zone-badge ${zoneColors.badge}">${c.zona}</span>
                        </div>
                    </div>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent-blue)" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                </div>
            `;
        }).join('');
    },

    async addMorosoManual(clientId) {
        const result = await DB.addMoroso(clientId);
        if (result) {
            const client = DB.getClientById(clientId);
            this.showToast(`⚠️ ${client.nombre} ${client.apellido || ''} agregado a morosos`, 'warning');
            // Update the modal results to remove the added client
            const query = document.getElementById('moroso-search-client').value;
            this.renderAddMorosoResults(query);
            this.renderMorosos();
        } else {
            this.showToast('Este cliente ya está en la lista de morosos', 'info');
        }
    },

    async toggleMorosoSuspension(clientId, suspend) {
        const client = DB.getClientById(clientId);
        if (!client) return;

        this.showToast('Sincronizando con MikroTik...', 'info');

        if (suspend) {
            // Suspend: reduce in MikroTik
            const res = await reduceClient(client);
            if (res && res.success) {
                client.estado = 'Reducido';
                await DB.saveClient(client);
                await DB.updateMoroso(clientId, { isSuspended: true });
                this.showToast(`🔴 ${client.nombre} suspendido en MikroTik`, 'error');
            } else {
                this.showToast(`❌ Error al suspender: ${res?.message}`, 'error');
            }
        } else {
            // Activate: restore in MikroTik
            const res = await activateClient(client);
            if (res && res.success) {
                client.estado = 'Activo';
                await DB.saveClient(client);
                await DB.updateMoroso(clientId, { isSuspended: false });
                this.showToast(`✅ ${client.nombre} activado en MikroTik`, 'success');
            } else {
                this.showToast(`❌ Error al activar: ${res?.message}`, 'error');
            }
        }

        this.renderMorosos();
    },

    // ========================================
    // MikroTik
    // ========================================
    bindMikrotik() {
        const settings = DB.getSettings();
        
        // Router Selector logic
        const updateRouterSelector = () => {
          const selector = document.getElementById('mk-router-selector');
          if (selector) {
            selector.innerHTML = settings.routers.map((r, i) => 
               `<option value="${i}" ${i === settings.activeRouterIndex ? 'selected' : ''}>${r.name || 'Sin nombre'}</option>`
            ).join('');
          }
        };
        updateRouterSelector();

        this._bind('mk-router-selector', (e) => {
          settings.activeRouterIndex = parseInt(e.target.value);
          DB.saveSettings(settings);
          this.loadMikrotikDashboard(); // Reload with new router data
        });

        this._bind('btn-add-router', () => {
          settings.routers.push({
            name: 'Nuevo Router',
            host: '',
            port: '8728',
            user: '',
            password: '',
            addressList: 'morosos'
          });
          settings.activeRouterIndex = settings.routers.length - 1;
          DB.saveSettings(settings);
          this.loadMikrotikDashboard();
          this.showToast('✅ Nuevo router añadido. Configure los datos abajo.', 'success');
        });

        this._bind('btn-delete-router', () => {
          if (settings.routers.length <= 1) {
            this.showToast('⚠️ No puedes eliminar el único router.', 'warning');
            return;
          }
          if (confirm('¿Eliminar este router de la configuración?')) {
            settings.routers.splice(settings.activeRouterIndex, 1);
            settings.activeRouterIndex = 0;
            DB.saveSettings(settings);
            this.loadMikrotikDashboard();
            this.showToast('🗑️ Router eliminado.', 'info');
          }
        });

        // Save current router settings
        this._bind('btn-save-mikrotik', () => {
          const idx = settings.activeRouterIndex;
          settings.routers[idx] = {
            name: document.getElementById('setting-mikrotik-name').value,
            host: document.getElementById('setting-mikrotik-host').value,
            port: document.getElementById('setting-mikrotik-port').value,
            user: document.getElementById('setting-mikrotik-user').value,
            password: document.getElementById('setting-mikrotik-password').value,
            addressList: document.getElementById('setting-mikrotik-list').value
          };
          DB.saveSettings(settings);
          this.showToast('✅ Router guardado correctamente.', 'success');
          updateRouterSelector();
        });

        // Refresh & Test buttons
        this._bind('btn-refresh-mikrotik', () => this.loadMikrotikDashboard());

        this._bind('btn-test-mikrotik', () => {
            // Save before testing
            document.getElementById('btn-save-mikrotik').click();
            this.loadMikrotikDashboard();
        });

        const btnTogglePass = document.getElementById('toggle-mikrotik-password-form');
        if (btnTogglePass) {
            btnTogglePass.addEventListener('click', () => {
                const passInput = document.getElementById('setting-mikrotik-password');
                if (passInput) {
                    const isPass = passInput.type === 'password';
                    passInput.type = isPass ? 'text' : 'password';
                    btnTogglePass.textContent = isPass ? '🙈' : '👁️';
                }
            });
        }

        this._bind('btn-reboot-mikrotik', async () => {
            if (!confirm('¿Estás seguro de que quieres reiniciar el Router MikroTik? Se cortará la conexión momentáneamente.')) {
                return;
            }
            
            const router = DB.getSettings().routers[DB.getSettings().activeRouterIndex];
            const config = {
                host: router.host,
                port: parseInt(router.port || '8728'),
                user: router.user,
                password: router.password
            };

            this.showToast('Enviando comando de reinicio...', 'info');
            try {
                const { rebootMikrotik } = await import('./mikrotikService.js');
                const res = await rebootMikrotik(config);
                if (res && res.success) {
                    this.showToast('✅ Router reiniciando. Espera unos minutos antes de refrescar.', 'warning');
                    const statusEl = document.getElementById('mk-status-text');
                    if (statusEl) {
                        statusEl.textContent = 'Reiniciando...';
                        statusEl.style.color = '#ff9800';
                    }
                } else {
                    this.showToast(`❌ Error al reiniciar: ${res?.message}`, 'error');
                }
            } catch (e) {
                this.showToast('Error de conexión con el backend local', 'error');
            }
        });

        // ======== AUTO-REFRESH TRAFFIC ========
        this.mkAutoRefreshTimer = null;
        this.mkSelectedInterface = 'ALL';
        this.mkPrevRxBytes = {};
        this.mkPrevTxBytes = {};

        const autoToggle = document.getElementById('mk-auto-refresh-toggle');
        if (autoToggle) {
            autoToggle.addEventListener('change', (e) => {
                if (e.target.checked) {
                    this.startMikrotikAutoRefresh();
                } else {
                    this.stopMikrotikAutoRefresh();
                }
            });
        }

        const intervalSelect = document.getElementById('mk-refresh-interval');
        if (intervalSelect) {
            intervalSelect.addEventListener('change', () => {
                if (this.mkAutoRefreshTimer) {
                    this.stopMikrotikAutoRefresh();
                    this.startMikrotikAutoRefresh();
                }
            });
        }

        // ======== SCRIPT GENERATOR ========
        this._bind('btn-script-queues', () => this.generateMikrotikScript('queues'));
        this._bind('btn-script-address-list', () => this.generateMikrotikScript('address-list'));
        this._bind('btn-script-dhcp', () => this.generateMikrotikScript('dhcp'));
        this._bind('btn-script-morosos', () => this.generateMikrotikScript('morosos'));
        this._bind('btn-script-api-config', () => this.generateMikrotikScript('api-config'));

        // ======== SYNC BUTTONS ========
        const handleSync = async (clean = false) => {
            const clients = DB.getClients();
            const morosos = DB.getMorosos(); // Using actual morosos list
            const settings = DB.getSettings();
            const router = settings.routers[settings.activeRouterIndex];
            
            const config = {
                host: router.host,
                port: parseInt(router.port || '8728'),
                user: router.user,
                password: router.password
            };

            this.showToast(clean ? 'Sincronizando clientes (sin comentarios)...' : 'Iniciando sincronización completa...', 'info');
            
            try {
                const { syncMikrotik } = await import('./mikrotikService.js');
                const res = await syncMikrotik(config, clients, morosos, clean);
                
                if (res && res.success) {
                    this.showToast('✅ Sincronización completada con éxito.', 'success');
                    console.log("[SYNC ACTIONS]", res.actions);
                } else {
                    this.showToast(`❌ Error en sincronización: ${res?.message}`, 'error');
                }
            } catch (e) {
                this.showToast('Error de conexión con el backend', 'error');
            }
        };

        this._bind('btn-sync-mikrotik-main', () => handleSync(false));
        this._bind('btn-sync-mikrotik-clients', () => handleSync(true));

        this._bind('btn-copy-script', () => {
            const output = document.getElementById('script-output');
            if (output) {
                navigator.clipboard.writeText(output.textContent).then(() => {
                    this.showToast('✅ Script copiado al portapapeles', 'success');
                }).catch(() => {
                    // Fallback
                    const range = document.createRange();
                    range.selectNode(output);
                    window.getSelection().removeAllRanges();
                    window.getSelection().addRange(range);
                    document.execCommand('copy');
                    this.showToast('✅ Script copiado', 'success');
                });
            }
        });

        this._bind('btn-download-script', () => {
            const output = document.getElementById('script-output');
            if (output) {
                const blob = new Blob([output.textContent], { type: 'text/plain' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `interred-script-${Date.now()}.rsc`;
                a.click();
                URL.revokeObjectURL(url);
                this.showToast('💾 Script descargado como .rsc', 'success');
            }
        });
    },

    // ======== AUTO-REFRESH TRAFFIC ========
    startMikrotikAutoRefresh() {
        const intervalEl = document.getElementById('mk-refresh-interval');
        const interval = parseInt(intervalEl?.value || '5000');
        const statusEl = document.getElementById('mk-auto-status');
        
        if (statusEl) statusEl.textContent = `⚡ Auto ${interval/1000}s`;
        
        this.loadMikrotikDashboard();
        this.mkAutoRefreshTimer = setInterval(() => {
            this.loadMikrotikDashboard();
        }, interval);

        this.showToast(`📡 Monitoreo activo cada ${interval/1000} segundos`, 'success');
    },

    stopMikrotikAutoRefresh() {
        if (this.mkAutoRefreshTimer) {
            clearInterval(this.mkAutoRefreshTimer);
            this.mkAutoRefreshTimer = null;
        }
        const statusEl = document.getElementById('mk-auto-status');
        if (statusEl) statusEl.textContent = 'Detenido';
    },

    // ======== SCRIPT GENERATOR ========
    generateMikrotikScript(type) {
        const optionsEl = document.getElementById('script-options');
        const outputContainer = document.getElementById('script-output-container');
        const outputEl = document.getElementById('script-output');
        const titleEl = document.getElementById('script-output-title');
        const countEl = document.getElementById('script-client-count');

        if (!outputEl || !outputContainer) return;

        // Show options for queues
        if (optionsEl) {
            optionsEl.classList.toggle('hidden', type === 'morosos');
        }
        outputContainer.classList.remove('hidden');

        const zoneFilter = document.getElementById('script-zone-filter')?.value || 'ALL';
        const downloadSpeed = document.getElementById('script-download-speed')?.value || '15M';
        const uploadSpeed = document.getElementById('script-upload-speed')?.value || '5M';
        
        const settings = DB.getSettings();
        const router = settings.routers[settings.activeRouterIndex];
        const addressList = router.addressList || 'morosos';
        
        let allClients = DB.getClients();
        if (zoneFilter !== 'ALL') {
            allClients = allClients.filter(c => c.zona === zoneFilter);
        }
        
        // Only clients with IP
        const clientsWithIP = allClients.filter(c => c.ip && c.ip.trim());
        let script = '';
        let clientCount = 0;

        const date = new Date().toLocaleDateString('es-AR');

        switch(type) {
            case 'queues':
                titleEl.textContent = '📊 Simple Queues — Limitar ancho de banda';
                script = `# =============================================\n`;
                script += `# INTER RED - Simple Queues Script\n`;
                script += `# Generado: ${date}\n`;
                script += `# Velocidad: ${downloadSpeed}/${uploadSpeed} (upload/download)\n`;
                script += `# =============================================\n\n`;
                
                clientsWithIP.forEach(c => {
                    const name = `${c.nombre} ${c.apellido || ''}`.trim().replace(/\s+/g, '_');
                    script += `/queue simple add name="${name}" target=${c.ip}/32 max-limit=${uploadSpeed}/${downloadSpeed} comment="Zona: ${c.zona} | ID: ${c.id}"\n`;
                    clientCount++;
                });
                break;

            case 'address-list':
                titleEl.textContent = '📋 Address List — Lista de IPs';
                script = `# =============================================\n`;
                script += `# INTER RED - Address List Script\n`;
                script += `# Generado: ${date}\n`;
                script += `# Lista: clientes-interred\n`;
                script += `# =============================================\n\n`;
                
                clientsWithIP.forEach(c => {
                    const comment = `${c.nombre} ${c.apellido || ''} - ${c.zona}`.trim();
                    script += `/ip firewall address-list add list=clientes-interred address=${c.ip} comment="${comment}"\n`;
                    clientCount++;
                });
                break;

            case 'dhcp':
                titleEl.textContent = '🖧 DHCP Static Leases — Reservar IPs';
                script = `# =============================================\n`;
                script += `# INTER RED - DHCP Static Leases Script\n`;
                script += `# Generado: ${date}\n`;
                script += `# NOTA: Necesita la MAC de cada cliente\n`;
                script += `# =============================================\n\n`;
                
                allClients.filter(c => c.ip && c.ip.trim()).forEach(c => {
                    const name = `${c.nombre} ${c.apellido || ''}`.trim();
                    if (c.mac && c.mac.trim()) {
                        script += `/ip dhcp-server lease add address=${c.ip} mac-address=${c.mac} comment="${name} - ${c.zona}" server=dhcp1\n`;
                    } else {
                        script += `# [SIN MAC] ${name} (${c.ip}) - Agregar MAC manualmente\n`;
                        script += `# /ip dhcp-server lease add address=${c.ip} mac-address=XX:XX:XX:XX:XX:XX comment="${name} - ${c.zona}" server=dhcp1\n`;
                    }
                    clientCount++;
                });
                break;

            case 'morosos':
                titleEl.textContent = '🚫 Cortar Morosos — Agregar a Address List';
                const morosos = DB.getMorosos();
                script = `# =============================================\n`;
                script += `# INTER RED - Cortar Morosos Script\n`;
                script += `# Generado: ${date}\n`;
                script += `# Address List: ${addressList}\n`;
                script += `# =============================================\n\n`;
                script += `# Primero limpiar la lista actual\n`;
                script += `/ip firewall address-list remove [find list="${addressList}"]\n\n`;
                script += `# Agregar morosos activos\n`;

                morosos.forEach(m => {
                    const client = DB.getClientById(m.clientId);
                    if (client && client.ip) {
                        const name = `${client.nombre} ${client.apellido || ''}`.trim();
                        script += `/ip firewall address-list add list="${addressList}" address=${client.ip} comment="MOROSO: ${name} - ${client.zona}"\n`;
                        clientCount++;
                    }
                });

                if (clientCount === 0) {
                    script += `# No hay morosos con IP asignada\n`;
                }

                script += `\n# =============================================\n`;
                script += `# Regla de Firewall para bloquear/reducir morosos\n`;
                script += `# (Descomentar si no existe esta regla)\n`;
                script += `# =============================================\n`;
                script += `# /ip firewall filter add chain=forward src-address-list="${addressList}" action=drop comment="Bloquear morosos InterRed"\n`;
                break;

            case 'api-config':
                titleEl.textContent = '⚙️ Config API App — Preparar MikroTik';
                const defUser = router.user || 'admin_app';
                const defPass = router.password || 'InterRed2026';
                script = `# =============================================\n`;
                script += `# INTER RED - Script de Configuración Inicial\n`;
                script += `# Generado: ${date}\n`;
                script += `# Propósito: Permitir que la App controle el router\n`;
                script += `# =============================================\n\n`;
                script += `# 1. Habilitar servicio API (puerto 8728)\n`;
                script += `/ip service enable api\n`;
                script += `/ip service set api port=8728\n\n`;
                script += `# 2. Crear grupo de permisos para la App\n`;
                script += `/user group add name=interred-app policy=api,write,read,test,reboot\n\n`;
                script += `# 3. Crear el usuario para la App\n`;
                script += `/user add name="${defUser}" password="${defPass}" group=interred-app comment="Usuario para control desde App InterRed"\n\n`;
                script += `# 4. Crear Address List inicial para morosos\n`;
                script += `/ip firewall address-list add list="${addressList}" address=127.0.0.1 comment="InterRed Init"\n\n`;
                script += `# 5. Regla de Firewall para Bloqueo (Opcional)\n`;
                script += `/ip firewall filter add chain=forward src-address-list="${addressList}" action=drop comment="BLOQUEO MOROSOS INTERRED"\n\n`;
                script += `# =============================================\n`;
                script += `# ¡LISTO! Ahora podés usar estos datos en la app:\n`;
                script += `# Usuario: ${defUser}\n`;
                script += `# Pass: ${defPass}\n`;
                script += `# =============================================\n`;
                clientCount = 1;
                break;
        }

        outputEl.textContent = script;
        if (countEl) countEl.textContent = clientCount;
        this.showToast(`✅ Script generado: ${type}`, 'success');
    },

    async loadMikrotikDashboard() {
        const settings = DB.getSettings();
        const router = settings.routers[settings.activeRouterIndex] || settings.routers[0];
        
        // Form fields
        const nameEl = document.getElementById('setting-mikrotik-name');
        const hostEl = document.getElementById('setting-mikrotik-host');
        const portEl = document.getElementById('setting-mikrotik-port');
        const userEl = document.getElementById('setting-mikrotik-user');
        const passEl = document.getElementById('setting-mikrotik-password');
        const listEl = document.getElementById('setting-mikrotik-list');

        if (nameEl) nameEl.value = router.name || '';
        if (hostEl) hostEl.value = router.host || '';
        if (portEl) portEl.value = router.port || '8728';
        if (userEl) userEl.value = router.user || '';
        if (passEl) passEl.value = router.password || '';
        if (listEl) listEl.value = router.addressList || 'morosos';

        const config = {
            host: router.host,
            port: parseInt(router.port || '8728'),
            user: router.user,
            password: router.password
        };

        const statusEl = document.getElementById('mk-status-text');
        if (!statusEl) return;
        
        if (!config.host || !config.user || !config.password) {
            statusEl.textContent = 'Sin Configurar';
            statusEl.style.color = '#ff9800';
            return;
        }

        if (!this.mkAutoRefreshTimer) {
            statusEl.textContent = 'Conectando...';
            statusEl.style.color = '#ff9800';
        }

        try {
            const { getMikrotikStatus } = await import('./mikrotikService.js');
            const res = await getMikrotikStatus(config);

            if (res.success) {
                statusEl.textContent = 'Conectado';
                statusEl.style.color = '#25D366';
                
                document.getElementById('mk-uptime').textContent = res.uptime;
                document.getElementById('mk-cpu').textContent = `CPU: ${res.cpuLoad}%`;
                
                // RAM conversion
                const freeMB = (parseInt(res.freeMemory) / 1024 / 1024).toFixed(0);
                const totalMB = (parseInt(res.totalMemory) / 1024 / 1024).toFixed(0);
                document.getElementById('mk-ram').textContent = `RAM: ${freeMB} / ${totalMB} MB`;

                // Rebuild Selector if needed
                const selector = document.getElementById('mk-interface-selector');
                if (selector && res.interfaces) {
                    const currentNames = Array.from(selector.options).map(o => o.value).filter(v => v !== 'ALL').join(',');
                    const newNames = res.interfaces.map(i => i.name).join(',');
                    
                    if (currentNames !== newNames) {
                      selector.innerHTML = '<option value="ALL">Monitorear: Todas las Interfaces</option>';
                      res.interfaces.forEach(i => {
                          const opt = document.createElement('option');
                          opt.value = i.name;
                          opt.textContent = i.name;
                          selector.appendChild(opt);
                      });
                      
                      if (!selector.hasListener) {
                        selector.addEventListener('change', (e) => {
                            this.mkSelectedInterface = e.target.value;
                            // Clear totals upon switching interface to avoid mixed stats
                            this._mkSessionRx = 0;
                            this._mkSessionTx = 0;
                        });
                        selector.hasListener = true;
                      }
                    }
                }

                const intfList = document.getElementById('mk-interfaces-list');
                if (res.interfaces && res.interfaces.length > 0) {
                    const now = Date.now();
                    const elapsed = this._mkLastPollTime ? (now - this._mkLastPollTime) / 1000 : 5;
                    this._mkLastPollTime = now;

                    let totalRxMbps = 0;
                    let totalTxMbps = 0;
                    
                    // Initialize session counters if they don't exist
                    if (this._mkSessionRx === undefined) this._mkSessionRx = 0;
                    if (this._mkSessionTx === undefined) this._mkSessionTx = 0;

                    intfList.innerHTML = res.interfaces.map(i => {
                        const rxBytes = parseInt(i.rxByte || 0);
                        const txBytes = parseInt(i.txByte || 0);
                        
                        // Deltas for Mbps
                        const prevRx = this.mkPrevRxBytes[i.name];
                        const prevTx = this.mkPrevTxBytes[i.name];
                        
                        let rxMbps = 0, txMbps = 0;
                        if (prevRx !== undefined && elapsed > 0) {
                            const deltaRx = Math.max(0, rxBytes - prevRx);
                            const deltaTx = Math.max(0, txBytes - prevTx);
                            
                            // Bits per second to Mbps ( * 8 bits / 1,000,000)
                            rxMbps = (deltaRx * 8 / 1000000) / elapsed;
                            txMbps = (deltaTx * 8 / 1000000) / elapsed;
                            
                            // Accumulate session total only for selected interface(s)
                            if (this.mkSelectedInterface === 'ALL' || this.mkSelectedInterface === i.name) {
                                this._mkSessionRx += deltaRx;
                                this._mkSessionTx += deltaTx;
                                totalRxMbps += rxMbps;
                                totalTxMbps += txMbps;
                            }
                        }

                        this.mkPrevRxBytes[i.name] = rxBytes;
                        this.mkPrevTxBytes[i.name] = txBytes;
                        
                        const rxDisp = rxMbps >= 1 ? rxMbps.toFixed(1) + ' Mbps' : (rxMbps * 1000).toFixed(0) + ' Kbps';
                        const txDisp = txMbps >= 1 ? txMbps.toFixed(1) + ' Mbps' : (txMbps * 1000).toFixed(0) + ' Kbps';

                        return `
                            <div style="background: var(--bg-hover); padding: 12px; border-radius: 10px; display: flex; justify-content: space-between; align-items: center; border: 1px solid var(--border-color);">
                                <div>
                                    <div style="font-weight: 600; font-size: 14px; margin-bottom: 2px;">
                                        <span style="color: ${i.running ? '#25D366' : '#ff4d4d'}; margin-right: 4px;">●</span> 
                                        ${i.name}
                                    </div>
                                    <div style="font-size: 11px; opacity: 0.6;">Tipo: ${i.type}</div>
                                </div>
                                <div style="text-align: right; font-size: 12px;">
                                    <div style="color: #3b82f6; font-weight: 600;">⬇️ ${rxDisp}</div>
                                    <div style="color: #ef4444; font-weight: 600;">⬆️ ${txDisp}</div>
                                </div>
                            </div>
                        `;
                    }).join('');

                    // Update Live Stats
                    const rxLive = document.getElementById('mk-rx-live');
                    const txLive = document.getElementById('mk-tx-live');
                    const rxTotal = document.getElementById('mk-rx-total');
                    const txTotal = document.getElementById('mk-tx-total');

                    if (rxLive) rxLive.textContent = totalRxMbps.toFixed(2) + ' Mbps';
                    if (txLive) txLive.textContent = totalTxMbps.toFixed(2) + ' Mbps';
                    
                    const formatBytes = (b) => {
                        if (b >= 1073741824) return (b / 1073741824).toFixed(2) + ' GB';
                        return (b / 1048576).toFixed(1) + ' MB';
                    };

                    if (rxTotal) rxTotal.textContent = `Sesión: ${formatBytes(this._mkSessionRx)}`;
                    if (txTotal) txTotal.textContent = `Sesión: ${formatBytes(this._mkSessionTx)}`;

                    this.updateMikrotikChart(totalRxMbps, totalTxMbps);
                } else {
                    intfList.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: 20px;">No se encontraron interfaces</p>';
                }

            } else {
                statusEl.textContent = 'Falló Conexión';
                statusEl.style.color = '#ff4d4d';
            }
        } catch (e) {
            statusEl.textContent = 'Error Servidor';
            statusEl.style.color = '#ff4d4d';
        }
    },

    removeMorosoFromList(clientId) {
        const client = DB.getClientById(clientId);
        this.showConfirm(
            'Quitar de Morosos',
            `¿Quitar a ${client?.nombre || ''} ${client?.apellido || ''} de la lista de morosos?`,
            () => {
                DB.removeMoroso(clientId);
                this.showToast('Cliente quitado de la lista de morosos', 'success');
                this.renderMorosos();
            }
        );
    },

    initMikrotikChart() {
        const ctx = document.getElementById('mk-traffic-chart');
        if (!ctx) return;
        
        this.mkChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: Array(30).fill(''),
                datasets: [
                    {
                        label: 'RX (Bajada)',
                        data: Array(30).fill(0),
                        borderColor: '#3b82f6',
                        backgroundColor: 'rgba(59, 130, 246, 0.1)',
                        borderWidth: 2,
                        fill: true,
                        tension: 0.4,
                        pointRadius: 0
                    },
                    {
                        label: 'TX (Subida)',
                        data: Array(30).fill(0),
                        borderColor: '#ef4444',
                        backgroundColor: 'rgba(239, 68, 68, 0.05)',
                        borderWidth: 2,
                        fill: true,
                        tension: 0.4,
                        pointRadius: 0
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { display: false },
                    y: {
                        beginAtZero: true,
                        grid: { color: 'rgba(255, 255, 255, 0.05)' },
                        ticks: { color: 'rgba(255, 255, 255, 0.5)', font: { size: 10 } }
                    }
                },
                animation: { duration: 0 }
            }
        });
    },

    updateMikrotikChart(rxMbps, txMbps) {
        if (!this.mkChart) {
            this.initMikrotikChart();
        }
        if (!this.mkChart) return;
        
        const data = this.mkChart.data.datasets;
        data[0].data.shift();
        data[0].data.push(rxMbps);
        data[1].data.shift();
        data[1].data.push(txMbps);
        
        this.mkChart.update('none');
    },

    // ========================================
    // Utilities
    // ========================================
    formatNumber(num) { return formatNumber(num); },
    formatCurrency(amount) { return formatCurrency(amount); },
    formatDate(dateStr) { return formatDate(dateStr); },

    refreshCurrentView() {
        switch (this.currentView) {
            case 'dashboard': this.renderDashboard(); break;
            case 'clients': this.renderClients(); break;
            case 'payments': this.renderPayments(); break;
            case 'morosos': this.renderMorosos(); break;
        }
    },

    showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                ${type === 'success' ? '<polyline points="20 6 9 17 4 12"/>' : ''}
                ${type === 'error' ? '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>' : ''}
                ${type === 'warning' ? '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>' : ''}
                ${type === 'info' ? '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>' : ''}
            </svg>
            ${message}
        `;
        container.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('toast-out');
            setTimeout(() => toast.remove(), 300);
        }, 3500);
    },

    // ========================================
    // MIKROTIK SYNC
    // ========================================
    async syncMikrotik(silent = false) {
        if (!silent) this.showToast('Sincronizando MikroTik...', 'info');
        
        try {
            const settings = DB.getSettings();
            const router = settings.routers[settings.activeRouterIndex] || settings.routers[0];
            
            if (!router || !router.host) {
                if (!silent) this.showToast('Router no configurado', 'error');
                return;
            }

            const config = {
                host: router.host,
                port: parseInt(router.port || '8728'),
                user: router.user,
                password: router.password
            };

            const clients = DB.getClients();
            const morosos = DB.getMorosos();

            const { syncMikrotik } = await import('./mikrotikService.js');
            const res = await syncMikrotik(config, clients, morosos);

            if (res.success) {
                if (!silent) {
                    const detail = res.actions?.length > 0 ? ` (${res.actions.length} acciones)` : '';
                    this.showToast(`✅ Sync exitoso${detail}`, 'success');
                }
            } else {
                if (!silent) this.showToast(`❌ Sync falló: ${res.message}`, 'error');
            }
            return res;
        } catch (e) {
            console.error("Sync Error:", e);
            if (!silent) this.showToast('Error de comunicación con el servidor', 'error');
        }
    },
};

// ---- Global access for legacy script support ----
window.App = App;

// Initialize App
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => App.init());
} else {
    App.init();
}

export default App;
