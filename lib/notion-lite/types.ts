export type WorkspaceRole = 'owner' | 'editor' | 'viewer'

export interface Workspace {
  id: string
  name: string
  role: WorkspaceRole
  created_at: string
  order_index?: number
}

export interface PageRecord {
  id: string
  workspace_id: string
  parent_id: string | null
  title: string
  order_index: number
  content: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export interface WorkspaceMember {
  user_id: string
  role: WorkspaceRole
  created_at: string
  email: string | null
}

export interface UploadedImageAsset {
  id: string
  url: string
  storagePath?: string
  alt?: string
}

export interface PreparedImageUpload {
  id: string
  signedUrl: string
  storagePath: string
}

export interface CloneImageSource {
  assetId?: string
  storagePath?: string
  src: string
  alt?: string
}

export type PageDropPosition = 'above' | 'below' | 'inside'
export type SavingStatus = 'idle' | 'saved' | 'loaded'
export type VisibleSavingStatus = Exclude<SavingStatus, 'idle'>
