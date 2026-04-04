import { RouterOSClient } from 'routeros-client';
async function test() {
    const api = new RouterOSClient({ host: '1', user: '2', password: '3', keepalive: false });
    console.log(typeof api.menu);
    console.log(api);
}
test();

