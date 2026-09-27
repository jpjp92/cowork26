import type { RefObject } from 'react'
import type { Workspace, WorkspaceMember, WorkspaceRole } from '../../lib/notion-lite/types'
import { SettingsPanel } from './settings-panel'

interface AppHeaderProps {
  accessToken: string
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
  mobileNavigationOpen: boolean
  onToggleMobileNavigation: () => void
  onRefresh: () => void
  onToggleSettings: () => void
  onInviteEmailChange: (email: string) => void
  onInviteRoleChange: (role: Extract<WorkspaceRole, 'editor' | 'viewer'>) => void
  onInvite: () => void
  onSignOut: () => void
}

export function AppHeader({
  accessToken,
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
  mobileNavigationOpen,
  onToggleMobileNavigation,
  onRefresh,
  onToggleSettings,
  onInviteEmailChange,
  onInviteRoleChange,
  onInvite,
  onSignOut,
}: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-40 flex min-h-16 shrink-0 items-center justify-between gap-2 border-b border-black bg-[#777773] px-3 pt-[env(safe-area-inset-top)] sm:px-4">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          aria-label={mobileNavigationOpen ? '페이지 탐색 닫기' : '페이지 탐색 열기'}
          aria-controls="workspace-sidebar"
          aria-expanded={mobileNavigationOpen}
          onClick={onToggleMobileNavigation}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[8px] border border-black bg-[#50504d] text-xl font-black leading-none text-white shadow-[2px_2px_0_#000] hover:bg-[#baf7c8] hover:text-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white md:hidden"
        >
          {mobileNavigationOpen ? '×' : '☰'}
        </button>
        <span className="truncate text-base font-black tracking-tight text-white">Cowork26</span>
      </div>

      <div className="relative flex min-w-0 items-center gap-2" ref={settingsContainerRef}>
        <button
          onClick={onRefresh}
          disabled={refreshing}
          aria-label="새로고침"
          className="flex h-11 w-11 items-center justify-center rounded-[8px] border border-black bg-[#50504d] text-lg font-black leading-none text-white shadow-[2px_2px_0_#000] hover:-translate-y-0.5 hover:bg-[#baf7c8] hover:text-black hover:shadow-[3px_3px_0_#000] disabled:opacity-40 md:h-9 md:w-9"
          title="새로고침"
        >
          {refreshing
            ? <span className="loading-dots text-xs tracking-widest"><span>·</span><span>·</span><span>·</span></span>
            : '↻'}
        </button>
        <button
          type="button"
          aria-label="설정"
          aria-controls="settings-panel"
          aria-expanded={settingsOpen}
          onClick={onToggleSettings}
          className="flex h-11 w-11 items-center justify-center rounded-[8px] border border-black bg-[#50504d] text-lg font-black leading-none text-white shadow-[2px_2px_0_#000] hover:-translate-y-0.5 hover:bg-[#baf7c8] hover:text-black hover:shadow-[3px_3px_0_#000] sm:h-9 sm:w-9"
          title="Settings"
        >
          ⚙
        </button>
        {settingsOpen && (
          <SettingsPanel
            accessToken={accessToken}
            email={email}
            workspace={workspace}
            members={members}
            membersLoading={membersLoading}
            canManageMembers={canManageMembers}
            inviteEmail={inviteEmail}
            inviteRole={inviteRole}
            inviteLoading={inviteLoading}
            onClose={onToggleSettings}
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
