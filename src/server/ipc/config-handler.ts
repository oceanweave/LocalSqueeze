import { ipcMain, app } from 'electron';
import fs from 'fs/promises';
import path from 'path';
import { defaultCompressionPreferences, normalizeCompressionPreferences } from '../../lib/compression-settings';

const CONFIG_DIR = path.join(app.getPath('userData'), 'config');
const CONFIG_FILE = path.join(CONFIG_DIR, 'compression-settings.json');
let writes: Promise<void> = Promise.resolve();

export function initConfigHandlers() {
  ipcMain.handle('save-compression-settings', async (_, settings) => {
    // Serialize writes and rename atomically, so fast slider changes cannot leave
    // truncated JSON or an older preference winning a race with a newer one.
    const write = writes.then(async () => {
      await fs.mkdir(CONFIG_DIR, { recursive: true });
      const temporary = `${CONFIG_FILE}.tmp`;
      await fs.writeFile(temporary, JSON.stringify(settings, null, 2), 'utf-8');
      await fs.rename(temporary, CONFIG_FILE);
    });
    writes = write.catch(() => { /* Report failure to the originating request. */ });
    try { await write; return { success: true }; }
    catch (error) { return { success: false, error: error.message }; }
  });
  ipcMain.handle('get-compression-settings', async () => {
    await writes;
    try {
      const data = await fs.readFile(CONFIG_FILE, 'utf-8');
      return { success: true, settings: normalizeCompressionPreferences(JSON.parse(data)) };
    } catch (error) {
      if (error.code === 'ENOENT') return { success: true, settings: defaultCompressionPreferences };
      return { success: false, error: error.message };
    }
  });
}
