# PLAN - Stock Management Console Expansion

This plan outlines the design and implementation of advanced inventory features in the **Stock Management** console, turning it into a fully-featured, independent administration system.

---

## Overview
We are expanding the `stock-management` application to include:
1. **Add Item Page:** Clean dedicated creation form for new products.
2. **View Item Detail Page:** Drill-down dashboard for single SKU audits and inventory transaction histories.
3. **Advanced Business Analytics Page:** Enterprise dashboard calculating Inventory Turnover Ratio (ITR), Days Sales of Inventory (DSI), Sell-Through Rate (STR), GMROI, and ABC Analysis segmentation.
4. **Supplier Management Page:** Full CRUD operations and SKU-supplier mapping.
5. **User Access Management Page:** Employee profile creation, role setting, and security credential management.
6. **Database Issues Diagnostics Page:** Real-time health-checks, cache-to-DB mismatch inspector, and sync recovery utility.
7. **Printer Connection Configuration:** Dropdown of OS-installed printers, raw sizing, and test-print capabilities.

---

## Project Type
**WEB / DESKTOP (Electron + Express/MongoDB Backend)**

---

## Tech Stack
* **Frontend:** HTML5, Vanilla JavaScript, Tailwind CSS v4, Chart.js (or lightweight SVG charts), Google Material Symbols.
* **Backend:** Node.js, Express, MongoDB (Mongoose), Electron Main IPC API (`getPrintersAsync`).

---

## File Structure

```plaintext
pos-main/
├── stock-management/
│   ├── add-item.html         # [NEW] Item creation interface
│   ├── add-item.js           # [NEW] Form handler & validation
│   ├── view-item.html        # [NEW] Single SKU detailed lookup & audit trail
│   ├── view-item.js          # [NEW] Audit fetching & transaction log
│   ├── analytics.html        # [NEW] Advanced charts, ITR, DSI, GMROI, ABC Analysis
│   ├── analytics.js          # [NEW] Business logic calculation & Chart.js integration
│   ├── suppliers.html        # [MODIFY] Advanced CRUD and SKU mapping
│   ├── suppliers.js          # [MODIFY] Link suppliers to item catalog
│   ├── users.html            # [NEW] Employee profiles, access roles, PIN manager
│   ├── users.js              # [NEW] User credentials and permissions
│   ├── db-issues.html        # [NEW] Connection state, sync diagnostics, mismatch validator
│   ├── db-issues.js          # [NEW] Mismatch checker & manual recovery triggers
│   ├── printers.html         # [NEW] OS printer selector, raw margins settings, test print
│   ├── printers.js           # [NEW] IPC printer fetching and settings persistence
│   ├── main.js               # [MODIFY] Register IPC handlers for OS printer list
│   └── preload.js            # [MODIFY] Expose getPrinters list bridge
```

---

## Success Criteria
1. **Independent Admin Operations:** No administrative tasks (Users, Items, Suppliers) require Simple POS cashier client access.
2. **Advanced Metrics Calculation:**
   - **ITR (Inventory Turnover Ratio)**: Cost of Goods Sold (COGS) / Average Inventory Value.
   - **DSI (Days Sales of Inventory)**: (Average Inventory / COGS) * 30 days.
   - **GMROI (Gross Margin Return on Investment)**: Gross Profit / Average Inventory Cost.
   - **ABC Analysis**: Auto-categorization of items into A (High Value), B (Moderate), C (Low Value) segments based on sales revenue.
3. **Robust Printing settings:** Users can select any installed printer from a dropdown, configure width/height, and click "Test Print" to produce a test barcode sticker.
4. **DB Diagnostics & Recovery:** Displays real-time API connection, counts pending transactions, lists items present in cache but missing or mismatching in DB, and allows manual delta-sync triggers.

---

## Task Breakdown

### Phase 1: Printer IPC Integration & Settings Page
#### Task 1.1: Expose Printer List IPC in Electron
* **Agent:** `devops-engineer`
* **Skills:** `nodejs-best-practices`
* **Priority:** P1
* **Dependencies:** None
* **INPUT:** `stock-management/main.js` and `preload.js`
* **OUTPUT:** IPC handler executing `webContents.getPrintersAsync()` and exposing it via `window.electronAPI.getPrinters()`.
* **VERIFY:** Console log `window.electronAPI.getPrinters()` in developer tools and confirm it returns array of OS printers.

#### Task 1.2: Build Printer Settings UI (`printers.html` / `printers.js`)
* **Agent:** `frontend-specialist`
* **Skills:** `frontend-design`, `tailwind-patterns`
* **Priority:** P1
* **Dependencies:** Task 1.1
* **INPUT:** New files `stock-management/printers.html` and `printers.js`
* **OUTPUT:** Interface showing printer dropdown, size parameters, and a "Test Print" button. Saves configurations to `localStorage`.
* **VERIFY:** Changing selection updates `localStorage` and triggers a sample sticker silent-print layout.

