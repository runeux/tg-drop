import { formatSize } from '../shared/files';

export async function validateFile(file: File, maxBytes: number) {
  if (!file.name || file.size === 0)
    throw new Error('Empty files are not supported.');
  if (file.size > maxBytes)
    throw new Error(`Maximum file size is ${formatSize(maxBytes)}.`);
  try {
    await file.slice(0, 1).arrayBuffer();
  } catch {
    throw new Error(
      'This item cannot be read. Choose a regular file or ZIP archive.',
    );
  }
}

export function captureDrop(transfer: DataTransfer) {
  // entries must be captured while the browser's drop data store is readable.
  const items = Array.from(transfer.items).filter(
    (item) => item.kind === 'file',
  );
  if (!items.length)
    return Array.from(transfer.files).map((file) => ({ file, entry: null }));
  return items.map((item) => ({
    file: item.getAsFile(),
    entry:
      typeof item.webkitGetAsEntry === 'function'
        ? item.webkitGetAsEntry()
        : null,
  }));
}

export async function prepareDrop(
  items: ReturnType<typeof captureDrop>,
  maxBytes: number,
  preparing: (name: string) => void,
) {
  const files: File[] = [];
  const errors: string[] = [];
  for (const item of items) {
    const name = item.entry?.name ?? item.file?.name ?? 'item';
    try {
      let file = item.file;
      if (item.entry?.isDirectory) {
        preparing(`${name}.zip`);
        const { ZipFS } = await import('@zip.js/zip.js');
        const archive = new ZipFS();
        await archive.addFileSystemEntry(item.entry);
        const options = {
          level: 0,
          bufferedWrite: false,
          useWebWorkers: false,
        };
        if ((await archive.getExportedSize(options)) > maxBytes) {
          throw new Error(`ZIP archive exceeds ${formatSize(maxBytes)}.`);
        }
        file = new File([await archive.exportBlob(options)], `${name}.zip`, {
          type: 'application/zip',
        });
      }
      if (!file)
        throw new Error(
          'This item is not supported. Choose a regular file or folder.',
        );
      await validateFile(file, maxBytes);
      files.push(file);
    } catch (error) {
      errors.push(
        `${name}: ${error instanceof Error ? error.message : 'This item cannot be read.'}`,
      );
    }
  }
  return { files, errors };
}
