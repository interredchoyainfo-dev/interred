const fs = require('fs');

const file1 = fs.readFileSync('dashboard_debug.txt', 'utf8').split(/\r?\n/).map(s => s.trim()).filter(s => s.length > 0);
const file2 = fs.readFileSync('dashboard.html', 'utf8').split(/\r?\n/).map(s => s.trim()).filter(s => s.length > 0);

for (let i = 0; i < Math.max(file1.length, file2.length); i++) {
    const l1 = file1[i] || '';
    const l2 = file2[i] || '';
    if (l1 !== l2 && !l1.includes('styles.css') && !l1.includes('Transferencia') && !l1.includes('Efectivo')) {
        console.log(`Difference at line ${i + 1}:`);
        console.log(`Debug: ${l1}`);
        console.log(`HTML:  ${l2}`);
    }
}
