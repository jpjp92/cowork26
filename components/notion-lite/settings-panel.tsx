import type { Workspace, WorkspaceMember, WorkspaceRole } from '../../lib/notion-lite/types'
import { getRoleBadgeClass } from '../../lib/notion-lite/roles'
import { MembersSkeleton } from './loading-states'

interface SettingsPanelProps {
  email: string
  workspace?: Workspace
  members: WorkspaceMember[]
  membersLoading: boolean
  canManageMembers: boolean
  inviteEmail: string
  inviteRole: Extract<WorkspaceRole, 'editor' | 'viewer'>
  inviteLoading: boolean
  onClose: () => void
  onInviteEmailChange: (email: string) => void
  onInviteRoleChange: (role: Extract<WorkspaceRole, 'editor' | 'viewer'>) => void
  onInvite: () => void
  onSignOut: () => void
}

export function SettingsPanel({
  email,
  workspace,
  members,
  membersLoading,
  canManageMembers,
  inviteEmail,
  inviteRole,
  inviteLoading,
  onClose,
  onInviteEmailChange,
  onInviteRoleChange,
  onInvite,
  onSignOut,
}: SettingsPanelProps) {
  return (
    <>
      <div
        aria-hidden="true"
        className="fixed inset-0 z-40 bg-black/45 md:hidden"
        onClick={onClose}
      />
      <div
        id="settings-panel"
        role="dialog"
        aria-label="설정"
        className="fixed inset-y-0 right-0 z-50 w-[min(92vw,24rem)] overflow-y-auto overscroll-contain border-l border-black bg-[#50504d] px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] text-white shadow-[-6px_0_0_#000] md:absolute md:inset-y-auto md:right-0 md:top-11 md:max-h-[calc(100dvh-5rem)] md:w-[min(20rem,calc(100vw-2rem))] md:rounded-[8px] md:border md:p-3 md:shadow-[5px_5px_0_#000]"
      >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-bold text-neutral-100">{email}</p>
          {workspace && <p className="mt-1 truncate text-sm font-black uppercase">{workspace.name}</p>}
        </div>
        <button
          type="button"
          aria-label="설정 닫기"
          onClick={onClose}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[8px] border border-black bg-[#62625f] text-xl font-black text-white md:hidden"
        >
          ×
        </button>
      </div>
      {workspace && (
        <>
          <div className="mt-3 border-t border-black pt-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[11px] font-black uppercase text-neutral-100">Members</p>
              {membersLoading ? (
                <span aria-label="Loading members" role="status" className="loading-dots text-[11px] font-bold tracking-widest text-neutral-200"><span aria-hidden="true">·</span><span aria-hidden="true">·</span><span aria-hidden="true">·</span></span>
              ) : (
                <span className="border border-black bg-[#baf7c8] px-1.5 text-[11px] font-black text-black">
                  {members.length}
                </span>
              )}
            </div>
            <div className="max-h-40 space-y-2 overflow-y-auto pr-1">
              {membersLoading && members.length === 0 ? (
                <MembersSkeleton />
              ) : members.map(member => (
                <div key={member.user_id} className="rounded-[8px] border border-black bg-[#62625f] px-2 py-2">
                  <p className="truncate text-xs font-bold text-white">{member.email ?? member.user_id}</p>
                  <span className={`mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-black uppercase ${getRoleBadgeClass(member.role)}`}>
                    {member.role}
                  </span>
                </div>
              ))}
              {!membersLoading && members.length === 0 && (
                <p className="text-xs font-bold text-neutral-200">No members yet.</p>
              )}
            </div>
          </div>
          {canManageMembers && (
            <div className="mt-3 border-t border-black pt-3">
              <label htmlFor="member-email" className="mb-2 block text-[11px] font-black uppercase text-neutral-100">
                Add Member
              </label>
              <input
                id="member-email"
                aria-label="Member email"
                autoComplete="email"
                className="w-full rounded-[8px] border border-black bg-white px-2.5 py-2 text-base font-bold text-black outline-none placeholder:text-[#666] focus-visible:ring-2 focus-visible:ring-[#baf7c8] focus-visible:ring-offset-2 focus-visible:ring-offset-[#50504d] md:text-sm"
                placeholder="Email"
                type="email"
                value={inviteEmail}
                onChange={event => onInviteEmailChange(event.target.value)}
                onKeyDown={event => event.key === 'Enter' && onInvite()}
              />
              <div className="mt-2 flex gap-2">
                <div role="group" aria-label="Member role" className="flex min-w-0 flex-1 overflow-hidden rounded-[8px] border border-black">
                  <button
                    type="button"
                    aria-pressed={inviteRole === 'editor'}
                    onClick={() => onInviteRoleChange('editor')}
                    className={`min-h-11 flex-1 py-1.5 text-xs font-black uppercase transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-white md:min-h-0 ${
                      inviteRole === 'editor' ? 'bg-[#fde68a] text-black' : 'bg-[#62625f] text-neutral-300 hover:text-white'
                    }`}
                  >editor</button>
                  <div className="w-px bg-black" />
                  <button
                    type="button"
                    aria-pressed={inviteRole === 'viewer'}
                    onClick={() => onInviteRoleChange('viewer')}
                    className={`min-h-11 flex-1 py-1.5 text-xs font-black uppercase transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-white md:min-h-0 ${
                      inviteRole === 'viewer' ? 'bg-[#c4b5fd] text-black' : 'bg-[#62625f] text-neutral-300 hover:text-white'
                    }`}
                  >viewer</button>
                </div>
                <button
                  type="button"
                  aria-label={inviteLoading ? 'Adding member' : 'Add member'}
                  aria-busy={inviteLoading}
                  onClick={onInvite}
                  disabled={!inviteEmail.trim() || inviteLoading}
                  className="h-11 rounded-[8px] border border-black bg-[#baf7c8] px-3 text-xs font-black text-black shadow-[2px_2px_0_#000] hover:-translate-y-0.5 hover:shadow-[3px_3px_0_#000] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-[2px_2px_0_#000] md:h-9"
                >
                  {inviteLoading ? <span aria-hidden="true" className="loading-dots text-xs tracking-widest"><span>·</span><span>·</span><span>·</span></span> : 'Add'}
                </button>
              </div>
            </div>
          )}
        </>
      )}
      <button
        type="button"
        onClick={onSignOut}
        className="mt-3 h-11 w-full rounded-[8px] border border-black bg-[#baf7c8] px-3 text-xs font-black text-black shadow-[2px_2px_0_#000] hover:-translate-y-0.5 hover:shadow-[3px_3px_0_#000] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white md:h-9"
      >
        Logout
      </button>
      </div>
    </>
  )
}
