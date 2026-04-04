const fs = require('fs');

let data = fs.readFileSync('dashboard_debug.txt', 'utf8');
data = data.replace(
    '<option value="Efectivo">Efectivo</option>\r\n                                <option value="Transferencia">Transferencia</option>',
    '<option value="Transferencia">Transferencia</option>\r\n                                <option value="Efectivo">Efectivo</option>'
);
data = data.replace(
    '<option value="Efectivo">Efectivo</option>\n                                <option value="Transferencia">Transferencia</option>',
    '<option value="Transferencia">Transferencia</option>\n                                <option value="Efectivo">Efectivo</option>'
);

// fix dashboard_debug.txt broken styles link
data = data.replace('<link rel=" stylesheet\\ href=\\/css/styles.css\\>', '<link rel="stylesheet" href="/css/styles.css">');

fs.writeFileSync('dashboard.html', data);
console.log('Restored dashboard.html from dashboard_debug.txt with fixes!');
