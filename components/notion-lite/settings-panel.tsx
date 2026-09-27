'use client'

import { useState } from 'react'
import type { Workspace, WorkspaceMember, WorkspaceRole } from '../../lib/notion-lite/types'
import { getRoleBadgeClass } from '../../lib/notion-lite/roles'
import { MembersSkeleton } from './loading-states'
import { AiCredentialSettings } from './ai-credential-settings'
import { WorkspaceAiPolicySettings } from './workspace-ai-policy'
import { UtilityPanel } from './utility-panel'

interface SettingsPanelProps {
  accessToken: string
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
  accessToken,
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
  const [workspaceExpanded, setWorkspaceExpanded] = useState(false)
  const [showAllMembers, setShowAllMembers] = useState(false)
  const visibleMembers = showAllMembers ? members : members.slice(0, 3)

  return (
    <UtilityPanel id="settings-panel" title="설정" description="계정과 워크스페이스 관리" closeLabel="설정 닫기" onClose={onClose} tone="dark">
      <section aria-labelledby="account-settings-heading">
        <p id="account-settings-heading" className="text-[11px] font-black uppercase text-neutral-200">계정</p>
        <p className="mt-1 truncate text-xs font-bold text-neutral-100">{email}</p>
      </section>
      {workspace && (
        <section className="mt-3 border-t border-black pt-3" aria-labelledby="workspace-settings-heading">
          <button
            type="button"
            aria-expanded={workspaceExpanded}
            aria-controls="workspace-settings-content"
            onClick={() => setWorkspaceExpanded(value => {
              if (value) setShowAllMembers(false)
              return !value
            })}
            className="flex min-h-11 w-full items-center justify-between gap-3 rounded-[8px] px-1 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            <span className="min-w-0">
              <span id="workspace-settings-heading" className="block text-[11px] font-black uppercase text-neutral-100">워크스페이스 · 멤버</span>
              <span className="mt-0.5 block truncate text-xs font-bold text-neutral-200">{workspace.name}</span>
            </span>
            <span className="flex shrink-0 items-center gap-2">
              <span className="rounded border border-black bg-[#baf7c8] px-1.5 py-0.5 text-[10px] font-black text-black">
                {membersLoading ? '확인 중' : `${members.length}명`}
              </span>
              <span aria-hidden="true" className={`text-sm font-black transition-transform ${workspaceExpanded ? 'rotate-90' : ''}`}>›</span>
            </span>
          </button>
          {workspaceExpanded && (
            <div id="workspace-settings-content">
            <div className="mb-2 mt-3 flex items-center justify-between border-t border-black pt-3">
              <p className="text-[11px] font-black uppercase text-neutral-100">멤버</p>
              {membersLoading ? (
                <span aria-label="Loading members" role="status" className="loading-dots text-[11px] font-bold tracking-widest text-neutral-200"><span aria-hidden="true">·</span><span aria-hidden="true">·</span><span aria-hidden="true">·</span></span>
              ) : (
                <span className="border border-black bg-[#baf7c8] px-1.5 text-[11px] font-black text-black">
                  {members.length}
                </span>
              )}
            </div>
            <div className="space-y-2">
              {membersLoading && members.length === 0 ? (
                <MembersSkeleton />
              ) : visibleMembers.map(member => (
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
            {members.length > 3 && (
              <button
                type="button"
                aria-expanded={showAllMembers}
                onClick={() => setShowAllMembers(value => !value)}
                className="mt-2 min-h-11 w-full rounded-[8px] text-xs font-bold text-neutral-100 underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white md:min-h-8"
              >{showAllMembers ? '멤버 접기' : `나머지 ${members.length - 3}명 보기`}</button>
            )}
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
            </div>
          )}
        </section>
      )}
      <AiCredentialSettings accessToken={accessToken} />
      {workspace && (
        <WorkspaceAiPolicySettings
          accessToken={accessToken}
          workspaceId={workspace.id}
          canManage={canManageMembers}
        />
      )}
      <section aria-labelledby="logout-heading" className="mt-3 border-t border-black pt-3">
        <h2 id="logout-heading" className="text-[11px] font-black uppercase text-neutral-100">로그아웃</h2>
        <button
          type="button"
          onClick={onSignOut}
          className="mt-2 h-11 w-full rounded-[8px] border border-black bg-[#baf7c8] px-3 text-xs font-black text-black shadow-[2px_2px_0_#000] hover:-translate-y-0.5 hover:shadow-[3px_3px_0_#000] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white md:h-9"
        >
          Logout
        </button>
      </section>
    </UtilityPanel>
  )
}
