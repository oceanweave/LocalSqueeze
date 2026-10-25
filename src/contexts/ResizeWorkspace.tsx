import { createContext, useContext, useEffect, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { normalizeResizePreferences, type CropRegion, type ResizePreferences } from '../lib/resize-settings';
import type { ProcessedImage } from '../types/global';
export interface ResizeItem {
  id: string; name: string; path: string; previewUrl: string; width: number; height: number;
  crop?: CropRegion; warning?: string; error?: string; result?: ProcessedImage; resultUrl?: string;
}
interface Workspace {
  items: ResizeItem[]; setItems: Dispatch<SetStateAction<ResizeItem[]>>;
  selected: string; setSelected: Dispatch<SetStateAction<string>>;
  settings: ResizePreferences; setSettings: Dispatch<SetStateAction<ResizePreferences>>;
  processing: boolean; setProcessing: Dispatch<SetStateAction<boolean>>;
  message: string; setMessage: Dispatch<SetStateAction<string>>;
}
const Context = createContext<Workspace | undefined>(undefined);
function loadSettings(): ResizePreferences {
  try { return normalizeResizePreferences(JSON.parse(localStorage.getItem('resizeSettings') || '{}')); }
  catch { return normalizeResizePreferences(); }
}
export function ResizeWorkspaceProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ResizeItem[]>([]);
  const [selected, setSelected] = useState('');
  const [settings, setSettings] = useState<ResizePreferences>(loadSettings);
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    localStorage.setItem('resizeSettings', JSON.stringify(settings));
  }, [settings]);
  return <Context.Provider value={{ items, setItems, selected, setSelected, settings, setSettings, processing, setProcessing, message, setMessage }}>{children}</Context.Provider>;
}
export function useResizeWorkspace() {
  const workspace = useContext(Context);
  if (!workspace) throw new Error('Missing resize workspace');
  return workspace;
}
