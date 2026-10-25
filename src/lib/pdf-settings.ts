export type PdfPreset = 'lossless' | 'balanced' | 'strong' | 'custom';
export interface PdfSettings {
  preset: PdfPreset;
  imageQuality: number;
  targetEnabled: boolean;
  targetSizeMB: number;
}
export const pdfPresets = [
  { id: 'lossless', label: '无损整理', description: '保持图片原样，整理内部结构。适合文字、图纸和需要保留画质的文件。' },
  { id: 'balanced', label: '均衡压缩', description: '推荐。适度压缩内嵌图片，兼顾清晰度与体积，适合一般文档和扫描件。' },
  { id: 'strong', label: '强力压缩', description: '降低内嵌图片质量，优先减小体积。适合发送、上传，细节可能变模糊。' },
  { id: 'custom', label: '自定义', description: '自行调整内嵌图片质量。数值越低，体积通常越小。' }
] as const;
export function normalizePdfSettings(value: Partial<PdfSettings> = {}): PdfSettings {
  const preset = pdfPresets.find(item => item.id === value.preset)?.id || 'balanced';
  const quality = value.imageQuality ?? 75;
  const target = value.targetSizeMB ?? 2;
  return {
    preset,
    imageQuality: preset === 'strong' ? 45 : preset === 'custom' && Number.isFinite(quality) ? Math.round(Math.min(95, Math.max(20, quality))) : 75,
    targetEnabled: value.targetEnabled === true,
    targetSizeMB: Number.isFinite(target) && target >= 0.01 && target <= 150 ? target : 2
  };
}
