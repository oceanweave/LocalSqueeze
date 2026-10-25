/**
 * 图片压缩服务主入口
 * 处理不同格式图片的压缩逻辑
 */

import path from 'path';
import fs from 'fs/promises';
import { encodeImage } from './encoder';

// 压缩设置类型定义
export interface CompressionSettings {
  quality: number; // 压缩质量 (1-100)
  keepDimensions: boolean; // 是否保持原始尺寸
  keepRatio?: boolean;
  width?: number; // 输出宽度
  height?: number; // 输出高度
  keepFormat: boolean; // 是否保持原始格式
  outputFormat?: string; // 输出格式
  removeMetadata: boolean; // 是否移除元数据
  optimizeColors: boolean; // 是否优化颜色（主要用于PNG）
  progressive: boolean; // 是否使用渐进式（主要用于JPEG）
  targetEnabled?: boolean;
  targetSizeKB?: number;
  targetAllowResize?: boolean;
}

// 压缩结果类型定义
export interface CompressionResult {
  success: boolean;
  originalPath: string;
  outputPath: string;
  originalSize: number;
  compressedSize: number;
  compressionRate: string;
  originalFormat: string;
  outputFormat: string;
  width: number;
  height: number;
  error?: string;
  targetSizeKB?: number;
  targetMet?: boolean;
  warning?: string;
}

/**
 * 压缩单个图片
 * @param inputPath 输入文件路径
 * @param outputPath 输出文件路径
 * @param settings 压缩设置
 * @returns 压缩结果
 */
export async function compressImage(
  inputPath: string,
  outputPath: string,
  settings: CompressionSettings
): Promise<CompressionResult> {
  return encodeImage(inputPath, outputPath, settings);
}

/**
 * 批量压缩图片
 * @param inputPaths 输入文件路径数组
 * @param outputDir 输出目录
 * @param settings 压缩设置
 * @param progressCallback 进度回调函数
 * @returns 压缩结果数组
 */
export async function batchCompressImages(
  inputPaths: string[],
  outputDir: string,
  settings: CompressionSettings,
  progressCallback?: (current: number, total: number, result?: CompressionResult) => void
): Promise<CompressionResult[]> {
  const results: CompressionResult[] = [];
  const total = inputPaths.length;
  
  // 确保输出目录存在
  await fs.mkdir(outputDir, { recursive: true });
  
  for (let i = 0; i < total; i++) {
    const inputPath = inputPaths[i];
    const fileName = path.basename(inputPath);
    const fileExt = path.extname(fileName);
    const fileNameWithoutExt = path.basename(fileName, fileExt);
    
    // 确定输出格式
    let outputExt = fileExt;
    if (!settings.keepFormat && settings.outputFormat) {
      outputExt = `.${settings.outputFormat.toLowerCase()}`;
    }
    
    // 构建输出文件路径
    const outputPath = path.join(outputDir, `${fileNameWithoutExt}_compressed${outputExt}`);
    
    // 压缩单个图片 - 使用设置的深拷贝，确保每个图片使用独立的设置副本
    const result = await compressImage(inputPath, outputPath, { ...settings });
    results.push(result);
    
    // 调用进度回调
    if (progressCallback) {
      progressCallback(i + 1, total, result);
    }
  }
  
  return results;
}

/**
 * 获取预设压缩设置
 * @param presetName 预设名称
 * @returns 压缩设置
 */
export function getPresetSettings(presetName: string): CompressionSettings {
  switch (presetName) {
    case '低压缩':
      return {
        quality: 80,
        keepDimensions: true,
        keepFormat: true,
        removeMetadata: true,
        optimizeColors: true,
        progressive: false
      };
    
    case '中等压缩':
      return {
        quality: 60,
        keepDimensions: true,
        keepFormat: true,
        removeMetadata: true,
        optimizeColors: true,
        progressive: true
      };
    
    case '高压缩':
      return {
        quality: 40,
        keepDimensions: true,
        keepFormat: true,
        removeMetadata: true,
        optimizeColors: true,
        progressive: true
      };
    
    case 'Web优化':
      return {
        quality: 70,
        keepDimensions: false,
        width: 1920,
        height: 1080,
        keepFormat: false,
        outputFormat: 'webp',
        removeMetadata: true,
        optimizeColors: true,
        progressive: true
      };
    
    default:
      // 默认为中等压缩
      return {
        quality: 70,
        keepDimensions: true,
        keepFormat: true,
        removeMetadata: true,
        optimizeColors: false,
        progressive: false
      };
  }
}
