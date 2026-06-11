# 📋 Fashion Shaa POS — Complete Project Report
> **Document Type:** Onboarding & Technical Reference  
> **Version:** 2.0.0  
> **Prepared for:** New & Existing Development Team Members  
> **Last Updated:** June 2026

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Technology Stack](#2-technology-stack)
3. [System Architecture](#3-system-architecture)
4. [Project Directory Structure](#4-project-directory-structure)
5. [Database Schema & Entity Relationships](#5-database-schema--entity-relationships)
6. [Backend — API Reference](#6-backend--api-reference)
7. [Frontend — Electron Desktop Application](#7-frontend--electron-desktop-application)
8. [Authentication & Authorization Flow](#8-authentication--authorization-flow)
9. [MongoDB Sync System](#9-mongodb-sync-system)
10. [Data Flow Diagrams](#10-data-flow-diagrams)
11. [Security Architecture](#11-security-architecture)
12. [Deployment Architecture](#12-deployment-architecture)
13. [Environment Configuration](#13-environment-configuration)
14. [Local Development Setup](#14-local-development-setup)
15. [Testing Strategy](#15-testing-strategy)
16. [Known Issues & Technical Debt](#16-known-issues--technical-debt)
17. [Glossary](#17-glossary)

---

## 1. Project Overview

**Fashion Shaa POS** is a full-featured, retail Point-of-Sale (POS) system built for a fashion retail store. It is packaged as a **Windows desktop application** (via Electron) that communicates with a **cloud-hosted REST API** (Node.js + Express) backed by **MongoDB Atlas** (or a local MongoDB instance).

### Business Modules

| Module | Description |
|---|---|
| **Sales / POS** | Core billing, cart management, receipt printing |
| **Inventory** | Product catalogue, stock level tracking, SKU/barcode management |
| **Customers (CRM)** | Customer profiles, loyalty points, purchase history |
| **Employees** | Staff management, roles, salary tracking |
| **Attendance** | Daily attendance recording and reporting |
| **Shifts** | Cash register shift open/close with float reconciliation |
| **Discounts** | Rule-based discount engine (%, fixed, BOGO) |
| **Suppliers** | Supplier directory, purchase orders, restock tracking |
| **Returns** | Return/refund processing against original sales |
| **Advances** | Employee salary advance management |
| **Analytics** | Sales charts, employee performance, item-level analytics |
| **Reports** | Period-based sales, revenue, and inventory reports |
| **AI Assistant** | Gemini AI integration for business insights |
| **Sync** | Bidirectional MongoDB sync between local and remote DBs |

### Key Design Decisions

- **Offline-capable desktop app** — Electron wraps HTML pages; no React/framework overhead.
- **No IndexedDB** — All data lives in MongoDB. The frontend `database.js` is a thin fetch-wrapper, not a local DB.
- **Auto API Discovery** — On startup the frontend probes multiple localhost ports before falling back to user-configured remote origin.
- **Dual MongoDB** — Supports local + remote MongoDB with scheduled background sync in either direction.

---

## 2. Technology Stack

### Backend

| Concern | Technology | Version |
|---|---|---|
| Runtime | Node.js | LTS |
| Framework | Express | ^5.2.1 |
| Database ODM | Mongoose | ^9.3.1 |
| Authentication | JSON Web Token (jsonwebtoken) | ^9.0.3 |
| Password Hashing | bcryptjs | ^3.0.3 |
| Rate Limiting | express-rate-limit | ^8.5.2 |
| Barcode Generation | bwip-js | ^4.7.0 |
| AI Integration | @google/generative-ai (Gemini) | ^0.24.1 |
| Config | dotenv | ^17.3.1 |
| CORS | cors | ^2.8.6 |
| Test DB | mongodb-memory-server | ^11.0.1 |

### Frontend (Electron Desktop App)

| Concern | Technology | Version |
|---|---|---|
| Shell | Electron | ^31.0.0 |
| UI Framework | Vanilla HTML + JS (no React/Vue) | — |
| CSS Framework | Tailwind CSS | ^3.4.1 |
| Bundler | electron-builder | ^26.4.0 |
| E2E Testing | Playwright | ^1.60.0 |
| Unit Testing | Jest | ^30.4.2 |
| CSS Build | tailwindcss CLI + PostCSS | — |

### Infrastructure & Deployment

| Concern | Technology |
|---|---|
| Backend Hosting | Render.com (Node web service) |
| Database | MongoDB Atlas (remote) + local MongoDB |
| Desktop Distribution | NSIS Installer + Portable EXE |
| Config Management | `.env` files + Render environment variables |

---

## 3. System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                  ELECTRON DESKTOP CLIENT                    │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Renderer Process (Chromium)                           │ │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │ │
│  │  │index.html│ │items.html│ │sales.html│ │  ...etc  │  │ │
│  │  └─────┬────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘  │ │
│  │        └───────────┴────────────┴─────────────┘        │ │
│  │                    │  All pages share                   │ │
│  │              database.js (API wrapper)                  │ │
│  │              fetchAPI() → JWT → REST calls              │ │
│  └────────────────────┬───────────────────────────────────┘ │
│  ┌─────────────────── │──────────────────────────────────┐  │
│  │  Main Process      │  (main.js)                        │  │
│  │  - BrowserWindow   │                                   │  │
│  │  - Silent Printing (IPC: print-receipt)               │  │
│  │  - System Time (IPC: set-system-time)                 │  │
│  │  - CSP injection                                      │  │
│  └────────────────────┼──────────────────────────────────┘  │
└───────────────────────┼──────────────────────────────────────┘
                        │  HTTPS/HTTP  (Bearer JWT)
                        ▼
┌─────────────────────────────────────────────────────────────┐
│              NODE.JS / EXPRESS REST API                     │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │  CORS       │  │ Rate Limiter │  │ Auth Middleware    │  │
│  │  (Strict)   │  │ (auth: 20/15m│  │ authenticateToken │  │
│  │             │  │  ai: 10/1m)  │  │ authorize(roles)  │  │
│  └─────────────┘  └──────────────┘  └───────────────────┘  │
│                                                             │
│  Routes: /api/auth  /api/items  /api/sales  /api/employees  │
│          /api/customers  /api/discounts  /api/shifts        │
│          /api/attendance  /api/suppliers  /api/returns      │
│          /api/advances  /api/barcode  /api/ai  /api/sync    │
│                          /api/health                        │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  syncService.js — Background MongoDB Sync             │  │
│  │  Interval: 60s (configurable)                        │  │
│  └──────────────────────────────────────────────────────┘  │
└──────────────────────┬──────────────────────────────────────┘
                       │  Mongoose ODM
              ┌────────┴────────┐
              │                 │
┌─────────────▼──────┐  ┌───────▼────────────┐
│  MongoDB LOCAL     │  │  MongoDB REMOTE     │
│  127.0.0.1:27017   │  │  Atlas (Cloud)      │
│  fashion_shaa_pos  │  │  mongodb+srv://...  │
└────────────────────┘  └────────────────────┘
         ▲                        ▲
         └──────── SYNC ──────────┘
             (bidirectional, bulk upsert)
```

### Connection Mode Strategy

The backend supports 4 MongoDB connection modes, resolved from the `MONGO_CONNECTION_MODE` env var:

```
┌──────────────────────────────────────────────────────────────┐
│               MongoDB Connection Mode Selection              │
├──────────┬───────────────────────────────────────────────────┤
│ single   │ Uses MONGO_URI / MONGODB_URI directly             │
│ local    │ Uses MONGO_LOCAL_URI only                         │
│ remote   │ Uses MONGO_REMOTE_URI only                        │
│ auto     │ Tries REMOTE first, falls back to LOCAL           │
└──────────┴───────────────────────────────────────────────────┘
```

---

## 4. Project Directory Structure

```
pos-main/                          ← Project Root
│
├── backend/                       ← Node.js REST API
│   ├── server.js                  ← Express app entry point, route mounting, startup
│   ├── config.js                  ← All env var parsing & MongoDB config builder
│   ├── mongoConnection.js         ← MongoDB connection with fallback logic
│   ├── syncService.js             ← Bidirectional MongoDB background sync
│   ├── backup.js                  ← DB backup utility
│   ├── seed-users.js              ← Seed script for creating initial users
│   │
│   ├── middleware/
│   │   └── auth.js                ← JWT verify (authenticateToken) + role check (authorize)
│   │
│   ├── models/                    ← Mongoose schemas (one file = one collection)
│   │   ├── User.js                ← System user accounts (login)
│   │   ├── Employee.js            ← Staff records
│   │   ├── Item.js                ← Product / inventory items
│   │   ├── Sale.js                ← Sales transactions (with embedded SaleItems)
│   │   ├── Customer.js            ← CRM customer records
│   │   ├── Return.js              ← Return/refund records
│   │   ├── Shift.js               ← Cash register shifts
│   │   ├── Attendance.js          ← Daily attendance records
│   │   ├── Supplier.js            ← Supplier directory
│   │   ├── PurchaseOrder.js       ← Purchase orders from suppliers
│   │   ├── DiscountRule.js        ← Discount engine rules
│   │   ├── EmployeeAdvance.js     ← Salary advance records
│   │   └── InventoryTransaction.js← Stock in/out audit trail
│   │
│   ├── routes/                    ← Express routers (one file = one domain)
│   │   ├── auth.js                ← Login, register, user management
│   │   ├── items.js               ← Inventory CRUD
│   │   ├── sales.js               ← Sales create/query/analytics
│   │   ├── employees.js           ← Employee CRUD
│   │   ├── customers.js           ← CRM CRUD
│   │   ├── discounts.js           ← Discount rule management
│   │   ├── shifts.js              ← Shift open/close management
│   │   ├── attendance.js          ← Attendance records
│   │   ├── suppliers.js           ← Supplier management
│   │   ├── returns.js             ← Return processing
│   │   ├── advances.js            ← Employee advances
│   │   ├── barcode.js             ← Barcode generate/assign/render
│   │   ├── ai.js                  ← Gemini AI insight endpoints
│   │   ├── restock.js             ← Restock / purchase orders
│   │   ├── mappings.js            ← Category/item mappings (admin)
│   │   └── sync.js                ← Manual sync trigger (admin only)
│   │
│   ├── utils/
│   │   ├── barcodeParser.js       ← Parse structured barcodes (price/category/SKU)
│   │   ├── importer.js            ← Bulk CSV/data import utility
│   │   └── skuGenerator.js        ← Auto-generate SKU from item name + category
│   │
│   ├── migrations/                ← Database migration scripts
│   ├── tests/                     ← Integration test scripts
│   ├── .env                       ← Local environment vars (git-ignored)
│   ├── .env.example               ← Template for new devs
│   └── package.json
│
├── simple-pos/                    ← Electron Desktop App
│   ├── main.js                    ← Electron main process (window, IPC, CSP)
│   ├── preload.js                 ← Electron preload (contextBridge)
│   ├── database.js                ← API wrapper (replaces IndexedDB), POS_API global
│   │
│   ├── index.html / index.js (app.old.js)  ← POS sales terminal page
│   ├── items.html / items.js      ← Inventory management
│   ├── customers.html / customers.js       ← Customer/CRM management
│   ├── employees.html / employees.js       ← Employee management
│   ├── discounts.html / discounts.js       ← Discount rule management
│   ├── analytics.html / analytics.js       ← Sales analytics & charts
│   ├── reports.html / reports.js  ← Report generation
│   ├── returns.html / returns.js  ← Return/refund workflow
│   ├── suppliers.html / suppliers.js       ← Supplier directory
│   ├── shifts.html / shifts.js    ← Cash shift management
│   ├── attendance.html            ← Attendance tracking
│   ├── advances.html / advances.js← Employee advance management
│   ├── settings.html / settings.js← API origin config, user management
│   ├── profile.html / profile.js  ← User profile
│   ├── sync.html / sync.js        ← MongoDB sync control panel
│   ├── dashboard.html             ← Main dashboard
│   │
│   ├── input.css                  ← Tailwind CSS source
│   ├── output.css                 ← Compiled Tailwind CSS (generated)
│   ├── style.css                  ← Global custom styles
│   ├── analytics.css              ← Analytics page styles
│   │
│   ├── tailwind.config.js         ← Tailwind configuration
│   ├── playwright.config.js       ← E2E test config
│   ├── jest.config.js             ← Unit test config
│   ├── tests/                     ← E2E + unit tests
│   └── package.json
│
├── render.yaml                    ← Render.com deployment blueprint
├── DEPLOYMENT.md                  ← Deployment guide
└── README.md
```

---

## 5. Database Schema & Entity Relationships

### Entity Relationship Diagram

```
┌──────────────┐        ┌──────────────────────┐        ┌──────────────┐
│     USER     │        │        SALE          │        │   CUSTOMER   │
├──────────────┤        ├──────────────────────┤        ├──────────────┤
│ _id          │        │ _id                  │        │ id (custom)  │
│ username     │        │ employeeId  ─────────┼──┐     │ name         │
│ password(✗)  │        │ totalAmount          │  │     │ phone (idx)  │
│ pin (✗)      │        │ subTotal             │  │     │ email        │
│ role         │        │ discount             │  │     │ address      │
│ employeeId──────┐     │ amountReceived       │  │     │ birthday     │
│ isActive     │  │     │ changeAmount         │  │     │ points       │
│ lastLogin    │  │     │ itemsCount           │  │     │ photoBase64  │
│ createdAt    │  │     │ saleDate (idx)       │  │     │ lastVisit    │
└──────────────┘  │     │ saleTime             │  │     │ createdAt    │
                  │     │ customerId ──────────┼──┼──►  └──────────────┘
                  │     │ customerName         │  │
                  │     │ items[] (embedded)   │  │     ┌──────────────┐
                  │     │  ├─ sku              │  │     │   EMPLOYEE   │
                  │     │  ├─ itemName         │  └──►  ├──────────────┤
                  │     │  ├─ quantity         │        │ empId (E1..) │
                  │     │  ├─ unitPrice        │        │ name         │
                  │     │  ├─ totalPrice       │        │ phone        │
                  │     │  ├─ discountEligible │        │ role         │
                  │     │  └─ priceFromBarcode │        │ baseSalary   │
                  │     │ createdAt (-1 idx)   │        │ workingDays  │
                  │     └──────────────────────┘        │ createdAt    │
                  │                                     └──────┬───────┘
                  └─────────────────────────────────────────►  │
                                                               │
┌──────────────┐         ┌────────────────┐   ┌──────────────┐│
│     ITEM     │         │  DISCOUNT_RULE  │   │  ATTENDANCE  ││
├──────────────┤         ├────────────────┤   ├──────────────┤│
│ sku (idx/unq)│         │ id (custom/unq)│   │ employeeId ◄─┘│
│ barcode (idx)│         │ name           │   │ employeeName  │
│ name         │         │ type           │   │ date          │
│ category     │         │ valueType      │   │ status        │
│ price        │         │ value/Min/Max  │   │ note          │
│ stockLevel   │         │ appliesTo      │   └──────────────┘
│ imageUrl     │         │ minPurchase    │
│ storedAt     │         │ startDate      │   ┌──────────────┐
│ createdAt    │         │ endDate        │   │     SHIFT    │
└──────────────┘         │ active         │   ├──────────────┤
                         │ createdAt      │   │ employeeId   │
                         └────────────────┘   │ openingFloat │
                                              │ salesTotal   │
┌──────────────┐         ┌────────────────┐   │ closingCash  │
│   SUPPLIER   │         │ PURCHASE_ORDER  │   │ difference   │
├──────────────┤         ├────────────────┤   │ openedAt     │
│ _id          │◄────────│ supplierId     │   │ closedAt     │
│ name         │         │ items[]        │   │ notes        │
│ contact      │         │ status         │   └──────────────┘
│ ...          │         │ totalCost      │
└──────────────┘         └────────────────┘   ┌──────────────┐
                                              │  EMP_ADVANCE  │
┌──────────────┐                             ├──────────────┤
│    RETURN    │                             │ employeeId   │
├──────────────┤                             │ amount       │
│ saleId       │                             │ date         │
│ items[]      │                             │ reason       │
│ reason       │                             │ status       │
│ refundAmount │                             └──────────────┘
│ processedBy  │
└──────────────┘
```

### MongoDB Collections Summary

| Collection | Model File | Key Indexes |
|---|---|---|
| `users` | User.js | `username` (unique) |
| `employees` | Employee.js | `empId` (unique) |
| `items` | Item.js | `sku` (unique), `barcode` (unique, sparse) |
| `sales` | Sale.js | `saleDate`, `employeeId`, `(saleDate+employeeId)` compound, `createdAt` desc |
| `customers` | Customer.js | `id` (unique), `phone` |
| `returns` | Return.js | — |
| `shifts` | Shift.js | — |
| `attendances` | Attendance.js | — |
| `suppliers` | Supplier.js | — |
| `purchaseorders` | PurchaseOrder.js | — |
| `discountrules` | DiscountRule.js | `id` (unique) |
| `employeeadvances` | EmployeeAdvance.js | — |
| `inventorytransactions` | InventoryTransaction.js | — |

---

## 6. Backend — API Reference

### Base URL
- **Local Dev:** `http://localhost:5000/api`
- **Production:** `https://<your-service>.onrender.com/api`

### Authentication
All protected routes require:
```
Authorization: Bearer <JWT_TOKEN>
```
Token is obtained from `POST /api/auth/login` and expires based on `JWT_EXPIRY` (default: `12h`).

### Role Hierarchy
```
admin > manager > cashier
```

### Route Overview

#### Public Routes
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Health check — DB status, version, sync state |
| `POST` | `/auth/login` | Authenticate → returns JWT |
| `POST` | `/auth/register` | Create user (first user is auto-admin; subsequent require admin JWT) |

#### Auth Management (JWT required)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/auth/me` | All | Current user info |
| `POST` | `/auth/override` | All | Verify admin PIN for override |
| `GET` | `/auth/users` | admin | List all system users |
| `PUT` | `/auth/users/:id` | admin | Update role, status, password, PIN |

#### Inventory
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/items` | All | List all items |
| `POST` | `/items` | All | Create item |
| `GET` | `/items/:sku` | All | Get item by SKU |
| `PUT` | `/items/:sku` | All | Update item |
| `DELETE` | `/items/:sku` | All | Delete item |

#### Sales
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/sales` | All | List sales (`?date=`, `?limit=`) |
| `POST` | `/sales` | All | Create sale (deducts stock) |
| `GET` | `/sales/:id` | All | Get sale by ID |

#### Employees
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/employees` | All | List all employees |
| `POST` | `/employees` | All | Create employee |
| `PUT` | `/employees/:empId` | All | Update employee |
| `DELETE` | `/employees/:empId` | All | Delete employee |

#### Customers
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/customers` | All | List all customers |
| `POST` | `/customers` | All | Create customer |
| `GET` | `/customers/:id` | All | Get customer |
| `PUT` | `/customers/:id` | All | Update customer |
| `DELETE` | `/customers/:id` | All | Delete customer |

#### Restricted Routes (admin/manager)
| Endpoint | Notes |
|---|---|
| `/attendance` | Attendance recording |
| `/suppliers` | Supplier directory |
| `/mappings` | Category mappings config |
| `/sync` | Manual DB sync trigger (admin only) |

#### AI
| Method | Endpoint | Access | Notes |
|---|---|---|---|
| `POST` | `/ai/*` | All + 10 req/min limit | Gemini-powered business insights |

#### Barcode
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/barcode/generate` | Generate EAN-13 or structured barcode |
| `POST` | `/barcode/assign` | Assign barcode to existing item |
| `POST` | `/barcode/render` | Render barcode as PNG |

---

## 7. Frontend — Electron Desktop Application

### Application Startup Flow

```
1. npm start (Electron)
   │
   ├─► main.js creates BrowserWindow
   │     - nodeIntegration: false (security)
   │     - contextIsolation: true (security)
   │     - CSP injected via injectCspMeta()
   │     - Single instance lock enforced
   │
   ├─► Loads index.html (POS terminal)
   │
   └─► database.js initialises:
         ├─ resolveApiOrigin() probes localhost candidates
         │    [127.0.0.1:5096, localhost:5096, 127.0.0.1:5000, localhost:5000]
         ├─ Checks saved origin from localStorage
         └─ Falls back to http://localhost:5000
```

### Page-to-Module Mapping

| Page File | Feature Domain |
|---|---|
| `index.html` | POS Sales Terminal (main checkout screen) |
| `items.html` | Inventory / Product Catalogue |
| `customers.html` | CRM — Customer management |
| `employees.html` | HR — Staff management |
| `discounts.html` | Promotion & Discount rules |
| `analytics.html` | Business analytics & charts |
| `reports.html` | Report generation & export |
| `returns.html` | Returns / Refund processing |
| `suppliers.html` | Supplier directory |
| `shifts.html` | Cash register shift management |
| `attendance.html` | Staff attendance |
| `advances.html` | Salary advance management |
| `settings.html` | API config, users, system settings |
| `sync.html` | MongoDB sync control panel |
| `dashboard.html` | Executive summary dashboard |
| `profile.html` | Current user profile |

### The `database.js` Global API (`window.POS_API`)

`database.js` is the **single source of truth** for all API communication. It exposes everything via `window.POS_API`:

```
window.POS_API = {
  // API Origin Management
  normalizeApiOrigin, getApiOrigin, setApiOrigin, getApiBase,

  // Auth
  getAuthToken, setAuthToken, getAuthUser, setAuthUser,
  isAuthenticated, loginUser, registerUser, logoutUser,
  getSystemUsers, createSystemUserAccount, updateSystemUserAccount,

  // Core Fetch Wrapper
  fetchAPI,               ← Used by ALL other functions

  // Sales
  saveSale, getAllSales, getSalesByDateRange, getSalesByEmployee,
  getTodaySales, getWeekSales, getYearSales,

  // Items
  getAllInventoryItems, saveInventoryItem, updateInventoryItem,
  deleteInventoryItem, deleteInventoryItemBySku,

  // Barcode
  generateEan13Barcode, assignEan13BarcodeToItem,
  generateStructuredBarcode, renderBarcodePng,

  // Employees
  getAllEmployees, saveEmployee, updateEmployeeRecord, deleteEmployeeFromDB,

  // Attendance
  getAllAttendance, saveAttendanceRecord,

  // Customers
  getAllCustomers, getCustomerById, saveCustomer, deleteCustomer, addLoyaltyPoints,

  // Shifts, Returns, Suppliers, etc.
  ...
}
```

### IPC Channels (Main Process ↔ Renderer)

| Channel | Direction | Description |
|---|---|---|
| `print-receipt` | Renderer → Main | Silent thermal receipt printing |
| `set-system-time` | Renderer → Main | Adjusts Windows system clock (runs elevated PowerShell) |

---

## 8. Authentication & Authorization Flow

### Login Sequence

```
User enters credentials
        │
        ▼
POST /api/auth/login
        │
        ├─ Find user by username (case-insensitive)
        ├─ Check isActive === true
        ├─ bcrypt.compare(password, hash)
        ├─ Update lastLogin timestamp
        └─ jwt.sign({ id, username, role, employeeId })
                │
                ▼
        Return { token, user }
                │
                ▼
        Frontend stores:
        localStorage['pos_auth_token'] = token
        localStorage['pos_auth_user']  = user
```

### Request Authorization Flow

```
Every API request
        │
        ▼
database.js fetchAPI()
        │
        ├─ getAuthToken() from localStorage
        ├─ Inject: Authorization: Bearer <token>
        └─ call fetch()
                │
                ▼
Backend: authenticateToken middleware
        │
        ├─ Extract Bearer token from header
        ├─ jwt.verify(token, JWT_SECRET)
        ├─ Attach decoded payload to req.user
        └─ next()
                │
          (optional)
                ▼
        authorize('admin', 'manager') middleware
        │
        ├─ Check req.user.role in allowed roles
        └─ next() or 403
```

### Role Permissions Matrix

| Feature | admin | manager | cashier |
|---|---|---|---|
| Login | ✅ | ✅ | ✅ |
| Sales (create/view) | ✅ | ✅ | ✅ |
| Inventory (CRUD) | ✅ | ✅ | ✅ |
| Customers (CRUD) | ✅ | ✅ | ✅ |
| Attendance | ✅ | ✅ | ❌ |
| Suppliers | ✅ | ✅ | ❌ |
| Category Mappings | ✅ | ✅ | ❌ |
| User Management | ✅ | limited | ❌ |
| DB Sync Control | ✅ | ❌ | ❌ |
| Admin PIN Override | ✅ | ❌ | ❌ |

---

## 9. MongoDB Sync System

The sync system allows the app to operate with **both a local and remote MongoDB**, syncing data bidirectionally.

### Sync Architecture

```
┌────────────────────────────────────────────────────────┐
│                    syncService.js                      │
│                                                        │
│  State: { activeSource, running, timer, lastRun }      │
│                                                        │
│  Directions:                                           │
│  ├─ 'active-to-standby'  (default, auto-detects)       │
│  ├─ 'local-to-remote'    (explicit)                    │
│  └─ 'remote-to-local'    (explicit)                    │
│                                                        │
│  Algorithm (per collection):                           │
│  ┌──────────────────────────────────────────────────┐  │
│  │  1. Open secondary connection to source & target │  │
│  │  2. cursor.find({}) all source docs              │  │
│  │  3. Batch 200 docs at a time                     │  │
│  │  4. bulkWrite replaceOne+upsert to target        │  │
│  │  5. Track: processed, matched, modified, upserted│  │
│  │  6. Close both connections                       │  │
│  └──────────────────────────────────────────────────┘  │
│                                                        │
│  Background: setInterval(60000ms) — configurable       │
│  Startup: optional immediate sync on server start      │
└────────────────────────────────────────────────────────┘
```

### Sync-Enabled Collections (12 total)

`users`, `employees`, `items`, `sales`, `customers`, `returns`, `shifts`, `attendances`, `suppliers`, `purchaseorders`, `discountrules`, `employeeadvances`

### Sync API Endpoints (admin only)

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/sync/status` | Current sync state |
| `POST` | `/api/sync/run` | Trigger manual sync |
| `POST` | `/api/sync/run` + `direction` | Sync in specific direction |

---

## 10. Data Flow Diagrams

### Sale Processing Flow

```
Cashier scans/selects items
          │
          ▼
      Cart built in index.html
      (discount applied via DiscountRule lookup)
          │
          ▼
      Customer selected (optional)
          │
          ▼
      [Process Sale] button
          │
          ▼
  saveSale() in database.js
          │
          ▼
  POST /api/sales
          │
      Backend sales.js route:
      ├─ Validate sale payload
      ├─ Deduct stockLevel from Item docs
      │    (forEach item → Item.findOne(sku) → update)
      │    (with transaction if replica set supports it)
      ├─ Create Sale document
      └─ Return saved sale
          │
          ▼
  Frontend receives sale._id
          │
          ▼
  Print receipt (IPC: print-receipt)
          │
          ▼
  Clear cart, reset POS terminal
```

### Barcode Flow

```
Admin assigns barcode to item
          │
          ▼
  POST /api/barcode/assign { sku, format }
          │
      Backend barcode.js:
      ├─ format: 'ean13' → generate 13-digit EAN
      ├─ format: 'structured' → encode sku+category+price+date
      ├─ Assign barcode to Item.barcode field
      └─ Render PNG via bwip-js
          │
          ▼
  Cashier scans barcode at POS
          │
          ▼
  Barcode parsed by barcodeParser.js
  ├─ EAN-13 → look up item by barcode field
  └─ Structured → decode price/SKU from barcode digits
```

---

## 11. Security Architecture

### Implemented Security Controls

| Control | Implementation |
|---|---|
| **JWT Auth** | All API routes (except /health, /auth/login, /auth/register) |
| **Password Hashing** | bcrypt with salt rounds = 12 |
| **PIN Hashing** | bcrypt with salt rounds = 12 |
| **Rate Limiting — Auth** | 20 requests per 15 minutes per IP |
| **Rate Limiting — AI** | 10 requests per minute per IP |
| **CORS — Strict** | Only allows: localhost, file://, app://, explicit CORS_ORIGIN list |
| **CSP — Electron** | Injected via `injectCspMeta()` in main.js on every page load |
| **Single Instance** | `app.requestSingleInstanceLock()` prevents duplicate Electron instances |
| **External Links** | Opened in OS browser, never in Electron window (`setWindowOpenHandler`) |
| **Node Integration Disabled** | `nodeIntegration: false` in BrowserWindow |
| **Context Isolation** | `contextIsolation: true` in BrowserWindow |
| **Credential Scrubbing** | `User.toJSON()` removes `password` and `pin` from all API responses |
| **Token Expiry** | Default 12h, configurable via JWT_EXPIRY |
| **Admin-only routes** | DB sync, user management gated by `authorize('admin')` |

### Threat Model Highlights

- **SEC-007** — CORS restricted to explicit origin list; loopback and `file://` always allowed for Electron.
- **Password in DB** — Only bcrypt hash stored; plaintext never persisted.
- **Admin Override** — Requires PIN (bcrypt-hashed), not password, for secondary authorization at point of sale.
- **SQL/NoSQL Injection** — Mongoose schema + regex anchoring on `username` queries prevents injection.

---

## 12. Deployment Architecture

### Production Setup (Render.com)

```
┌────────────────────────────────────────────────────────┐
│                  render.yaml                           │
│  Service: fashion-shaa-pos-api                         │
│  Type: web (Node runtime)                              │
│  Root: backend/                                        │
│  Build: npm install                                    │
│  Start: npm start                                      │
│  Health: GET /api/health                               │
└────────────────────────────────────────────────────────┘
          │
          │  auto-deploy on git push
          ▼
  Render Node.js Container
          │
          ├─ PORT env → Listen on Render-assigned port
          ├─ MONGO_URI → MongoDB Atlas cluster
          ├─ JWT_SECRET → Long random secret
          └─ NODE_ENV=production → Hides stack traces
```

### Electron App Distribution

```
npm run dist (in simple-pos/)
          │
          ▼
  electron-builder packages app:
  ├─ NSIS Installer (.exe setup file)
  └─ Portable (.exe, no install needed)
          │
          ▼
  User installs / runs app
          │
          ▼
  App Settings → Configure API URL
  └─ http://localhost:5000  (local)
     or
     https://xxx.onrender.com (cloud)
```

---

## 13. Environment Configuration

### `backend/.env` Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `5000` | HTTP server port |
| `NODE_ENV` | `development` | Environment flag |
| `MONGO_URI` / `MONGODB_URI` | — | Single explicit MongoDB URI |
| `MONGO_LOCAL_URI` | `mongodb://127.0.0.1:27017/fashion_shaa_pos` | Local MongoDB URI |
| `MONGO_REMOTE_URI` | — | Remote/Atlas MongoDB URI |
| `MONGO_CONNECTION_MODE` | `auto` | `single` / `local` / `remote` / `auto` |
| `MONGO_SYNC_ENABLED` | `false` | Enable background sync |
| `MONGO_SYNC_ON_STARTUP` | `true` | Sync immediately on start |
| `MONGO_SYNC_INTERVAL_MS` | `60000` | Sync interval (milliseconds) |
| `JWT_SECRET` | `(insecure default)` | **MUST change in production** |
| `JWT_EXPIRY` / `JWT_EXPIRES_IN` | `12h` | Token lifetime |
| `CORS_ORIGIN` | — | Comma-separated allowed origins |

> [!CAUTION]
> **NEVER deploy with the default `JWT_SECRET`**. Generate a secure random string (64+ chars) for production.

---

## 14. Local Development Setup

### Prerequisites

- Node.js LTS
- MongoDB (local) OR MongoDB Atlas account
- Git

### Step 1 — Clone & Configure Backend

```bash
cd pos-main/backend
cp .env.example .env
# Edit .env: set MONGO_LOCAL_URI or MONGO_URI
npm install
npm start
# API runs at http://localhost:5000
# Check: GET http://localhost:5000/api/health
```

### Step 2 — Seed First Admin User

```bash
# Create your first admin account via API
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"yourpassword"}'
# First user is auto-promoted to admin role
```

### Step 3 — Run Electron App

```bash
cd pos-main/simple-pos
npm install
npm start
# Tailwind CSS is auto-built via "prestart" script
```

### Step 4 — Build CSS Only

```bash
npm run build-css
```

### Step 5 — Run Tests

```bash
# Backend integration tests
cd backend
npm run test:integration

# Frontend unit tests (Jest)
cd simple-pos
npm run test:unit

# Frontend E2E tests (Playwright)
cd simple-pos
npm run test:e2e
```

### Step 6 — Build Installer

```bash
cd simple-pos
npm run dist
# Output in simple-pos/dist/
```

---

## 15. Testing Strategy

### Backend Tests

| Test Script | Command | Description |
|---|---|---|
| Parser tests | `npm run test:parser` | Unit tests for barcode parser & SKU generator |
| Integration tests | `npm run test:integration` | Full sales workflow against in-memory MongoDB |

The integration tests use `mongodb-memory-server` to spin up a temporary MongoDB instance — no real DB required.

### Frontend Tests

| Test Type | Tool | Command | Description |
|---|---|---|---|
| Unit | Jest + jsdom | `npm run test:unit` | Pure function tests (discount calc, normalization helpers) |
| E2E | Playwright | `npm run test:e2e` | Full browser tests against running Electron app |
| Headed E2E | Playwright | `npm run test:headed` | Same as above but with visible browser window |

### Test Coverage Goals

| Area | Coverage Priority |
|---|---|
| `database.js` helper functions | High |
| Barcode parsing (`barcodeParser.js`) | High |
| SKU generation (`skuGenerator.js`) | Medium |
| Sales route (create + stock deduction) | High |
| Auth route (login, role checks) | High |
| Sync service logic | Medium |

---

## 16. Known Issues & Technical Debt

> [!WARNING]
> These items are known and should be addressed before the next major release.

| # | Area | Issue | Priority |
|---|---|---|---|
| 1 | `database.js` | Some analytics queries fetch all sales client-side and filter locally — inefficient for large datasets. Move filtering to backend query params. | Medium |
| 2 | `getSalesByDateRange` | Client-side date range filter on top of `getAllSales()` makes N+1 pattern on large datasets. | Medium |
| 3 | `Sale` schema | `saleDate` and `saleTime` stored as plain strings, not ISO Date objects. Makes date range queries string-based, not index-range. | Low |
| 4 | Sync | Full collection copy every interval — no delta/incremental sync. For large datasets this is expensive. | Medium |
| 5 | Sessions | JWT is stored in `localStorage`. Consider `sessionStorage` or in-memory for better security. | Low |
| 6 | Auth route | `POST /auth/register` does inline JWT verification inside the route handler — ideally use the shared middleware. | Low |
| 7 | CSS | `output.css` (compiled Tailwind) is committed to git — should be `.gitignore`d and generated at build time. | Low |
| 8 | `app.old.js` | 54KB legacy file present in codebase — should be removed or archived. | Low |

---

## 17. Glossary

| Term | Definition |
|---|---|
| **SKU** | Stock Keeping Unit — unique identifier for each product (format: `ITM-<id>`) |
| **EAN-13** | European Article Number, 13-digit standard barcode format used for retail products |
| **Structured Barcode** | Custom barcode format encoding SKU + category + price + date into barcode digits |
| **JWT** | JSON Web Token — stateless auth token signed with `JWT_SECRET` |
| **IPC** | Inter-Process Communication — messaging between Electron's main and renderer processes |
| **CSP** | Content Security Policy — browser security header controlling allowed resource origins |
| **Sync** | Background MongoDB data replication between local and remote databases |
| **Auto Mode** | MongoDB connection mode that tries remote first, then falls back to local |
| **Admin Override** | Secondary authorization flow using a numeric PIN (separate from login password) |
| **Opening Float** | Cash placed in the register at shift start before any sales |
| **BOGO** | Buy One Get One — a discount rule type |
| **empId** | Employee ID in format `E1`, `E2`, `E3` — links Employee ↔ User ↔ Sale records |
| **POS_API** | Global JavaScript object exposed by `database.js` for all frontend pages to use |
| **Render** | Cloud hosting platform (render.com) where the backend API is deployed |

---

*This document was generated for the Fashion Shaa POS v2.0.0 codebase.*  
*Maintain this document whenever significant architectural changes are made.*
