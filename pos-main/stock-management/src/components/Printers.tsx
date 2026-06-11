import { FormEvent, PointerEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Printer, RefreshCw, Save } from 'lucide-react';
import type { LabelElementKey, LabelElementLayout, LabelPresetKey, PrinterInfo, PrinterSettings } from '../types';
import {
  DEFAULT_PRINTER_SETTINGS,
  LABEL_ELEMENT_KEYS,
  LABEL_ELEMENT_LABELS,
  LABEL_PRESET_LABELS,
  buildLabelHtml,
  clamp,
  clampLabelElement,
  createLabelLayoutPreset,
  getErrorMessage,
  loadPrinterSettings,
  makeTestLabelData,
  normalizePrinterSettings,
  savePrinterSettings
} from '../utils';
import { Button, Field, SelectInput, TextInput } from './Ui';

const TEXT_ELEMENTS: LabelElementKey[] = ['brand', 'name', 'category', 'size', 'customText', 'sku', 'price'];

export function Printers(): JSX.Element {
  const [settings, setSettings] = useState<PrinterSettings>(() => loadPrinterSettings());
  const [printers, setPrinters] = useState<PrinterInfo[]>([]);
  const [selectedElement, setSelectedElement] = useState<LabelElementKey>('barcode');
  const [dragState, setDragState] = useState<{ key: LabelElementKey; offsetXMm: number; offsetYMm: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const previewRef = useRef<HTMLDivElement | null>(null);

  const normalizedSettings = useMemo(() => normalizePrinterSettings(settings), [settings]);
  const previewData = useMemo(() => makeTestLabelData(normalizedSettings), [normalizedSettings]);
  const selectedLayout = normalizedSettings.labelLayout.elements[selectedElement];

  async function loadPrinters(): Promise<void> {
    setLoading(true);
    setError('');
    try {
      const data = window.electronAPI?.getPrinters ? await window.electronAPI.getPrinters() : [];
      setPrinters(data);
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPrinters();
  }, []);

  function updateSettings(updater: (current: PrinterSettings) => PrinterSettings): void {
    setSettings((current) => normalizePrinterSettings(updater(current)));
  }

  function updateSetting<K extends keyof PrinterSettings>(key: K, value: PrinterSettings[K]): void {
    updateSettings((current) => ({ ...current, [key]: value }));
  }

  function updateLayoutElement(key: LabelElementKey, updates: Partial<LabelElementLayout>): void {
    updateSettings((current) => {
      const next = normalizePrinterSettings(current);
      const printableWidth = Math.max(1, next.labelWidth - next.marginLeft - next.marginRight);
      const printableHeight = Math.max(1, next.labelHeight - next.marginTop - next.marginBottom);
      return {
        ...next,
        labelLayout: {
          ...next.labelLayout,
          elements: {
            ...next.labelLayout.elements,
            [key]: clampLabelElement({ ...next.labelLayout.elements[key], ...updates }, printableWidth, printableHeight)
          }
        }
      };
    });
  }

  function applyPreset(preset: LabelPresetKey): void {
    updateSettings((current) => ({
      ...current,
      labelLayout: createLabelLayoutPreset(preset, current.labelWidth, current.labelHeight)
    }));
  }

  function handleSave(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    savePrinterSettings(normalizedSettings);
    setMessage('Printer and label layout settings saved.');
  }

  function handleReset(): void {
    setSettings(DEFAULT_PRINTER_SETTINGS);
    savePrinterSettings(DEFAULT_PRINTER_SETTINGS);
    setSelectedElement('barcode');
    setMessage('Printer settings and label layout reset.');
  }

  function handleTestPrint(): void {
    setError('');
    setMessage('');
    try {
      savePrinterSettings(normalizedSettings);
      const html = buildLabelHtml(normalizedSettings, previewData);
      if (window.electronAPI?.printReceipt) {
        window.electronAPI.printReceipt(html, {
          printerName: normalizedSettings.printerName,
          landscape: normalizedSettings.printOrientation === 'landscape',
          preferCSSPageSize: true,
          margins: { marginType: 'none' },
          pageSize: {
            width: Math.round(normalizedSettings.labelWidth * 1000),
            height: Math.round(normalizedSettings.labelHeight * 1000)
          }
        });
        setMessage('Current layout saved and test label sent to printer.');
      } else {
        const printWindow = window.open('', '_blank', 'width=420,height=640');
        if (!printWindow) throw new Error('Print window could not be opened.');
        printWindow.document.write(html);
        printWindow.document.close();
        printWindow.print();
        setMessage('Current layout saved and test label opened.');
      }
    } catch (printError) {
      setError(getErrorMessage(printError));
    }
  }

  function pointerToMm(event: PointerEvent<HTMLDivElement>): { xMm: number; yMm: number } | null {
    const rect = previewRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return {
      xMm: ((event.clientX - rect.left) / rect.width) * normalizedSettings.labelWidth,
      yMm: ((event.clientY - rect.top) / rect.height) * normalizedSettings.labelHeight
    };
  }

  function handleElementPointerDown(event: PointerEvent<HTMLDivElement>, key: LabelElementKey): void {
    event.preventDefault();
    const point = pointerToMm(event);
    if (!point) return;
    const element = normalizedSettings.labelLayout.elements[key];
    setSelectedElement(key);
    setDragState({
      key,
      offsetXMm: point.xMm - element.xMm,
      offsetYMm: point.yMm - element.yMm
    });
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePreviewPointerMove(event: PointerEvent<HTMLDivElement>): void {
    if (!dragState) return;
    const point = pointerToMm(event);
    if (!point) return;
    const element = normalizedSettings.labelLayout.elements[dragState.key];
    updateLayoutElement(dragState.key, {
      xMm: clamp(point.xMm - dragState.offsetXMm, 0, normalizedSettings.labelWidth - element.widthMm),
      yMm: clamp(point.yMm - dragState.offsetYMm, 0, normalizedSettings.labelHeight - element.heightMm)
    });
  }

  function handlePreviewPointerUp(): void {
    setDragState(null);
  }

  return (
    <section className="view-stack">
      <div className="action-band">
        <div>
          <p className="eyebrow">Label output</p>
          <h2>Printer Configuration</h2>
        </div>
        <Button loading={loading} onClick={loadPrinters} type="button">
          <RefreshCw aria-hidden="true" size={16} />
          Refresh Printers
        </Button>
      </div>

      {message ? <div className="notice good">{message}</div> : null}
      {error ? <div className="notice danger">{error}</div> : null}
      <div className="notice warn">
        Drag fields inside the preview or use the numeric controls. Test and Save both store the current layout for product labels.
      </div>

      <div className="settings-grid label-designer-grid">
        <section className="panel">
          <form className="stack-form" onSubmit={handleSave}>
            <SelectInput label="Printer" onChange={(event) => updateSetting('printerName', event.target.value)} value={normalizedSettings.printerName}>
              <option value="">Default OS printer</option>
              {printers.map((printer) => (
                <option key={printer.name} value={printer.name}>
                  {printer.name}
                  {printer.isDefault ? ' (Default)' : ''}
                </option>
              ))}
            </SelectInput>

            <div className="grid two">
              <TextInput
                label="Label Width (mm)"
                min="10"
                onChange={(event) => updateSetting('labelWidth', Number(event.target.value))}
                step="0.1"
                type="number"
                value={normalizedSettings.labelWidth}
              />
              <TextInput
                label="Label Height (mm)"
                min="10"
                onChange={(event) => updateSetting('labelHeight', Number(event.target.value))}
                step="0.1"
                type="number"
                value={normalizedSettings.labelHeight}
              />
            </div>

            <div className="grid two">
              <SelectInput
                label="Orientation"
                onChange={(event) => updateSetting('printOrientation', event.target.value as PrinterSettings['printOrientation'])}
                value={normalizedSettings.printOrientation}
              >
                <option value="portrait">Portrait</option>
                <option value="landscape">Landscape</option>
              </SelectInput>
              <SelectInput
                label="Whole Label Rotation"
                onChange={(event) => updateSetting('contentRotation', event.target.value as PrinterSettings['contentRotation'])}
                value={normalizedSettings.contentRotation}
              >
                <option value="0">0 deg</option>
                <option value="90">90 deg</option>
                <option value="180">180 deg</option>
                <option value="270">270 deg</option>
              </SelectInput>
            </div>

            <div className="grid four">
              <TextInput label="Top" min="0" onChange={(event) => updateSetting('marginTop', Number(event.target.value))} step="0.1" type="number" value={normalizedSettings.marginTop} />
              <TextInput label="Right" min="0" onChange={(event) => updateSetting('marginRight', Number(event.target.value))} step="0.1" type="number" value={normalizedSettings.marginRight} />
              <TextInput label="Bottom" min="0" onChange={(event) => updateSetting('marginBottom', Number(event.target.value))} step="0.1" type="number" value={normalizedSettings.marginBottom} />
              <TextInput label="Left" min="0" onChange={(event) => updateSetting('marginLeft', Number(event.target.value))} step="0.1" type="number" value={normalizedSettings.marginLeft} />
            </div>

            <SelectInput label="Layout Preset" onChange={(event) => applyPreset(event.target.value as LabelPresetKey)} value={normalizedSettings.labelLayout.preset}>
              {Object.entries(LABEL_PRESET_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </SelectInput>

            <TextInput
              label="Custom Text"
              onChange={(event) =>
                updateSettings((current) => ({
                  ...current,
                  labelLayout: { ...current.labelLayout, customText: event.target.value }
                }))
              }
              value={normalizedSettings.labelLayout.customText}
            />

            <div className="label-toggle-grid">
              {LABEL_ELEMENT_KEYS.map((key) => (
                <label className="check-row" key={key}>
                  <input checked={normalizedSettings.labelLayout.elements[key].visible} onChange={(event) => updateLayoutElement(key, { visible: event.target.checked })} type="checkbox" />
                  {LABEL_ELEMENT_LABELS[key]}
                </label>
              ))}
            </div>

            <div className="button-row end">
              <Button onClick={handleReset} type="button" variant="ghost">
                Reset
              </Button>
              <Button onClick={handleTestPrint} type="button">
                <Printer aria-hidden="true" size={16} />
                Test
              </Button>
              <Button type="submit" variant="primary">
                <Save aria-hidden="true" size={16} />
                Save
              </Button>
            </div>
          </form>
        </section>

        <section className="panel preview-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Drag to reposition</p>
              <h3>Label Designer</h3>
            </div>
            <Printer aria-hidden="true" size={20} />
          </div>

          <div className="label-preview-stage designer-stage">
            <div
              className="designer-canvas"
              onPointerMove={handlePreviewPointerMove}
              onPointerUp={handlePreviewPointerUp}
              ref={previewRef}
              style={{ aspectRatio: `${normalizedSettings.labelWidth} / ${normalizedSettings.labelHeight}` }}
            >
              {LABEL_ELEMENT_KEYS.map((key) => {
                const element = normalizedSettings.labelLayout.elements[key];
                if (!element.visible) return null;
                const content = getPreviewContent(key, previewData);
                return (
                  <div
                    className={`designer-element ${selectedElement === key ? 'selected' : ''} ${key === 'barcode' ? 'barcode-box' : ''}`}
                    key={key}
                    onPointerDown={(event) => handleElementPointerDown(event, key)}
                    role="button"
                    style={{
                      left: `${(element.xMm / normalizedSettings.labelWidth) * 100}%`,
                      top: `${(element.yMm / normalizedSettings.labelHeight) * 100}%`,
                      width: `${(element.widthMm / normalizedSettings.labelWidth) * 100}%`,
                      height: `${(element.heightMm / normalizedSettings.labelHeight) * 100}%`,
                      fontSize: `${Math.max(7, element.fontSizePx * 2.2)}px`,
                      justifyContent: alignToFlex(element.align),
                      textAlign: element.align,
                      transform: `rotate(${element.rotationDeg}deg)`
                    }}
                    tabIndex={0}
                    title={LABEL_ELEMENT_LABELS[key]}
                  >
                    {key === 'barcode' ? <span className="preview-bars" /> : content}
                  </div>
                );
              })}
            </div>
          </div>

          <section className="designer-controls">
            <SelectInput label="Selected Field" onChange={(event) => setSelectedElement(event.target.value as LabelElementKey)} value={selectedElement}>
              {LABEL_ELEMENT_KEYS.map((key) => (
                <option key={key} value={key}>
                  {LABEL_ELEMENT_LABELS[key]}
                </option>
              ))}
            </SelectInput>

            <label className="check-row">
              <input checked={selectedLayout.visible} onChange={(event) => updateLayoutElement(selectedElement, { visible: event.target.checked })} type="checkbox" />
              Visible
            </label>

            <div className="grid four">
              <TextInput label="X mm" min="0" onChange={(event) => updateLayoutElement(selectedElement, { xMm: Number(event.target.value) })} step="0.1" type="number" value={selectedLayout.xMm} />
              <TextInput label="Y mm" min="0" onChange={(event) => updateLayoutElement(selectedElement, { yMm: Number(event.target.value) })} step="0.1" type="number" value={selectedLayout.yMm} />
              <TextInput label="W mm" min="1" onChange={(event) => updateLayoutElement(selectedElement, { widthMm: Number(event.target.value) })} step="0.1" type="number" value={selectedLayout.widthMm} />
              <TextInput label="H mm" min="1" onChange={(event) => updateLayoutElement(selectedElement, { heightMm: Number(event.target.value) })} step="0.1" type="number" value={selectedLayout.heightMm} />
            </div>

            <div className="grid three">
              <TextInput label="Text Size" min="3" onChange={(event) => updateLayoutElement(selectedElement, { fontSizePx: Number(event.target.value) })} step="0.1" type="number" value={selectedLayout.fontSizePx} />
              <TextInput label="Rotation" max="180" min="-180" onChange={(event) => updateLayoutElement(selectedElement, { rotationDeg: Number(event.target.value) })} step="1" type="number" value={selectedLayout.rotationDeg} />
              <SelectInput label="Align" onChange={(event) => updateLayoutElement(selectedElement, { align: event.target.value as LabelElementLayout['align'] })} value={selectedLayout.align}>
                <option value="left">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
              </SelectInput>
            </div>
          </section>
        </section>
      </div>
    </section>
  );
}

function getPreviewContent(key: LabelElementKey, data: ReturnType<typeof makeTestLabelData>): string {
  switch (key) {
    case 'brand':
      return data.brand;
    case 'name':
      return data.name;
    case 'category':
      return data.category;
    case 'size':
      return data.size;
    case 'customText':
      return data.customText;
    case 'sku':
      return data.sku;
    case 'price':
      return data.price;
    case 'barcode':
      return data.barcodeText;
    default:
      return '';
  }
}

function alignToFlex(align: LabelElementLayout['align']): string {
  if (align === 'left') return 'flex-start';
  if (align === 'right') return 'flex-end';
  return 'center';
}
