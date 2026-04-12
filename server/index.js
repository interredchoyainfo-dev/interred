/* ========================================
   INTER RED - Backend API Server
   ======================================== */

import 'dotenv/config'; // Carga .env en desarrollo (en Render usa las vars del panel)
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
    reduceClient,
    suspendClient,
    activateClient,
    testConnection,
    getMorososList,
    getSystemStatus,
    rebootRouter,
    listSimpleQueues,
    suspendQueueByName,
    activateQueueByName,
    updateClientQueue,
    syncClientsWithMikrotik
} from './mikrotik.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONFIG_PATH = path.join(__dirname, '..', 'data', 'site_config.json');
const WISP_DB_PATH = path.join(__dirname, '..', 'data', 'wisp_db.json');

const app = express();

// ---- Variables de entorno ----
const API_SECRET = process.env.API_SECRET || null;
const ADMIN_USER = process.env.ADMIN_USER || 'Admin';
const ADMIN_PASS = process.env.ADMIN_PASS || '';

if (!API_SECRET) {
    console.warn('⚠️  API_SECRET no configurado. El backend NO está protegido. Configuralo en .env o en Render.');
}
if (!ADMIN_PASS) {
    console.warn('⚠️  ADMIN_PASS no configurado. El login del panel no funcionará.');
}

// ---- CORS ----
// En producción, reemplazá '*' por tu dominio real, ej: 'https://interred.web.app'
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '*').split(',').map(s => s.trim());

app.use(cors({
    origin: ALLOWED_ORIGINS.includes('*') ? '*' : function (origin, callback) {
        if (!origin || ALLOWED_ORIGINS.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('No permitido por CORS'));
        }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: !ALLOWED_ORIGINS.includes('*'),
    optionsSuccessStatus: 204
}));

app.use(express.json());

// ---- Middleware de autenticación ----
// Protege todos los endpoints /api/mikrotik/* y /api/queue/* y /api/wisp/*
function requireAuth(req, res, next) {
    if (!API_SECRET) {
        // Sin secret configurado: modo inseguro, dejamos pasar con advertencia
        return next();
    }
    const auth = req.headers['authorization'] || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (token !== API_SECRET) {
        return res.status(401).json({ success: false, message: 'No autorizado' });
    }
    next();
}

// ---- Endpoint de login (devuelve el token al frontend) ----
// El frontend llama esto una vez con usuario/pass y recibe el API_SECRET para usarlo en requests
app.post('/api/auth/login', (req, res) => {
    const { user, pass } = req.body;
    if (!user || !pass) {
        return res.status(400).json({ success: false, message: 'Faltan credenciales' });
    }
    if (user === ADMIN_USER && pass === ADMIN_PASS) {
        return res.json({ success: true, token: API_SECRET });
    }
    return res.status(401).json({ success: false, message: 'Credenciales incorrectas' });
});

// ---- Health Check (público) ----
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'Servidor INTER RED activo' });
});

app.get('/', (req, res) => res.send('API INTERRED FUNCIONANDO OK'));
app.get('/api', (req, res) => res.send('API endpoint activo'));

// ============================================================
// ENDPOINTS PROTEGIDOS — todos requieren Bearer token
// ============================================================

// ---- Sync MikroTik ----
app.post('/api/mikrotik/sync', requireAuth, async (req, res) => {
    try {
        const { config, clients, morosos, clean } = req.body;
        if (!config || !clients) {
            return res.status(200).json({ success: false, message: 'Faltan datos: config y clients son requeridos' });
        }
        const result = await syncClientsWithMikrotik(config, clients, morosos || [], !!clean);
        res.json(result);
    } catch (error) {
        res.status(200).json({ success: false, message: error.message });
    }
});

// ---- Test conexión ----
app.post('/api/mikrotik/test', requireAuth, async (req, res) => {
    const config = req.body;
    if (!config.host || !config.user || !config.password) {
        return res.status(400).json({ success: false, message: 'Faltan datos: host, user, password' });
    }
    try {
        const result = await testConnection(config);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, message: `Error de conexión: ${error.message}` });
    }
});

// ---- Estado del sistema ----
app.post('/api/mikrotik/status', requireAuth, async (req, res) => {
    const config = req.body;
    if (!config.host || !config.user || !config.password) {
        return res.status(400).json({ success: false, message: 'Faltan datos: host, user, password' });
    }
    try {
        const result = await getSystemStatus(config);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, message: `Error obteniendo estado: ${error.message}` });
    }
});

