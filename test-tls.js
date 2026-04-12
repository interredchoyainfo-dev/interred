import { RouterOSClient } from 'routeros-client';

async function testTLS() {
    console.log("Iniciando prueba TLS hacia el MikroTik...");
    const api = new RouterOSClient({
        host: '181.209.118.162',
        port: 8729,
        user: 'interred_api',
        password: 'InterRed2026',
        keepalive: false,
        tls: true,
        rejectUnauthorized: false
    });

    try {
        console.log("Conectando...");
        const client = await api.connect();
        console.log("✅ ¡CONEXIÓN EXITOSA CON TLS!");
        
        const identity = await client.menu('/system/identity').get();
        console.log("🏷️  Identidad del router:", identity[0].name);
        
        await api.close();
    } catch (err) {
        console.error("❌ ERROR DE CONEXIÓN:");
        console.error(err.message);
    }
}

testTLS();
