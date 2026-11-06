const extensions: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  svg: 'image/svg+xml',
  heic: 'image/heic',
  heif: 'image/heif',
  bmp: 'image/bmp',
  tiff: 'image/tiff',
  tif: 'image/tiff',
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  mkv: 'video/x-matroska',
  avi: 'video/x-msvideo',
  ogv: 'video/ogg',
};

export function mediaType(file: { name: string; mime: string }) {
  const mime = file.mime.split(';')[0]?.trim().toLowerCase() ?? '';
  if (mime.startsWith('image/') || mime.startsWith('video/')) return mime;
  if (mime && mime !== 'application/octet-stream') return null;
  const extension = file.name.split('.').at(-1)?.toLowerCase() ?? '';
  return Object.hasOwn(extensions, extension)
    ? (extensions[extension] ?? null)
    : null;
}

export function mediaKind(file: { name: string; mime: string }) {
  const mime = mediaType(file);
  return mime?.startsWith('video/') ? 'video' : mime ? 'image' : null;
}
