import type { CaptureAttachmentInput } from '../types/captureAction';

export interface CaptureAttachmentDraft extends CaptureAttachmentInput {
  id: string;
  preview_url: string | null;
}

function dataUrlToBase64(dataUrl: string): string {
  const comma = dataUrl.indexOf(',');
  return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('Could not read attachment'));
        return;
      }
      resolve(reader.result);
    };
    reader.onerror = () => reject(new Error('Could not read attachment'));
    reader.readAsDataURL(file);
  });
}

export async function fileToCaptureAttachment(file: File): Promise<CaptureAttachmentDraft> {
  const dataUrl = await readFileAsDataUrl(file);
  const mimeType = file.type || 'application/octet-stream';
  return {
    id: crypto.randomUUID(),
    name: file.name || 'attachment',
    mime_type: mimeType,
    data_base64: dataUrlToBase64(dataUrl),
    preview_url: mimeType.startsWith('image/') ? dataUrl : null,
  };
}

function clipboardTypeExtension(mimeType: string): string {
  if (mimeType === 'image/jpeg') return 'jpg';
  if (mimeType === 'image/webp') return 'webp';
  if (mimeType === 'image/gif') return 'gif';
  return 'png';
}

export async function clipboardImagesToCaptureAttachments(): Promise<CaptureAttachmentDraft[]> {
  if (!navigator.clipboard?.read) {
    throw new Error('Clipboard image paste is not available in this browser');
  }

  const clipboardItems = await navigator.clipboard.read();
  const files: File[] = [];
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

  for (const item of clipboardItems) {
    const imageType = item.types.find((type) => type.startsWith('image/'));
    if (!imageType) continue;
    const blob = await item.getType(imageType);
    const ext = clipboardTypeExtension(imageType);
    files.push(new File([blob], `clipboard-${timestamp}.${ext}`, { type: imageType }));
  }

  if (files.length === 0) {
    throw new Error('No image found on the clipboard');
  }

  return Promise.all(files.slice(0, 3).map(fileToCaptureAttachment));
}

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Could not capture screenshot'));
        return;
      }
      resolve(blob);
    }, 'image/png');
  });
}

export async function captureScreenToAttachment(): Promise<CaptureAttachmentDraft> {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    throw new Error('Screen capture is not available in this browser');
  }

  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: true,
    audio: false,
  });

  try {
    const video = document.createElement('video');
    video.muted = true;
    await new Promise<void>((resolve) => {
      video.onloadedmetadata = () => resolve();
      video.srcObject = stream;
    });
    await video.play();

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not prepare screenshot canvas');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const blob = await canvasToPngBlob(canvas);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const file = new File([blob], `screenshot-${timestamp}.png`, { type: 'image/png' });
    return fileToCaptureAttachment(file);
  } finally {
    for (const track of stream.getTracks()) track.stop();
  }
}
