# Fashion Shaa POS

Fashion Shaa POS is a Windows-focused Electron point-of-sale system with a Node/Mongo backend, sales analytics, CRM features, and local-plus-online MongoDB sync support.

## Client Windows Install
Use this path for a new client PC.

1. Build or collect the Windows installer from [D:\OneDrive\OneDrive - Sri Lanka Institute of Information Technology\Desktop\pos-main - Copy\pos-main\simple-pos\dist](</D:/OneDrive/OneDrive - Sri Lanka Institute of Information Technology/Desktop/pos-main - Copy/pos-main/simple-pos/dist>).
2. Install the app with the generated `Fashion Shaa POS Setup *.exe`.
3. In the installed app folder, run:
   - `Setup-ClientPC.bat`
4. The setup script will:
   - install/start MongoDB Community Server with `winget`
   - write the runtime backend `.env` into `%ProgramData%\FashionShaaPOS\backend\.env`
   - start the packaged backend
   - seed/reset the admin account
   - create a desktop shortcut
5. Launch the app from:
   - `Fashion Shaa POS` desktop shortcut

### Client prerequisites
- Windows 10 or Windows 11
- `winget` available
- MongoDB Atlas remote connection string
- Gemini API key, if AI discount features are needed

## Developer / Source Checkout
Use this path when working from the repo directly.

### Backend
```powershell
cd "D:\OneDrive\OneDrive - Sri Lanka Institute of Information Technology\Desktop\pos-main - Copy\pos-main\backend"
npm install
copy .env.example .env
npm start
```

### Frontend / Electron
```powershell
cd "D:\OneDrive\OneDrive - Sri Lanka Institute of Information Technology\Desktop\pos-main - Copy\pos-main\simple-pos"
npm install
npm start
```

### Convenience launcher
For source checkouts you can also use:
- [D:\OneDrive\OneDrive - Sri Lanka Institute of Information Technology\Desktop\pos-main - Copy\pos-main\simple-pos\FashionShaa-POS.bat](</D:/OneDrive/OneDrive - Sri Lanka Institute of Information Technology/Desktop/pos-main - Copy/pos-main/simple-pos/FashionShaa-POS.bat>)

This path is still intended for development/source folders. The packaged Windows install uses the built app and `Setup-ClientPC.bat` instead of `node server.js`.

## Windows Build
```powershell
cd "D:\OneDrive\OneDrive - Sri Lanka Institute of Information Technology\Desktop\pos-main - Copy\pos-main\simple-pos"
npm install
npm run build-css
npm run dist
```

Outputs are written to:
- [D:\OneDrive\OneDrive - Sri Lanka Institute of Information Technology\Desktop\pos-main - Copy\pos-main\simple-pos\dist](</D:/OneDrive/OneDrive - Sri Lanka Institute of Information Technology/Desktop/pos-main - Copy/pos-main/simple-pos/dist>)

## Runtime Notes
- The packaged desktop app can launch a hidden backend companion process with `--backend`.
- Client runtime config is loaded from:
  - `%ProgramData%\FashionShaaPOS\backend\.env`
- Backend logs are written to:
  - `%ProgramData%\FashionShaaPOS\logs`

## Verification Checklist
- Desktop app launches
- Backend health is reachable at `/api/health`
- Admin login works
- Sale save and receipt print work
- Analytics updates
- Data Sync page shows healthy local/remote targets
