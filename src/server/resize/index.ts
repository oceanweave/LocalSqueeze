import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { app, ipcMain } from 'electron';
import { validDimensions, type CropRegion, type ResizeSettings } from '../../lib/resize-settings';

const inputOptions = { limitInputPixels: 100000000, failOn: 'error' as const };
export function initResizeHandlers() {
  ipcMain.handle('get-image-thumbnail', async (_, imagePath: string) => {
    try {
      const preview = await sharp(imagePath, inputOptions).autoOrient()
        .resize({ width: 400, height: 260, fit: 'inside', withoutEnlargement: true }).png().toBuffer();
      return 'data:image/png;base64,' + preview.toString('base64');
    } catch { return undefined; }
  });
  ipcMain.handle('prepare-resize-image', async (_, imagePath: string) => {
    try {
      const image = sharp(imagePath, inputOptions);
      const metadata = await image.metadata();
      const swapped = (metadata.orientation || 1) >= 5;
      const width = (swapped ? metadata.height : metadata.width) || 0;
      const height = (swapped ? metadata.width : metadata.height) || 0;
      const preview = await image.autoOrient().resize({ width: 1400, height: 1400, fit: 'inside', withoutEnlargement: true }).png().toBuffer();
      return { success: true, width, height, previewUrl: 'data:image/png;base64,' + preview.toString('base64'),
        warning: (metadata.pages || 1) > 1 ? '多帧图片仅处理第一帧；原文件不会改变。' : undefined };
    } catch (error) { return { success: false, error: error instanceof Error ? error.message : '图片无法读取' }; }
  });
  ipcMain.handle('resize-image', async (_, args: { imagePath: string; name: string; settings: ResizeSettings; crop?: CropRegion }) => {
    try {
      const { imagePath, settings, crop } = args;
      if (!validDimensions(settings.width, settings.height)) throw new Error('宽高须为 1–20000 的整数，且总像素不超过 4000 万');
      if (!Number.isInteger(settings.dpi) || settings.dpi < 36 || settings.dpi > 1200) throw new Error('DPI 须为 36–1200 的整数');
      if (!['crop', 'contain', 'stretch'].includes(settings.fit)) throw new Error('无效的尺寸调整方式');
      if (!['jpeg', 'png', 'webp'].includes(settings.format)) throw new Error('请选择 JPEG、PNG 或 WebP 输出');
      if (!/^#[0-9a-f]{6}$/i.test(settings.background)) throw new Error('无效的填充颜色');
      if (!Number.isInteger(settings.quality) || settings.quality < 1 || settings.quality > 100) throw new Error('质量须为 1–100 的整数');
      const originalSize = (await fs.stat(imagePath)).size;
      const metadata = await sharp(imagePath, inputOptions).metadata();
      const swapped = (metadata.orientation || 1) >= 5;
      const sourceWidth = (swapped ? metadata.height : metadata.width) || 0;
      const sourceHeight = (swapped ? metadata.width : metadata.height) || 0;
      let image = sharp(imagePath, inputOptions).autoOrient();
      if (settings.fit === 'crop') {
        if (!crop || [crop.x, crop.y, crop.width, crop.height].some(value => !Number.isFinite(value)) ||
          crop.x < 0 || crop.y < 0 || crop.width <= 0 || crop.height <= 0 || crop.x + crop.width > 100.001 || crop.y + crop.height > 100.001) {
          throw new Error('请在图片范围内选择有效的裁剪区域');
        }
        const left = Math.min(sourceWidth - 1, Math.round(crop.x / 100 * sourceWidth));
        const top = Math.min(sourceHeight - 1, Math.round(crop.y / 100 * sourceHeight));
        const width = Math.min(sourceWidth - left, Math.max(1, Math.round(crop.width / 100 * sourceWidth)));
        const height = Math.min(sourceHeight - top, Math.max(1, Math.round(crop.height / 100 * sourceHeight)));
        // Small rounding differences are cropped, rather than stretching the subject.
        image = image.extract({ left, top, width, height });
      }
      image = image.resize({ width: settings.width, height: settings.height,
        fit: settings.fit === 'contain' ? 'contain' : settings.fit === 'stretch' ? 'fill' : 'cover', background: settings.background });
      // Start a new pipeline from oriented sRGB pixels: retain DPI, not source EXIF/GPS.
      const pixels = await image.toColourspace('srgb').raw().toBuffer({ resolveWithObject: true });
      image = sharp(pixels.data, { raw: { width: pixels.info.width, height: pixels.info.height, channels: pixels.info.channels } })
        .withMetadata({ density: settings.dpi });
      if (settings.format === 'jpeg') image = image.flatten({ background: settings.background }).jpeg({ quality: settings.quality, mozjpeg: true });
      if (settings.format === 'png') image = image.png({ compressionLevel: 9, adaptiveFiltering: true, palette: false });
      if (settings.format === 'webp') image = image.webp({ quality: settings.quality });
      const id = randomUUID();
      const extension = settings.format === 'jpeg' ? 'jpg' : settings.format;
      const base = Array.from(path.parse(path.basename(args.name || imagePath)).name.replace(/[\\/:*?"<>|]/g, '_')).slice(0, 50).join('') || 'image';
      const name = `${base}_${settings.width}x${settings.height}.${extension}`;
      const directory = path.join(app.getPath('userData'), 'resized-images', id);
      await fs.mkdir(directory, { recursive: true });
      const outputPath = path.join(directory, name);
      const info = await image.toFile(outputPath);
      return { success: true, image: { id, name, originalPath: imagePath, outputPath, originalSize,
        compressedSize: info.size, compressionRate: `${((originalSize - info.size) / originalSize * 100).toFixed(1)}%`,
        width: info.width, height: info.height, format: settings.format, processedAt: Date.now(), operation: 'resize',
        warning: (metadata.pages || 1) > 1 ? '仅处理了第一帧' : undefined } };
    } catch (error) { return { success: false, error: error instanceof Error ? error.message : '尺寸处理失败' }; }
  });
}
