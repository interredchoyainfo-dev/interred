/* ========================================
   INTER RED - Backend API Server
   Express server for MikroTik proxy
   ======================================== */

import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { suspendClient, activateClient, testConnection, getMorososList, getSystemStatus, rebootRouter, listSimpleQueues } from './mikrotik.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONFIG_PATH = path.join(__dirname, '..', 'data', 'site_config.json');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// ---- Health Check ----
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', service: 'InterRed MikroTik API', timestamp: new Date().toISOString() });
});

app.get("/", (req, res) => {
  res.send("API funcionando OK");
});

app.get("/api", (req, res) => {
  res.send("API endpoint activo");
});

// ---- Reboot Router ----
app.post('/api/mikrotik/reboot', async (req, res) => {
    const config = req.body;
    if (!config.host || !config.user || !config.password) {
        return res.status(400).json({ success: false, message: 'Faltan datos' });
    }
    try {
        const result = await rebootRouter(config);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ---- Get Detailed Status ----
app.post('/api/mikrotik/status', async (req, res) => {
    const config = req.body;

    if (!config.host || !config.user || !config.password) {
        return res.status(400).json({ success: false, message: 'Faltan datos: host, user, password' });
    }

    try {
        const result = await getSystemStatus(config);
        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            message: `Error obteniendo estado: ${error.message}`
        });
    }
});

// ---- Test MikroTik Connection ----
app.post('/api/mikrotik/test', async (req, res) => {
    const config = req.body;

    if (!config.host || !config.user || !config.password) {
        return res.status(400).json({ success: false, message: 'Faltan datos: host, user, password' });
    }

    try {
        const result = await testConnection(config);
        res.json(result);
    } catch (error) {
        console.error('❌ MikroTik test failed:', error.message);
        res.status(500).json({
            success: false,
            message: `Error de conexión: ${error.message}`,
            details: error.code || 'UNKNOWN',
        });
    }
});

// ---- Suspend Client (ENABLE simple queue limit) ----
app.post('/suspend', async (req, res) => {
    const { config, ip, clientName } = req.body;
    if (!config || !ip) {
        return res.status(400).json({ success: false, message: 'Faltan datos: config, ip' });
    }
    try {
        const result = await suspendClient(config, ip, clientName);
        console.log(`🔴 Suspendido en Mikrotik (Port 3000): ${ip}`);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, message: error.message, ip });
    }
});

// ---- Activate Client (DISABLE simple queue limit) ----
app.post('/activate', async (req, res) => {
    const { config, ip } = req.body;
    if (!config || !ip) {
        return res.status(400).json({ success: false, message: 'Faltan datos: config, ip' });
    }
    try {
        const result = await activateClient(config, ip);
        console.log(`✅ Activado en Mikrotik (Port 3000): ${ip}`);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, message: error.message, ip });
    }
});

// ---- NAME-BASED QUEUE CONTROL (New) ----
import { suspendQueueByName, activateQueueByName } from './mikrotik.js';

app.post('/api/queue/enable', async (req, res) => {
    const { config, name, clientName } = req.body;
    if (!config || !name) {
        return res.status(400).json({ success: false, message: 'Faltan datos' });
    }
    try {
        const result = await suspendQueueByName(config, name, clientName);
        console.log(`🔴 Queue Limitada: ${name}`);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/api/queue/disable', async (req, res) => {
    const { config, name } = req.body;
    if (!config || !name) {
        return res.status(400).json({ success: false, message: 'Faltan datos' });
    }
    try {
        const result = await activateQueueByName(config, name);
        console.log(`✅ Queue Activada: ${name}`);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});


app.post('/api/queues', async (req, res) => {
    const { config } = req.body;
    if (!config) return res.status(400).json({ success: false, message: 'Faltan datos' });
    try {
        const result = await listSimpleQueues(config);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, message: error.message, data: [] });
    }
});

// Aliases for retro-compatibility if needed
app.post('/api/mikrotik/suspend', (req, res) => res.redirect(307, '/suspend'));
app.post('/api/mikrotik/activate', (req, res) => res.redirect(307, '/activate'));


// ---- Test MikroTik Connection ----
app.post('/test', async (req, res) => {
    const config = req.body;
    if (!config.host || !config.user || !config.password) {
        return res.status(400).json({ success: false, message: 'Faltan datos: host, user, password' });
    }
    try {
        const result = await testConnection(config);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ---- Get Detailed Status ----
app.post('/status', async (req, res) => {
    const config = req.body;
    if (!config.host) return res.status(400).json({ success: false, message: 'Faltan datos' });
    try {
        const result = await getSystemStatus(config);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ---- Get Morosos List from MikroTik ----
app.post('/list', async (req, res) => {
    const config = req.body;
    try {
        const result = await getMorososList(config);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ---- Reboot Router ----
app.post('/reboot', async (req, res) => {
    const config = req.body;
    try {
        const result = await rebootRouter(config);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ---- Bulk Suspend (Multiple IPs) ----
app.post('/bulk-suspend', async (req, res) => {
    const { config, ips } = req.body;
    if (!config || !ips) return res.status(400).json({ success: false });
    const results = [];
    for (const item of ips) {
        try {
            const result = await suspendClient(config, item.ip, item.clientName);
            results.push(result);
        } catch (e) { results.push({ success: false, ip: item.ip }); }
    }
    res.json({ success: true, results });
});

// ---- Bulk Activate (Multiple IPs) ----
app.post('/bulk-activate', async (req, res) => {
    const { config, ips } = req.body;
    if (!config || !ips) return res.status(400).json({ success: false });
    const results = [];
    for (const ip of ips) {
        try {
            const result = await activateClient(config, ip);
            results.push(result);
        } catch (e) { results.push({ success: false, ip }); }
    }
    res.json({ success: true, results });
});

// ---- CMS API (Content Management) ----

// Get current config
app.get('/api/cms/config', (req, res) => {
    try {
        if (!fs.existsSync(CONFIG_PATH)) {
            return res.json({ hero: { title: "INTER RED", description: "Conectando al mundo." }, plans: { hogar: { price: "0" }, gaming: { price: "0" } }, contact: { whatsapp: "0" } });
        }
        const data = fs.readFileSync(CONFIG_PATH, 'utf8');
        res.json(JSON.parse(data));
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ---- WISP Database API (Clients & Payments) ----
const WISP_DB_PATH = path.join(__dirname, '..', 'data', 'wisp_db.json');

// Get WISP Database
app.get('/api/wisp/database', (req, res) => {
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

// Save WISP Database
app.post('/api/wisp/database', (req, res) => {
    try {
        const dbData = req.body;
        fs.writeFileSync(WISP_DB_PATH, JSON.stringify(dbData, null, 2));
        res.json({ success: true, message: 'Base de datos WISP guardada en el servidor' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ---- Start Server ----
app.listen(PORT, () => {
    console.log('');
    console.log('  ╔══════════════════════════════════════╗');
    console.log('  ║   🌐 InterRed MikroTik API Server   ║');
    console.log(`  ║   → http://localhost:${PORT}            ║`);
    console.log('  ╚══════════════════════════════════════╝');
    console.log('');
});
