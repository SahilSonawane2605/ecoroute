const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const consoleMessages = [];
  const pageErrors = [];

  page.on('console', msg => {
    consoleMessages.push(`[${msg.type()}] ${msg.text()}`);
  });

  page.on('pageerror', err => {
    pageErrors.push(err.toString());
  });

  console.log('Navigating to http://localhost:5173...');
  await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  const title = await page.title();
  const rootContent = await page.evaluate(() => document.getElementById('root')?.innerHTML || '');

  console.log('TITLE:', title);
  console.log('ROOT INNER HTML LENGTH:', rootContent.length);
  if (rootContent.length === 0) {
    console.log('BODY HTML:', await page.evaluate(() => document.body.innerHTML));
  } else {
    console.log('ROOT SNIPPET:', rootContent.substring(0, 300));
  }

  console.log('CONSOLE LOGS:', consoleMessages);
  console.log('PAGE ERRORS:', pageErrors);

  await browser.close();
})().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
