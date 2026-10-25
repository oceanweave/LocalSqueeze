/**
 * PNG图片压缩处理模块
 * 使用sharp和pngquant优化PNG图像
 */

import { compressImage, CompressionSettings, CompressionResult } from './index';

/**
 * PNG专用压缩设置
 */
export interface PngCompressionSettings extends CompressionSettings {
  compressionLevel: number; // 压缩级别 (0-9)
  adaptiveFiltering: boolean; // 是否使用自适应过滤
  palette: boolean; // 是否使用调色板
  dither: number; // 抖动级别 (0-1)
  colors: number; // 颜色数量 (2-256)
}

/**
 * 压缩PNG图片
 * @param inputPath 输入文件路径
 * @param outputPath 输出文件路径
 * @param settings 压缩设置
 * @returns 压缩结果
 */
export async function compressPng(
  inputPath: string,
  outputPath: string,
  settings: PngCompressionSettings
): Promise<CompressionResult> {
  return compressImage(inputPath, outputPath, settings);
}

/**
 * 获取PNG优化的默认设置
 * @returns PNG压缩设置
 */
export function getDefaultPngSettings(): PngCompressionSettings {
  return {
    quality: 80,
    keepDimensions: true,
    keepFormat: true,
    removeMetadata: true,
    optimizeColors: true,
    progressive: false,
    compressionLevel: 9,
    adaptiveFiltering: true,
    palette: true,
    dither: 1.0,
    colors: 256
  };
}

/**
 * 获取PNG高质量设置
 * @returns PNG压缩设置
 */
export function getHighQualityPngSettings(): PngCompressionSettings {
  return {
    quality: 90,
    keepDimensions: true,
    keepFormat: true,
    removeMetadata: true,
    optimizeColors: true,
    progressive: false,
    compressionLevel: 7,
    adaptiveFiltering: true,
    palette: false,
    dither: 0,
    colors: 256
  };
}

/**
 * 获取PNG高压缩设置
 * @returns PNG压缩设置
 */
export function getHighCompressionPngSettings(): PngCompressionSettings {
  return {
    quality: 60,
    keepDimensions: true,
    keepFormat: true,
    removeMetadata: true,
    optimizeColors: true,
    progressive: false,
    compressionLevel: 9,
    adaptiveFiltering: true,
    palette: true,
    dither: 1.0,
    colors: 128
  };
}