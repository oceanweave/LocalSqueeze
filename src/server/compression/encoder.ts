import sharp from 'sharp';
import path from 'path';
import fs from 'fs/promises';
import type { CompressionSettings, CompressionResult } from './index';

/** Encode every input through the selected output format, including target-size searches. */
export async function encodeImage(inputPath: string, outputPath: string, settings: CompressionSettings): Promise<CompressionResult> {
  try {
    if (path.resolve(inputPath) === path.resolve(outputPath)) throw new Error('输出路径不能覆盖原始图片');
    const originalSize = (await fs.stat(inputPath)).size;
    const metadata = await sharp(inputPath, { animated: true }).metadata();
    const originalFormat = metadata.format || path.extname(inputPath).slice(1).toLowerCase();
    const requestedFormat = settings.keepFormat ? originalFormat : (settings.outputFormat || originalFormat).toLowerCase();
    const format = requestedFormat === 'jpg' ? 'jpeg' : requestedFormat;
    if (!['jpeg', 'png', 'webp', 'avif', 'gif', 'tiff'].includes(format)) {
      throw new Error(`不支持输出 ${format} 格式，请在压缩设置中选择 PNG、JPEG 或 WebP`);
    }
    const targetKB = settings.targetEnabled === false ? undefined : settings.targetSizeKB;
    if (targetKB !== undefined && (!Number.isFinite(targetKB) || targetKB <= 0)) {
      throw new Error('目标体积必须为大于 0 的有效数值');
    }
    // A target means strictly less than the limit, rather than a quality percentage.
    const limit = targetKB === undefined ? undefined : Math.ceil(targetKB * 1024) - 1;
    const quality = Math.max(1, Math.min(100, Math.round(Number(settings.quality) || 1)));
    const animated = (metadata.pages || 1) > 1 && ['gif', 'webp'].includes(format);
    const swapAxes = !animated && (metadata.orientation || 0) >= 5;
    let width = (swapAxes ? metadata.height : metadata.width) || 1;
    let height = (swapAxes ? metadata.width : metadata.pageHeight || metadata.height) || 1;
    if (!settings.keepDimensions && settings.width && settings.height) {
      if (settings.keepRatio === false) {
        width = Math.min(width, Math.max(1, Math.round(settings.width)));
        height = Math.min(height, Math.max(1, Math.round(settings.height)));
      } else {
        const scale = Math.min(1, settings.width / width, settings.height / height);
        width = Math.max(1, Math.round(width * scale));
        height = Math.max(1, Math.round(height * scale));
      }
    }
    const encode = async (q: number, w: number, h: number): Promise<Buffer> => {
      let image = sharp(inputPath, { animated });
      if (!animated) image = image.autoOrient();
      image = image.resize({ width: w, height: h, fit: settings.keepRatio === false ? 'fill' : 'inside', withoutEnlargement: true });
      switch (format) {
        case 'png': {
          const palette = settings.optimizeColors || limit !== undefined;
          image = image.png({ compressionLevel: 9, adaptiveFiltering: true, palette,
            ...(palette ? { quality: q, colours: Math.max(2, Math.round(2 + 254 * Math.pow(q / 100, 1.6))), dither: 0 } : {}) });
          break;
        }
        case 'jpeg':
          image = image.flatten({ background: '#ffffff' }).jpeg({ quality: q, mozjpeg: true, progressive: settings.progressive });
          break;
        case 'webp': image = image.webp({ quality: q, effort: 5 }); break;
        case 'avif': image = image.avif({ quality: q, effort: 4 }); break;
        case 'gif': image = image.gif({ colours: Math.max(2, Math.round(2 + 254 * q / 100)), dither: 0 }); break;
        case 'tiff': image = image.tiff({ quality: q, compression: 'lzw' }); break;
      }
      // Sharp strips metadata by default. withMetadata() adds it back.
      if (!settings.removeMetadata) image = image.keepMetadata();
      return image.toBuffer();
    };

    let output = await encode(quality, width, height);
    if (limit !== undefined && output.length > limit) {
      // Prefer readable quality with resizing; at fixed dimensions try the full quality range.
      const minimumQuality = settings.targetAllowResize ? Math.min(quality, 20) : 1;
      for (let attempt = 0; attempt < 16; attempt++) {
        const smallest = await encode(minimumQuality, width, height);
        if (smallest.length < output.length) output = smallest;
        if (smallest.length <= limit) {
          let best = smallest;
          let low = minimumQuality + 1;
          let high = quality;
          // Keep the highest tested quality that meets the measured byte limit.
          while (low <= high) {
            const mid = Math.floor((low + high) / 2);
            const candidate = await encode(mid, width, height);
            if (candidate.length <= limit) { best = candidate; low = mid + 1; }
            else high = mid - 1;
          }
          output = best;
          break;
        }
        if (!settings.targetAllowResize || (width === 1 && height === 1)) break;
        const scale = Math.min(0.85, Math.max(0.1, Math.sqrt(limit / smallest.length) * 0.9));
        width = Math.max(1, Math.floor(width * scale));
        height = Math.max(1, Math.floor(height * scale));
        const candidate = await encode(quality, width, height);
        if (candidate.length < output.length) output = candidate;
        if (candidate.length <= limit) { output = candidate; break; }
      }
    }
    const hasMetadata = metadata.exif || metadata.icc || metadata.iptc || metadata.xmp;
    if (format === originalFormat && settings.keepDimensions && output.length >= originalSize &&
      (!settings.removeMetadata || !hasMetadata)) {
      output = await fs.readFile(inputPath);
    }
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, output);
    const actual = await sharp(output, { animated: true }).metadata();
    const targetMet = limit === undefined ? undefined : output.length <= limit;
    return {
      success: true, originalPath: inputPath, outputPath,
      originalSize, compressedSize: output.length,
      compressionRate: `${((originalSize - output.length) / originalSize * 100).toFixed(1)}%`,
      originalFormat, outputFormat: actual.format || format,
      width: actual.width || 0, height: actual.pageHeight || actual.height || 0,
      targetSizeKB: targetKB, targetMet,
      warning: targetMet === false ? `未达到小于 ${targetKB} KB 的目标。可允许自动缩小尺寸、改用 WebP 或提高目标体积。` : undefined
    };
  } catch (error) {
    return { success: false, originalPath: inputPath, outputPath: '', originalSize: 0, compressedSize: 0,
      compressionRate: '0%', originalFormat: '', outputFormat: '', width: 0, height: 0,
      error: error instanceof Error ? error.message : '压缩失败' };
  }
}
