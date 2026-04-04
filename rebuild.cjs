const fs = require('fs');

// Read as utf16le
let data = fs.readFileSync('dashboard_debug.txt', 'utf16le');

// Fix the dropdown
data = data.replace(
    '<option value="Efectivo">Efectivo</option>\r\n                                <option value="Transferencia">Transferencia</option>',
    '<option value="Transferencia">Transferencia</option>\r\n                                <option value="Efectivo">Efectivo</option>'
);
data = data.replace(
    '<option value="Efectivo">Efectivo</option>\n                                <option value="Transferencia">Transferencia</option>',
    '<option value="Transferencia">Transferencia</option>\n                                <option value="Efectivo">Efectivo</option>'
);

// Fix the broken style link in debug file
data = data.replace('<link rel=" stylesheet\\ href=\\/css/styles.css\\>', '<link rel="stylesheet" href="/css/styles.css">');

// Save as utf8
fs.writeFileSync('dashboard.html', data, 'utf8');
console.log('Successfully created dashboard.html!');
