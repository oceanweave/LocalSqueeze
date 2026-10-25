import type { CompressionSettings } from '../types/global';

export interface CompressionPreferences extends CompressionSettings {
  settingsVersion: number;
  preset: string;
  width: number;
  height: number;
  keepRatio: boolean;
  outputFormat: string;
  fileNaming: string;
  targetEnabled: boolean;
  targetSizeKB: number;
  targetAllowResize: boolean;
}

export const defaultCompressionPreferences: CompressionPreferences = {
  settingsVersion: 2,
  preset: '中等压缩', quality: 60,
  keepDimensions: true, width: 1920, height: 1080, keepRatio: true,
  keepFormat: true, outputFormat: 'png', fileNaming: '{filename}_compressed',
  removeMetadata: true, optimizeColors: true, progressive: false,
  targetEnabled: false, targetSizeKB: 200, targetAllowResize: true
};

export function normalizeCompressionPreferences(saved: Partial<CompressionPreferences> = {}): CompressionPreferences {
  const preferences = { ...defaultCompressionPreferences, ...saved };
  // Older releases always used a PNG palette, even while the disabled UI flag
  // said false. Preserve that behavior and make the control reflect it.
  if (!saved.settingsVersion) preferences.optimizeColors = true;
  preferences.settingsVersion = 2;
  preferences.quality = Math.max(1, Math.min(100, Number.isFinite(Number(preferences.quality)) ? Number(preferences.quality) : 60));
  preferences.outputFormat = String(preferences.outputFormat || 'png').toLowerCase();
  if (({ '低压缩': 80, '中等压缩': 60, '高压缩': 40 }[preferences.preset]) !== preferences.quality) {
    preferences.preset = '自定义';
  }
  return preferences;
}
