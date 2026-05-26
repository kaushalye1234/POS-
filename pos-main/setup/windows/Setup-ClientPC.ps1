param(
    [string]$InstallDir = '',
    [string]$RemoteMongoUri = '',
    [string]$GeminiApiKey = '',
    [string]$JwtSecret = '',
    [string]$AdminUsername = '',
    [string]$AdminPassword = '',
    [switch]$InstallMongoShell
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

function Write-Step([string]$Message) {
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Test-IsAdministrator {
    $currentIdentity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [Security.Principal.WindowsPrincipal]::new($currentIdentity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Build-ElevationArguments {
    $args = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$PSCommandPath`"")

    if ($InstallDir) { $args += @('-InstallDir', "`"$InstallDir`"") }
    if ($RemoteMongoUri) { $args += @('-RemoteMongoUri', "`"$RemoteMongoUri`"") }
    if ($GeminiApiKey) { $args += @('-GeminiApiKey', "`"$GeminiApiKey`"") }
    if ($JwtSecret) { $args += @('-JwtSecret', "`"$JwtSecret`"") }
    if ($AdminUsername) { $args += @('-AdminUsername', "`"$AdminUsername`"") }
    if ($AdminPassword) { $args += @('-AdminPassword', "`"$AdminPassword`"") }
    if ($InstallMongoShell.IsPresent) { $args += '-InstallMongoShell' }

    return $args
}

function Ensure-Elevated {
    if (Test-IsAdministrator) {
        return
    }

    Write-Step 'Requesting administrator rights for MongoDB service setup and ProgramData configuration'
    Start-Process -FilePath 'powershell.exe' -Verb RunAs -ArgumentList (Build-ElevationArguments()) | Out-Null
    exit
}

function Test-WingetAvailable {
    return [bool](Get-Command winget -ErrorAction SilentlyContinue)
}

function Get-ExecutableCandidate([string]$BaseDirectory) {
    if (-not $BaseDirectory -or -not (Test-Path $BaseDirectory)) {
        return $null
    }

    $preferred = Join-Path $BaseDirectory 'Fashion Shaa POS.exe'
    if (Test-Path $preferred) {
        return (Resolve-Path $preferred).Path
    }

    $fallback = Get-ChildItem -Path $BaseDirectory -Filter '*.exe' -File -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -notlike 'Uninstall*' } |
        Sort-Object Name |
        Select-Object -First 1

    if ($fallback) {
        return $fallback.FullName
    }

    return $null
}

function Get-InstalledExePath {
    if ($InstallDir) {
        $fromInstallDir = Get-ExecutableCandidate -BaseDirectory $InstallDir
        if ($fromInstallDir) { return $fromInstallDir }
    }

    $fromScriptDir = Get-ExecutableCandidate -BaseDirectory $PSScriptRoot
    if ($fromScriptDir) { return $fromScriptDir }

    $registryPaths = @(
        'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*',
        'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*'
    )

    foreach ($registryPath in $registryPaths) {
        $match = Get-ItemProperty -Path $registryPath -ErrorAction SilentlyContinue |
            Where-Object { $_.DisplayName -eq 'Fashion Shaa POS' -and $_.InstallLocation } |
            Select-Object -First 1

        if ($match) {
            $fromRegistry = Get-ExecutableCandidate -BaseDirectory $match.InstallLocation
            if ($fromRegistry) { return $fromRegistry }
        }
    }

    $commonCandidates = @(
        (Join-Path ${env:ProgramFiles} 'Fashion Shaa POS'),
        (Join-Path ${env:ProgramFiles(x86)} 'Fashion Shaa POS')
    )

    foreach ($candidate in $commonCandidates) {
        $resolved = Get-ExecutableCandidate -BaseDirectory $candidate
        if ($resolved) { return $resolved }
    }

    throw 'Could not locate "Fashion Shaa POS.exe". Install the Windows app first or pass -InstallDir.'
}

function Prompt-RequiredValue([string]$Label, [string]$CurrentValue, [switch]$AsSecureString) {
    if ($CurrentValue) {
        return $CurrentValue
    }

    if ($AsSecureString) {
        $secure = Read-Host -Prompt $Label -AsSecureString
        $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
        try {
            return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
        } finally {
            [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
        }
    }

    return (Read-Host -Prompt $Label).Trim()
}

function Ensure-Directory([string]$DirectoryPath) {
    New-Item -Path $DirectoryPath -ItemType Directory -Force | Out-Null
}

function Set-OrAppendEnvValue([string]$Content, [string]$Key, [string]$Value) {
    $escapedKey = [regex]::Escape($Key)
    $line = "$Key=$Value"

    if ($Content -match "(?m)^$escapedKey=.*$") {
        return [regex]::Replace($Content, "(?m)^$escapedKey=.*$", $line)
    }

    $suffix = if ($Content.EndsWith("`r`n") -or $Content.EndsWith("`n")) { '' } else { "`r`n" }
    return "$Content$suffix$line`r`n"
}

function Write-RuntimeEnvFile {
    param(
        [string]$TemplatePath,
        [string]$DestinationPath,
        [hashtable]$Values
    )

    $content = if (Test-Path $TemplatePath) {
        Get-Content -Path $TemplatePath -Raw
    } else {
        @"
# Fashion Shaa POS generated runtime configuration
"@
    }

    foreach ($entry in $Values.GetEnumerator()) {
        $content = Set-OrAppendEnvValue -Content $content -Key $entry.Key -Value $entry.Value
    }

    [System.IO.File]::WriteAllText($DestinationPath, $content, [System.Text.Encoding]::UTF8)
}

function Get-MongoService {
    return Get-Service -Name 'MongoDB' -ErrorAction SilentlyContinue
}

function Ensure-MongoDbInstalled {
    $service = Get-MongoService
    if ($service) {
        return $service
    }

    if (-not (Test-WingetAvailable)) {
        throw 'winget is required to install MongoDB automatically on this client PC.'
    }

    Write-Step 'Installing MongoDB Community Server'
    winget install --id MongoDB.Server --source winget --accept-package-agreements --accept-source-agreements --silent
    Start-Sleep -Seconds 5

    $service = Get-MongoService
    if (-not $service) {
        throw 'MongoDB service was not found after installation.'
    }

    return $service
}

function Ensure-MongoDbRunning {
    $service = Ensure-MongoDbInstalled

    if ($service.Status -ne 'Running') {
        Write-Step 'Starting MongoDB Windows service'
        Start-Service -Name 'MongoDB'
        $service.WaitForStatus('Running', '00:00:20')
    }

    $mongoReachable = Test-NetConnection 127.0.0.1 -Port 27017 -WarningAction SilentlyContinue
    if (-not $mongoReachable.TcpTestSucceeded) {
        throw 'MongoDB is installed but not reachable on 127.0.0.1:27017.'
    }

    return $service
}

function Ensure-MongoShellInstalled {
    if (-not $InstallMongoShell.IsPresent) {
        return
    }

    if (-not (Test-WingetAvailable)) {
        throw 'winget is required to install MongoDB Shell automatically.'
    }

    Write-Step 'Installing MongoDB Shell'
    winget install --id MongoDB.Shell --source winget --accept-package-agreements --accept-source-agreements --silent
}

function Stop-ExistingBackendProcesses([string]$AppExePath) {
    $exeName = [System.IO.Path]::GetFileName($AppExePath)
    $backendProcesses = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
        Where-Object {
            $_.Name -eq $exeName -and
            $_.ExecutablePath -eq $AppExePath -and
            $_.CommandLine -like '*--backend*'
        }

    foreach ($processInfo in $backendProcesses) {
        Write-Step "Stopping existing backend process $($processInfo.ProcessId)"
        Stop-Process -Id $processInfo.ProcessId -Force -ErrorAction SilentlyContinue
    }
}

function Start-PackagedBackend([string]$AppExePath) {
    Write-Step 'Starting packaged backend service'
    Start-Process -FilePath $AppExePath -ArgumentList '--backend' -WindowStyle Hidden | Out-Null
}

function Wait-ForBackendHealth([int]$TimeoutSeconds = 60) {
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)

    do {
        try {
            $response = Invoke-RestMethod -Uri 'http://127.0.0.1:5000/api/health' -Method Get -TimeoutSec 5
            if ($response.status -eq 'ok') {
                return $response
            }
        } catch {
            Start-Sleep -Seconds 2
            continue
        }

        Start-Sleep -Seconds 2
    } while ((Get-Date) -lt $deadline)

    throw 'Backend health check did not become ready on http://127.0.0.1:5000/api/health.'
}

function Invoke-AdminBootstrap {
    param(
        [string]$AppExePath,
        [string]$Username,
        [string]$Password
    )

    Write-Step 'Seeding or resetting the client admin account'
    $resultFile = Join-Path $env:TEMP ("fashion-shaa-bootstrap-" + [guid]::NewGuid().ToString('N') + '.json')
    $output = & $AppExePath --bootstrap-admin --admin-username $Username --admin-password $Password --result-file $resultFile 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "Admin bootstrap failed: $output"
    }

    if (-not (Test-Path $resultFile)) {
        throw "Admin bootstrap finished without writing a result file: $output"
    }

    try {
        return (Get-Content -Path $resultFile -Raw | ConvertFrom-Json)
    } finally {
        Remove-Item -Path $resultFile -Force -ErrorAction SilentlyContinue
    }
}

function Test-AdminLogin {
    param(
        [string]$Username,
        [string]$Password
    )

    $body = @{
        username = $Username
        password = $Password
    } | ConvertTo-Json

    return Invoke-RestMethod -Uri 'http://127.0.0.1:5000/api/auth/login' -Method Post -ContentType 'application/json' -Body $body -TimeoutSec 10
}

function Ensure-DesktopShortcut([string]$AppExePath) {
    $desktopDir = [Environment]::GetFolderPath('Desktop')
    $shortcutPath = Join-Path $desktopDir 'Fashion Shaa POS.lnk'
    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut($shortcutPath)
    $shortcut.TargetPath = $AppExePath
    $shortcut.WorkingDirectory = Split-Path $AppExePath -Parent
    $shortcut.Description = 'Fashion Shaa Point of Sale System'
    $shortcut.IconLocation = "$AppExePath,0"
    $shortcut.Save()
}

Ensure-Elevated

Write-Step 'Locating the installed Fashion Shaa POS application'
$appExePath = Get-InstalledExePath
$installDirectory = Split-Path $appExePath -Parent

Write-Step 'Collecting client setup values'
$RemoteMongoUri = Prompt-RequiredValue -Label 'MongoDB Atlas connection string (MONGO_REMOTE_URI)' -CurrentValue $RemoteMongoUri
$GeminiApiKey = Prompt-RequiredValue -Label 'Gemini API key' -CurrentValue $GeminiApiKey
$JwtSecret = Prompt-RequiredValue -Label 'JWT secret' -CurrentValue $JwtSecret
$AdminUsername = Prompt-RequiredValue -Label 'Admin username' -CurrentValue $AdminUsername
$AdminPassword = Prompt-RequiredValue -Label 'Admin password' -CurrentValue $AdminPassword -AsSecureString

Write-Step 'Preparing runtime configuration directories'
$runtimeRoot = Join-Path $env:ProgramData 'FashionShaaPOS'
$runtimeBackendDir = Join-Path $runtimeRoot 'backend'
$runtimeLogDir = Join-Path $runtimeRoot 'logs'
Ensure-Directory -DirectoryPath $runtimeBackendDir
Ensure-Directory -DirectoryPath $runtimeLogDir

$templatePath = Join-Path $installDirectory 'resources\templates\backend.env.example'
$runtimeEnvPath = Join-Path $runtimeBackendDir '.env'

Write-Step 'Writing backend runtime .env'
Write-RuntimeEnvFile -TemplatePath $templatePath -DestinationPath $runtimeEnvPath -Values @{
    PORT = '5000'
    NODE_ENV = 'production'
    MONGO_CONNECTION_MODE = 'auto'
    MONGO_LOCAL_URI = 'mongodb://127.0.0.1:27017/fashion_shaa_pos'
    MONGO_REMOTE_URI = $RemoteMongoUri
    MONGO_URI = ''
    MONGO_SYNC_ENABLED = 'true'
    MONGO_SYNC_ON_STARTUP = 'true'
    MONGO_SYNC_INTERVAL_MS = '60000'
    BUSINESS_TIME_ZONE = 'Asia/Colombo'
    CORS_ORIGIN = ''
    GEMINI_API_KEY = $GeminiApiKey
    JWT_SECRET = $JwtSecret
    JWT_EXPIRY = '12h'
}

Ensure-MongoDbRunning | Out-Null
Ensure-MongoShellInstalled
Stop-ExistingBackendProcesses -AppExePath $appExePath
Start-PackagedBackend -AppExePath $appExePath
$health = Wait-ForBackendHealth
$bootstrapSummary = Invoke-AdminBootstrap -AppExePath $appExePath -Username $AdminUsername -Password $AdminPassword
$login = Test-AdminLogin -Username $AdminUsername -Password $AdminPassword
Ensure-DesktopShortcut -AppExePath $appExePath

Write-Step 'Client setup complete'
Write-Host "Installed EXE: $appExePath" -ForegroundColor Green
Write-Host "Runtime env: $runtimeEnvPath" -ForegroundColor Green
Write-Host "Backend health: $($health.status)" -ForegroundColor Green
Write-Host "Active database source: $($health.database.activeSource)" -ForegroundColor Green
Write-Host "Mongo local target: $($health.sync.configuredTargets.local)" -ForegroundColor Green
Write-Host "Mongo remote target: $($health.sync.configuredTargets.remote)" -ForegroundColor Green
Write-Host "Sync enabled: $($health.sync.enabled)" -ForegroundColor Green
Write-Host "Sync active source: $($health.sync.activeSource)" -ForegroundColor Green
Write-Host "Admin username: $($bootstrapSummary.username)" -ForegroundColor Green
Write-Host "Admin login verified: $([bool]$login.token)" -ForegroundColor Green
