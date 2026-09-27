export type RevisionedPagePatch = {
  title?: unknown
  content?: unknown
}

export function isRevisionedPagePatch(patch: RevisionedPagePatch) {
  return Object.prototype.hasOwnProperty.call(patch, 'title')
    || Object.prototype.hasOwnProperty.call(patch, 'content')
}

export function isValidBaseRevision(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0
}

