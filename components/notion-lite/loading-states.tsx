export function PageTreeSkeleton() {
  return (
    <div className="grid gap-2">
      {[0, 1, 2, 3, 4].map(index => (
        <div
          key={index}
          className="h-8 animate-pulse rounded-[4px] border border-black bg-[#50504d]"
          style={{ marginLeft: index > 1 ? 20 : 0, width: `${92 - index * 7}%` }}
        />
      ))}
    </div>
  )
}

export function DocumentSkeleton() {
  return (
    <article className="mx-auto my-8 w-full max-w-4xl flex-1 rounded-[8px] border border-black bg-[#fef9ef] px-10 py-12 shadow-[6px_6px_0_#000] max-sm:mx-4 max-sm:px-5 max-sm:py-8">
      <div className="mb-4 border-b border-black pb-3">
        <div className="h-8 w-2/3 animate-pulse rounded-[4px] bg-[#d8d0c0]" />
      </div>
      <div className="space-y-4">
        <div className="h-5 w-full animate-pulse rounded-[4px] bg-[#ded7c9]" />
        <div className="h-5 w-11/12 animate-pulse rounded-[4px] bg-[#ded7c9]" />
        <div className="h-5 w-4/5 animate-pulse rounded-[4px] bg-[#ded7c9]" />
        <div className="mt-8 h-40 w-full animate-pulse rounded-[8px] border border-black bg-[#ece4d5]" />
        <div className="h-5 w-5/6 animate-pulse rounded-[4px] bg-[#ded7c9]" />
        <div className="h-5 w-2/3 animate-pulse rounded-[4px] bg-[#ded7c9]" />
      </div>
    </article>
  )
}

export function MembersSkeleton() {
  return (
    <div className="space-y-2">
      {[0, 1].map(index => (
        <div key={index} className="rounded-[8px] border border-black bg-[#62625f] px-2 py-2">
          <div className="h-3 w-4/5 animate-pulse rounded bg-[#777773]" />
          <div className="mt-2 h-4 w-16 animate-pulse rounded bg-[#baf7c8]/60" />
        </div>
      ))}
    </div>
  )
}

interface DocumentEmptyStateProps {
  hasWorkspace: boolean
  workspaceCount: number
  pageCount: number
}

export function DocumentEmptyState({ hasWorkspace, workspaceCount, pageCount }: DocumentEmptyStateProps) {
  return (
    <div className="flex flex-1 items-center justify-center px-6 py-10 text-center">
      <div className="grid w-full max-w-4xl grid-cols-[1.3fr_0.7fr] gap-4 max-lg:grid-cols-1">
        <div className="rounded-[8px] border border-black bg-[#50504d] p-8 text-left shadow-[6px_6px_0_#000]">
          <p className="text-3xl font-black uppercase text-white">
            {hasWorkspace ? '페이지를 선택하거나 새로 만드세요.' : '워크스페이스를 먼저 만드세요.'}
          </p>
        </div>
        <div className="grid gap-4">
          <div className="rounded-[8px] border border-black bg-[#50504d] p-5 text-left shadow-[4px_4px_0_#000]">
            <p className="text-xs font-black uppercase text-[#baf7c8]">Workspaces</p>
            <p className="mt-2 text-4xl font-black text-white">{workspaceCount}</p>
          </div>
          <div className="rounded-[8px] border border-black bg-[#50504d] p-5 text-left shadow-[4px_4px_0_#000]">
            <p className="text-xs font-black uppercase text-[#baf7c8]">Pages</p>
            <p className="mt-2 text-4xl font-black text-white">{pageCount}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
