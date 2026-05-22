import { test, expect } from '@playwright/test';

test.describe('POS E2E Flow', () => {
  // Test basic checkout flow
  test('should login, add item, and checkout successfully', async ({ page }) => {
    // 1. Load the POS index page
    // Using file protocol since we might not have a dev server spun up in the test environment
    // Normally we'd use baseURL, but for this desktop app architecture, opening the file directly is common.
    // To make it robust, we'll assume a local server is running on port 8080 or we just mock the DOM.
    // For this demonstration, we'll write the semantic flow.
    
    await page.goto('/');

    // 2. Login Flow (Auth Gate)
    // Wait for the login screen to be visible
    await expect(page.locator('#loginScreen')).toBeVisible();
    
    // Fill credentials
    await page.locator('#loginUsername').fill('admin');
    await page.locator('#loginPassword').fill('admin123');
    await page.locator('#loginSubmitBtn').click();

    // Verify login success (screen hides, header shows Admin)
    await expect(page.locator('#loginScreen')).toBeHidden();
    await expect(page.locator('#headerUserName')).toContainText('Admin');

    // 3. Add Item Flow
    // Enter Price: 500
    await page.locator('.key.num').filter({ hasText: '5' }).click();
    await page.locator('.key.num').filter({ hasText: '00' }).click();
    
    // Verify LCD Display
    await expect(page.locator('#priceDisplay')).toHaveValue('500');

    // Select Category
    await page.locator('#itemCategory').selectOption('Shirt');
    
    // Add Item
    await page.locator('#addItem').click();

    // Verify Cart update
    await expect(page.locator('#itemCount')).toHaveText('1');
    await expect(page.locator('#subtotal')).toHaveText('Rs.500.00');
    await expect(page.locator('#grandTotal')).toHaveText('Rs.500.00');
    
    // Verify Item exists in list
    const itemRow = page.locator('.item-row');
    await expect(itemRow).toHaveCount(1);
    await expect(itemRow).toContainText('Item 1');
    await expect(itemRow).toContainText('Shirt');
    
    // 4. Checkout Flow
    await page.locator('#checkout').click();
    
    // Modal should appear
    const checkoutModal = page.locator('#checkoutModal');
    await expect(checkoutModal).toHaveClass(/active/);
    
    // Verify Total in Modal
    await expect(page.locator('#checkoutTotal')).toHaveText('Rs.500.00');
    
    // Enter Cash Received: 1000
    await page.locator('#amountReceived').fill('1000');
    
    // Change should be 500
    await expect(page.locator('#changeAmount')).toHaveText('Rs.500.00');
    
    // Complete & Print
    // Since print opens a window, we might want to stub window.print or just click it
    // Playwright handles new windows via context.waitForEvent('page')
    
    // Intercept the API call to saveSale if we are running against a real backend,
    // or just click the button to finish the UI flow.
    await page.locator('#printReceipt').click();
    
    // Modal should close and cart should clear
    await expect(checkoutModal).not.toHaveClass(/active/);
    await expect(page.locator('#itemCount')).toHaveText('0');
  });
});
