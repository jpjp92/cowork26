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
  content_revision: number
  created_at: string
  updated_at: string
}

export interface WorkspaceMember {
  user_id: string
  role: WorkspaceRole
  created_at: string
  email: string | null
}

export type AiCredentialProvider = 'openai' | 'gemini'

export interface AiCredentialStatus {
  provider: AiCredentialProvider
  connected: boolean
  keyLastFour?: string
  verifiedAt?: string
  updatedAt?: string
}

export interface WorkspaceAiPolicy {
  workspaceId: string
  enabled: boolean
  allowedProviders: AiCredentialProvider[]
  allowedRoles: Array<Extract<WorkspaceRole, 'owner' | 'editor'>>
  updatedAt: string | null
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
export type SavingStatus = 'idle' | 'saved' | 'loaded' | 'conflict'
export type VisibleSavingStatus = Exclude<SavingStatus, 'idle'>

export type WorkspaceAnalysisMode = 'summary' | 'organize' | 'analysis' | 'question' | 'action_items'

export interface WorkspaceAnalysisDraft {
  workspaceId: string
  pageIds: string[]
  provider: AiCredentialProvider
  mode: WorkspaceAnalysisMode
  additionalRequest: string
}

export interface WorkspaceAnalysisCitation {
  label: string
  pageId: string
}

export interface WorkspaceAnalysisResult {
  requestId: string
  status: 'succeeded'
  provider: AiCredentialProvider
  title: string
  overview: string
  sections: Array<{
    kind: string
    heading: string
    items: Array<{ text: string; citations: WorkspaceAnalysisCitation[] }>
  }>
  unknowns: Array<{ text: string; citations: WorkspaceAnalysisCitation[] }>
}
