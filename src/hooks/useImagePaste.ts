import { useEffect } from 'react';

// Clipboard images often all arrive as image.png. Give every paste its own name
// so the compression queue does not mistake a new screenshot for a completed one.
function getPastedImages(data: DataTransfer): File[] {
  const files = Array.from(data.files).filter(file => file.type.startsWith('image/'));
  if (files.length === 0) {
    for (const item of Array.from(data.items)) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) files.push(file);
      }
    }
  }

  return files.map(file => {
    const extension = file.type.split('/')[1].split('+')[0];
    const filename = `clipboard-${Date.now()}-${crypto.randomUUID()}.${extension === 'jpeg' ? 'jpg' : extension}`;
    return new File([file], filename, { type: file.type, lastModified: file.lastModified });
  });
}

export function useImagePaste(onImages: (images: File[]) => void) {
  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      if (event.defaultPrevented || !event.clipboardData) return;

      // Leave text fields and editors to their normal paste behavior.
      const target = event.target;
      const isTextInput = target instanceof HTMLInputElement && ![
        'button', 'checkbox', 'color', 'file', 'hidden', 'image', 'radio', 'range', 'reset', 'submit'
      ].includes(target.type);
      if (target instanceof HTMLElement && (
        isTextInput || target.closest('textarea, [role="textbox"]') || target.isContentEditable
      )) return;

      const images = getPastedImages(event.clipboardData);
      if (images.length === 0) return;

      event.preventDefault();
      onImages(images);
    };

    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [onImages]);
}
