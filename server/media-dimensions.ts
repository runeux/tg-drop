import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { imageSizeFromFile } from 'image-size/fromFile';
import { imageSize } from 'image-size';
import { z } from 'zod';
import { mediaKind } from '../shared/media.js';

const exec = promisify(execFile);
export function imageDimensions(bytes: Uint8Array) {
  const { width, height, orientation } = imageSize(bytes);
  return orientation && orientation >= 5
    ? { width: height, height: width }
    : { width, height };
}
const videoSchema = z.object({
  streams: z.array(
    z.object({
      width: z.number().positive(),
      height: z.number().positive(),
      sample_aspect_ratio: z.string().optional(),
      side_data_list: z
        .array(z.object({ rotation: z.number().optional() }))
        .optional(),
    }),
  ),
});

export async function probeDimensions(
  path: string,
  file: { name: string; mime: string },
) {
  const kind = mediaKind(file);
  if (!kind) return undefined;
  try {
    if (kind === 'image') {
      const { width, height, orientation } = await imageSizeFromFile(path);
      return orientation && orientation >= 5
        ? { width: height, height: width }
        : { width, height };
    }
    const { stdout } = await exec(
      'ffprobe',
      [
        '-v',
        'error',
        '-select_streams',
        'v:0',
        '-show_entries',
        'stream=width,height,sample_aspect_ratio:stream_side_data=rotation',
        '-of',
        'json',
        path,
      ],
      { timeout: 15000, maxBuffer: 65536 },
    );
    const stream = videoSchema.parse(JSON.parse(stdout)).streams[0];
    if (!stream) return undefined;
    let { width, height } = stream;
    const [numerator, denominator] = (stream.sample_aspect_ratio ?? '1:1')
      .split(':')
      .map(Number);
    if (numerator && denominator)
      width = Math.round((width * numerator) / denominator);
    const rotation =
      stream.side_data_list?.find((data) => data.rotation !== undefined)
        ?.rotation ?? 0;
    if (Math.abs(rotation) % 180 === 90) [width, height] = [height, width];
    return { width, height };
  } catch (error) {
    // unreadable or unsupported media remains downloadable.
    console.warn(
      'media dimensions unavailable',
      file.mime,
      error instanceof Error ? error.name : 'unknown',
    );
    return undefined;
  }
}
