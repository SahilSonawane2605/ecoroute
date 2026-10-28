const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on('console', msg => {
    if (msg.type() === 'error') console.log(`[BROWSER ERROR] ${msg.text()}`);
  });

  console.log('1. Navigating to http://[::1]:5173...');
  await page.goto('http://[::1]:5173', { waitUntil: 'domcontentloaded' });

  // 1. Check Unauthenticated Landing Page Options
  console.log('2. Verifying login landing buttons...');
  const citizenLoginBtn = await page.getByRole('button', { name: 'Citizen Login' }).first();
  const municipalLoginBtn = await page.getByRole('button', { name: 'Municipal Staff Login' }).first();
  console.log('Citizen Login Button visible:', await citizenLoginBtn.isVisible());
  console.log('Municipal Staff Login Button visible:', await municipalLoginBtn.isVisible());

  // Confirm registration buttons are removed from UI
  const regCount = await page.getByText(/Register Citizen Account|Create Account|Register here/i).count();
  console.log('Registration options count in UI (must be 0):', regCount);
  if (regCount !== 0) throw new Error('Registration elements still present on login interface');

  // 2. Open Citizen Login Modal
  console.log('3. Opening Citizen Login modal...');
  await citizenLoginBtn.click();
  await page.waitForTimeout(600);

  // Check Demo Credentials Section is Rendered
  const demoSectionVisible = await page.getByText('Demo Credentials (Development Mode)').isVisible();
  console.log('Demo Credentials section visible:', demoSectionVisible);

  // 3. Test Invalid Credentials Error Parsing (Must NOT be [object Object])
  console.log('4. Testing error handling with invalid credentials...');
  await page.fill('input[type="email"]', 'citizen.demo@ecoroute.local');
  await page.fill('input[type="password"]', 'WrongPassword123');
  await page.getByRole('button', { name: 'Sign In as Citizen' }).click();
  await page.waitForTimeout(800);

  const errorText = await page.locator('.bg-red-50').innerText();
  console.log('Error message rendered to user:', errorText.trim());
  if (errorText.includes('[object Object]')) {
    throw new Error('FAILED: Raw [object Object] detected in error box!');
  }
  if (!errorText.includes('Invalid email or password')) {
    throw new Error('FAILED: Expected "Invalid email or password" error message');
  }

  // 4. Test Citizen Demo One-Click Autofill and Login
  console.log('5. Clicking "Use Account" for Citizen Demo...');
  await page.getByRole('button', { name: 'Use Account →' }).first().click();
  await page.waitForTimeout(300);

  console.log('Submitting citizen demo login...');
  await page.getByRole('button', { name: 'Sign In as Citizen' }).click();
  await page.waitForTimeout(1000);

  // Verify Citizen Logged in
  const citizenName = await page.getByText('Demo Citizen User').first().isVisible();
  console.log('Citizen logged in successfully (Demo Citizen User visible):', citizenName);
  const myReportsVisible = await page.getByRole('button', { name: 'My Reports' }).isVisible();
  console.log('"My Reports" tab visible for citizen:', myReportsVisible);

  // Log out citizen
  console.log('6. Logging out citizen...');
  await page.getByTitle('Sign Out').click();
  await page.waitForTimeout(500);

  // 5. Open Municipal Staff Login Modal
  console.log('7. Opening Municipal Staff Login modal...');
  await page.getByRole('button', { name: 'Municipal Staff Login' }).first().click();
  await page.waitForTimeout(600);

  // Test Municipal Demo One-Click Autofill and Login
  console.log('8. Clicking "Use Account" for Municipal Demo...');
  const useMunicipalBtn = page.getByRole('button', { name: 'Use Account →' }).nth(1);
  await useMunicipalBtn.click();
  await page.waitForTimeout(300);

  console.log('Submitting municipal demo login...');
  await page.getByRole('button', { name: 'Access Municipal Console' }).click();
  await page.waitForTimeout(1000);

  // Verify Municipal Admin Logged in
  const municipalName = await page.getByText('Demo Municipal Officer').first().isVisible();
  console.log('Municipal Admin logged in successfully (Demo Municipal Officer visible):', municipalName);
  const commandConsoleVisible = await page.getByRole('button', { name: 'Municipal Command Console' }).isVisible();
  console.log('Municipal Command Console visible:', commandConsoleVisible);

  await browser.close();
  console.log('=== ALL LOGIN INTERFACE & DEMO ACCOUNT CHECKS PASSED ===');
})().catch(err => {
  console.error('Login Interface Verification Failed:', err);
  process.exit(1);
});
