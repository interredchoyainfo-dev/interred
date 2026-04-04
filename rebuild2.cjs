const fs = require('fs');
let data = fs.readFileSync('dashboard_debug.txt', 'utf8');
console.log('Read data, length:', data.length);
if (data.includes('modal-client')) {
    console.log('modal-client exists');
} else {
    console.log('modal-client does NOT exist');
}
fs.writeFileSync('dashboard.html', data, 'utf8');
console.log('Restored dashboard.html from dashboard_debug.txt as utf8');
