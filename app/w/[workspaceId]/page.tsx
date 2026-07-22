import NotionLiteApp from '../../../components/notion-lite-app'

interface WorkspaceRouteProps {
  params: Promise<{ workspaceId: string }>
}

export default async function WorkspaceRoute({ params }: WorkspaceRouteProps) {
  const { workspaceId } = await params
  return <NotionLiteApp initialWorkspaceId={workspaceId} />
}
