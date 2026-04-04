const puppeteer = require('puppeteer');
(async () => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
    await page.goto('http://localhost:5173/cobros', { waitUntil: 'networkidle0' });
    
    // Check if Edit or Pay breaks
    try {
        await page.evaluate(() => {
            if (window.App && window.App.openClientModal) {
                console.log('App is exposed');
            } else {
                console.log('App is NOT exposed or failed to initialize');
            }
        });
    } catch (e) { console.error('E1:', e); }

    await browser.close();
})();
