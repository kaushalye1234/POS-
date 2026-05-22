# Fashion Shaa POS Deployment Guide

This project now targets a hosted backend on Render plus Electron desktop clients that connect to that API over HTTPS.

## 1. Backend Environment
Create `backend/.env` from `backend/.env.example` for local development, or add the same values in Render:

```env
PORT=5000
NODE_ENV=production
MONGO_URI=mongodb+srv://<user>:<password>@<cluster>/<db>
JWT_SECRET=replace_with_a_long_random_secret
JWT_EXPIRY=12h
CORS_ORIGIN=https://your-admin-site.example.com
```

Notes:
- `MONGO_URI` is the primary database variable. `MONGODB_URI` is also accepted for compatibility.
- `JWT_EXPIRY` is the primary token expiry variable. `JWT_EXPIRES_IN` is also accepted.
- `CORS_ORIGIN` is optional and accepts a comma-separated list of browser origins. Electron/file origins are allowed automatically.

## 2. Render Deployment
The repo includes [`render.yaml`](D:/OneDrive/OneDrive%20-%20Sri%20Lanka%20Institute%20of%20Information%20Technology/Desktop/pos-main%20-%20Copy/pos-main/render.yaml) for a Render Blueprint deployment.

Render service settings:
- Root directory: `backend`
- Build command: `npm install`
- Start command: `npm start`
- Health check path: `/api/health`

Important behavior:
- The API connects to MongoDB before it starts listening.
- If MongoDB is missing or unreachable, startup exits non-zero.
- `/api/health` returns `503` until MongoDB is ready.

## 3. Electron Client Setup
In the desktop app Settings page, set the API origin to one of:

- Local development: `http://localhost:5000`
- Render-hosted backend: `https://<your-service>.onrender.com`

Rules:
- `http://` is only accepted for `localhost` / `127.0.0.1`
- Hosted backends must use `https://`

The Settings “Test” button now checks `/api/health`, so it verifies connectivity without requiring a logged-in session.

## 4. Local Development
Backend:

```bash
cd backend
npm install
npm start
```

Electron app:

```bash
cd simple-pos
npm install
npm start
```

## 5. Verification Checklist
- Backend starts with `npm start`
- `/api/health` returns `200` when MongoDB is connected
- Electron Settings accepts the Render HTTPS origin
- Login, admin override, and normal authenticated API flows still work
