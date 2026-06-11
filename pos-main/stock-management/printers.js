// printers.js - Improved with Printer Detection + Better Label Handling
document.addEventListener('DOMContentLoaded', async () => {
    const printerSelect = document.getElementById('printerSelect');
    const labelWidthInput = document.getElementById('labelWidth');
    const labelHeightInput = document.getElementById('labelHeight');
    const printOrientationInput = document.getElementById('printOrientation');
    const contentRotationInput = document.getElementById('contentRotation');
    const saveBtn = document.getElementById('saveSettingsBtn');
    const testBtn = document.getElementById('testPrintBtn');
    const simulatedSticker = document.getElementById('simulatedSticker');

    const STORAGE_KEY = 'fashion_shaa_printer_settings';

    const defaults = {
        printerName: '',
        labelWidth: 50,
        labelHeight: 25,
        printOrientation: 'portrait',
        contentRotation: '0',
        marginTop: 1,
        marginBottom: 1,
        marginLeft: 1,
        marginRight: 1,
        fontSize: 8,
        padding: 4
    };

    function loadSettings() {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            return stored ? { ...defaults, ...JSON.parse(stored) } : defaults;
        } catch {
            return defaults;
        }
    }

    function saveSettings(settings) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    }

    const currentSettings = loadSettings();
    populateForm(currentSettings);
    await loadSystemPrinters(currentSettings.printerName);

    // Populate Form
    function populateForm(settings) {
        labelWidthInput.value = settings.labelWidth;
        labelHeightInput.value = settings.labelHeight;
        if (printOrientationInput) printOrientationInput.value = settings.printOrientation;
        if (contentRotationInput) contentRotationInput.value = settings.contentRotation;
        document.getElementById('marginTop').value = settings.marginTop;
        document.getElementById('marginBottom').value = settings.marginBottom;
        document.getElementById('marginLeft').value = settings.marginLeft;
        document.getElementById('marginRight').value = settings.marginRight;
        document.getElementById('stickerFontSize').value = settings.fontSize;
        document.getElementById('stickerPadding').value = settings.padding;
    }

    // Load Real Printers from Electron
    async function loadSystemPrinters(selectedName) {
        if (window.electronAPI?.getPrinters) {
            try {
                const printers = await window.electronAPI.getPrinters();
                printerSelect.innerHTML = '<option value="">Default OS Printer</option>';

                printers.forEach(p => {
                    const opt = document.createElement('option');
                    opt.value = p.name;
                    opt.textContent = p.name + (p.isDefault ? ' (Default)' : '');
                    if (p.name === selectedName) opt.selected = true;
                    printerSelect.appendChild(opt);
                });
            } catch (err) {
                console.error('Failed to load printers:', err);
            }
        } else {
            printerSelect.innerHTML = `<option value="">Default OS Printer (Browser Mode)</option>`;
        }
    }

    // Live Simulator Update
    function updateSimulator() {
        const width = parseFloat(labelWidthInput.value) || 50;
        const height = parseFloat(labelHeightInput.value) || 25;
        const scale = 5; // mm to px for preview

        simulatedSticker.style.width = `${width * scale}px`;
        simulatedSticker.style.height = `${height * scale}px`;
        simulatedSticker.style.transform = contentRotationInput?.value !== '0'
            ? `rotate(${contentRotationInput.value}deg)` : '';
    }

    // Bind live updates
    [labelWidthInput, labelHeightInput, printOrientationInput, contentRotationInput].forEach(el => {
        if (el) el.addEventListener('input', updateSimulator);
    });
    updateSimulator();

    function readNumber(elementId, fallback) {
        const value = parseFloat(document.getElementById(elementId)?.value);
        return Number.isFinite(value) ? value : fallback;
    }

    function getSettingsFromForm() {
        return {
            printerName: printerSelect.value,
            labelWidth: parseFloat(labelWidthInput.value) || 50,
            labelHeight: parseFloat(labelHeightInput.value) || 25,
            printOrientation: printOrientationInput?.value || 'portrait',
            contentRotation: contentRotationInput?.value || '0',
            marginTop: readNumber('marginTop', 1),
            marginBottom: readNumber('marginBottom', 1),
            marginLeft: readNumber('marginLeft', 1),
            marginRight: readNumber('marginRight', 1),
            fontSize: readNumber('stickerFontSize', 8),
            padding: readNumber('stickerPadding', 4)
        };
    }

    function mmToMicrons(mm) {
        return Math.max(353, Math.round(Number(mm || 0) * 1000));
    }

    function buildPrintOptions(settings) {
        return {
            printerName: settings.printerName || '',
            landscape: settings.printOrientation === 'landscape',
            pageSize: {
                width: mmToMicrons(settings.labelWidth),
                height: mmToMicrons(settings.labelHeight)
            },
            margins: {
                marginType: 'none'
            },
            scaleFactor: 100
        };
    }

    function printHtml(html, options) {
        if (window.electronAPI?.printReceipt) {
            window.electronAPI.printReceipt(html, options);
            return;
        }

        const printWindow = window.open('', '_blank', 'width=420,height=640');
        printWindow.document.write(html);
        printWindow.document.close();
        printWindow.focus();
        printWindow.print();
    }

    // Save Settings
    saveBtn.addEventListener('click', () => {
        const settings = getSettingsFromForm();
        saveSettings(settings);
        alert('✅ Printer settings saved!');
    });

    // Test Print - uses the same page-size path as real barcode labels.
    testBtn.addEventListener('click', async () => {
        try {
            const settings = getSettingsFromForm();
            const labelHtml = generateProfessionalLabelHTML(settings);

            printHtml(labelHtml, buildPrintOptions(settings));
            alert(`✅ Test print sent at ${settings.labelWidth}mm x ${settings.labelHeight}mm.`);
        } catch (err) {
            alert("Error: " + err.message);
        }
    });

    function generateProfessionalLabelHTML(settings) {
        const width = settings.labelWidth;
        const height = settings.labelHeight;
        const fontSize = settings.fontSize;
        const rot = settings.contentRotation || '0';
        const rotationCss = rot !== '0' ? `
                transform: rotate(${rot}deg);
                transform-origin: center;
            ` : '';

        return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>
            @page {
                size: ${width}mm ${height}mm;
                margin: 0mm;
            }
            html,
            body {
                width: ${width}mm;
                height: ${height}mm;
                margin: 0;
                padding: 0;
                overflow: hidden;
                background: white;
            }
            body {
                font-family: 'Courier New', Courier, monospace;
                font-size: ${fontSize}pt;
                text-align: center;
                color: black;
            }
            .label {
                width: ${width}mm;
                height: ${height}mm;
                padding: calc(${settings.marginTop}mm + ${settings.padding}px) calc(${settings.marginRight}mm + ${settings.padding}px) calc(${settings.marginBottom}mm + ${settings.padding}px) calc(${settings.marginLeft}mm + ${settings.padding}px);
                box-sizing: border-box;
                display: flex;
                flex-direction: column;
                justify-content: space-between;
                align-items: center;
                ${rotationCss}
            }
            .title { font-weight: bold; font-size: ${fontSize + 2}pt; }
            .name { font-size: ${fontSize - 1}pt; line-height: 1.05; }
            .barcode {
                display: flex;
                align-items: flex-end;
                justify-content: center;
                gap: 1px;
                width: 100%;
                height: 9mm;
                overflow: hidden;
            }
            .barcode span { display: block; background: #000; }
            .code { font-size: ${Math.max(6, fontSize - 1)}pt; letter-spacing: 1px; }
            .price { font-weight: bold; font-size: ${fontSize + 1}pt; }
            .size { font-size: ${Math.max(6, fontSize - 2)}pt; }
        </style>
    </head>
    <body>
        <div class="label">
            <div class="title">FASHION SHAA</div>
            <div class="name">TEST STICKER LABEL</div>
            <div class="barcode" aria-label="sample barcode">
                <span style="width:2px;height:100%"></span>
                <span style="width:1px;height:80%"></span>
                <span style="width:3px;height:100%"></span>
                <span style="width:1px;height:75%"></span>
                <span style="width:2px;height:100%"></span>
                <span style="width:1px;height:80%"></span>
                <span style="width:4px;height:100%"></span>
                <span style="width:2px;height:90%"></span>
                <span style="width:1px;height:100%"></span>
                <span style="width:3px;height:80%"></span>
                <span style="width:1px;height:100%"></span>
                <span style="width:2px;height:90%"></span>
            </div>
            <div class="code">123456789012</div>
            <div class="price">Rs. 1,250.00</div>
            <div class="size">${width}mm x ${height}mm</div>
        </div>
    </body>
    </html>`;
    }
});
