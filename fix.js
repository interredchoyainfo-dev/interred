import fs from 'fs';
let data = fs.readFileSync('dashboard_debug.txt', 'utf8');
data = data.replace(
    '<option value="Efectivo">Efectivo</option>\r\n                                <option value="Transferencia">Transferencia</option>',
    '<option value="Transferencia">Transferencia</option>\r\n                                <option value="Efectivo">Efectivo</option>'
);
data = data.replace(
    '<option value="Efectivo">Efectivo</option>\n                                <option value="Transferencia">Transferencia</option>',
    '<option value="Transferencia">Transferencia</option>\n                                <option value="Efectivo">Efectivo</option>'
);
fs.writeFileSync('dashboard.html', data);
console.log('Done!');
