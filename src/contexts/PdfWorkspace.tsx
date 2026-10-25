import { createContext, useContext, useEffect, useRef, useState, type Dispatch, type ReactNode, type SetStateAction, type RefObject } from 'react';
import { normalizePdfSettings, type PdfSettings } from '../lib/pdf-settings';
import type { ProcessedImage } from '../types/global';
export interface PdfItem {
  id: string; name: string; path: string; size?: number;
  status: 'ready' | 'processing' | 'done' | 'error'; error?: string; result?: ProcessedImage;
}
interface Workspace {
  items: PdfItem[]; setItems: Dispatch<SetStateAction<PdfItem[]>>;
  settings: PdfSettings; setSettings: Dispatch<SetStateAction<PdfSettings>>;
  processing: boolean; setProcessing: Dispatch<SetStateAction<boolean>>;
  message: string; setMessage: Dispatch<SetStateAction<string>>;
  stop: RefObject<boolean>;
}
const Context = createContext<Workspace | undefined>(undefined);
function loadSettings() {
  try { return normalizePdfSettings(JSON.parse(localStorage.getItem('pdfSettings') || '{}')); }
  catch { return normalizePdfSettings(); }
}
export function PdfWorkspaceProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<PdfItem[]>([]);
  const [settings, setSettings] = useState<PdfSettings>(loadSettings);
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState('');
  const stop = useRef(false);
  useEffect(() => { localStorage.setItem('pdfSettings', JSON.stringify(settings)); }, [settings]);
  return <Context.Provider value={{ items, setItems, settings, setSettings, processing, setProcessing, message, setMessage, stop }}>{children}</Context.Provider>;
}
export function usePdfWorkspace() {
  const value = useContext(Context);
  if (!value) throw new Error('Missing PDF workspace');
  return value;
}
