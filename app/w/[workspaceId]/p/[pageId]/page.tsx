import NotionLiteApp from '../../../../../components/notion-lite-app'

interface PageRouteProps {
  params: Promise<{ workspaceId: string; pageId: string }>
}

export default async function PageRoute({ params }: PageRouteProps) {
  const { workspaceId, pageId } = await params
  return <NotionLiteApp initialWorkspaceId={workspaceId} initialPageId={pageId} />
}
