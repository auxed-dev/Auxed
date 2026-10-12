import { post } from './api';

/** Photo filters for Pic Snippets (canvas filter strings). */
export const PHOTO_FILTERS: { name: string; css: string }[] = [
  { name: 'Original', css: 'none' },
  { name: 'Mono', css: 'grayscale(1) contrast(1.1)' },
  { name: 'Warm', css: 'sepia(0.35) saturate(1.3) contrast(1.05)' },
  { name: 'Neon', css: 'saturate(1.8) contrast(1.15) hue-rotate(-12deg)' },
  { name: 'Fade', css: 'contrast(0.85) brightness(1.08) saturate(0.8)' },
  { name: 'Night', css: 'brightness(0.85) contrast(1.25) saturate(1.2) hue-rotate(200deg)' },
];

/** Downscale + re-encode an image file in the browser (strips EXIF/location data too). */
export async function prepareImage(file: File, { maxDim = 1440, quality = 0.84, filter = 'none' }: { maxDim?: number; quality?: number; filter?: string } = {}): Promise<string> {
  if (!/^image\/(jpeg|png|webp|heic|heif)$/i.test(file.type) && !/\.(jpe?g|png|webp|heic)$/i.test(file.name)) {
    throw new Error('Choose a JPEG, PNG or WebP photo.');
  }
  const bitmap = await loadBitmap(file);
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Your browser could not process that photo.');
  if (filter !== 'none') ctx.filter = filter;
  ctx.drawImage(bitmap, 0, 0, w, h);
  let out = canvas.toDataURL('image/jpeg', quality);
  // Keep well under the 2.5MB upload limit.
  let q = quality;
  while (out.length > 3_200_000 && q > 0.5) {
    q -= 0.1;
    out = canvas.toDataURL('image/jpeg', q);
  }
  return out;
}

async function loadBitmap(file: File): Promise<HTMLImageElement | ImageBitmap> {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
    } catch {
      /* fall through */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return img;
  } catch {
    throw new Error('That photo could not be read. Try a different one.');
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

/** Upload a prepared data URL; returns the public URL. */
export async function uploadImage(dataUrl: string): Promise<string> {
  const { url } = await post<{ url: string }>('/api/media', { data: dataUrl });
  return url;
}
