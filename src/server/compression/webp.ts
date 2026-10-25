/**
 * WebP图片压缩处理模块
 * 使用sharp优化WebP图像
 */

import { compressImage, CompressionSettings, CompressionResult } from './index';

/**
 * WebP专用压缩设置
 */
export interface WebpCompressionSettings extends CompressionSettings {
  lossless: boolean; // 是否使用无损压缩
  nearLossless: boolean; // 是否使用接近无损的压缩
  smartSubsample: boolean; // 是否使用智能二次采样
  effort: number; // 压缩努力程度 (0-6)
}

/**
 * 压缩WebP图片
 * @param inputPath 输入文件路径
 * @param outputPath 输出文件路径
 * @param settings 压缩设置
 * @returns 压缩结果
 */
export async function compressWebp(
  inputPath: string,
  outputPath: string,
  settings: WebpCompressionSettings
): Promise<CompressionResult> {
  return compressImage(inputPath, outputPath, settings);
}

/**
 * 将其他格式转换为WebP
 * @param inputPath 输入文件路径
 * @param outputPath 输出文件路径
 * @param settings 压缩设置
 * @returns 压缩结果
 */
export async function convertToWebp(
  inputPath: string,
  outputPath: string,
  settings: WebpCompressionSettings
): Promise<CompressionResult> {
  // 确保输出路径以.webp结尾
  if (!outputPath.toLowerCase().endsWith('.webp')) {
    outputPath = outputPath + '.webp';
  }
  
  // 调用标准的WebP压缩函数
  return compressWebp(inputPath, outputPath, { ...settings, keepFormat: false, outputFormat: 'webp' });
}

/**
 * 获取WebP优化的默认设置
 * @returns WebP压缩设置
 */
export function getDefaultWebpSettings(): WebpCompressionSettings {
  return {
    quality: 75,
    keepDimensions: true,
    keepFormat: true,
    removeMetadata: true,
    optimizeColors: true,
    progressive: false,
    lossless: false,
    nearLossless: false,
    smartSubsample: true,
    effort: 4
  };
}

/**
 * 获取WebP高质量设置
 * @returns WebP压缩设置
 */
export function getHighQualityWebpSettings(): WebpCompressionSettings {
  return {
    quality: 90,
    keepDimensions: true,
    keepFormat: true,
    removeMetadata: true,
    optimizeColors: true,
    progressive: false,
    lossless: true,
    nearLossless: true,
    smartSubsample: true,
    effort: 6
  };
}

/**
 * 获取WebP高压缩设置
 * @returns WebP压缩设置
 */
export function getHighCompressionWebpSettings(): WebpCompressionSettings {
  return {
    quality: 60,
    keepDimensions: true,
    keepFormat: true,
    removeMetadata: true,
    optimizeColors: true,
    progressive: false,
    lossless: false,
    nearLossless: false,
    smartSubsample: true,
    effort: 2
  };
}