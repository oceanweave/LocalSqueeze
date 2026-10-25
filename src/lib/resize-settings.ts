export interface CropRegion { unit: '%'; x: number; y: number; width: number; height: number }
export interface ResizeSettings {
  presetId: string;
  width: number;
  height: number;
  dpi: number;
  fit: 'crop' | 'contain' | 'stretch';
  format: 'jpeg' | 'png' | 'webp';
  background: string;
  quality: number;
  targetSizeKB?: number;
  compressionEnabled?: boolean;
  optimizeColors?: boolean;
}
export interface SizePreset {
  id: string; name: string; width: number; height: number;
  description: string; note: string; source?: string; printWidthMM?: number; printHeightMM?: number;
}
export const sizePresets: SizePreset[] = [
  { id: 'one-inch', printWidthMM: 25, printHeightMM: 35, name: '一寸', width: 295, height: 413, description: '25 × 35 mm · 300 DPI',
    note: '常用一寸规格。打印时请按实际尺寸输出。', source: 'https://rsj.beijing.gov.cn/ywsite/bjpta/fwzn/cjwt/bm/cz/qgpt/202108/t20210821_2473438.html' },
  { id: 'two-inch', printWidthMM: 35, printHeightMM: 49, name: '二寸', width: 413, height: 579, description: '35 × 49 mm · 300 DPI',
    note: '常用二寸规格，与小二寸、护照照片不同；请按接收方要求选择。' },
  { id: 'passport-paper', printWidthMM: 33, printHeightMM: 48, name: '中国护照纸质照参考', width: 390, height: 567, description: '33 × 48 mm · 300 DPI',
    note: '纸质照片尺寸参考。线上护照申请的数字照片尺寸可能不同。', source: 'https://pg.china-embassy.gov.cn/lsyw/lszj/hzlxz/hzlzyq/202401/t20240103_11216467.html' },
  { id: 'china-passport-digital', name: '中国护照数字照参考', width: 354, height: 472, description: '354 × 472 px',
    note: '数字照参考规格。头部大小、留白、背景和申请渠道仍需按办证机构要求检查。', source: 'https://dj.china-embassy.gov.cn/lsfw/linshizhengjian/huzhaolvxingzheng/202311/P020231126826793735884.pdf' },
  { id: 'civil-service', name: '国考源照片参考', width: 295, height: 413, description: '295 × 413 px · JPEG',
    note: '2027 国考源照片最低为 295 × 413 像素，白底或蓝底；上传前仍须通过官方照片处理工具审核。', source: 'https://shanghai.chinatax.gov.cn/xxgk/rsxx/202610/t481764.html' },
  { id: 'us-visa', name: '美国签证数字照参考', width: 600, height: 600, description: '600 × 600 px · JPEG',
    note: '方形数字照参考。还需检查头部占比、背景及申请渠道的文件体积要求。', source: 'https://travel.state.gov/content/travel/en/us-visas/visa-information-resources/photos.html' },
  { id: 'pixels-150-200', name: '150 × 200 像素', width: 150, height: 200, description: '自定义像素示例', note: '适合只要求指定像素宽高的场景。' }
];
export const defaultResizeSettings: ResizeSettings = {
  presetId: 'one-inch', width: 295, height: 413, dpi: 300,
  fit: 'crop', format: 'jpeg', background: '#ffffff', quality: 90
};
export function validDimensions(width: number, height: number): boolean {
  return Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0 &&
    width <= 20000 && height <= 20000 && width * height <= 40000000;
}
/** Percentages are measured against the EXIF-oriented image, never screen pixels. */
export function aspectCrop(width: number, height: number, aspect: number, previous?: CropRegion): CropRegion {
  const cropWidth = Math.min(previous ? previous.width / 100 * width : width * 0.9,
    height * 0.9 * aspect);
  const cropHeight = cropWidth / aspect;
  const w = cropWidth / width * 100;
  const h = cropHeight / height * 100;
  const cx = previous ? previous.x + previous.width / 2 : 50;
  const cy = previous ? previous.y + previous.height / 2 : 50;
  return { unit: '%', width: w, height: h,
    x: Math.max(0, Math.min(100 - w, cx - w / 2)), y: Math.max(0, Math.min(100 - h, cy - h / 2)) };
}

