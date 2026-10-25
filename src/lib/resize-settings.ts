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
}
export interface SizePreset {
  id: string; name: string; width: number; height: number;
  description: string; note: string; source?: string;
}
export const sizePresets: SizePreset[] = [
  { id: 'one-inch', name: '一寸', width: 295, height: 413, description: '25 × 35 mm · 300 DPI',
    note: '常用一寸规格。打印时请按实际尺寸输出。', source: 'https://rsj.beijing.gov.cn/ywsite/bjpta/fwzn/cjwt/bm/cz/qgpt/202108/t20210821_2473438.html' },
  { id: 'two-inch', name: '二寸', width: 413, height: 579, description: '35 × 49 mm · 300 DPI',
    note: '常用二寸规格，与小二寸、护照照片不同；请按接收方要求选择。' },
  { id: 'passport-paper', name: '中国护照纸质照参考', width: 390, height: 567, description: '33 × 48 mm · 300 DPI',
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
