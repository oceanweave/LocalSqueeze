import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ReactCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { Crop, Download, FolderOpen, ImagePlus, RotateCcw, X } from 'lucide-react';
import { useImagePaste } from '../hooks/useImagePaste';
import { useResizeWorkspace, type ResizeItem } from '../contexts/ResizeWorkspace';
import { aspectCrop, sizePresets, validDimensions, type ResizeSettings } from '../lib/resize-settings';
import { formatFileSize } from '../lib/utils';
import type { ProcessedImage } from '../types/global';

const inputClass = 'w-full rounded-md border border-border bg-background px-3 py-2';
const buttonClass = 'inline-flex items-center justify-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-accent disabled:opacity-50';
const primaryClass = buttonClass + ' bg-primary text-primary-foreground hover:bg-primary/90';
const isImage = (file: File) => file.type.startsWith('image/') || /\.(jpe?g|png|webp|gif|bmp|tiff?)$/i.test(file.name);

export default function ImageResizePage() {
  const { items, setItems, selected, setSelected, settings, setSettings, processing, setProcessing, message, setMessage } = useResizeWorkspace();
  const [importing, setImporting] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const importQueue = useRef(Promise.resolve());
  const fileInput = useRef<HTMLInputElement>(null);
  const selectedItem = items.find(item => item.id === selected) || items[0];
  const preset = sizePresets.find(item => item.id === settings.presetId);
  const dimensionsValid = validDimensions(settings.width, settings.height);
  const settingsValid = dimensionsValid && Number.isInteger(settings.dpi) && settings.dpi >= 36 && settings.dpi <= 1200;
  const busy = processing || importing;

  const importImages = (files: File[]) => {
    const images = files.filter(isImage);
    if (!images.length) { setMessage('请选择 JPG、PNG、WebP、GIF、BMP 或 TIFF 图片。'); return; }
    // Serialize overlapping file selections and clipboard events, preserving each import.
    importQueue.current = importQueue.current.then(async () => {
      setImporting(true);
      let added = 0;
      const errors: string[] = [];
      for (const file of images) {
        try {
          const saved = await window.electron.ipcRenderer.invoke('save-temp-file', { filename: file.name, data: await file.arrayBuffer() });
          const image = await window.electron.ipcRenderer.invoke('prepare-resize-image', saved.path);
          if (!image.success) throw new Error(image.error || '无法读取图片');
          const item: ResizeItem = { id: crypto.randomUUID(), name: file.name, path: saved.path,
            width: image.width, height: image.height, previewUrl: image.previewUrl, warning: image.warning };
          setItems(previous => [...previous, item]);
          setSelected(item.id);
          setShowResult(false);
          added++;
        } catch (error) { errors.push(`${file.name}：${error instanceof Error ? error.message : '导入失败'}`); }
      }
      setMessage(`已导入 ${added} 张图片。${errors.join('；')}`);
      setImporting(false);
    }).catch(error => { setImporting(false); setMessage(`导入失败：${String(error)}`); });
  };
  useImagePaste(importImages);

  const changeSettings = (patch: Partial<ResizeSettings>) => {
    const next = { ...settings, ...patch };
    if (patch.dpi !== undefined && !patch.presetId) next.presetId = 'custom';
    if (patch.width !== undefined || patch.height !== undefined) {
      next.presetId = patch.presetId || 'custom';
      if (validDimensions(next.width, next.height)) {
        setItems(previous => previous.map(item => ({ ...item,
          crop: aspectCrop(item.width, item.height, next.width / next.height, item.crop) })));
      }
    }
    setSettings(next);
    setShowResult(false);
  };
  const importFolder = async () => {
    try {
      const directory = await window.electron.ipcRenderer.invoke('select-folder');
      if (directory.canceled || !directory.filePaths?.length) return;
      const paths: string[] = await window.electron.ipcRenderer.invoke('get-images-from-folder', directory.filePaths[0]);
      const files: File[] = [];
      for (const filePath of paths) {
        const data = await window.electron.ipcRenderer.invoke('read-file-as-buffer', filePath);
        files.push(new File([data], filePath.split(/[\\/]/).pop() || 'image.png'));
      }
      importImages(files);
    } catch (error) { setMessage(`文件夹导入失败：${String(error)}`); }
  };
  const updateItem = (id: string, patch: Partial<ResizeItem>) => setItems(previous => previous.map(item => item.id === id ? { ...item, ...patch } : item));
  const processImages = async (batch: ResizeItem[]) => {
    if (!settingsValid || busy || !batch.length) return;
    setProcessing(true);
    const snapshot = { ...settings };
    let success = 0;
    let unsaved = 0;
    for (let index = 0; index < batch.length; index++) {
      const item = batch[index];
      setMessage(`正在处理 ${index + 1} / ${batch.length}：${item.name}`);
      try {
        const result = await window.electron.ipcRenderer.invoke('resize-image', { imagePath: item.path, name: item.name, settings: snapshot,
          crop: item.crop || aspectCrop(item.width, item.height, snapshot.width / snapshot.height) });
        if (!result.success) throw new Error(result.error || '尺寸处理失败');
        const image: ProcessedImage = result.image;
        const resultUrl = await window.electron.ipcRenderer.invoke('get-image-data-url', image.outputPath);
        updateItem(item.id, { result: image, resultUrl, error: undefined });
        const saved = await window.stats.addProcessedImage(image);
        if (!saved.success) unsaved++;
        success++;
      } catch (error) { updateItem(item.id, { error: error instanceof Error ? error.message : '处理失败' }); }
    }
    setProcessing(false);
    setShowResult(success > 0);
    setMessage(`尺寸处理完成：成功 ${success} 张，失败 ${batch.length - success} 张。结果保存在“尺寸处理 → 导出管理”。${unsaved ? `有 ${unsaved} 张导出记录保存失败，请直接保存当前结果。` : ''}`);
  };
  const saveCurrent = async () => {
    if (!selectedItem?.result) return;
    try {
      const result = await window.electron.ipcRenderer.invoke('save-file', { sourcePath: selectedItem.result.outputPath, suggestedName: selectedItem.result.name });
      if (result.success) setMessage(`已保存到 ${result.path}`);
      else if (result.error) setMessage(`保存失败：${result.error}`);
    } catch (error) { setMessage(`保存失败：${String(error)}`); }
  };
  const crop = selectedItem && (selectedItem.crop || (dimensionsValid ? aspectCrop(selectedItem.width, selectedItem.height, settings.width / settings.height) : undefined));
  const cropValid = settings.fit !== 'crop' || !!crop && crop.width > 0 && crop.height > 0;
  const lowResolution = selectedItem && (settings.fit === 'crop' && crop
    ? crop.width / 100 * selectedItem.width < settings.width || crop.height / 100 * selectedItem.height < settings.height
    : selectedItem.width < settings.width || selectedItem.height < settings.height);

  return <div className="space-y-6" id="resize-workspace">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h1 className="text-3xl font-bold">图片尺寸处理</h1><p className="mt-2 text-muted-foreground">证件照裁剪与像素调整，按指定宽高输出。</p></div>
      <Link to="/resize/export" className={buttonClass}><Download size={16} />导出管理</Link>
    </div>
    <div className={'rounded-xl border-2 border-dashed p-5 transition-colors ' + (dragging ? 'border-primary bg-primary/10' : 'border-border bg-card')}
      onDragOver={event => { event.preventDefault(); setDragging(true); }}
      onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false); }}
      onDrop={event => { event.preventDefault(); setDragging(false); importImages(Array.from(event.dataTransfer.files)); }}>
      <div className="flex flex-wrap items-center gap-3">
        <ImagePlus className="text-primary" size={28} />
        <div className="flex-1 min-w-48"><p className="font-medium">拖入图片，或按 Ctrl+V / ⌘V 粘贴</p><p className="text-sm text-muted-foreground mt-1">可导入多张，逐张调整裁剪框后批量生成。所有图片均在本机处理。</p></div>
        <input ref={fileInput} id="resize-files" type="file" multiple accept="image/*,.tif,.tiff,.bmp" className="hidden" onChange={event => { importImages(Array.from(event.target.files || [])); event.target.value = ''; }} />
        <button className={primaryClass} disabled={importing} onClick={() => fileInput.current?.click()}><ImagePlus size={16} />选择图片</button>
        <button className={buttonClass} disabled={importing} onClick={importFolder}><FolderOpen size={16} />选择文件夹</button>
      </div>
    </div>
    {items.length > 0 && <div className="flex gap-3 overflow-x-auto pb-2" aria-label="待处理图片">
      {items.map(item => <div key={item.id} className={'relative shrink-0 rounded-lg border p-2 w-32 ' + (item.id === selectedItem?.id ? 'border-primary bg-primary/5' : 'border-border')}>
        <button disabled={processing} className="w-full text-left" aria-pressed={item.id === selectedItem?.id} onClick={() => { setSelected(item.id); setShowResult(false); }}>
          <img src={item.previewUrl} alt="" className="h-16 w-full rounded object-contain bg-muted" /><span className="block truncate mt-2 text-xs" title={item.name}>{item.name}</span>
          <span className={'text-xs ' + (item.error ? 'text-red-600' : 'text-muted-foreground')}>{item.error ? '处理失败' : item.result ? '已生成' : '待处理'}</span>
        </button>
        <button aria-label={`移除 ${item.name}`} disabled={processing} className="absolute right-1 top-1 rounded-full bg-background/90 p-1" onClick={() => setItems(previous => previous.filter(image => image.id !== item.id))}><X size={12} /></button>
      </div>)}
    </div>}
    <div className="grid grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)] gap-6 items-start">
      <fieldset disabled={busy} className="rounded-xl border border-border bg-card p-5 space-y-5 min-w-0">
        <legend className="sr-only">尺寸设置</legend>
        <div><label htmlFor="resize-preset" className="block font-semibold mb-2">尺寸预设</label>
          <select id="resize-preset" className={inputClass} value={settings.presetId} onChange={event => {
            const next = sizePresets.find(item => item.id === event.target.value);
            if (next) changeSettings({ presetId: next.id, width: next.width, height: next.height, dpi: 300, fit: 'crop', format: 'jpeg' });
            else changeSettings({ presetId: 'custom' });
          }}><option value="custom">自定义像素</option>{sizePresets.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
          {preset && <div className="mt-3 rounded-md bg-muted p-3 text-sm"><p className="font-medium">{preset.description}</p><p className="mt-1 text-muted-foreground">{preset.note}</p>{preset.source && <a href={preset.source} target="_blank" rel="noreferrer" className="inline-block text-primary mt-2">查看规格来源 ↗</a>}</div>}
        </div>
        <div><p className="font-semibold mb-2">输出像素</p><div className="grid grid-cols-2 gap-3">
          <label className="text-sm">宽度（px）<input id="resize-width" type="number" min="1" max="20000" value={settings.width || ''} aria-invalid={!dimensionsValid} className={inputClass + ' mt-1'} onChange={event => changeSettings({ width: Number(event.target.value) })} /></label>
          <label className="text-sm">高度（px）<input id="resize-height" type="number" min="1" max="20000" value={settings.height || ''} aria-invalid={!dimensionsValid} className={inputClass + ' mt-1'} onChange={event => changeSettings({ height: Number(event.target.value) })} /></label>
        </div>{!dimensionsValid && <p role="alert" className="text-sm text-red-600 mt-2">宽高须为 1–20000 的整数，总像素不超过 4000 万。</p>}</div>
        <div><label htmlFor="resize-fit" className="block font-semibold mb-2">调整方式</label>
          <select id="resize-fit" className={inputClass} value={settings.fit} onChange={event => changeSettings({ fit: event.target.value as ResizeSettings['fit'] })}>
            <option value="crop">裁剪填满 · 保持比例</option><option value="contain">等比留白 · 保留全图</option><option value="stretch">拉伸铺满 · 可能变形</option>
          </select><p className="text-xs text-muted-foreground mt-2">{settings.fit === 'crop' ? '拖动框选择保留区域，拖动边角缩放。框的比例与输出尺寸一致。' : settings.fit === 'contain' ? '完整保留图片，在空白区域填充所选颜色。' : '直接改为指定宽高，原图比例不同时会变形。'}</p>
        </div>
        <div><label htmlFor="resize-format" className="block font-semibold mb-2">输出格式</label><select id="resize-format" value={settings.format} className={inputClass} onChange={event => changeSettings({ format: event.target.value as ResizeSettings['format'] })}><option value="jpeg">JPEG · 证件照常用</option><option value="png">PNG · 保色输出</option><option value="webp">WebP</option></select></div>
        {settings.format !== 'png' && <label className="block text-sm">输出质量：{settings.quality}<input id="resize-quality" type="range" min="1" max="100" value={settings.quality} className="block w-full mt-2 accent-primary" onChange={event => changeSettings({ quality: Number(event.target.value) })} /></label>}
        <div className="grid grid-cols-2 gap-3"><label className="text-sm">打印分辨率（DPI）<input id="resize-dpi" type="number" min="36" max="1200" value={settings.dpi || ''} className={inputClass + ' mt-1'} onChange={event => changeSettings({ dpi: Number(event.target.value) })} /></label>
          <label className="text-sm">留白 / 透明底色<input id="resize-background" type="color" value={settings.background} className="block w-full h-10 mt-1 rounded border border-border" onChange={event => changeSettings({ background: event.target.value })} /></label></div>
        {(!Number.isInteger(settings.dpi) || settings.dpi < 36 || settings.dpi > 1200) && <p role="alert" className="text-sm text-red-600">DPI 须为 36–1200 的整数。</p>}
        <p className="text-xs text-muted-foreground">DPI 用于打印，修改它不会自动改变上方像素。JPEG 的透明区域会填充底色。尺寸设置自动保存，与图片压缩配置独立。</p>
      </fieldset>
      <section className="rounded-xl border border-border bg-card p-5 min-w-0 space-y-4">
        <div className="flex flex-wrap justify-between items-center gap-3"><h2 className="text-lg font-semibold">{showResult && selectedItem?.result ? '生成结果' : '裁剪与预览'}</h2>
          {selectedItem && <div className="flex gap-2"><button className={buttonClass} disabled={processing} onClick={() => { updateItem(selectedItem.id, { crop: undefined }); setShowResult(false); }}><RotateCcw size={14} />重置裁剪</button>
            {selectedItem.result && <button className={buttonClass} onClick={() => setShowResult(!showResult)}>{showResult ? '返回编辑' : '查看上次结果'}</button>}</div>}
        </div>
        {selectedItem ? <>
          <p className="text-sm text-muted-foreground break-all">{selectedItem.name} · 原图 {selectedItem.width} × {selectedItem.height} px</p>
          <div id="resize-canvas" className="flex justify-center items-center min-h-72 rounded-lg bg-muted p-4 overflow-hidden">
            {showResult && selectedItem.resultUrl ? <img src={selectedItem.resultUrl} alt="尺寸处理结果" className="max-w-full object-contain" style={{ maxHeight: 440 }} />
              : settings.fit === 'crop' ? <ReactCrop key={selectedItem.id} crop={crop} aspect={dimensionsValid ? settings.width / settings.height : 1} keepSelection ruleOfThirds disabled={busy || !dimensionsValid}
                onChange={(_, region) => { updateItem(selectedItem.id, { crop: region }); setShowResult(false); }}>
                <img src={selectedItem.previewUrl} alt="待裁剪图片" draggable={false} style={{ display: 'block', maxWidth: '100%', maxHeight: 440, width: 'auto', height: 'auto' }} />
              </ReactCrop>
              : <div style={{ aspectRatio: dimensionsValid ? `${settings.width} / ${settings.height}` : '1', width: '100%', maxWidth: dimensionsValid ? Math.min(660, 440 * settings.width / settings.height) : 440, maxHeight: 440, background: settings.background }}>
                <img src={selectedItem.previewUrl} alt="尺寸调整预览" className="w-full h-full" style={{ objectFit: settings.fit === 'contain' ? 'contain' : 'fill' }} />
              </div>}
          </div>
          <div className="rounded-lg bg-muted p-3 text-sm">
            {showResult && selectedItem.result ? <p>上次结果：{selectedItem.result.width} × {selectedItem.result.height} px · {selectedItem.result.format.toUpperCase()} · {formatFileSize(selectedItem.result.compressedSize)}</p>
              : <p><Crop size={14} className="inline mr-1" />目标：{settings.width || '—'} × {settings.height || '—'} px{settingsValid ? ` · 约 ${(settings.width / settings.dpi * 25.4).toFixed(1)} × ${(settings.height / settings.dpi * 25.4).toFixed(1)} mm（${settings.dpi} DPI）` : ''}</p>}
          </div>
          {!showResult && lowResolution && <p className="text-sm text-amber-700 dark:text-amber-300">所选区域小于目标尺寸，将放大输出；放大不会增加原图细节。</p>}
          {selectedItem.warning && <p className="text-sm text-amber-700 dark:text-amber-300">{selectedItem.warning}</p>}
          {selectedItem.error && <p role="alert" className="text-sm text-red-600">{selectedItem.error}</p>}
          <div className="flex flex-wrap gap-3">
            <button id="resize-generate" className={primaryClass} disabled={busy || !settingsValid || !cropValid} onClick={() => processImages([selectedItem])}>生成当前图片</button>
            <button id="resize-generate-all" className={buttonClass} disabled={busy || !settingsValid || !cropValid} onClick={() => processImages(items)}>批量生成（{items.length} 张）</button>
            {selectedItem.result && <button id="resize-save" className={buttonClass} disabled={processing} onClick={saveCurrent}><Download size={16} />保存当前结果</button>}
          </div>
        </> : <div className="min-h-80 flex flex-col items-center justify-center rounded-lg bg-muted text-center p-8"><Crop size={48} className="text-primary mb-4" /><h3 className="font-semibold text-lg">先选择尺寸，再放入图片</h3><p className="text-sm text-muted-foreground mt-2">导入后会显示可移动的裁剪框，保留区域可逐张调整。</p></div>}
        <p className="text-xs text-muted-foreground">证件照预设仅处理尺寸与构图，不自动换背景或审核人像。提交前请核对对应机构对背景、头部位置、文件体积及审核工具的要求。</p>
      </section>
    </div>
    <p id="resize-status" role="status" aria-live="polite" className="text-sm text-muted-foreground">{message || '选择预设或输入自定义像素后，导入图片开始处理。'}</p>
  </div>;
}