export type ResizeMode = 'photo' | 'dimensions' | 'ratio' | 'scale';
export interface ResizePreferences extends ResizeSettings {
  mode: ResizeMode;
  unit: 'px' | 'mm' | 'cm';
  physicalWidth: number;
  physicalHeight: number;
  dimensionPolicy: 'exact' | 'width' | 'height' | 'within';
  ratioId: string;
  ratioWidth: number;
  ratioHeight: number;
  ratioOutput: 'selection' | 'width';
  ratioOutputWidth: number;
  scalePercent: number;
  targetEnabled: boolean;
  targetSizeKB: number;
  compressionEnabled: boolean;
  optimizeColors: boolean;
}
export const resizeModes: { id: ResizeMode; label: string; example: string }[] = [
  { id: 'photo', label: '证件照 / 一寸二寸', example: '要求“一寸照片”或“护照照片”' },
  { id: 'dimensions', label: '指定宽高 / 像素', example: '要求 150×200 像素或 3×4 厘米' },
  { id: 'ratio', label: '固定比例裁剪', example: '要求 4:3、16:9、正方形等' },
  { id: 'scale', label: '按百分比缩放', example: '整张图片缩小到 50%，不裁剪' }
];
export const ratioPresets = ['1:1', '4:3', '3:4', '16:9', '9:16', '3:2', '2:3'];
export const defaultResizePreferences: ResizePreferences = {
  ...defaultResizeSettings, mode: 'photo', unit: 'px', physicalWidth: 25, physicalHeight: 35,
  dimensionPolicy: 'exact', ratioId: '4:3', ratioWidth: 4, ratioHeight: 3,
  ratioOutput: 'selection', ratioOutputWidth: 1600, scalePercent: 50, targetEnabled: false, targetSizeKB: 200, compressionEnabled: false, optimizeColors: true
};
export function normalizeResizePreferences(saved: Partial<ResizePreferences> = {}): ResizePreferences {
  const result = { ...defaultResizePreferences, ...saved };
  if (!saved.mode) result.mode = sizePresets.some(preset => preset.id === saved.presetId && preset.id !== 'pixels-150-200') ? 'photo' : saved.presetId ? 'dimensions' : 'photo';
  if (!['photo', 'dimensions', 'ratio', 'scale'].includes(result.mode)) result.mode = 'photo';
  if (!['px', 'mm', 'cm'].includes(result.unit)) result.unit = 'px';
  if (!['exact', 'width', 'height', 'within'].includes(result.dimensionPolicy)) result.dimensionPolicy = 'exact';
  if (!['crop', 'contain', 'stretch'].includes(result.fit)) result.fit = 'crop';
  if (!['jpeg', 'png', 'webp'].includes(result.format)) result.format = 'jpeg';
  if (!/^#[0-9a-f]{6}$/i.test(result.background)) result.background = '#ffffff';
  for (const key of ['width', 'height', 'dpi', 'quality', 'physicalWidth', 'physicalHeight', 'ratioWidth', 'ratioHeight', 'ratioOutputWidth', 'scalePercent', 'targetSizeKB'] as const) {
    if (!Number.isFinite(result[key]) || result[key] <= 0) result[key] = defaultResizePreferences[key];
  }
  if (!Number.isInteger(result.dpi) || result.dpi < 36 || result.dpi > 1200) result.dpi = 300;
  if (!Number.isInteger(result.quality) || result.quality > 100) result.quality = 90;
  if (![...ratioPresets, 'original', 'custom'].includes(result.ratioId)) result.ratioId = '4:3';
  if (!['selection', 'width'].includes(result.ratioOutput)) result.ratioOutput = 'selection';
  result.targetEnabled = result.targetEnabled === true;
  result.compressionEnabled = result.compressionEnabled === true || result.targetEnabled;
  result.optimizeColors = result.optimizeColors === true;
  if (!sizePresets.some(preset => preset.id === result.presetId) && result.mode === 'photo') result.presetId = 'one-inch';
  return result;
}
export interface ResizeSource { width: number; height: number; crop?: CropRegion }
export interface ResizePlan { settings: ResizeSettings; crop?: CropRegion; aspect: number; error?: string; needsImage: boolean }

/** Resolve a user's requirement once; preview and each batch item use this same plan. */
export function resolveResizePlan(preferences: ResizePreferences, source?: ResizeSource): ResizePlan {
  const settings: ResizeSettings = { ...preferences, targetSizeKB: preferences.targetEnabled ? preferences.targetSizeKB : undefined };
  const result: ResizePlan = { settings, aspect: 1, needsImage: false };
  const invalid = (message: string) => ({ ...result, error: message });
  const needsImage = () => ({ ...result, needsImage: true, error: '导入图片后自动计算输出尺寸' });
  if (!Number.isInteger(settings.dpi) || settings.dpi < 36 || settings.dpi > 1200) return invalid('打印分辨率须为 36–1200 的整数；不确定时保持 300 即可。');
  if (preferences.targetEnabled && !preferences.compressionEnabled) return invalid('要限制文件大小，请先开启“同时压缩”。');
  if (preferences.targetEnabled && (!Number.isFinite(preferences.targetSizeKB) || preferences.targetSizeKB < 1)) return invalid('文件大小上限至少为 1 KB。');
  let width = preferences.width;
  let height = preferences.height;
  let ratioWidth = 1;
  let ratioHeight = 1;
  if (preferences.mode === 'photo') {
    const preset = sizePresets.find(item => item.id === preferences.presetId);
    if (!preset) return invalid('请选择证件照尺寸。');
    width = preset.printWidthMM ? Math.round(preset.printWidthMM / 25.4 * settings.dpi) : preset.width;
    height = preset.printHeightMM ? Math.round(preset.printHeightMM / 25.4 * settings.dpi) : preset.height;
  } else if (preferences.mode === 'dimensions') {
    const pixelUnit = preferences.unit === 'px';
    const factor = preferences.unit === 'cm' ? 10 : 1;
    const w = pixelUnit ? preferences.width : preferences.physicalWidth;
    const h = pixelUnit ? preferences.height : preferences.physicalHeight;
    const validLength = (value: number) => Number.isFinite(value) && value > 0 && (!pixelUnit || Number.isInteger(value));
    if ((preferences.dimensionPolicy !== 'height' && !validLength(w)) || (preferences.dimensionPolicy !== 'width' && !validLength(h))) return invalid(pixelUnit ? '请填写大于 0 的整数像素。' : '请填写大于 0 的宽度和高度。');
    width = pixelUnit ? w : Math.round(w * factor / 25.4 * settings.dpi);
    height = pixelUnit ? h : Math.round(h * factor / 25.4 * settings.dpi);
    if (preferences.dimensionPolicy !== 'exact') {
      if (!source) return needsImage();
      const scale = preferences.dimensionPolicy === 'width' ? width / source.width : preferences.dimensionPolicy === 'height' ? height / source.height : Math.min(1, width / source.width, height / source.height);
      width = preferences.dimensionPolicy === 'width' ? width : Math.max(1, Math.round(source.width * scale));
      height = preferences.dimensionPolicy === 'height' ? height : Math.max(1, Math.round(source.height * scale));
      settings.fit = 'stretch'; // The calculated dimensions preserve the source ratio.
    }
  } else if (preferences.mode === 'ratio') {
    if (preferences.ratioId === 'original') {
      if (!source) return needsImage();
      ratioWidth = source.width; ratioHeight = source.height;
    } else if (preferences.ratioId === 'custom') {
      ratioWidth = preferences.ratioWidth; ratioHeight = preferences.ratioHeight;
    } else {
      [ratioWidth, ratioHeight] = preferences.ratioId.split(':').map(Number);
    }
    if (![ratioWidth, ratioHeight].every(value => Number.isInteger(value) && value > 0 && value <= (preferences.ratioId === 'original' ? 100000000 : 20000))) return invalid('请填写有效的宽高比例，例如 4 : 3。');
    result.aspect = ratioWidth / ratioHeight;
    settings.fit = 'crop';
    if (!source) return needsImage();
    if (preferences.ratioOutput === 'width') {
      width = preferences.ratioOutputWidth;
      height = Math.max(1, Math.round(width / result.aspect));
    } else {
      const crop = cropForAspect(source, result.aspect, true);
      // Use an integer multiple so the saved pixels have exactly the chosen ratio.
      const gcd = (a: number, b: number): number => b ? gcd(b, a % b) : a;
      const divisor = gcd(ratioWidth, ratioHeight);
      const rw = ratioWidth / divisor, rh = ratioHeight / divisor;
      const multiple = Math.max(1, Math.floor(Math.min(source.width * crop.width / 100 / rw, source.height * crop.height / 100 / rh) + 1e-8));
      width = rw * multiple; height = rh * multiple;
    }
  } else if (preferences.mode === 'scale') {
    if (!Number.isFinite(preferences.scalePercent) || preferences.scalePercent < 1 || preferences.scalePercent > 400) return invalid('缩放比例须在 1%–400% 之间。');
    if (!source) return needsImage();
    width = Math.max(1, Math.round(source.width * preferences.scalePercent / 100));
    height = Math.max(1, Math.round(source.height * preferences.scalePercent / 100));
    settings.fit = 'stretch';
  } else return invalid('请选择处理方式。');
  if (!validDimensions(width, height)) return invalid('输出宽高须为 1–20000 的整数，总像素不超过 4000 万；请缩小选区或输出尺寸。');
  settings.width = width; settings.height = height;
  if (preferences.mode !== 'ratio') result.aspect = width / height;
  if (settings.fit === 'crop' && source) result.crop = cropForAspect(source, result.aspect, preferences.mode === 'ratio');
  return result;
}
function cropForAspect(source: ResizeSource, aspect: number, fullCoverage = false): CropRegion {
  const crop = source.crop;
  if (crop && (crop.width === 0 || crop.height === 0)) return crop;
  if (crop && crop.width > 0 && crop.height > 0 && Math.abs(crop.width * source.width / (crop.height * source.height) / aspect - 1) < 0.0001) return crop;
  if (!crop && fullCoverage) {
    const width = Math.min(100, 100 * source.height / source.width * aspect);
    const height = width * source.width / source.height / aspect;
    return { unit: '%', width, height, x: (100 - width) / 2, y: (100 - height) / 2 };
  }
  return aspectCrop(source.width, source.height, aspect, crop);
}
