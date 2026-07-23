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
  onInviteEmailChange,
  onInviteRoleChange,
  onInvite,
  onSignOut,
}: SettingsPanelProps) {
  return (
    <div className="absolute right-0 top-11 z-20 w-80 rounded-[8px] border border-black bg-[#50504d] p-3 text-white shadow-[5px_5px_0_#000]">
      <p className="truncate text-xs font-bold text-neutral-100">{email}</p>
      {workspace && <p className="mt-1 truncate text-sm font-black uppercase">{workspace.name}</p>}
      {workspace && (
        <>
          <div className="mt-3 border-t border-black pt-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[11px] font-black uppercase text-neutral-100">Members</p>
              {membersLoading ? (
                <span className="loading-dots text-[11px] font-bold tracking-widest text-neutral-200"><span>·</span><span>·</span><span>·</span></span>
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
                <p className="text-xs font-bold text-neutral-200">멤버가 없습니다.</p>
              )}
            </div>
          </div>
          {canManageMembers && (
            <div className="mt-3 border-t border-black pt-3">
              <p className="mb-2 text-[11px] font-black uppercase text-neutral-100">Add Member</p>
              <input
                className="w-full rounded-[8px] border border-black bg-white px-2.5 py-2 text-sm font-bold text-black outline-none placeholder:text-[#666]"
                placeholder="이메일"
                type="email"
                value={inviteEmail}
                onChange={event => onInviteEmailChange(event.target.value)}
                onKeyDown={event => event.key === 'Enter' && onInvite()}
              />
              <div className="mt-2 flex gap-2">
                <div className="flex min-w-0 flex-1 overflow-hidden rounded-[8px] border border-black">
                  <button
                    type="button"
                    onClick={() => onInviteRoleChange('editor')}
                    className={`flex-1 py-1.5 text-xs font-black uppercase transition-colors ${
                      inviteRole === 'editor' ? 'bg-[#fde68a] text-black' : 'bg-[#62625f] text-neutral-300 hover:text-white'
                    }`}
                  >editor</button>
                  <div className="w-px bg-black" />
                  <button
                    type="button"
                    onClick={() => onInviteRoleChange('viewer')}
                    className={`flex-1 py-1.5 text-xs font-black uppercase transition-colors ${
                      inviteRole === 'viewer' ? 'bg-[#c4b5fd] text-black' : 'bg-[#62625f] text-neutral-300 hover:text-white'
                    }`}
                  >viewer</button>
                </div>
                <button
                  onClick={onInvite}
                  disabled={!inviteEmail.trim() || inviteLoading}
                  className="h-9 rounded-[8px] border border-black bg-[#baf7c8] px-3 text-xs font-black text-black shadow-[2px_2px_0_#000] disabled:opacity-40"
                >
                  {inviteLoading ? <span className="loading-dots text-xs tracking-widest"><span>·</span><span>·</span><span>·</span></span> : '멤버 추가'}
                </button>
              </div>
            </div>
          )}
        </>
      )}
      <button
        onClick={onSignOut}
        className="mt-3 h-9 w-full rounded-[8px] border border-black bg-[#baf7c8] px-3 text-xs font-black text-black shadow-[2px_2px_0_#000] hover:-translate-y-0.5 hover:shadow-[3px_3px_0_#000]"
      >
        로그아웃
      </button>
    </div>
  )
}
