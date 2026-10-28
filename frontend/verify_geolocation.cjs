const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

(async () => {
  // Launch browser with Wagholi, Pune geolocation pre-configured
  // Wagholi coordinates: lat: 18.5793, lon: 73.9787
  const WAGHOLI_COORDS = { latitude: 18.5793, longitude: 73.9787 };

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    permissions: ['geolocation'],
    geolocation: WAGHOLI_COORDS,
  });

  const page = await context.newPage();

  page.on('console', msg => {
    if (msg.type() === 'error') console.log(`[BROWSER ERROR] ${msg.text()}`);
  });

  console.log('1. Navigating to http://[::1]:5173...');
  await page.goto('http://[::1]:5173', { waitUntil: 'domcontentloaded' });

  // 1. Log in as Citizen Demo
  console.log('2. Signing in as citizen demo...');
  await page.getByRole('button', { name: 'Citizen Login' }).first().click();
  await page.waitForTimeout(500);

  // Click citizen demo button
  await page.getByRole('button', { name: 'Use Account →' }).first().click();
  await page.waitForTimeout(200);
  await page.getByRole('button', { name: 'Sign In as Citizen' }).click();
  await page.waitForTimeout(1000);

  console.log('Citizen logged in. Opening "Report Hazard" modal...');
  await page.getByRole('button', { name: 'Report Hazard' }).click();

  // 2. Observe Automatic Geolocation Request on Modal Open (NO button click needed)
  console.log('3. Checking automatic location detection in progress...');
  await page.waitForTimeout(800);

  // Check that coordinates in modal reflect Wagholi (18.5793, 73.9787) rather than Bavdhan (18.5152, 73.7810)
  const coordsText = await page.locator('.font-mono.text-emerald-800').innerText();
  console.log('Detected Coordinates Displayed:', coordsText);

  if (!coordsText.includes('18.5793') || !coordsText.includes('73.9787')) {
    throw new Error(`FAILED: Expected Wagholi coordinates 18.5793, 73.9787 but found ${coordsText}`);
  }
  if (coordsText.includes('18.5152') || coordsText.includes('73.7810')) {
    throw new Error('FAILED: Hardcoded Bavdhan coordinates were detected!');
  }

  // 3. Check Reverse-Geocoded Address (Must be Wagholi / Baif Road, NOT Bavdhan)
  console.log('4. Waiting for reverse-geocoded address...');
  await page.waitForTimeout(2500);
  const addressVal = await page.locator('input[placeholder="Auto-detected or enter street name..."]').inputValue();
  console.log('Reverse-Geocoded Address:', addressVal);

  if (addressVal.toLowerCase().includes('bavdhan')) {
    throw new Error(`FAILED: Address still contains Bavdhan: ${addressVal}`);
  }

  // 4. Submit Report with Detected Location and Sample Photo
  console.log('5. Submitting report with detected Wagholi coordinates...');
  // Find a sample image in realwaste to upload
  const sampleImagePath = path.resolve('..', 'realwaste', 'realwaste-main', 'RealWaste', 'Plastic', 'Plastic_1.jpg');
  console.log('Attaching test image from:', sampleImagePath);
  
  const fileInput = await page.locator('input[type="file"]');
  await fileInput.setInputFiles(sampleImagePath);
  await page.waitForTimeout(500);

  // Fill title
  await page.fill('input[placeholder="e.g. Grate blocked by plastic sacks outside Paud Road Depot"]', 'Plastic clogging storm culvert in Wagholi');

  // Click Submit
  console.log('Submitting form...');
  await page.getByRole('button', { name: 'Submit & Assess Hazard' }).click();
  await page.waitForTimeout(4000);

  // Verify submission summary shows the exact Wagholi coordinates
  const summaryHeading = await page.getByText('Hazard Report Submitted').isVisible();
  console.log('Report submitted successfully modal rendered:', summaryHeading);

  const summaryCoords = await page.getByText(/18\.579300.*73\.978700/).first().isVisible();
  console.log('Summary reflects exact Wagholi coordinates (18.579300, 73.978700):', summaryCoords);

  const summaryId = await page.locator('.font-mono.font-semibold.text-slate-900').first().innerText();
  console.log('Created Report ID:', summaryId);

  await page.getByRole('button', { name: 'Return to My Reports' }).click();
  await page.waitForTimeout(1000);

  // Confirm report appears in Citizen My Reports queue
  const reportItem = await page.getByText('Plastic clogging storm culvert in Wagholi').first().isVisible();
  console.log('Report visible in Citizen "My Reports" list:', reportItem);

  await browser.close();
  console.log('=== AUTOMATIC GEOLOCATION VERIFICATION PASSED ===');
})().catch(err => {
  console.error('Geolocation Verification Failed:', err);
  process.exit(1);
});
