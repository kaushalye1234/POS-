# Fashion Shaa POS Deployment Guide

This project supports two deployment styles:

1. **Developer / source checkout**
2. **Client Windows installer with local + online Mongo sync**

## 1. Client Windows Installer Flow

### Build the installer
```powershell
cd "D:\OneDrive\OneDrive - Sri Lanka Institute of Information Technology\Desktop\pos-main - Copy\pos-main\simple-pos"
npm install
npm run build-css
npm run dist
```

The installer artifacts are created in:
- [D:\OneDrive\OneDrive - Sri Lanka Institute of Information Technology\Desktop\pos-main - Copy\pos-main\simple-pos\dist](</D:/OneDrive/OneDrive - Sri Lanka Institute of Information Technology/Desktop/pos-main - Copy/pos-main/simple-pos/dist>)

### Install on the client PC
1. Run the generated NSIS installer.
2. In the installed folder, run:
   - `Setup-ClientPC.bat`
3. Provide these values when prompted:
   - MongoDB Atlas URI
   - Gemini API key
   - JWT secret
   - admin username
   - admin password

### What the setup script does
- installs MongoDB Community Server with `winget` if needed
- starts and verifies the `MongoDB` Windows service
- writes runtime backend config to:
  - `%ProgramData%\FashionShaaPOS\backend\.env`
- starts the packaged backend with the desktop EXE in `--backend` mode
- verifies:
  - `http://127.0.0.1:5000/api/health`
- seeds or resets the admin account
- recreates the desktop shortcut

### Client runtime defaults
The client setup writes these backend defaults:

```env
PORT=5000
NODE_ENV=production
MONGO_CONNECTION_MODE=auto
MONGO_LOCAL_URI=mongodb://127.0.0.1:27017/fashion_shaa_pos
MONGO_REMOTE_URI=<atlas uri>
MONGO_URI=
MONGO_SYNC_ENABLED=true
MONGO_SYNC_ON_STARTUP=true
MONGO_SYNC_INTERVAL_MS=60000
BUSINESS_TIME_ZONE=Asia/Colombo
JWT_EXPIRY=12h
```

### Client verification checklist
- Desktop app opens from the shortcut
- `/api/health` returns `200`
- login works with the seeded admin account
- a sale can be completed
- analytics update
- note/annotation save works from dashboard pages
- Data Sync shows local and remote configured

## 2. Developer / Source Checkout

### Backend
```powershell
cd "D:\OneDrive\OneDrive - Sri Lanka Institute of Information Technology\Desktop\pos-main - Copy\pos-main\backend"
npm install
copy .env.example .env
npm start
```

### Electron app
```powershell
cd "D:\OneDrive\OneDrive - Sri Lanka Institute of Information Technology\Desktop\pos-main - Copy\pos-main\simple-pos"
npm install
npm start
```

For source checkouts, the existing launcher still works:
- [D:\OneDrive\OneDrive - Sri Lanka Institute of Information Technology\Desktop\pos-main - Copy\pos-main\simple-pos\FashionShaa-POS.bat](</D:/OneDrive/OneDrive - Sri Lanka Institute of Information Technology/Desktop/pos-main - Copy/pos-main/simple-pos/FashionShaa-POS.bat>)

## 3. Runtime Configuration Behavior

### Backend config resolution
Backend runtime config now prefers the writable client machine path first:

1. `%ProgramData%\FashionShaaPOS\backend\.env`
2. local repo `backend\.env` for source/development

### Backend logs
Packaged backend logs are written to:
- `%ProgramData%\FashionShaaPOS\logs`

### Desktop EXE modes
The packaged EXE supports:
- normal launch: opens the POS window
- `--backend`: runs the hidden backend service only
- `--bootstrap-admin`: seeds or resets the admin account

## 4. Hosted / Remote Backend Notes
The app still supports hosted or remote APIs through the Settings page, but this client deployment path is optimized for:
- local MongoDB
- Atlas MongoDB
- `auto` connection mode
- enabled sync

The Settings page can still test or override API origin if needed.
