'use client'

import { useCallback, useState } from 'react'
import { notionLiteApi } from '../lib/notion-lite/api'
import type { Workspace, WorkspaceMember } from '../lib/notion-lite/types'

export function useWorkspaceData(accessToken: string | undefined) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [workspacesLoading, setWorkspacesLoading] = useState(false)
  const [members, setMembers] = useState<WorkspaceMember[]>([])
  const [membersLoading, setMembersLoading] = useState(false)
  const [creatingWorkspace, setCreatingWorkspace] = useState(false)
  const [renamingWorkspace, setRenamingWorkspace] = useState(false)
  const [inviteLoading, setInviteLoading] = useState(false)

  const loadWorkspaces = useCallback(async () => {
    if (!accessToken) return
    setWorkspacesLoading(true)
    try {
      const data = await notionLiteApi.listWorkspaces(accessToken)
      setWorkspaces(data)
      return data
    } finally {
      setWorkspacesLoading(false)
    }
  }, [accessToken])

  const createWorkspace = useCallback(async (name: string) => {
    if (!accessToken) return
    setCreatingWorkspace(true)
    try {
      const data = await notionLiteApi.createWorkspace(accessToken, name)
      setWorkspaces(previous => [
        ...previous,
        { ...data.workspace, order_index: previous.length },
      ])
      return data
    } finally {
      setCreatingWorkspace(false)
    }
  }, [accessToken])

  const renameWorkspace = useCallback(async (id: string, name: string) => {
    if (!accessToken) return
    setRenamingWorkspace(true)
    try {
      const workspace = await notionLiteApi.renameWorkspace(accessToken, id, name)
      setWorkspaces(previous => previous.map(item => item.id === workspace.id ? workspace : item))
      return workspace
    } finally {
      setRenamingWorkspace(false)
    }
  }, [accessToken])

  const reorderWorkspaces = useCallback(async (
    sourceId: string,
    targetId: string,
    position: 'before' | 'after',
  ) => {
    if (!accessToken || sourceId === targetId) return

    const sourceIndex = workspaces.findIndex(workspace => workspace.id === sourceId)
    const targetIndex = workspaces.findIndex(workspace => workspace.id === targetId)
    if (sourceIndex < 0 || targetIndex < 0) return

    const previousWorkspaces = workspaces
    const reordered = [...workspaces]
    const [source] = reordered.splice(sourceIndex, 1)
    const adjustedTargetIndex = reordered.findIndex(workspace => workspace.id === targetId)
    const insertIndex = position === 'before' ? adjustedTargetIndex : adjustedTargetIndex + 1
    reordered.splice(insertIndex, 0, source)
    const nextWorkspaces = reordered.map((workspace, index) => ({ ...workspace, order_index: index }))
    setWorkspaces(nextWorkspaces)

    try {
      await notionLiteApi.reorderWorkspaces(
        accessToken,
        nextWorkspaces.map(workspace => workspace.id),
      )
    } catch (error) {
      setWorkspaces(previousWorkspaces)
      throw error
    }
  }, [accessToken, workspaces])

  const loadMembers = useCallback(async (workspaceId: string) => {
    if (!accessToken || !workspaceId) return
    setMembersLoading(true)
    try {
      const data = await notionLiteApi.listMembers(accessToken, workspaceId)
      setMembers(data)
      return data
    } finally {
      setMembersLoading(false)
    }
  }, [accessToken])

  const inviteMember = useCallback(async (
    workspaceId: string,
    email: string,
    role: 'editor' | 'viewer',
  ) => {
    if (!accessToken) return
    setInviteLoading(true)
    try {
      await notionLiteApi.inviteMember(accessToken, workspaceId, email, role)
      await loadMembers(workspaceId)
    } finally {
      setInviteLoading(false)
    }
  }, [accessToken, loadMembers])

  const resetWorkspaceData = useCallback(() => {
    setWorkspaces([])
    setMembers([])
    setWorkspacesLoading(false)
    setMembersLoading(false)
    setCreatingWorkspace(false)
    setRenamingWorkspace(false)
    setInviteLoading(false)
  }, [])

  return {
    workspaces,
    workspacesLoading,
    members,
    membersLoading,
    creatingWorkspace,
    renamingWorkspace,
    inviteLoading,
    loadWorkspaces,
    createWorkspace,
    renameWorkspace,
    reorderWorkspaces,
    loadMembers,
    inviteMember,
    resetWorkspaceData,
  }
}
