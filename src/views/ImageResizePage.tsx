import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ReactCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { Crop, Download, FolderOpen, ImagePlus, RotateCcw, X } from 'lucide-react';
import { useImagePaste } from '../hooks/useImagePaste';
import { useResizeWorkspace, type ResizeItem } from '../contexts/ResizeWorkspace';
import { sizePresets, resizeModes, ratioPresets, resolveResizePlan, type ResizePreferences, type ResizeMode } from '../lib/resize-settings';
import { formatFileSize, getCompressionSettings } from '../lib/utils';
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
  const plan = resolveResizePlan(settings, selectedItem);
  const settingsValid = !plan.error;
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

  const changeSettings = (patch: Partial<ResizePreferences>) => {
    setSettings(previous => ({ ...previous, ...patch }));
    setShowResult(false);
  };
  const changeUnit = (unit: ResizePreferences['unit']) => {
    if (unit === settings.unit) return;
    const dpi = Number.isInteger(settings.dpi) && settings.dpi >= 36 && settings.dpi <= 1200 ? settings.dpi : 300;
    const millimetres = settings.unit === 'px'
      ? [settings.width / dpi * 25.4, settings.height / dpi * 25.4]
      : [settings.physicalWidth, settings.physicalHeight].map(value => value * (settings.unit === 'cm' ? 10 : 1));
    if (unit === 'px') changeSettings({ unit, width: Math.round(millimetres[0] / 25.4 * dpi), height: Math.round(millimetres[1] / 25.4 * dpi) });
    else changeSettings({ unit, physicalWidth: Number((millimetres[0] / (unit === 'cm' ? 10 : 1)).toFixed(4)), physicalHeight: Number((millimetres[1] / (unit === 'cm' ? 10 : 1)).toFixed(4)) });
  };
  const changeMode = (mode: ResizeMode) => {
    changeSettings({ mode, ...(mode === 'photo' ? { presetId: sizePresets.some(preset => preset.id === settings.presetId && preset.id !== 'pixels-150-200') ? settings.presetId : 'one-inch', fit: 'crop' as const } : {}) });
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
    if (busy || !batch.length) return;
    setProcessing(true);
    const snapshot = { ...settings };
    let success = 0;
    let unsaved = 0;
    let overLimit = 0;
    for (let index = 0; index < batch.length; index++) {
      const item = batch[index];
      setMessage(`正在处理 ${index + 1} / ${batch.length}：${item.name}`);
      try {
        const request = resolveResizePlan(snapshot, item);
        if (request.error) throw new Error(request.error);
        const result = await window.electron.ipcRenderer.invoke('resize-image', { imagePath: item.path, name: item.name, settings: request.settings, crop: request.crop });
        if (!result.success) throw new Error(result.error || '尺寸处理失败');
        const image: ProcessedImage = result.image;
        if (image.targetMet === false) overLimit++;
        const resultUrl = await window.electron.ipcRenderer.invoke('get-image-data-url', image.outputPath);
        updateItem(item.id, { result: image, resultUrl, error: undefined });
        const saved = await window.stats.addProcessedImage(image);
        if (!saved.success) unsaved++;
        success++;
      } catch (error) { updateItem(item.id, { error: error instanceof Error ? error.message : '处理失败' }); }
    }
    setProcessing(false);
    setShowResult(success > 0);
    setMessage(`尺寸处理完成：成功 ${success} 张，失败 ${batch.length - success} 张。结果保存在“尺寸处理 → 导出管理”。${overLimit ? `其中 ${overLimit} 张未达到文件大小要求，请查看结果提示。` : ''}${unsaved ? `有 ${unsaved} 张导出记录保存失败，请直接保存当前结果。` : ''}`);
  };
  const saveCurrent = async () => {
    if (!selectedItem?.result) return;
    try {
      const result = await window.electron.ipcRenderer.invoke('save-file', { sourcePath: selectedItem.result.outputPath, suggestedName: selectedItem.result.name });
      if (result.success) setMessage(`已保存到 ${result.path}`);
      else if (result.error) setMessage(`保存失败：${result.error}`);
    } catch (error) { setMessage(`保存失败：${String(error)}`); }
  };
  const crop = plan.crop;
  const cropValid = plan.settings.fit !== 'crop' || !!crop && crop.width > 0 && crop.height > 0;
  const lowResolution = selectedItem && settingsValid && (plan.settings.fit === 'crop' && crop
    ? crop.width / 100 * selectedItem.width + 0.5 < plan.settings.width || crop.height / 100 * selectedItem.height + 0.5 < plan.settings.height
    : selectedItem.width < plan.settings.width || selectedItem.height < plan.settings.height);
  const batchReady = items.some(item => !resolveResizePlan(settings, item).error);

  return <div className="space-y-6" id="resize-workspace">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h1 className="text-3xl font-bold">图片尺寸处理</h1><p className="mt-2 text-muted-foreground">先选择你收到的尺寸要求，程序自动计算其余参数。</p></div>
      <Link to="/resize/export" className={buttonClass}><Download size={16} />导出管理</Link>
    </div>
    <section aria-labelledby="resize-requirement-title" className="space-y-3">
      <h2 id="resize-requirement-title" className="text-lg font-semibold">你收到的要求是什么？</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">{resizeModes.map(mode => <button key={mode.id} id={`resize-mode-${mode.id}`} disabled={busy} aria-pressed={settings.mode === mode.id} onClick={() => changeMode(mode.id)} className={'rounded-lg border p-4 text-left hover:border-primary disabled:opacity-50 ' + (settings.mode === mode.id ? 'border-primary bg-primary/5' : 'border-border bg-card')}><span className="block font-semibold text-sm">{mode.label}</span><span className="block text-xs text-muted-foreground mt-2">{mode.example}</span></button>)}</div>
    </section>
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
          <span className={'text-xs ' + (item.error ? 'text-red-600' : 'text-muted-foreground')}>{item.error ? '处理失败' : item.result?.targetMet === false ? '已生成 · 体积超限' : item.result ? '已生成' : '待处理'}</span>
        </button>
        <button aria-label={`移除 ${item.name}`} disabled={processing} className="absolute right-1 top-1 rounded-full bg-background/90 p-1" onClick={() => setItems(previous => previous.filter(image => image.id !== item.id))}><X size={12} /></button>
      </div>)}
    </div>}
    <div className="grid grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)] gap-6 items-start">
      <fieldset disabled={busy} className="rounded-xl border border-border bg-card p-5 space-y-5 min-w-0">
        <legend className="sr-only">按要求设置图片</legend>
        {settings.mode === 'photo' && <div>
          <label htmlFor="resize-preset" className="block font-semibold mb-2">需要哪种照片？</label>
          <select id="resize-preset" className={inputClass} value={settings.presetId} onChange={event => changeSettings({ presetId: event.target.value, fit: 'crop', format: 'jpeg', dpi: 300 })}>
            {sizePresets.filter(item => item.id !== 'pixels-150-200').map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          {preset && <div className="mt-3 rounded-md bg-muted p-3 text-sm"><p className="font-medium">{preset.printWidthMM ? `${preset.printWidthMM} × ${preset.printHeightMM} 毫米 · 打印参数已自动配置` : `${preset.width} × ${preset.height} 像素 · 电子照片`}</p><p className="mt-1 text-muted-foreground">{preset.note}</p>{preset.source && <a href={preset.source} target="_blank" rel="noreferrer" className="inline-block text-primary mt-2">查看要求来源 ↗</a>}</div>}
          <p className="text-xs text-muted-foreground mt-2">只需选照片规格并调整裁剪框，不必手动换算像素。</p>
        </div>}
        {settings.mode === 'dimensions' && <div className="space-y-3">
          <div><label htmlFor="resize-unit" className="block font-semibold mb-2">要求使用什么单位？</label><select id="resize-unit" className={inputClass} value={settings.unit} onChange={event => changeUnit(event.target.value as ResizePreferences['unit'])}><option value="px">像素（px）· 网站上传常用</option><option value="mm">毫米（mm）· 打印用</option><option value="cm">厘米（cm）· 打印用</option></select></div>
          <div><label htmlFor="resize-dimension-policy" className="block font-semibold mb-2">宽高要怎么调整？</label><select id="resize-dimension-policy" className={inputClass} value={settings.dimensionPolicy} onChange={event => changeSettings({ dimensionPolicy: event.target.value as ResizePreferences['dimensionPolicy'] })}><option value="exact">宽、高都必须是指定数值</option><option value="width">只指定宽度，高度自动计算</option><option value="height">只指定高度，宽度自动计算</option><option value="within">不超过指定宽高，保留原比例</option></select></div>
          <div className="grid grid-cols-2 gap-3">
            {settings.dimensionPolicy !== 'height' && <label className="text-sm">{settings.dimensionPolicy === 'within' ? '最大宽度' : '宽度'}（{settings.unit}）<input id="resize-width" type="number" min={settings.unit === 'px' ? 1 : 0.01} step={settings.unit === 'px' ? 1 : 'any'} value={(settings.unit === 'px' ? settings.width : settings.physicalWidth) || ''} className={inputClass + ' mt-1'} onChange={event => changeSettings(settings.unit === 'px' ? { width: Number(event.target.value) } : { physicalWidth: Number(event.target.value) })} /></label>}
            {settings.dimensionPolicy !== 'width' && <label className="text-sm">{settings.dimensionPolicy === 'within' ? '最大高度' : '高度'}（{settings.unit}）<input id="resize-height" type="number" min={settings.unit === 'px' ? 1 : 0.01} step={settings.unit === 'px' ? 1 : 'any'} value={(settings.unit === 'px' ? settings.height : settings.physicalHeight) || ''} className={inputClass + ' mt-1'} onChange={event => changeSettings(settings.unit === 'px' ? { height: Number(event.target.value) } : { physicalHeight: Number(event.target.value) })} /></label>}
          </div>
          {settings.dimensionPolicy === 'exact' && <button className={buttonClass} onClick={() => changeSettings(settings.unit === 'px' ? { width: settings.height, height: settings.width } : { physicalWidth: settings.physicalHeight, physicalHeight: settings.physicalWidth })}>交换宽高</button>}
          {settings.unit === 'px' && settings.dimensionPolicy === 'exact' && <div className="flex flex-wrap gap-2">{[[150, 200], [300, 300], [1920, 1080]].map(([width, height]) => <button key={width} id={`resize-pixels-${width}x${height}`} className={buttonClass} onClick={() => changeSettings({ width, height })}>{width}×{height}</button>)}</div>}
          <p className="text-xs text-muted-foreground">{settings.dimensionPolicy === 'exact' ? settings.unit === 'px' ? '例如要求“150×200 像素”，就在宽度填 150、高度填 200。' : '直接填写打印宽高，程序自动换算；默认使用适合照片打印的清晰度。' : settings.dimensionPolicy === 'within' ? '整张图片按比例缩小到范围内，不裁剪、不放大；实际结果可能小于这里的最大宽高。' : '整张图片保持原比例，不裁剪、不变形；另一边按每张原图自动计算。'}</p>
        </div>}
        {settings.mode === 'ratio' && <div className="space-y-3">
          <p className="font-semibold">选择宽 : 高比例</p>
          <div className="grid grid-cols-3 gap-2">{[...ratioPresets, 'original', 'custom'].map(id => <button key={id} className={buttonClass + (settings.ratioId === id ? ' border-primary text-primary bg-primary/5' : '')} aria-pressed={settings.ratioId === id} onClick={() => changeSettings({ ratioId: id })}>{id === 'original' ? '原图比例' : id === 'custom' ? '自定义' : id}</button>)}</div>
          {settings.ratioId === 'custom' && <div className="flex gap-2 items-end"><label className="text-sm flex-1">宽的比例<input id="resize-ratio-width" type="number" min="1" step="1" className={inputClass + ' mt-1'} value={settings.ratioWidth || ''} onChange={event => changeSettings({ ratioWidth: Number(event.target.value) })} /></label><span className="pb-2">:</span><label className="text-sm flex-1">高的比例<input id="resize-ratio-height" type="number" min="1" step="1" className={inputClass + ' mt-1'} value={settings.ratioHeight || ''} onChange={event => changeSettings({ ratioHeight: Number(event.target.value) })} /></label></div>}
          <p className="text-xs text-muted-foreground">拖动裁剪框选择保留部分。例如 16:9 是横图，9:16 是竖图。</p>
          <label htmlFor="resize-ratio-output" className="block text-sm font-medium">裁剪后是否还需要指定像素？</label><select id="resize-ratio-output" className={inputClass} value={settings.ratioOutput} onChange={event => changeSettings({ ratioOutput: event.target.value as ResizePreferences['ratioOutput'] })}><option value="selection">不需要，尽量保留选区原有像素</option><option value="width">需要，指定宽度，高度按比例计算</option></select>
          {settings.ratioOutput === 'width' && <label className="block text-sm">输出宽度（px）<input id="resize-ratio-output-width" className={inputClass + ' mt-1'} type="number" min="1" step="1" value={settings.ratioOutputWidth || ''} onChange={event => changeSettings({ ratioOutputWidth: Number(event.target.value) })} /><span className="block text-xs text-muted-foreground mt-1">高度会取整到最接近的像素。</span></label>}
        </div>}
        {settings.mode === 'scale' && <div className="space-y-3"><label htmlFor="resize-percent" className="block font-semibold">缩放到原图的多少？</label><div className="flex items-center gap-2"><input id="resize-percent" className={inputClass} type="number" min="1" max="400" step="any" value={settings.scalePercent || ''} onChange={event => changeSettings({ scalePercent: Number(event.target.value) })} /><span>%</span></div><div className="flex flex-wrap gap-2">{[25, 50, 75, 100, 200].map(percent => <button key={percent} className={buttonClass} onClick={() => changeSettings({ scalePercent: percent })}>{percent}%</button>)}</div><p className="text-xs text-muted-foreground">50% 表示宽度、高度都减半。保留整张图片，不裁剪；批量时按每张原图分别计算。</p></div>}
        {(settings.mode === 'photo' || settings.mode === 'dimensions' && settings.dimensionPolicy === 'exact') && <div><label htmlFor="resize-fit" className="block font-semibold mb-2">原图比例不一样时</label><select id="resize-fit" className={inputClass} value={settings.fit} onChange={event => changeSettings({ fit: event.target.value as ResizePreferences['fit'] })}><option value="crop">裁掉多余部分，画面不变形</option><option value="contain">保留完整图片，空白处填色</option><option value="stretch">直接拉伸铺满，画面可能变形</option></select><p className="text-xs text-muted-foreground mt-2">{settings.fit === 'crop' ? '拖动裁剪框决定保留哪里；适合证件照及要求精确宽高的图片。' : settings.fit === 'contain' ? '适合不想裁掉任何内容的图片，仍输出指定宽高。' : '只有明确允许改变原图比例时才选择拉伸。'}</p>{settings.fit === 'contain' && <label className="block text-sm mt-3">空白填充颜色<input id="resize-background" type="color" value={settings.background} className="block w-full h-10 mt-1 rounded border border-border" onChange={event => changeSettings({ background: event.target.value })} /></label>}</div>}
        <div><label htmlFor="resize-format" className="block font-semibold mb-2">保存格式</label><select id="resize-format" value={settings.format} className={inputClass} onChange={event => changeSettings({ format: event.target.value as ResizePreferences['format'] })}><option value="jpeg">JPG / JPEG · 照片、报名常用</option><option value="png">PNG · 保留透明和颜色</option><option value="webp">WebP · 网页常用</option></select></div>
        <div className="border-t border-border pt-4 space-y-3">
          <label className="flex gap-2 items-center font-semibold text-sm"><input id="resize-compression-enabled" type="checkbox" checked={settings.compressionEnabled} onChange={event => changeSettings({ compressionEnabled: event.target.checked, ...(!event.target.checked ? { targetEnabled: false } : {}) })} />同时压缩，减小文件体积（可选）</label>
          <p className="text-xs text-muted-foreground">{settings.compressionEnabled ? '只优化文件体积，保持本页要求的像素和裁剪区域。' : '当前优先保留画质。裁剪、缩放或格式转换仍需重新编码；需要小于 200 KB 等要求时可开启压缩。'}</p>
          {settings.compressionEnabled && <>
            <button className={buttonClass} onClick={async () => {
              try { const saved = await getCompressionSettings(); changeSettings({ quality: saved.quality, optimizeColors: saved.optimizeColors }); setMessage('已套用压缩强度和 PNG 颜色策略；输出格式与尺寸保持本页选择。'); }
              catch { setMessage('读取压缩设置失败，可手动调整下方参数。'); }
            }}>套用“图片压缩”的当前参数</button>
            {(settings.format !== 'png' || settings.optimizeColors) && <label className="block text-sm">压缩强度：{100 - settings.quality} / 100<input id="resize-quality" type="range" min="0" max="99" value={100 - settings.quality} className="block w-full mt-2 accent-primary" onChange={event => changeSettings({ quality: 100 - Number(event.target.value) })} /></label>}
            {(settings.format !== 'png' || settings.optimizeColors) && <p className="text-xs text-muted-foreground">强度越高通常体积越小，这个数值不等于文件体积缩减百分比。</p>}
            {settings.format === 'png' && <label className="block text-sm">PNG 颜色处理<select id="resize-png-colors" className={inputClass + ' mt-1'} value={settings.optimizeColors ? 'reduce' : 'preserve'} onChange={event => changeSettings({ optimizeColors: event.target.value === 'reduce' })}><option value="reduce">减色压缩 · 通常体积更小</option><option value="preserve">保色优化 · 渐变过渡更完整</option></select><span className="block text-xs text-muted-foreground mt-1">减色可能改变细微颜色；保色时压缩强度不减少颜色数量。</span></label>}
            <label className="flex gap-2 items-center text-sm"><input id="resize-target-enabled" type="checkbox" checked={settings.targetEnabled} onChange={event => changeSettings({ targetEnabled: event.target.checked })} />还要求文件小于指定大小</label>
            {settings.targetEnabled && <><div className="flex items-center gap-2"><input id="resize-target-size" aria-label="文件大小上限" className={inputClass} type="number" min="1" step="any" value={settings.targetSizeKB || ''} onChange={event => changeSettings({ targetSizeKB: Number(event.target.value) })} /><span>KB</span></div><div className="flex flex-wrap gap-2">{[100, 200, 500, 1024].map(size => <button key={size} className={buttonClass} onClick={() => changeSettings({ targetSizeKB: size })}>{size === 1024 ? '1 MB' : `${size} KB`}</button>)}</div><p className="text-xs text-muted-foreground">自动调整编码质量，不缩小指定像素。无法满足大小要求时会明确提示。</p></>}
          </>}
        </div>
        <details id="resize-advanced" className="border-t border-border pt-4"><summary className="cursor-pointer text-sm font-medium">高级设置（一般无需修改）</summary><div className="mt-4 space-y-4">
          <label className="block text-sm">打印清晰度（DPI）<input id="resize-dpi" type="number" min="36" max="1200" value={settings.dpi || ''} className={inputClass + ' mt-1'} onChange={event => changeSettings({ dpi: Number(event.target.value) })} /></label>
          <p className="text-xs text-muted-foreground">保持 300 即可。只有照片打印通常需要关注：毫米、厘米和纸质证件照会自动换算像素；纯像素、比例和百分比模式不因 DPI 改变像素。</p>
          {plan.settings.fit !== 'contain' && settings.format === 'jpeg' && <label className="block text-sm">透明区域填充颜色<input id="resize-background" type="color" value={settings.background} className="block w-full h-10 mt-1 rounded border border-border" onChange={event => changeSettings({ background: event.target.value })} /></label>}
        </div></details>
        {plan.error && !plan.needsImage && <p role="alert" className="text-sm text-red-600">{plan.error}</p>}
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
              : plan.settings.fit === 'crop' ? <ReactCrop key={selectedItem.id} crop={crop} aspect={plan.aspect} keepSelection ruleOfThirds disabled={busy || !settingsValid}
                onChange={(_, region) => { updateItem(selectedItem.id, { crop: region }); setShowResult(false); }}>
                <img src={selectedItem.previewUrl} alt="待裁剪图片" draggable={false} style={{ display: 'block', maxWidth: '100%', maxHeight: 440, width: 'auto', height: 'auto' }} />
              </ReactCrop>
              : <div style={{ aspectRatio: settingsValid ? `${plan.settings.width} / ${plan.settings.height}` : '1', width: '100%', maxWidth: settingsValid ? Math.min(660, 440 * plan.settings.width / plan.settings.height) : 440, maxHeight: 440, background: settings.background }}>
                <img src={selectedItem.previewUrl} alt="尺寸调整预览" className="w-full h-full" style={{ objectFit: plan.settings.fit === 'contain' ? 'contain' : 'fill' }} />
              </div>}
          </div>
          <div id="resize-output-summary" className="rounded-lg bg-muted p-3 text-sm">
            {showResult && selectedItem.result ? <p>上次结果：{selectedItem.result.width} × {selectedItem.result.height} px · {selectedItem.result.format.toUpperCase()} · {formatFileSize(selectedItem.result.compressedSize)}</p>
              : <p><Crop size={14} className="inline mr-1" />{settingsValid ? `将生成：${plan.settings.width} × ${plan.settings.height} 像素 · ${settings.format === 'jpeg' ? 'JPG' : settings.format.toUpperCase()}` : plan.error}{settingsValid && (settings.mode === 'photo' && preset?.printWidthMM || settings.mode === 'dimensions' && settings.unit !== 'px') ? ` · 打印约 ${(plan.settings.width / settings.dpi * 25.4).toFixed(1)} × ${(plan.settings.height / settings.dpi * 25.4).toFixed(1)} 毫米` : ''}{settings.targetEnabled ? ` · 目标小于 ${settings.targetSizeKB} KB` : ''}</p>}
          </div>
          {!showResult && lowResolution && <p className="text-sm text-amber-700 dark:text-amber-300">所选区域小于目标尺寸，将放大输出；放大不会增加原图细节。</p>}
          {selectedItem.warning && <p className="text-sm text-amber-700 dark:text-amber-300">{selectedItem.warning}</p>}
          {showResult && selectedItem.result?.warning && <p role="status" className="text-sm text-amber-700 dark:text-amber-300">{selectedItem.result.warning}</p>}
          {selectedItem.error && <p role="alert" className="text-sm text-red-600">{selectedItem.error}</p>}
          <div className="flex flex-wrap gap-3">
            <button id="resize-generate" className={primaryClass} disabled={busy || !settingsValid || !cropValid} onClick={() => processImages([selectedItem])}>生成当前图片</button>
            <button id="resize-generate-all" className={buttonClass} disabled={busy || !batchReady} onClick={() => processImages(items)}>批量生成（{items.length} 张）</button>
            {selectedItem.result && <button id="resize-save" className={buttonClass} disabled={processing} onClick={saveCurrent}><Download size={16} />保存当前结果</button>}
          </div>
        </> : <div className="min-h-80 flex flex-col items-center justify-center rounded-lg bg-muted text-center p-8"><Crop size={48} className="text-primary mb-4" /><h3 className="font-semibold text-lg">按你的要求选择一种方式</h3><p className="text-sm text-muted-foreground mt-2">一寸照片直接选预设；网站要求像素就填宽高；4:3、16:9 选择固定比例。</p></div>}
        <p className="text-xs text-muted-foreground">证件照预设仅处理尺寸与构图，不自动换背景或审核人像。提交前请核对对应机构对背景、头部位置、文件体积及审核工具的要求。</p>
      </section>
    </div>
    <p id="resize-status" role="status" aria-live="polite" className="text-sm text-muted-foreground">{message || '选择上方的要求类型，再导入图片开始处理。'}</p>
  </div>;
}
