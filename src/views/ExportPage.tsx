import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, FileText, FolderOpen, RefreshCw } from 'lucide-react';
import { formatFileSize } from '../lib/utils';
import type { ProcessedImage } from '../types/global';

const buttonClass = 'inline-flex items-center justify-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-accent disabled:opacity-50';
const primaryClass = buttonClass + ' bg-primary text-primary-foreground hover:bg-primary/90';
type ExportImage = ProcessedImage & { previewUrl?: string };
export default function ExportPage({ operation = 'compression' }: { operation?: 'compression' | 'resize' | 'pdf' }) {
  const pdf = operation === 'pdf';
  const unit = pdf ? '个 PDF' : '张图片';
  const tool = pdf ? 'PDF 压缩' : operation === 'resize' ? '尺寸处理' : '图片压缩';
  const back = pdf ? '/pdf' : operation === 'resize' ? '/resize' : '/process';
  const [images, setImages] = useState<ExportImage[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [directory, setDirectory] = useState('');
  const [overwrite, setOverwrite] = useState(false);
  const [openAfter, setOpenAfter] = useState(true);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    window.stats.getRecentImages(1000).then(async result => {
      if (!result.success) throw new Error(result.error || '加载处理记录失败');
      const records = result.images.filter(image => (image.operation || 'compression') === operation).slice(0, 100);
      if (!active) return;
      setImages(records);
      setSelected(records.map(image => image.id));
      // Resolve previews independently so the list is usable before all thumbnails load.
      for (const image of (pdf ? [] : records)) {
        const previewUrl = await window.electron.ipcRenderer.invoke('get-image-thumbnail', image.outputPath);
        if (!active) return;
        setImages(previous => previous.map(item => item.id === image.id ? { ...item, previewUrl } : item));
      }
    }).catch(error => { if (active) setMessage(error instanceof Error ? error.message : '加载失败'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [operation, revision, pdf]);
  const chooseDirectory = async () => {
    try { const path = await window.compression.selectOutputDirectory(); if (path) setDirectory(path); }
    catch (error) { setMessage(`选择目录失败：${String(error)}`); }
  };
  const exportImages = async () => {
    if (!directory || !selected.length || exporting) return;
    setExporting(true);
    try {
      const result = await window.electron.ipcRenderer.invoke('export-all-files', {
        files: images.filter(image => selected.includes(image.id)).map(image => image.outputPath), outputDir: directory, overwriteExisting: overwrite
      });
      if (!result.success) throw new Error(`${result.error || '导出失败'}（已导出 ${result.exportedCount || 0} ${unit}）`);
      setMessage(`成功导出 ${result.exportedCount} ${unit}到 ${directory}`);
      if (openAfter) await window.electron.ipcRenderer.invoke('show-item-in-folder', directory);
    } catch (error) { setMessage(error instanceof Error ? error.message : '导出失败'); }
    finally { setExporting(false); }
  };
  const saveOne = async (image: ProcessedImage) => {
    try {
      const result = await window.electron.ipcRenderer.invoke('save-file', { sourcePath: image.outputPath, suggestedName: image.name });
      if (result.success) setMessage(`已保存到 ${result.path}`);
      else if (result.error) setMessage(`保存失败：${result.error}`);
    } catch (error) { setMessage(`保存失败：${String(error)}`); }
  };
  const toggle = (id: string) => setSelected(previous => previous.includes(id) ? previous.filter(item => item !== id) : [...previous, id]);
  const total = images.filter(image => selected.includes(image.id)).reduce((sum, image) => sum + image.compressedSize, 0);
  return <div className="space-y-6" id="export-workspace" data-operation={operation}>
    <div className="flex flex-wrap justify-between gap-3"><div><h1 className="text-3xl font-bold">{pdf ? 'PDF 压缩导出' : operation === 'resize' ? '尺寸处理导出' : '压缩导出管理'}</h1><p className="text-muted-foreground mt-2">仅显示{tool}结果，最多显示最近 100 {pdf ? '个文件' : '张图片'}。</p></div><Link to={back} className={buttonClass}>返回{tool}</Link></div>
    <section className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div className="flex flex-wrap gap-3 items-center"><FolderOpen className="text-primary" size={22} /><input aria-label="导出目录" className="flex-1 min-w-48 rounded-md border border-border bg-background px-3 py-2" value={directory} readOnly placeholder="请选择导出目录" /><button className={buttonClass} onClick={chooseDirectory} disabled={exporting}>选择目录</button></div>
      <div className="flex flex-wrap gap-5 text-sm"><label className="flex items-center gap-2"><input type="checkbox" checked={overwrite} disabled={exporting} onChange={event => setOverwrite(event.target.checked)} />覆盖同名文件</label><label className="flex items-center gap-2"><input type="checkbox" checked={openAfter} onChange={event => setOpenAfter(event.target.checked)} />导出后打开文件夹</label></div>
      <p className="text-xs text-muted-foreground">按处理时的格式和尺寸导出，不再次压缩。未开启覆盖时，同名文件会自动添加序号。</p>
      <button id="export-selected" className={primaryClass} disabled={exporting || !directory || !selected.length} onClick={exportImages}><Download size={16} />{exporting ? '正在导出…' : `导出所选 ${selected.length} ${unit} · ${formatFileSize(total)}`}</button>
    </section>
    <section className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">处理结果（{selected.length} / {images.length}）</h2><div className="flex flex-wrap gap-2"><button className={buttonClass} onClick={() => setSelected(selected.length === images.length ? [] : images.map(image => image.id))}>{selected.length === images.length && images.length ? '取消全选' : '全选'}</button>{operation !== 'resize' && <button className={buttonClass} onClick={() => setSelected(images.filter(image => image.compressedSize < image.originalSize).map(image => image.id))}>仅选择体积减小的{pdf ? '文件' : '图片'}</button>}<button className={buttonClass} disabled={loading} onClick={() => setRevision(previous => previous + 1)}><RefreshCw size={14} />刷新</button></div></div>
      {!images.length ? <p className="text-muted-foreground py-10 text-center">{loading ? '正在加载…' : `暂无处理结果，请先导入${pdf ? 'PDF' : '图片'}并生成。`}</p> : <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-4">{images.map(image => <article key={image.id} data-image-id={image.id} className={'rounded-lg border overflow-hidden ' + (selected.includes(image.id) ? 'border-primary' : 'border-border')}>
        <label className="block relative cursor-pointer"><input type="checkbox" aria-label={`选择 ${image.name}`} className="absolute left-3 top-3 accent-primary" checked={selected.includes(image.id)} onChange={() => toggle(image.id)} />{pdf ? <div className="h-28 bg-muted flex items-center justify-center gap-2 text-primary"><FileText size={34} /><span>{image.pageCount} 页 PDF</span></div> : image.previewUrl ? <img src={image.previewUrl} alt={image.name} className="w-full h-44 object-contain bg-muted" /> : <div className="h-44 bg-muted" />}</label>
        <div className="p-4 space-y-2"><p className="font-medium truncate" title={image.name}>{image.name}</p><p className="text-sm text-muted-foreground">{pdf ? `${image.pageCount} 页` : `${image.width} × ${image.height} px`} · {image.format.toUpperCase()} · {formatFileSize(image.compressedSize)}</p>{operation !== 'resize' && <p className="text-sm text-muted-foreground">{formatFileSize(image.originalSize)} → {formatFileSize(image.compressedSize)} · {image.compressionRate}</p>}{image.warning && <p className="text-sm text-amber-700">{image.warning}</p>}<div className="flex gap-2"><button className={buttonClass} onClick={() => saveOne(image)}>另存为</button><button className={buttonClass} onClick={() => window.electron.ipcRenderer.invoke('open-file', image.outputPath)}>预览</button><button className={buttonClass} onClick={() => { setImages(previous => previous.filter(item => item.id !== image.id)); setSelected(previous => previous.filter(id => id !== image.id)); }}>移出列表</button></div></div>
      </article>)}</div>}
    </section>
    <p role="status" aria-live="polite" className="text-sm text-muted-foreground">{message}</p>
  </div>;
}
