import { RouterOSAPI } from 'routeros-client';

async function test() {
    const api = new RouterOSAPI({
        host: '181.209.118.162',
        port: 8728,
        user: 'interred_api',
        password: 'InterRed2026',
        timeout: 10
    });
    
    console.log("Intentando conectar a 181.209.118.162:8728...");
    try {
        await api.connect();
        console.log("✅ CONEXIÓN EXITOSA");
        
        // Intentar leer la identidad
        const result = await api.write('/system/identity/print');
        console.log("Identidad del Router:", result);
        
        await api.close();
    } catch (err) {
        console.error("❌ ERROR DE CONEXIÓN:", err.message);
        if (err.message.includes("login")) {
            console.log("💡 Tip: Revisa si el usuario o la contraseña son correctos.");
        } else if (err.message.includes("timeout") || err.message.includes("EHOSTUNREACH")) {
            console.log("💡 Tip: Puede que el puerto 8728 esté cerrado en el firewall del MikroTik o la IP no sea alcanzable.");
        }
    }
}

test();
