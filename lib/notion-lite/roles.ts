import type { WorkspaceRole } from './types'

export function getWorkspaceRoleSymbol(role?: WorkspaceRole) {
  if (role === 'owner') return '●'
  if (role === 'editor') return '◆'
  if (role === 'viewer') return '○'
  return '–'
}

export function getRoleBadgeClass(role: WorkspaceRole) {
  if (role === 'owner') return 'bg-[#baf7c8] text-black'
  if (role === 'editor') return 'bg-[#fde68a] text-black'
  return 'bg-[#c4b5fd] text-black'
}
