import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  getImageSizeError,
  getImageStoragePath,
  MAX_IMAGE_SIZE_BYTES,
  isSupportedImageType,
  isUuid,
  isValidImageSize,
} from '../lib/image-assets.ts'

assert.equal(MAX_IMAGE_SIZE_BYTES, 20 * 1024 * 1024)
assert.equal(isValidImageSize(1), true)
assert.equal(isValidImageSize(MAX_IMAGE_SIZE_BYTES), true)
assert.equal(isValidImageSize(0), false)
assert.equal(isValidImageSize(MAX_IMAGE_SIZE_BYTES + 1), false)
assert.equal(isValidImageSize(Number.NaN), false)
assert.match(getImageSizeError(MAX_IMAGE_SIZE_BYTES + 1), /20MB/)

for (const type of ['image/png', 'image/jpeg', 'image/webp', 'image/gif']) {
  assert.equal(isSupportedImageType(type), true, `${type} should be supported`)
}
for (const type of ['image/svg+xml', 'image/avif', 'text/html', '', null]) {
  assert.equal(isSupportedImageType(type), false, `${String(type)} should be rejected`)
}

const workspaceId = '11111111-1111-4111-8111-111111111111'
const pageId = '22222222-2222-4222-8222-222222222222'
const assetId = '33333333-3333-4333-8333-333333333333'
assert.equal(isUuid(workspaceId), true)
assert.equal(isUuid('../outside'), false)
assert.equal(
  getImageStoragePath(workspaceId, pageId, assetId, 'image/jpeg'),
  `workspaces/${workspaceId}/pages/${pageId}/${assetId}.jpg`,
)

const assetRoute = await readFile(new URL('../app/api/assets/route.ts', import.meta.url), 'utf8')
const apiClient = await readFile(new URL('../lib/notion-lite/api.ts', import.meta.url), 'utf8')
const cloneRoute = await readFile(new URL('../app/api/assets/clone/route.ts', import.meta.url), 'utf8')

assert.match(assetRoute, /createSignedUploadUrl\(storagePath, \{ upsert: false \}\)/)
assert.match(assetRoute, /\.info\(storagePath\)/)
assert.match(assetRoute, /actualType !== body\.mimeType/)
assert.match(assetRoute, /Registered assets cannot be cancelled/)
assert.doesNotMatch(assetRoute, /request\.formData/)

assert.match(apiClient, /optimizeLargeImage\(file\)/)
assert.match(apiClient, /uploadImageToSignedUrl\(prepared\.signedUrl, uploadFile\)/)
assert.match(apiClient, /STANDARD_IMAGE_UPLOAD_TARGET_BYTES = 5 \* 1024 \* 1024/)
assert.match(apiClient, /action: 'complete'/)
assert.match(apiClient, /method: 'DELETE'/)

assert.match(cloneRoute, /\.copy\(sourceAsset\.storage_path, storagePath\)/)
assert.doesNotMatch(cloneRoute, /\.download\(sourceAsset\.storage_path\)/)

console.log('image asset direct-upload security test: passed')
