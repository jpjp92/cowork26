export const IMAGE_ASSET_BUCKET = 'page_assets'
export const MAX_IMAGE_SIZE_BYTES = 20 * 1024 * 1024

export const IMAGE_EXTENSIONS = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
} as const

export type SupportedImageMimeType = keyof typeof IMAGE_EXTENSIONS

export function isSupportedImageType(type: unknown): type is SupportedImageMimeType {
  return typeof type === 'string' && type in IMAGE_EXTENSIONS
}

export function isValidImageSize(size: unknown) {
  return Number.isInteger(size) && Number(size) > 0 && Number(size) <= MAX_IMAGE_SIZE_BYTES
}

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

export function getImageStoragePath(
  workspaceId: string,
  pageId: string,
  assetId: string,
  mimeType: SupportedImageMimeType,
) {
  return `workspaces/${workspaceId}/pages/${pageId}/${assetId}.${IMAGE_EXTENSIONS[mimeType]}`
}

export function getImageSizeError(size: number) {
  if (size <= 0) return '빈 이미지는 업로드할 수 없습니다.'
  if (size > MAX_IMAGE_SIZE_BYTES) return '이미지는 최대 20MB까지 업로드할 수 있습니다.'
  return null
}
