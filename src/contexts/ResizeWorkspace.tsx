import { createContext, useContext, useEffect, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { defaultResizeSettings, validDimensions, type CropRegion, type ResizeSettings } from '../lib/resize-settings';
import type { ProcessedImage } from '../types/global';
export interface ResizeItem {
  id: string; name: string; path: string; previewUrl: string; width: number; height: number;
  crop?: CropRegion; warning?: string; error?: string; result?: ProcessedImage; resultUrl?: string;
}
interface Workspace {
  items: ResizeItem[]; setItems: Dispatch<SetStateAction<ResizeItem[]>>;
  selected: string; setSelected: Dispatch<SetStateAction<string>>;
  settings: ResizeSettings; setSettings: Dispatch<SetStateAction<ResizeSettings>>;
  processing: boolean; setProcessing: Dispatch<SetStateAction<boolean>>;
  message: string; setMessage: Dispatch<SetStateAction<string>>;
}
const Context = createContext<Workspace | undefined>(undefined);
function loadSettings(): ResizeSettings {
  try {
    const saved = JSON.parse(localStorage.getItem('resizeSettings') || 'null');
    if (saved && validDimensions(saved.width, saved.height) && ['crop', 'contain', 'stretch'].includes(saved.fit) &&
      ['jpeg', 'png', 'webp'].includes(saved.format) && /^#[0-9a-f]{6}$/i.test(saved.background) &&
      Number.isInteger(saved.dpi) && saved.dpi >= 36 && saved.dpi <= 1200 && Number.isInteger(saved.quality) && saved.quality > 0 && saved.quality <= 100) {
      return { ...defaultResizeSettings, ...saved };
    }
  } catch { /* An invalid previous setting falls back to the defaults. */ }
  return defaultResizeSettings;
}
export function ResizeWorkspaceProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ResizeItem[]>([]);
  const [selected, setSelected] = useState('');
  const [settings, setSettings] = useState<ResizeSettings>(loadSettings);
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    if (validDimensions(settings.width, settings.height)) localStorage.setItem('resizeSettings', JSON.stringify(settings));
  }, [settings]);
  return <Context.Provider value={{ items, setItems, selected, setSelected, settings, setSettings, processing, setProcessing, message, setMessage }}>{children}</Context.Provider>;
}
export function useResizeWorkspace() {
  const workspace = useContext(Context);
  if (!workspace) throw new Error('Missing resize workspace');
  return workspace;
}
