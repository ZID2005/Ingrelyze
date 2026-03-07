const puppeteer = require('puppeteer');

(async () => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();

    page.on('response', async (response) => {
        if (response.url().includes('/api/') && response.status() >= 400) {
            console.log('Error URL:', response.url());
            console.log('Status:', response.status());
            try {
                const text = await response.text();
                console.log('Response Body:', text);
            } catch (e) {
                console.log('Could not read response body');
            }
        }
    });

    await page.goto('http://localhost:5174');

    // Wait a bit just in case there are auto-requests on load
    await new Promise(r => setTimeout(r, 5000));

    await browser.close();
})();
