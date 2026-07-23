'use client'

import type { MutableRefObject } from 'react'
import { useCallback } from 'react'
import { notionLiteApi } from '../lib/notion-lite/api'
import type { CloneImageSource, UploadedImageAsset } from '../lib/notion-lite/types'

export function usePageAssets(
  accessToken: string | undefined,
  activeWorkspaceId: string,
  activePageIdRef: MutableRefObject<string>,
) {
  const uploadImage = useCallback(async (file: File): Promise<UploadedImageAsset> => {
    if (!accessToken || !activeWorkspaceId || !activePageIdRef.current) {
      throw new Error('이미지를 업로드할 페이지를 찾을 수 없습니다.')
    }

    return notionLiteApi.uploadAsset(
      accessToken,
      activeWorkspaceId,
      activePageIdRef.current,
      file,
    )
  }, [accessToken, activePageIdRef, activeWorkspaceId])

  const cloneImage = useCallback(async (source: CloneImageSource): Promise<UploadedImageAsset> => {
    if (!accessToken || !activeWorkspaceId || !activePageIdRef.current) {
      throw new Error('이미지를 복사할 페이지를 찾을 수 없습니다.')
    }

    return notionLiteApi.cloneAsset(
      accessToken,
      activeWorkspaceId,
      activePageIdRef.current,
      source,
    )
  }, [accessToken, activePageIdRef, activeWorkspaceId])

  return { uploadImage, cloneImage }
}
