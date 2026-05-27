import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'

const port = Number(process.env.PORT ?? 4173)
const publicDir = join(process.cwd(), 'public')
const entry = '/workspace-dropdown-review.html'

const contentTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
])

function resolvePath(url) {
  const pathname = new URL(url, `http://localhost:${port}`).pathname
  const requestedPath = pathname === '/' ? entry : pathname
  const resolved = normalize(join(publicDir, requestedPath))

  if (!resolved.startsWith(publicDir)) {
    return null
  }

  return resolved
}

const server = createServer(async (request, response) => {
  const filePath = resolvePath(request.url ?? '/')

  if (!filePath) {
    response.writeHead(403)
    response.end('Forbidden')
    return
  }

  try {
    const body = await readFile(filePath)
    response.writeHead(200, {
      'Content-Type': contentTypes.get(extname(filePath)) ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
    })
    response.end(body)
  } catch {
    response.writeHead(404)
    response.end('Not found')
  }
})

server.listen(port, () => {
  console.log(`Workspace dropdown review: http://localhost:${port}${entry}`)
})
