import { RouterOSAPI } from 'routeros-client';

async function test() {
    const api = new RouterOSAPI({
        host: '181.209.118.162',
        port: 8728,
        user: 'interred_api',
        password: 'InterRed2026',
        timeout: 5000
    });
    console.log("Connecting...");
    await api.connect();
    console.log("SUCCESS");
    process.exit(0);
}

test().catch(err => { console.error("ERROR", err); process.exit(1); });