---

### Phase 2: Inventory CRUD & Detail Viewer (Add/View Item)
#### Task 2.1: Add Item Page (`add-item.html` / `add-item.js`)
* **Agent:** `frontend-specialist`
* **Skills:** `frontend-design`
* **Priority:** P1
* **Dependencies:** None
* **INPUT:** Create `add-item.html` and `add-item.js`
* **OUTPUT:** Clean creation form with fields for SKU, Barcode, Name, Cost Price, Selling Price, Max Discount, and Stock Level.
* **VERIFY:** Submitting form sends `POST /api/items` and creates product in database.

#### Task 2.2: View Item Detail Page (`view-item.html` / `view-item.js`)
* **Agent:** `frontend-specialist`
* **Skills:** `frontend-design`
* **Priority:** P1
* **Dependencies:** Task 2.1
* **INPUT:** Create `view-item.html` and `view-item.js`
* **OUTPUT:** Detailed drill-down view showing item details, barcode preview, and table of recent `InventoryTransaction` records for audit.
* **VERIFY:** Open page with `?sku=SKU_ID` and verify inventory audit log updates correctly.

---

### Phase 3: Advanced Business Analytics
#### Task 3.1: Backend Analytics API Endpoints
* **Agent:** `backend-specialist`
* **Skills:** `api-patterns`, `database-design`
* **Priority:** P1
* **Dependencies:** None
* **INPUT:** `backend/routes/sales.js` or new route `backend/routes/analytics.js`
* **OUTPUT:** Express endpoints calculating ITR, DSI, GMROI, and Pareto ABC revenue segments.
* **VERIFY:** Trigger endpoint via fetch and verify JSON payload matches mathematical calculations.

#### Task 3.2: Analytics Dashboard Page (`analytics.html` / `analytics.js`)
* **Agent:** `frontend-specialist`
* **Skills:** `frontend-design`, `tailwind-patterns`
* **Priority:** P1
* **Dependencies:** Task 3.1
* **INPUT:** Create `stock-management/analytics.html` and `analytics.js`
* **OUTPUT:** Rich dashboard styled in dark corporate rose-red theme displaying KPI metrics cards (ITR, DSI, GMROI), Chart.js sales trends, net profit margins chart (based on price vs costPrice), sales velocity trends (7/30 days per SKU), top categories/items, and low-stock/critical restock alerts.
* **VERIFY:** Analytics load, and KPI cards show valid ratio metrics.

---

### Phase 4: Supplier, User, and DB Diagnostics Pages
#### Task 4.1: User Management Page (`users.html` / `users.js`)
* **Agent:** `frontend-specialist`
* **Skills:** `clean-code`
* **Priority:** P2
* **Dependencies:** None
* **INPUT:** Create `stock-management/users.html` and `users.js`
* **OUTPUT:** CRUD panel to manage system employee users, roles (admin/manager/cashier), and credentials.
* **VERIFY:** Create cashier user, confirm user records update, and verify credentials work on POS sign-in.

#### Task 4.2: Database Issues Diagnostics Page (`db-issues.html` / `db-issues.js`)
* **Agent:** `backend-specialist`
* **Skills:** `nodejs-best-practices`
* **Priority:** P2
* **Dependencies:** None
* **INPUT:** Create `stock-management/db-issues.html` and `db-issues.js`
* **OUTPUT:** Real-time diagnostics page tracking API connection, cached sync log comparison, and delta manual override buttons.
* **VERIFY:** Disconnecting network displays offline indicator, and recovery buttons trigger background sync.

---

## Phase X: Verification Checklist

### 1. Build Verification
- [ ] Run `npm run build-css` in `stock-management` to verify CSS compiles cleanly.
- [ ] Start Stock Management client: `npm start`.

### 2. Runtime Verification
- [ ] List OS printers and select default printer. Test print prints correct layout.
- [ ] Add item with custom price margins, search it, and drill down into the View Item detailed transaction log.
- [ ] Open Analytics page and verify calculations for ITR, DSI, and ABC analysis display correctly.
- [ ] Trigger manual DB cache sync recovery and inspect connection health states.

### 3. Rule Compliance
- [ ] All new MongoDB models/collections let MongoDB auto-generate `_id`.
- [ ] Business logic and item searches utilize `sku` exclusively.
- [ ] No purple/violet color codes used in the frontends.
- [ ] All form inputs have explicit accessibility `<label>` tags.
