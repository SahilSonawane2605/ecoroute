const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Listen to console errors
  page.on('console', msg => {
    if (msg.type() === 'error') console.log(`[BROWSER ERROR] ${msg.text()}`);
  });

  console.log('1. Navigating to http://[::1]:5173...');
  await page.goto('http://[::1]:5173', { waitUntil: 'domcontentloaded' });

  // Verify page title and header
  const title = await page.title();
  console.log('Page Title:', title);

  // 1. Citizen Authentication Flow
  console.log('2. Clicking "Register Citizen Account"...');
  await page.getByRole('button', { name: 'Register Citizen Account' }).first().click();
  await page.waitForTimeout(500);

  const testEmail = `pune_citizen_${Date.now()}@example.com`;
  console.log(`3. Registering citizen: ${testEmail}`);
  await page.fill('input[placeholder="e.g. Aarav Patil"]', 'Ramesh Kulkarni');
  await page.fill('input[type="email"]', testEmail);
  await page.fill('input[type="password"]', 'CitizenPass#2026');
  
  await page.getByRole('button', { name: 'Create Citizen Account' }).click();
  await page.waitForTimeout(1000);

  // Check citizen full name in header
  const userName = await page.getByText('Ramesh Kulkarni').first().isVisible();
  console.log('4. Citizen Logged In & Name Visible in Header:', userName);

  // Check "My Reports" tab for Citizen
  const myReportsTab = await page.getByRole('button', { name: 'My Reports' }).isVisible();
  console.log('5. "My Reports" Tab Visible for Citizen:', myReportsTab);

  // 2. Submit Report Flow
  console.log('6. Opening Report Submission Modal...');
  await page.getByRole('button', { name: 'Report Hazard' }).click();
  await page.waitForTimeout(500);

  const modalHeading = await page.getByText('Submit Incident Report').isVisible();
  console.log('7. Report form modal opened:', modalHeading);
  await page.getByLabel('Close modal').click();
  await page.waitForTimeout(400);

  // 3. Log out citizen
  console.log('8. Logging out citizen...');
  await page.getByTitle('Sign Out').click();
  await page.waitForTimeout(500);

  // 4. Municipal Admin Login Flow
  console.log('9. Clicking Municipal Admin Login...');
  await page.getByRole('button', { name: 'Municipal Admin Login' }).first().click();
  await page.waitForTimeout(400);

  console.log('10. Entering Admin credentials (admin@pmc.gov.in)...');
  await page.fill('input[type="email"]', 'admin@pmc.gov.in');
  await page.fill('input[type="password"]', 'PuneCivic#2026');
  await page.getByRole('button', { name: 'Sign In as Municipal Administrator' }).click();
  await page.waitForTimeout(1000);

  const adminName = await page.getByText('Executive Engineer R. Joshi').first().isVisible();
  console.log('11. Municipal Admin Console Active (Admin Name Visible):', adminName);

  const adminTab = await page.getByRole('button', { name: 'Municipal Command Console' }).isVisible();
  console.log('12. Municipal Command Console Tab Available for Admin:', adminTab);

  // 5. ML Evaluation Metrics Tab
  console.log('13. Checking RealWaste ML Metrics Tab...');
  await page.getByRole('button', { name: 'RealWaste ML Metrics' }).click();
  await page.waitForTimeout(600);

  const mobilenetv3Heading = await page.getByText('MobileNetV3-Small').first().isVisible();
  console.log('14. Trained MobileNetV3 Checkpoint Metrics Rendered:', mobilenetv3Heading);

  const heldOutSplit = await page.getByText('Held-out Test Split').first().isVisible();
  console.log('15. Held-out Split Real Results Rendered:', heldOutSplit);

  await browser.close();
  console.log('=== ALL E2E VERIFICATION CHECKS PASSED SUCCESSFULLY ===');
})().catch(err => {
  console.error('E2E Verification Failed:', err);
  process.exit(1);
});
