# PLAN - POS Sign-Up Screen Implementation

Implement a clean, elegant, and secure **Sign Up** option on the login card of the **Fashion Shaa POS** system, allowing users to register new accounts.

---

## 🛑 Socratic Gate & Open Questions

> [!IMPORTANT]
> **Please review these key design decisions before proceeding with the implementation:**
>
> 1. **Public Signup Security Gate**: 
>    Currently, the backend API strictly enforces that **only logged-in Admins/Managers can create new users** once the first user (the main Admin) has been created. If a customer or guest tries to register on a machine that already has an admin registered, the API will reject the request with a `401 Unauthorized` code.
>    * **Proposal**: We will keep this security model! If the database is empty (first run), the "Sign Up" option allows registering the first **Admin** user with no authentication. If an Admin already exists, the "Sign Up" screen will prompt for an **Admin PIN / Authorization** at the bottom to authorize the cashier/manager creation.
> 2. **UI Toggle Location**:
>    Should we show a beautiful, subtle link at the bottom of the sign-in card saying `"Don't have an account? Sign Up"` that smoothly transitions the card using CSS animations?
> 3. **Input Fields**:
>    Do we need to request an **Employee ID** and a numeric **Admin Override PIN** (for managers/admins) directly on the sign-up screen?

---

## Project Type
**WEB / DESKTOP (Electron + Node.js Backend)**

---

## Tech Stack
* **Frontend**: HTML5, Vanilla JavaScript, Tailwind CSS v4, Google Material Symbols.
* **Backend**: Node.js, Express, MongoDB (Mongoose), JWT authentication.

---

## File Structure

```plaintext
pos-main/
├── simple-pos/
│   ├── index.html        # [MODIFY] Add Sign Up form fields, toggle button, and smooth transitions
│   └── js/
│       └── main.js       # [MODIFY] Bind toggle events and adjust UI focus on sign-up toggle
```

---

## Success Criteria
1. **Interactive Toggle**: A smooth, elegant toggle between "Sign In" and "Sign Up" states on the login card.
2. **First-Run Autodetect**: The UI automatically detects if this is the first run and changes the title to "Create Admin Account" to guide the user.
3. **Role & Pin Inputs**: The sign-up form reveals the "Role", "Employee ID", and "Admin PIN" fields only in Sign Up mode.
4. **Secure Backend Registration**: Integrates with `/api/auth/register` to register the new user with custom roles and PINs, securely hashed.
5. **No Style Breaking**: Maintain the dark modern corporate glassmorphism aesthetic without introducing any generic placeholders.

---

## Proposed Changes

### Component 1: Frontend Login Interface (`index.html`)

#### [MODIFY] [index.html](file:///d:/OneDrive/OneDrive%20-%20Sri%20Lanka%20Institute%20of%20Information%20Technology/Desktop/pos-main%20-%20Copy/pos-main/simple-pos/index.html)
* **Add Toggle Button**: Introduce a `Don't have an account? Sign Up` link below the Sign In button.
* **Reveal Additional Inputs**: In Sign Up mode, show the `#loginRoleGroup`, an `Employee ID` input field, and an `Admin PIN` input field (with visual explanation).
* **Adapt Login Handler**:
  - Update `handleLogin()` to read and pass `isRegistrationMode`.
  - Toggle `isRegistrationMode` state dynamically when clicking the sign-up link.

---

## Task Breakdown

### Task 1: Setup HTML Structure for Signup Fields
* **Agent**: `frontend-specialist`
* **Skills**: `frontend-design`, `tailwind-patterns`
* **Priority**: P1
* **Dependencies**: None
* **INPUT**: Existing login screen elements in `simple-pos/index.html`
* **OUTPUT**: Integrated signup elements (Role selection dropdown, Employee ID input, PIN input) hidden in Login mode and shown in Register mode.
* **VERIFY**: Open `index.html` in browser and confirm fields are styled correctly.

### Task 2: Implement Javascript State Toggle & Form Handlers
* **Agent**: `frontend-specialist`
* **Skills**: `clean-code`
* **Priority**: P1
* **Dependencies**: Task 1
* **INPUT**: `index.html` inline `<script>` tags
* **OUTPUT**: `isRegistrationMode` toggle functions that swap labels, buttons, and transition inputs cleanly.
* **VERIFY**: Click the "Sign Up" toggle link. Confirm input fields reveal smoothly, and header title changes to "Create Account".

### Task 3: API Integration for User Registration
* **Agent**: `backend-specialist`
* **Skills**: `api-patterns`
* **Priority**: P1
* **Dependencies**: Task 2
* **INPUT**: `simple-pos/database.js`'s `registerUser` function and `index.html`'s `handleLogin` function
* **OUTPUT**: Registration submission payload mapped with username, password, selected role, employee ID, and numeric PIN.
* **VERIFY**: Create a new cashier account, log out, and log in with the new cashier credentials.

---

## Phase X: Verification Checklist

### 1. Build Verification
- [ ] Run `npm run build` in `simple-pos` to verify compilation matches `electron-builder` specs.

### 2. Runtime Verification
- [ ] Launch POS desktop client.
- [ ] Toggle from Sign In to Sign Up screen.
- [ ] Create a cashier account (Username: `cashier2`, Password: `cashierpassword`, Role: `cashier`, PIN: `9999`, Employee ID: `E003`).
- [ ] Sign out of admin and sign in as `cashier2` using `cashierpassword`.
- [ ] Confirm cashier dashboard restrictions are active.

### 3. Rule Compliance
- [ ] No purple or violet color hexes are used.
- [ ] Maintain consistent glassmorphism layout tokens.
