/**
 * Render a demo video from its timeline:
 *
 *   node scripts/video/render.ts <id>                 MP4 in dist/videos/
 *   node scripts/video/render.ts <id> --sheet         also a contact sheet every 1.5 s
 *   node scripts/video/render.ts <id> --frames 3,9.5  PNG stills only, for review
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { mkdir, writeFile } from 'node:fs/promises';
import { availableParallelism } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { Resvg } from '@resvg/resvg-js';
import { synthesize } from './audio.ts';
import { FPS, HEIGHT, WIDTH, type Video } from './kit.ts';

const fontFiles = [
  'Inter-Regular.ttf',
  'Inter-SemiBold.ttf',
  'Inter-Bold.ttf',
  'JetBrainsMonoNL-Regular.ttf',
  'JetBrainsMonoNL-Bold.ttf',
].map((name) => fileURLToPath(new URL(`fonts/${name}`, import.meta.url)));

function rasterize(svg: string) {
  return new Resvg(svg, {
    fitTo: { mode: 'original' },
    font: { loadSystemFonts: false, fontFiles, defaultFontFamily: 'Inter' },
  }).render();
}

async function load(id: string): Promise<Video> {
  const module = (await import(new URL(`videos/${id}.ts`, import.meta.url).href)) as {
    default: Video;
  };
  return module.default;
}

function run(command: string, args: string[]) {
  const child = spawn(command, args, { stdio: ['ignore', 'inherit', 'inherit'] });
  return once(child, 'exit').then(([code]) => {
    if (code !== 0) {
      throw new Error(`${command} exited with ${code}`);
    }
  });
}

async function renderFrames(video: Video, times: number[], directory: URL) {
  await mkdir(directory, { recursive: true });
  for (const t of times) {
    const target = new URL(`${video.id}-${t.toFixed(2)}s.png`, directory);
    await writeFile(target, rasterize(video.frame(t)).asPng());
    console.log(fileURLToPath(target));
  }
}

async function renderVideo(video: Video, directory: URL, sheet: boolean) {
  await mkdir(directory, { recursive: true });
  const total = Math.round(video.duration * FPS);
  const audio = new URL(`${video.id}.wav`, directory);
  const output = new URL(`${video.id}.mp4`, directory);
  await writeFile(audio, synthesize(video.cues, video.duration));

  const ffmpeg = spawn(
    'ffmpeg',
    [
      ...['-y', '-loglevel', 'error'],
      ...['-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${WIDTH}x${HEIGHT}`, '-r', `${FPS}`],
      ...['-i', 'pipe:0', '-i', fileURLToPath(audio), '-map', '0:v', '-map', '1:a'],
      ...['-c:v', 'libx264', '-preset', 'slow', '-crf', '19', '-tune', 'animation'],
      ...['-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart'],
      ...['-shortest', fileURLToPath(output)],
    ],
    { stdio: ['pipe', 'inherit', 'inherit'] }
  );
  const finished = once(ffmpeg, 'exit');

  const count = Math.max(1, Math.min(availableParallelism() - 1, 8));
  const workers = Array.from(
    { length: count },
    () => new Worker(new URL(import.meta.url), { workerData: { id: video.id } })
  );
  const idle = [...workers];
  const pending = new Map<number, Buffer>();
  const digest = createHash('sha256');
  const window = count * 3;
  let next = 0;
  let written = 0;
  let flushing = false;
  const started = Date.now();

  await new Promise<void>((resolve, reject) => {
    const dispatch = () => {
      while (idle.length > 0 && next < total && next < written + window) {
        idle.pop()?.postMessage(next);
        next += 1;
      }
    };
    const flush = async () => {
      if (flushing) {
        return;
      }
      flushing = true;
      try {
        while (pending.has(written)) {
          const frame = pending.get(written) as Buffer;
          pending.delete(written);
          digest.update(frame);
          if (!ffmpeg.stdin.write(frame)) {
            await once(ffmpeg.stdin, 'drain');
          }
          written += 1;
          dispatch();
          if (written % (FPS * 5) === 0) {
            console.log(`${video.id}: ${(written / FPS).toFixed(0)} s of ${video.duration} s`);
          }
        }
      } catch (error) {
        reject(error);
      } finally {
        flushing = false;
      }
      if (written === total) {
        resolve();
      }
    };
    for (const worker of workers) {
      worker.on('message', ({ index, pixels }: { index: number; pixels: Uint8Array }) => {
        pending.set(index, Buffer.from(pixels.buffer, pixels.byteOffset, pixels.byteLength));
        idle.push(worker);
        dispatch();
        void flush();
      });
      worker.on('error', reject);
    }
    dispatch();
  });

  ffmpeg.stdin.end();
  await Promise.all(workers.map((worker) => worker.terminate()));
  const [code] = await finished;
  if (code !== 0) {
    throw new Error(`ffmpeg exited with ${code}`);
  }
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`${fileURLToPath(output)} (${total} frames in ${seconds} s)`);
  console.log(`frame digest sha256:${digest.digest('hex')}`);

  if (sheet) {
    const image = new URL(`${video.id}-sheet.png`, directory);
    const rows = Math.ceil(video.duration / 1.5 / 4);
    await run('ffmpeg', [
      ...['-y', '-loglevel', 'error', '-i', fileURLToPath(output)],
      ...['-vf', `fps=1/1.5,scale=640:-1,tile=4x${rows}:padding=6:color=white`],
      ...['-frames:v', '1', fileURLToPath(image)],
    ]);
    console.log(fileURLToPath(image));
  }
}

if (!isMainThread) {
  const video = await load((workerData as { id: string }).id);
  parentPort?.on('message', (index: number) => {
    const pixels = rasterize(video.frame(index / FPS)).pixels;
    parentPort?.postMessage({ index, pixels });
  });
} else if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [id, ...flags] = process.argv.slice(2);
  if (!id) {
    throw new Error('Usage: node scripts/video/render.ts <id> [--sheet] [--frames 1,2.5]');
  }
  const video = await load(id);
  const directory = new URL('../../dist/videos/', import.meta.url);
  const frames = flags.indexOf('--frames');
  if (frames >= 0) {
    const times = (flags[frames + 1] ?? '').split(',').map(Number);
    await renderFrames(video, times, new URL(`${id}/`, directory));
  } else {
    await renderVideo(video, directory, flags.includes('--sheet'));
  }
}