// ---- Reboot router ----
app.post('/api/mikrotik/reboot', requireAuth, async (req, res) => {
    const config = req.body;
    if (!config.host || !config.user || !config.password) {
        return res.status(400).json({ success: false, message: 'Faltan datos: host, user, password' });
    }
    try {
        const result = await rebootRouter(config);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ---- Update queue individual ----
app.post('/api/mikrotik/update-queue', requireAuth, async (req, res) => {
    const { config, clientIp, clientName, action } = req.body;
    if (!config || !clientIp || !action) {
        return res.status(400).json({ success: false, message: 'Faltan datos: config, clientIp, action' });
    }
    try {
        const result = await updateClientQueue(config, clientIp, clientName, action);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ---- 🔴 REDUCIR cliente ----
app.post('/api/queue/enable', requireAuth, async (req, res) => {
    try {
        const { config, ip, clientName } = req.body;
        if (!config || !ip) return res.status(200).json({ success: false, message: 'Faltan datos: config e ip' });
        const result = await reduceClient(config, ip, clientName);
        res.status(200).json(result);
    } catch (error) {
        res.status(200).json({ success: false, message: error.message });
    }
});

// ---- 🟢 ACTIVAR cliente ----
app.post('/api/queue/disable', requireAuth, async (req, res) => {
    try {
        const { config, ip, clientName } = req.body;
        if (!config || !ip) return res.status(200).json({ success: false, message: 'Faltan datos: config e ip' });
        const result = await activateClient(config, ip, clientName);
        res.status(200).json(result);
    } catch (error) {
        res.status(200).json({ success: false, message: error.message });
    }
});

// ---- Listar colas ----
app.post('/api/queues', requireAuth, async (req, res) => {
    const { config } = req.body;
    if (!config) return res.status(400).json({ success: false, message: 'Faltan datos: config' });
    try {
        const result = await listSimpleQueues(config);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, message: error.message, data: [] });
    }
});

// ---- Bulk suspend ----
app.post('/api/bulk-suspend', requireAuth, async (req, res) => {
    const { config, ips } = req.body;
    if (!config || !ips) return res.status(400).json({ success: false, message: 'Faltan datos' });
    const results = [];
    for (const item of ips) {
        try {
            results.push(await reduceClient(config, item.ip, item.clientName));
        } catch (e) {
            results.push({ success: false, ip: item.ip, message: e.message });
        }
    }
    res.json({ success: true, results });
});

// ---- Bulk activate ----
app.post('/api/bulk-activate', requireAuth, async (req, res) => {
    const { config, ips } = req.body;
    if (!config || !ips) return res.status(400).json({ success: false, message: 'Faltan datos' });
    const results = [];
    for (const item of ips) {
        try {
            results.push(await activateClient(config, item.ip, item.clientName));
        } catch (e) {
            results.push({ success: false, ip: item.ip, message: e.message });
        }
    }
    res.json({ success: true, results });
});

// ---- Aliases retrocompatibles (redirigen a las rutas nuevas) ----
app.post('/suspend', requireAuth, (req, res) => res.redirect(307, '/api/queue/enable'));
app.post('/activate', requireAuth, (req, res) => res.redirect(307, '/api/queue/disable'));
app.post('/api/mikrotik/suspend', requireAuth, (req, res) => res.redirect(307, '/api/queue/enable'));
app.post('/api/mikrotik/activate', requireAuth, (req, res) => res.redirect(307, '/api/queue/disable'));

// ============================================================
// CMS / WISP (protegidos)
// ============================================================

app.get('/api/cms/config', requireAuth, (req, res) => {
    try {
        if (!fs.existsSync(CONFIG_PATH)) {
            return res.json({ hero: { title: 'INTER RED', description: 'Conectando al mundo.' }, plans: { hogar: { price: '0' }, gaming: { price: '0' } }, contact: { whatsapp: '0' } });
        }
        const data = fs.readFileSync(CONFIG_PATH, 'utf8');
        res.json(JSON.parse(data));
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/api/wisp/database', requireAuth, (req, res) => {
    try {
        if (!fs.existsSync(WISP_DB_PATH)) {
            return res.json({ clients: [], payments: [], morosos: [], settings: {} });
        }
        const data = fs.readFileSync(WISP_DB_PATH, 'utf8');
        res.json(JSON.parse(data));
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// WISP con validación de esquema (BUG #3 corregido)
app.post('/api/wisp/database', requireAuth, (req, res) => {
    try {
        const dbData = req.body;

        // Validación mínima de esquema antes de escribir
        if (
            typeof dbData !== 'object' ||
            dbData === null ||
            !Array.isArray(dbData.clients) ||
            !Array.isArray(dbData.payments)
        ) {
            return res.status(400).json({
                success: false,
                message: 'Esquema inválido. Se requieren al menos: clients (array) y payments (array)'
            });
        }

        // Backup del archivo anterior antes de sobreescribir
        if (fs.existsSync(WISP_DB_PATH)) {
            const backup = WISP_DB_PATH.replace('.json', `_backup_${Date.now()}.json`);
            fs.copyFileSync(WISP_DB_PATH, backup);
        }

        fs.writeFileSync(WISP_DB_PATH, JSON.stringify(dbData, null, 2));
        res.json({ success: true, message: 'Base de datos WISP guardada en el servidor' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================================
// FRONTEND — Serve Vite build
// ============================================================
const distPath = path.join(__dirname, '..', 'dist');
app.use(express.static(distPath));

app.use((req, res) => {
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'Endpoint no encontrado' });
    }
    const indexFile = path.join(distPath, 'index.html');
    if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
    } else {
        res.status(404).send('Frontend no compilado. Ejecutá: npm run build');
    }
});

// ============================================================
// ERROR HANDLERS
// ============================================================
process.on('unhandledRejection', (reason) => {
    console.error('⚠️ Promesa no manejada:', reason);
});

process.on('uncaughtException', (err) => {
    console.error('⚠️ Error crítico no capturado:', err.message);
    if (!(err.message || '').includes('!empty')) {
        console.error(err.stack);
    }
});

// ---- Start ----
app.listen(process.env.PORT || 3000, () => {
    console.log(`Servidor INTER RED corriendo en puerto ${process.env.PORT || 3000}`);
    console.log(`Auth: ${API_SECRET ? 'ACTIVADA ✅' : 'DESACTIVADA ⚠️  (configura API_SECRET)'}`);
});
