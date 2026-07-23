import type { RefObject } from 'react'
import type { Workspace, WorkspaceMember, WorkspaceRole } from '../../lib/notion-lite/types'
import { SettingsPanel } from './settings-panel'

interface AppHeaderProps {
  email: string
  workspace?: Workspace
  refreshing: boolean
  settingsOpen: boolean
  settingsContainerRef: RefObject<HTMLDivElement | null>
  members: WorkspaceMember[]
  membersLoading: boolean
  canManageMembers: boolean
  inviteEmail: string
  inviteRole: Extract<WorkspaceRole, 'editor' | 'viewer'>
  inviteLoading: boolean
  onRefresh: () => void
  onToggleSettings: () => void
  onInviteEmailChange: (email: string) => void
  onInviteRoleChange: (role: Extract<WorkspaceRole, 'editor' | 'viewer'>) => void
  onInvite: () => void
  onSignOut: () => void
}

export function AppHeader({
  email,
  workspace,
  refreshing,
  settingsOpen,
  settingsContainerRef,
  members,
  membersLoading,
  canManageMembers,
  inviteEmail,
  inviteRole,
  inviteLoading,
  onRefresh,
  onToggleSettings,
  onInviteEmailChange,
  onInviteRoleChange,
  onInvite,
  onSignOut,
}: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-40 flex h-16 shrink-0 items-center justify-between border-b border-black bg-[#777773] px-4">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] border border-black bg-[#baf7c8] text-sm font-black leading-none text-black shadow-[2px_2px_0_#000]">
          C
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-black uppercase tracking-normal text-white">Cowork26</p>
          <p className="truncate text-xs font-bold text-neutral-100">{email}</p>
        </div>
      </div>

      <div className="relative flex min-w-0 items-center gap-2" ref={settingsContainerRef}>
        <button
          onClick={onRefresh}
          disabled={refreshing}
          className="flex h-9 w-9 items-center justify-center rounded-[8px] border border-black bg-[#50504d] text-lg font-black leading-none text-white shadow-[2px_2px_0_#000] hover:-translate-y-0.5 hover:bg-[#baf7c8] hover:text-black hover:shadow-[3px_3px_0_#000] disabled:opacity-40"
          title="새로고침"
        >
          {refreshing
            ? <span className="loading-dots text-xs tracking-widest"><span>·</span><span>·</span><span>·</span></span>
            : '↻'}
        </button>
        <button
          type="button"
          aria-label="Settings"
          aria-controls="settings-panel"
          aria-expanded={settingsOpen}
          onClick={onToggleSettings}
          className="flex h-9 w-9 items-center justify-center rounded-[8px] border border-black bg-[#50504d] text-lg font-black leading-none text-white shadow-[2px_2px_0_#000] hover:-translate-y-0.5 hover:bg-[#baf7c8] hover:text-black hover:shadow-[3px_3px_0_#000]"
          title="Settings"
        >
          ⚙
        </button>
        {settingsOpen && (
          <SettingsPanel
            email={email}
            workspace={workspace}
            members={members}
            membersLoading={membersLoading}
            canManageMembers={canManageMembers}
            inviteEmail={inviteEmail}
            inviteRole={inviteRole}
            inviteLoading={inviteLoading}
            onInviteEmailChange={onInviteEmailChange}
            onInviteRoleChange={onInviteRoleChange}
            onInvite={onInvite}
            onSignOut={onSignOut}
          />
        )}
      </div>
    </header>
  )
}
