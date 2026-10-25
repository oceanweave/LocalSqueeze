/**
 * JPEG图片压缩处理模块
 * 使用sharp和mozjpeg优化JPEG图像
 */

import { compressImage, CompressionSettings, CompressionResult } from './index';

/**
 * JPEG专用压缩设置
 */
export interface JpegCompressionSettings extends CompressionSettings {
  progressive: boolean; // 是否使用渐进式JPEG
  trellisQuantisation: boolean; // 是否使用Trellis量化
  overshootDeringing: boolean; // 是否使用过冲去振铃
  optimizeScans: boolean; // 是否优化扫描
}

/**
 * 压缩JPEG图片
 * @param inputPath 输入文件路径
 * @param outputPath 输出文件路径
 * @param settings 压缩设置
 * @returns 压缩结果
 */
export async function compressJpeg(
  inputPath: string,
  outputPath: string,
  settings: JpegCompressionSettings
): Promise<CompressionResult> {
  return compressImage(inputPath, outputPath, settings);
}

/**
 * 获取JPEG优化的默认设置
 * @returns JPEG压缩设置
 */
export function getDefaultJpegSettings(): JpegCompressionSettings {
  return {
    quality: 75,
    keepDimensions: true,
    keepFormat: true,
    removeMetadata: true,
    optimizeColors: false,
    progressive: true,
    trellisQuantisation: true,
    overshootDeringing: true,
    optimizeScans: true
  };
}

/**
 * 获取JPEG高质量设置
 * @returns JPEG压缩设置
 */
export function getHighQualityJpegSettings(): JpegCompressionSettings {
  return {
    quality: 85,
    keepDimensions: true,
    keepFormat: true,
    removeMetadata: true,
    optimizeColors: false,
    progressive: true,
    trellisQuantisation: true,
    overshootDeringing: true,
    optimizeScans: false
  };
}

/**
 * 获取JPEG高压缩设置
 * @returns JPEG压缩设置
 */
export function getHighCompressionJpegSettings(): JpegCompressionSettings {
  return {
    quality: 60,
    keepDimensions: true,
    keepFormat: true,
    removeMetadata: true,
    optimizeColors: false,
    progressive: true,
    trellisQuantisation: true,
    overshootDeringing: true,
    optimizeScans: true
  };
}