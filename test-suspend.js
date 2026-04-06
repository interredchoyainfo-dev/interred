import { suspendClient } from './server/mikrotik.js';

const config = {
    host: '181.209.118.162',
    port: 9728,
    user: 'interred_api',
    password: 'InterRed2026',
    addressListName: 'morosos'
};

(async () => {
    console.log('Iniciando prueba de corte al cliente: 192.168.20.252...');
    try {
        const result = await suspendClient(config, '192.168.20.252', 'Cliente Prueba');
        console.log('============= RESULTADO =============');
        console.log(result);
        console.log('=====================================');
    } catch (e) {
        console.error('Error durante la prueba:', e);
    }
    process.exit(0);
})();
