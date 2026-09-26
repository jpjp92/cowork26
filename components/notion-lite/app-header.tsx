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
  mobileNavigationOpen: boolean
  onToggleMobileNavigation: () => void
  onSearch: () => void
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
  mobileNavigationOpen,
  onToggleMobileNavigation,
  onSearch,
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
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] border border-black bg-[#baf7c8] text-sm font-black leading-none text-black shadow-[2px_2px_0_#000]">
          C
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-black uppercase tracking-normal text-white">Cowork26</p>
          <p className="hidden truncate text-xs font-bold text-neutral-100 sm:block">{email}</p>
        </div>
      </div>

      <div className="relative flex min-w-0 items-center gap-2" ref={settingsContainerRef}>
        <button
          type="button"
          onClick={onSearch}
          disabled={!workspace}
          aria-label="페이지 검색"
          aria-controls="page-search-dialog"
          className="flex h-11 w-11 items-center justify-center rounded-[8px] border border-black bg-[#50504d] text-lg font-black leading-none text-white shadow-[2px_2px_0_#000] hover:bg-[#baf7c8] hover:text-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-40 md:hidden"
          title="페이지 검색"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current" strokeWidth="2.25">
            <circle cx="11" cy="11" r="6.5" />
            <path d="m16 16 4 4" strokeLinecap="round" />
          </svg>
        </button>
        <button
          onClick={onRefresh}
          disabled={refreshing}
          aria-label="새로고침"
          className="hidden h-9 w-9 items-center justify-center rounded-[8px] border border-black bg-[#50504d] text-lg font-black leading-none text-white shadow-[2px_2px_0_#000] hover:-translate-y-0.5 hover:bg-[#baf7c8] hover:text-black hover:shadow-[3px_3px_0_#000] disabled:opacity-40 md:flex"
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
