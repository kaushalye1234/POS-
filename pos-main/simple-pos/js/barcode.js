import { state, emit } from './state.js';
import { setQuickAmount } from './calculator.js';
import { addItem } from './cart.js';

let barcodeBuffer = '';
let barcodeTimeout = null;

export function setupBarcodeScanner() {
    document.addEventListener('keypress', (e) => {
        // Only process if no input/textarea is explicitly focused
        // EXCEPT if the scanner hidden input is focused, or body is focused
        const activeTag = document.activeElement.tagName.toLowerCase();
        const activeId = document.activeElement.id;
        
        const isInputField = (activeTag === 'input' && activeId !== 'barcodeScannerInput') || activeTag === 'textarea';

        if (isInputField) return;

        if (e.key === 'Enter') {
            if (barcodeBuffer.length > 0) {
                processBarcode(barcodeBuffer);
                barcodeBuffer = '';
            }
        } else {
            barcodeBuffer += e.key;
            
            // Clear buffer if it's too slow (probably manual typing)
            clearTimeout(barcodeTimeout);
            barcodeTimeout = setTimeout(() => {
                barcodeBuffer = '';
            }, 50); // 50ms threshold between keystrokes
        }
    });
}

async function processBarcode(barcode) {
    barcode = barcode.trim();
    if (!barcode) return;
    
    emit('scanner:scanned', { barcode });

    // Try parsing logic
    if (typeof window.parseBarcode === 'function') {
        const parsed = window.parseBarcode(barcode);
        
        if (parsed.isValid && parsed.price) {
            // Price embedded barcode
            emit('scanner:price_embedded', { parsed });
            
            // Auto add item with derived price
            try {
                // Find name from SKU if possible
                let itemName = 'Weight Item';
                if (parsed.sku && typeof window.getInventoryItem === 'function') {
                    const item = await window.getInventoryItem(parsed.sku);
                    if (item) itemName = item.name;
                }
                
                setQuickAmount(parsed.price);
                addItem(false, itemName, 'Weight/Price', true, {
                    priceFromBarcode: true,
                    entryMode: 'manual'
                }); // Skip popup
            } catch (err) {
                console.error(err);
                setQuickAmount(parsed.price);
                addItem(false, 'Scanned Item', 'Other', true, {
                    priceFromBarcode: true,
                    entryMode: 'manual'
                });
            }
            return;
        }
    }

    // Regular DB lookup
    if (typeof window.fetchAPI === 'function') {
        try {
            const items = await window.fetchAPI('/items');
            const foundItem = items.find(i => String(i.barcode) === barcode || String(i.sku) === barcode);
            
            if (foundItem) {
                setQuickAmount(foundItem.price);
                addItem(true, foundItem.name, foundItem.category, true, {
                    sku: foundItem.sku,
                    entryMode: 'inventory'
                });
            } else {
                emit('scanner:not_found', { barcode });
            }
        } catch (err) {
            console.error('Failed to lookup barcode', err);
            emit('scanner:error', { error: err });
        }
    }
}
