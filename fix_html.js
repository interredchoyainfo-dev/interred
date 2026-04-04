import fs from 'fs';
const path = 'dashboard.html';
let content = fs.readFileSync(path, 'utf8');
content = content.replace(/<head><link rel=\".+?>/g, '<head>\n    <link rel="stylesheet" href="/css/styles.css">');
fs.writeFileSync(path, content, 'utf8');
console.log('Fixed dashboard.html');
