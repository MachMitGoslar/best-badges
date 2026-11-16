// Minimaler statischer Server für preview/ (nur 127.0.0.1, nur Lesezugriff auf diesen Ordner).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, normalize } from 'node:path';

const root = fileURLToPath(new URL('../preview/', import.meta.url));
const port = Number(process.env.PORT ?? 5180);
createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  const file = join(root, path.endsWith('/') ? `${path}index.html` : path);
  if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': file.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(body);
  } catch { res.writeHead(404).end('Nicht gefunden'); }
}).listen(port, '127.0.0.1', () => console.log(`Vorschau: http://127.0.0.1:${port}/`));
