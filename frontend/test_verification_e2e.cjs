const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function runVerificationE2E() {
  console.log('--- Starting ECO-ROUTE Municipal Verification E2E Test ---');

  const browser = await chromium.launch({ headless: true });
  
  // 1. Citizen Context
  const citizenContext = await browser.newContext({
    geolocation: { latitude: 18.5204, longitude: 73.8567 },
    permissions: ['geolocation']
  });
  const citizenPage = await citizenContext.newPage();
  
  // 2. Municipal Admin Context (Simulating separate browser session / tab)
  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();

  try {
    // --- STEP 1: Log in Citizen in Session 1 ---
    console.log('[Step 1] Navigating Citizen to http://localhost:5173...');
    await citizenPage.goto('http://localhost:5173');
    await citizenPage.waitForSelector('button:has-text("Citizen Login")', { timeout: 10000 });
    await citizenPage.click('button:has-text("Citizen Login")');
    
    // Auth Modal opens: click the Citizen Demo prefill button specifically
    const citizenDemoBtn = citizenPage.locator('button:has-text("Citizen Demo")');
    await citizenDemoBtn.waitFor({ state: 'visible', timeout: 10000 });
    await citizenDemoBtn.click();
    await citizenPage.click('button:has-text("Sign In as Citizen")');
    
    await citizenPage.waitForSelector('button:has-text("Report Hazard")', { timeout: 10000 });
    console.log('✓ Citizen logged in successfully');

    // Create a dummy image for submission
    const dummyImgPath = path.join(__dirname, 'test_hazard.png');
    const pngBuffer = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
    fs.writeFileSync(dummyImgPath, pngBuffer);

    // Generate a unique title for this test run to prevent collision with previously verified reports
    const testTitle = `E2E Waterlogging Clog at Alka Talkies ${Date.now()}`;

    // --- STEP 2: Citizen Submits Incident Report ---
    console.log('[Step 2] Citizen submitting new drainage incident report...');
    await citizenPage.click('button:has-text("Report Hazard")');
    await citizenPage.waitForSelector('input[placeholder*="Paud Road Depot"]', { timeout: 5000 });
    
    await citizenPage.fill('input[placeholder*="Paud Road Depot"]', testTitle);
    await citizenPage.setInputFiles('input[type="file"]', dummyImgPath);
    await citizenPage.fill('input[placeholder*="Inflow pipe partially submerged"]', 'Plastic sacks and bottles obstructing catch basin outlet.');
    
    // Wait for submit button to be enabled (requires coordinates from geolocation)
    const submitBtn = citizenPage.locator('button:has-text("Submit & Assess Hazard")');
    await submitBtn.waitFor({ state: 'visible' });
    await citizenPage.waitForTimeout(1000); // Allow geolocation detection to complete
    await submitBtn.click();

    // In success screen, click Return to My Reports
    await citizenPage.waitForSelector('button:has-text("Return to My Reports")', { timeout: 15000 });
    await citizenPage.click('button:has-text("Return to My Reports")');

    await citizenPage.waitForSelector(`text=${testTitle}`, { timeout: 15000 });
    console.log('✓ Citizen report submitted and visible in Citizen portal');

    // --- STEP 3: Municipal Admin logs in in Session 2 ---
    console.log('[Step 3] Municipal Admin logging in in Session 2...');
    await adminPage.goto('http://localhost:5173');
    await adminPage.waitForSelector('button:has-text("Municipal Staff Login")', { timeout: 10000 });
    await adminPage.click('button:has-text("Municipal Staff Login")');
    
    // Auth Modal for municipal staff: click the Municipal Demo prefill button specifically
    const municipalDemoBtn = adminPage.locator('button:has-text("Municipal Demo")');
    await municipalDemoBtn.waitFor({ state: 'visible', timeout: 10000 });
    await municipalDemoBtn.click();
    await adminPage.click('button:has-text("Access Municipal Console")');

    await adminPage.waitForSelector('text=Municipal Administration Portal', { timeout: 10000 });
    console.log('✓ Municipal Admin logged in successfully');

    // Find the newly created report in Admin portal
    await adminPage.waitForSelector(`text=${testTitle}`, { timeout: 10000 });
    const adminReportRowOrCard = adminPage.locator(`tr:has-text("${testTitle}"), div:has-text("${testTitle}")`).locator('button:has-text("View Details")').first();
    await adminReportRowOrCard.click();
    await adminPage.waitForSelector('h3:has-text("Supervisor Verification")', { timeout: 5000 });
    console.log('✓ Admin opened report details drawer');

    // --- STEP 4: Test Missing Evidence Safeguard ---
    console.log('[Step 4] Checking that Verify button is disabled when resolution photo is missing...');
    const verifyButton = adminPage.locator('button:has-text("Verify & Close Incident")');
    await verifyButton.waitFor({ state: 'attached', timeout: 5000 });
    const isDisabled = await verifyButton.isDisabled();
    if (!isDisabled) {
      throw new Error('FAILED: Verify button should be disabled when resolution photograph has not been uploaded.');
    }
    const warningText = await adminPage.locator('text=Resolution photograph (After) must be saved above before verification sign-off is permitted.').isVisible();
    if (!warningText) {
      throw new Error('FAILED: Warning banner about missing resolution photograph was not shown.');
    }
    console.log('✓ Verified: Municipal admin cannot verify without resolution photo evidence');

    // --- STEP 5: Admin uploads resolution photo and saves ---
    console.log('[Step 5] Admin uploading resolution photograph...');
    const cleanupImgPath = path.join(__dirname, 'test_cleanup.png');
    fs.writeFileSync(cleanupImgPath, pngBuffer);
    
    const cleanupFileInput = adminPage.locator('input[type="file"][accept="image/*"]');
    await cleanupFileInput.setInputFiles(cleanupImgPath);
    await adminPage.click('button:has-text("Save Resolution Photo")');
    await adminPage.waitForSelector('text=Resolution photograph uploaded successfully', { timeout: 10000 });
    console.log('✓ Resolution photo uploaded and saved');

    // --- STEP 6: Admin Signs off and Verifies Incident ---
    console.log('[Step 6] Admin completing Supervisor Verification sign-off...');
    await adminPage.fill('input[placeholder*="Supervisor Name & Designation"]', 'Er. Rajesh Patil (Zonal Drainage Officer)');
    await adminPage.click('button:has-text("Verify & Close Incident")');
    await adminPage.waitForSelector('text=successfully verified and closed', { timeout: 10000 });
    console.log('✓ Municipal verification completed with success notification');

    // --- STEP 7: Verify Multi-Session Background Sync in Citizen Portal ---
    console.log('[Step 7] Testing Cross-Session Polling in Citizen Portal without manual refresh...');
    // Citizen portal is still open in Session 1.
    // Waiting for background polling interval (5s) to update citizen portal automatically
    await citizenPage.waitForSelector('text=✓ VERIFIED & CLOSED', { timeout: 15000 });
    console.log('✓ Citizen portal automatically refreshed to ✓ VERIFIED & CLOSED status via polling!');

    // Citizen opens the details drawer to confirm verification audit trail and supervisor sign-off
    await citizenPage.locator(`div:has-text("${testTitle}")`).locator('button:has-text("View Details")').first().click();
    await citizenPage.waitForSelector('text=Municipal Verification & Incident Closure Confirmed', { timeout: 5000 });
    await citizenPage.waitForSelector('text=Er. Rajesh Patil', { timeout: 5000 });
    console.log('✓ Citizen drawer shows verified banner with supervisor name and timestamp!');

    console.log('\n======================================================');
    console.log('ALL MUNICIPAL VERIFICATION WORKFLOW E2E TESTS PASSED!');
    console.log('======================================================\n');
  } catch (error) {
    console.error('E2E TEST FAILURE:', error);
    process.exit(1);
  } finally {
    await citizenContext.close();
    await adminContext.close();
    await browser.close();
  }
}

runVerificationE2E();
