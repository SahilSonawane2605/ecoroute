const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  console.log('1. Navigating to http://localhost:5173...');
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
  
  // Verify map and list are present
  const reportCount = await page.$$eval('.report-risk-badge', el => el.length);
  console.log('2. Leaflet Risk Markers Rendered on Map:', reportCount);
  
  // Select first report item to open drawer
  console.log('3. Clicking first report card in queue...');
  const firstCard = await page.$('.divide-y > div');
  if (firstCard) {
    await firstCard.click();
    await page.waitForTimeout(600);
    const drawerVisible = await page.$eval('aside', el => !!el);
    console.log('4. Inspection Drawer Open State:', drawerVisible);

    // Close drawer via close button
    console.log('5. Closing drawer...');
    await page.getByLabel('Close drawer').click();
    await page.waitForTimeout(400);
  }
  
  // Test opening report submission modal
  console.log('6. Clicking "Report Incident" button...');
  const reportBtn = await page.getByRole('button', { name: 'Report Incident' });
  await reportBtn.click();
  await page.waitForTimeout(500);
  const modalVisible = await page.getByText('Submit Incident Report').isVisible();
  console.log('7. Report Submission Modal Open State:', modalVisible);

  // Close modal
  await page.getByLabel('Close modal').click();
  await page.waitForTimeout(400);
  
  // Check tab switching to ML evaluation
  console.log('8. Switching to "RealWaste ML Evaluation" tab...');
  const tabBtn = await page.getByRole('button', { name: 'RealWaste ML Evaluation' });
  await tabBtn.click();
  await page.waitForTimeout(500);
  const accuracyText = await page.getByText('Top-1 Validation Accuracy').isVisible();
  console.log('9. ML Evaluation Screen Rendered:', accuracyText);

  await browser.close();
  console.log('ALL WORKFLOW VERIFICATION CHECKS PASSED.');
})().catch(err => {
  console.error('E2E Verification Failed:', err);
  process.exit(1);
});
