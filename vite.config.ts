import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

const LESSONS = path.resolve(process.cwd(), 'public/lessons');
const SLUG = /^[a-z0-9][a-z0-9-]{0,60}$/;
const FILE = /^(lesson\.json|poses\.json|video\.[a-z0-9]{2,5})$/;

const TYPES: Record<string, string> = {
  '.json': 'application/json',
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
};

async function readIndex(): Promise<string[]> {
  try {
    return JSON.parse(await fs.readFile(path.join(LESSONS, 'index.json'), 'utf8')) as string[];
  } catch {
    return [];
  }
}

/**
 * While developing, lets the app save a routine straight into public/lessons,
 * so adding to the shared library is one click followed by a git commit.
 *   GET    /__library              is the library writable?
 *   PUT    /__library/<name>/<file> save lesson.json, poses.json or the video
 *   DELETE /__library/<name>        remove a routine
 */
function libraryPlugin(): Plugin {
  return {
    name: 'dancetutor-library',
    apply: 'serve',
    configureServer(server) {
      // Serve library files straight from disk, so a routine saved a moment ago
      // is available without restarting. Videos need byte ranges for seeking.
      server.middlewares.use('/lessons', async (req, res, next) => {
        try {
          const rel = decodeURIComponent((req.url ?? '/').split('?')[0]);
          const file = path.join(LESSONS, rel);
          if (!file.startsWith(LESSONS + path.sep)) return next();
          const stat = await fs.stat(file);
          if (!stat.isFile()) return next();
          res.setHeader('content-type', TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream');
          res.setHeader('accept-ranges', 'bytes');
          res.setHeader('cache-control', 'no-cache');
          const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
          if (range && (range[1] || range[2])) {
            const start = range[1] ? Number(range[1]) : Math.max(0, stat.size - Number(range[2]));
            const end = range[1] && range[2] ? Math.min(Number(range[2]), stat.size - 1) : stat.size - 1;
            if (start > end || start >= stat.size) {
              res.statusCode = 416;
              res.setHeader('content-range', `bytes */${stat.size}`);
              return res.end();
            }
            res.statusCode = 206;
            res.setHeader('content-range', `bytes ${start}-${end}/${stat.size}`);
            res.setHeader('content-length', end - start + 1);
            if (req.method === 'HEAD') return res.end();
            return createReadStream(file, { start, end }).pipe(res);
          }
          res.setHeader('content-length', stat.size);
          if (req.method === 'HEAD') return res.end();
          createReadStream(file).pipe(res);
        } catch {
          next();
        }
      });

      server.middlewares.use('/__library', async (req, res) => {
        const send = (status: number, body: unknown) => {
          res.statusCode = status;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify(body));
        };
        try {
          const parts = (req.url ?? '/').split('?')[0].split('/').filter(Boolean);
          if (req.method === 'GET' && parts.length === 0) return send(200, { writable: true });
          const [slug, file] = parts;
          if (!slug || !SLUG.test(slug)) return send(400, { error: 'bad routine name' });
          const dir = path.join(LESSONS, slug);
          if (req.method === 'DELETE' && parts.length === 1) {
            await fs.rm(dir, { recursive: true, force: true });
            const index = (await readIndex()).filter((id) => id !== slug);
            await fs.writeFile(path.join(LESSONS, 'index.json'), JSON.stringify(index, null, 2) + '\n');
            return send(200, { removed: slug });
          }
          if (req.method === 'PUT' && parts.length === 2 && FILE.test(file)) {
            const chunks: Buffer[] = [];
            for await (const chunk of req) chunks.push(chunk as Buffer);
            await fs.mkdir(dir, { recursive: true });
            await fs.writeFile(path.join(dir, file), Buffer.concat(chunks));
            // The routine becomes visible once its lesson.json is in place.
            if (file === 'lesson.json') {
              const index = await readIndex();
              if (!index.includes(slug)) index.push(slug);
              await fs.writeFile(path.join(LESSONS, 'index.json'), JSON.stringify(index, null, 2) + '\n');
            }
            return send(200, { saved: `${slug}/${file}` });
          }
          send(404, { error: 'not found' });
        } catch (e) {
          send(500, { error: e instanceof Error ? e.message : String(e) });
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), libraryPlugin()],
  // Saving a routine writes into public/lessons; do not reload the page for it.
  server: { watch: { ignored: ['**/public/lessons/**'] } },
  test: { include: ['tests/**/*.test.ts'] },
});
