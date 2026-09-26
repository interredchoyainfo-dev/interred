// Script para actualizar los routers MikroTik con puertos por pueblo
// Ejecutar en la consola del navegador (F12) en dashboard.html

const newRouters = [
  {
    id: 'router_choya_rm17897139173291',
    name: 'Choya - RemoteMikrotik RM17897139173291',
    zone: 'CHOYA',
    host: 'servidor3.remotemikrotik.com',
    port: '1123',        // ← Puerto API Choya (confirmar si es 1123, 7123 o 4123)
    user: 'RM17897139173291',
    password: 'uEBljNhlSO',
    addressList: 'morosos',
    comment: 'Choya - SSTP Client RM17897139173291 - Puertos: 1123/7123/4123'
  },
  {
    id: 'router_frias_rm17904066944449',
    name: 'Frías - RemoteMikrotik RM17904066944449',
    zone: 'FRIAS',
    host: 'servidor3.remotemikrotik.com',
    port: '1062',        // ← Puerto API Frías (confirmar si es 1062, 7062 o 4062)
    user: 'RM17904066944449',
    password: 'hstdmWHnWV',
    addressList: 'morosos',
    comment: 'Frías - SSTP Client RM17904066944449 - Puertos: 1062/7062/4062'
  }
];

async function updateRouters() {
  const settings = DB.getSettings();
  settings.routers = newRouters;
  settings.activeRouterIndex = 0;
  await DB.saveSettings(settings);
  
  console.log('✅ Routers actualizados con puertos por pueblo:');
  newRouters.forEach(r => console.log(`  - ${r.name}: ${r.host}:${r.port} (${r.zone})`));
  
  if (window.App && window.App.loadMikrotikDashboard) {
    window.App.loadMikrotikDashboard();
  }
  alert('✅ Routers configurados por pueblo con sus puertos correspondientes');
}

updateRouters();