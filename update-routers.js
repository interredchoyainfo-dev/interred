// Script para actualizar los routers MikroTik en la configuración
// Ejecutar en la consola del navegador (F12) en la página del dashboard

const newRouters = [
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
    comment: 'Choya - RemoteMikrotik RM17897139173291 - Puertos: 1123/7123/4123'
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
    comment: 'Frías - RemoteMikrotik RM17904066944449 - Puertos: 1062/7062/4062'
  }
];

async function updateRouters() {
  // Obtener configuración actual
  const settings = DB.getSettings();
  
  // Reemplazar completamente la lista de routers
  settings.routers = newRouters;
  settings.activeRouterIndex = 0;
  
  // Guardar en Firebase
  await DB.saveSettings(settings);
  
  console.log('✅ Routers actualizados correctamente');
  console.log('Nuevos routers:', newRouters.map(r => ({ name: r.name, host: r.host, user: r.user })));
  
  // Recargar la vista de MikroTik
  if (window.App && window.App.loadMikrotikDashboard) {
    window.App.loadMikrotikDashboard();
  }
  
  alert('✅ Routers actualizados. Se configuraron 2 routers SSTP de RemoteMikrotik.');
}

// Ejecutar
updateRouters();