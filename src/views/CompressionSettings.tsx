import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { getCompressionSettings, saveCompressionSettings } from '../lib/utils';
import { CompressionPreferences, defaultCompressionPreferences } from '../lib/compression-settings';

const presets = [
  { name: '轻度压缩', value: '低压缩', quality: 80 },
  { name: '中度压缩', value: '中等压缩', quality: 60 },
  { name: '高度压缩', value: '高压缩', quality: 40 }
];
const inputClass = 'px-3 py-2 rounded-md border border-border bg-background disabled:opacity-50';
const cardClass = 'bg-card rounded-xl border border-border shadow-sm p-6 space-y-5';

export default function CompressionSettings() {
  const [settings, setSettings] = useState<CompressionPreferences>(defaultCompressionPreferences);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saveStatus, setSaveStatus] = useState('');
  const sequence = useRef(0);

  useEffect(() => {
    let active = true;
    getCompressionSettings().then(saved => {
      if (active) setSettings(saved);
    }).catch(error => { if (active) setLoadError(error.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const invalidTarget = settings.targetEnabled &&
    (!Number.isFinite(settings.targetSizeKB) || settings.targetSizeKB < 1);
  const invalidDimensions = !settings.keepDimensions &&
    (!Number.isFinite(settings.width) || !Number.isFinite(settings.height) || settings.width < 1 || settings.height < 1);

  useEffect(() => {
    if (loading || loadError) return;
    if (invalidTarget || invalidDimensions) {
      setSaveStatus('请输入有效的目标体积和尺寸；当前输入尚未保存');
      return;
    }
    const current = ++sequence.current;
    let active = true;
    setSaveStatus('正在保存…');
    saveCompressionSettings(settings).then(() => {
      if (active && current === sequence.current) setSaveStatus('已自动保存');
    }).catch(error => {
      if (active && current === sequence.current) setSaveStatus('保存失败：' + error.message);
    });
    // Writes continue when navigating away; the main process serializes them.
    return () => { active = false; };
  }, [settings, loading, loadError, invalidTarget, invalidDimensions]);

  const update = (patch: Partial<CompressionPreferences>, custom = true) => {
    setSettings(previous => ({ ...previous, ...patch, ...(custom ? { preset: '自定义' } : {}) }));
  };
  const changeDimension = (key: 'width' | 'height', value: number) => {
    setSettings(previous => {
      const patch = { [key]: value };
      if (previous.keepRatio && previous.width > 0 && previous.height > 0) {
        patch[key === 'width' ? 'height' : 'width'] = key === 'width'
          ? Math.round(value * previous.height / previous.width)
          : Math.round(value * previous.width / previous.height);
      }
      return { ...previous, ...patch, preset: '自定义' };
    });
  };

  if (loading) return <p role="status">正在加载压缩设置…</p>;
  if (loadError) return <div role="alert">加载设置失败：{loadError} <button onClick={() => window.location.reload()}>重试</button></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">压缩设置</h1>
        <p className="text-muted-foreground">设置对之后上传、粘贴和批量处理的图片生效。</p>
        <p role="status" aria-live="polite" className="text-sm text-muted-foreground mt-2">{saveStatus}</p>
      </div>

      <section className={cardClass}>
        <h2 className="text-xl font-semibold">压缩预设</h2>
        <div className="flex flex-wrap gap-3">
          {presets.map(preset => (
            <button key={preset.value} aria-pressed={settings.preset === preset.value}
              className={'px-4 py-2 rounded-md border ' + (settings.preset === preset.value ? 'border-primary text-primary bg-primary/10' : 'border-border hover:bg-accent')}
              onClick={() => update({ preset: preset.value, quality: preset.quality }, false)}>
              {preset.name}
            </button>
          ))}
          <button aria-pressed={settings.preset === '自定义'}
            className={'px-4 py-2 rounded-md border ' + (settings.preset === '自定义' ? 'border-primary text-primary bg-primary/10' : 'border-border hover:bg-accent')}
            onClick={() => update({ preset: '自定义' })}>自定义</button>
        </div>
        <div>
          <label htmlFor="compression-strength" className="block font-medium mb-2">压缩强度</label>
          <div className="flex items-center gap-4">
            <input id="compression-strength" type="range" min="0" max="99" value={100 - settings.quality}
              onChange={event => update({ quality: 100 - Number(event.target.value) })}
              className="flex-1 accent-primary" />
            <span className="font-medium w-20 text-right">{100 - settings.quality} / 100</span>
          </div>
          <p className="text-sm text-muted-foreground mt-2">{settings.optimizeColors
            ? '强度越高，质量或颜色保留越少；这个数值不是文件体积缩减百分比，实际体积取决于图片内容与格式。'
            : 'PNG 保色优化不按强度减少颜色；JPEG、WebP 仍按强度调整质量。强度不是文件体积缩减百分比。'}</p>
        </div>
      </section>

      <section className={cardClass} aria-labelledby="png-color-mode-title">
        <h2 id="png-color-mode-title" className="text-xl font-semibold">PNG 压缩方式</h2>
        <div role="radiogroup" aria-labelledby="png-color-mode-title" className="grid grid-cols-1 xl:grid-cols-2 gap-3">
          <label className={'flex items-start gap-3 rounded-lg border p-4 cursor-pointer ' +
            (settings.optimizeColors ? 'border-primary bg-primary/5' : 'border-border hover:bg-accent')}>
            <input id="png-color-reduce" name="png-color-mode" type="radio" value="reduce"
              checked={settings.optimizeColors} onChange={() => update({ optimizeColors: true }, false)}
              className="accent-primary mt-1" />
            <span>
              <span className="flex flex-wrap items-center gap-2 font-medium">
                减色压缩
                <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">默认推荐</span>
              </span>
              <span className="block text-sm text-muted-foreground mt-2">通过减少颜色数量，体积通常缩小明显，适合截图和日常分享；部分颜色或渐变细节可能改变。</span>
            </span>
          </label>
          <label className={'flex items-start gap-3 rounded-lg border p-4 cursor-pointer ' +
            (!settings.optimizeColors ? 'border-primary bg-primary/5' : 'border-border hover:bg-accent')}>
            <input id="png-color-preserve" name="png-color-mode" type="radio" value="preserve"
              checked={!settings.optimizeColors} onChange={() => update({ optimizeColors: false }, false)}
              className="accent-primary mt-1" />
            <span>
              <span className="font-medium">保色优化</span>
              <span className="block text-sm text-muted-foreground mt-2">不主动减少颜色数量，保留原有渐变层次与平滑过渡；体积缩减通常较少，适合更重视色彩和渐变的图片。</span>
            </span>
          </label>
        </div>
        <p className="text-sm text-muted-foreground">仅影响 PNG 输出。JPEG、WebP 等格式按各自的质量参数压缩；切换轻度、中度或高度压缩会保留这里的选择。</p>
      </section>

      <section className={cardClass}>
        <h2 className="text-xl font-semibold">目标体积（可选）</h2>
        <label className="flex items-center gap-2">
          <input id="target-enabled" type="checkbox" checked={settings.targetEnabled}
            onChange={event => update({ targetEnabled: event.target.checked })} className="accent-primary" />
          自动压缩到指定体积以下
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <label htmlFor="target-size">每张图片小于</label>
          <input id="target-size" type="number" min="1" step="1" value={settings.targetSizeKB || ''}
            disabled={!settings.targetEnabled} aria-invalid={invalidTarget}
            onChange={event => update({ targetSizeKB: Number(event.target.value) })}
            className={inputClass + ' w-28'} />
          <span>KB</span>
          {[100, 200, 500, 1024].map(size => (
            <button key={size} disabled={!settings.targetEnabled} onClick={() => update({ targetSizeKB: size })}
              className="px-3 py-2 border border-border rounded-md disabled:opacity-50 hover:bg-accent">{size} KB</button>
          ))}
        </div>
        <label className="flex items-center gap-2">
          <input id="target-allow-resize" type="checkbox" checked={settings.targetAllowResize}
            disabled={!settings.targetEnabled} onChange={event => update({ targetAllowResize: event.target.checked })}
            className="accent-primary" />
          必要时允许自动按比例缩小尺寸
        </label>
        <p className="text-sm text-muted-foreground">{settings.optimizeColors
          ? '开启后先调整质量与颜色，并检查实际文件字节数。'
          : 'PNG 保色优化下不会为了满足目标而减色。'}仍超标且允许缩小时，会覆盖“保持原始尺寸”按比例缩小。未达到目标会明确提示。1 KB = 1024 字节。</p>
        {!settings.targetEnabled && <p className="text-sm text-muted-foreground">未开启：使用常规压缩参数，不限制输出体积。</p>}
        {invalidTarget && <p role="alert" className="text-amber-700">目标体积至少为 1 KB。</p>}
      </section>

      <section className={cardClass}>
        <h2 className="text-xl font-semibold">输出格式</h2>
        <label className="flex items-center gap-2">
          <input id="keep-format" type="checkbox" checked={settings.keepFormat}
            onChange={event => update({ keepFormat: event.target.checked })} className="accent-primary" />
          保持原始格式
        </label>
        <div className="flex flex-wrap gap-3">
          {['jpeg', 'png', 'webp', 'gif'].map(format => (
            <button key={format} aria-pressed={!settings.keepFormat && settings.outputFormat === format}
              onClick={() => update({ keepFormat: false, outputFormat: format })}
              className={'px-4 py-2 rounded-md border ' + (!settings.keepFormat && settings.outputFormat === format ? 'border-primary text-primary bg-primary/10' : 'border-border hover:bg-accent')}>
              {format.toUpperCase()}
            </button>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">PNG 可选减色压缩或保色优化；WebP 和 JPEG 通过质量参数控制体积，JPEG 不支持透明，透明区域将转为白色。点击格式即可切换输出。</p>
      </section>

      <section className={cardClass}>
        <h2 className="text-xl font-semibold">图像尺寸</h2>
        <label className="flex items-center gap-2">
          <input id="keep-dimensions" type="checkbox" checked={settings.keepDimensions}
            onChange={event => update({ keepDimensions: event.target.checked })} className="accent-primary" />
          保持原始尺寸
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <input aria-label="输出宽度" type="number" min="1" value={settings.width || ''} disabled={settings.keepDimensions}
            onChange={event => changeDimension('width', Number(event.target.value))} className={inputClass + ' w-28'} />
          <span>×</span>
          <input aria-label="输出高度" type="number" min="1" value={settings.height || ''} disabled={settings.keepDimensions}
            onChange={event => changeDimension('height', Number(event.target.value))} className={inputClass + ' w-28'} />
          <label className="flex items-center gap-2">
            <input id="keep-ratio" type="checkbox" checked={settings.keepRatio} disabled={settings.keepDimensions}
              onChange={event => update({ keepRatio: event.target.checked })} className="accent-primary" />
            保持比例
          </label>
        </div>
        {invalidDimensions && <p role="alert" className="text-amber-700">宽度和高度必须为正数。</p>}
      </section>

      <section className={cardClass}>
        <h2 className="text-xl font-semibold">高级选项</h2>
        <label className="flex items-center gap-2">
          <input id="remove-metadata" type="checkbox" checked={settings.removeMetadata}
            onChange={event => update({ removeMetadata: event.target.checked })} className="accent-primary" />
          移除 EXIF、ICC 等元数据
        </label>
        <label className="flex items-center gap-2">
          <input id="progressive" type="checkbox" checked={settings.progressive}
            onChange={event => update({ progressive: event.target.checked })} className="accent-primary" />
          JPEG 渐进式加载
        </label>
        <div>
          <label htmlFor="file-naming" className="block font-medium mb-2">文件命名</label>
          <input id="file-naming" type="text" value={settings.fileNaming}
            onChange={event => update({ fileNaming: event.target.value }, false)} className={inputClass + ' w-full'} />
          <p className="text-sm text-muted-foreground mt-2">{'{filename}'} 为原文件名，{'{timestamp}'} 为时间戳。</p>
        </div>
      </section>
      <Link to="/process" className="inline-flex px-5 py-3 rounded-md bg-primary text-primary-foreground">返回图片处理</Link>
    </div>
  );
}
