import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
// eslint-disable-next-line import/no-unresolved
import { CompressionSettings } from "../types/global";
import path from 'path';
import { defaultCompressionPreferences, normalizeCompressionPreferences } from './compression-settings';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * 格式化文件大小
 * @param bytes 字节数
 * @returns 格式化后的字符串
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * 计算压缩率
 * @param originalSize 原始大小（字节）
 * @param compressedSize 压缩后大小（字节）
 * @returns 压缩率百分比字符串
 */
export function calculateCompressionRate(originalSize: number, compressedSize: number): string {
  if (originalSize === 0) return '0%';
  
  const rate = ((originalSize - compressedSize) / originalSize) * 100;
  return `${rate.toFixed(1)}%`;
}

/**
 * 获取文件扩展名
 * @param fileName 文件名
 * @returns 扩展名（小写）
 */
export function getFileExtension(fileName: string): string {
  return fileName.split('.').pop()?.toLowerCase() || '';
}

/**
 * 根据命名模板生成输出文件名
 * @param originalPath 原始文件路径
 * @param fileNaming 文件命名模板
 * @param outputFormat 输出格式
 * @param keepFormat 是否保持原始格式
 * @returns 生成的文件名
 */
export function generateOutputFileName(
  originalPath: string, 
  fileNaming = '{filename}_compressed',
  outputFormat?: string,
  keepFormat = true
): string {
  const fileName = path.basename(originalPath);
  const fileExt = path.extname(originalPath);
  const fileNameWithoutExt = path.basename(fileName, fileExt);
  const originalExt = fileExt.substring(1).toLowerCase(); // 去掉点号
  
  // 替换文件名模板中的变量
  const outputFileName = fileNaming.replace(/\{filename\}/g, fileNameWithoutExt)
    .replace(/\{timestamp\}/g, String(Date.now())).replace(/[\\/:*?"<>|]/g, '_');
  
  // 根据是否保持原始格式决定扩展名
  const finalExt = keepFormat ? originalExt : (outputFormat || originalExt);
  const outputExtension = '.' + finalExt.toLowerCase();
  
  const result = outputFileName + outputExtension;
  
  return result;
}

/**
 * 保存压缩设置到配置文件
 * @param settings 压缩设置
 */
export async function saveCompressionSettings(settings: any): Promise<void> {
  if (window.compression?.saveCompressionSettings) {
    const result = await window.compression.saveCompressionSettings(settings);
    if (!result.success) throw new Error(result.error || '保存压缩设置失败');
  } else {
    localStorage.setItem('compressionSettings', JSON.stringify(settings));
  }
}

export async function getCompressionSettings(): Promise<any> {
  if (window.compression?.getCompressionSettings) {
    const result = await window.compression.getCompressionSettings();
    if (result.success && result.settings) return normalizeCompressionPreferences(result.settings);
    throw new Error(result.error || '加载压缩设置失败');
  }
  const saved = localStorage.getItem('compressionSettings');
  return normalizeCompressionPreferences(saved ? JSON.parse(saved) : {});
}

/** Translate saved preferences into validated encoder options. Disabled size targets are omitted. */
export function buildCompressionSettings(settings: any): CompressionSettings {
  const saved = { ...defaultCompressionPreferences, ...settings };
  return {
    quality: Math.max(1, Math.min(100, Number.isFinite(Number(saved.quality)) ? Math.round(Number(saved.quality)) : 60)),
    keepDimensions: saved.keepDimensions,
    keepFormat: saved.keepFormat,
    keepRatio: saved.keepRatio,
    width: Math.max(1, Math.round(Number(saved.width) || 1920)),
    height: Math.max(1, Math.round(Number(saved.height) || 1080)),
    removeMetadata: saved.removeMetadata,
    optimizeColors: saved.optimizeColors,
    progressive: saved.progressive,
    outputFormat: saved.outputFormat.toLowerCase(),
    fileNaming: saved.fileNaming || '{filename}_compressed',
    targetSizeKB: saved.targetEnabled ? Number(saved.targetSizeKB) : undefined,
    targetAllowResize: saved.targetAllowResize
  };
}
