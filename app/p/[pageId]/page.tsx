import NotionLiteApp from '../../../components/notion-lite-app'

interface ShortPageRouteProps {
  params: Promise<{ pageId: string }>
}

export default async function ShortPageRoute({ params }: ShortPageRouteProps) {
  const { pageId } = await params
  return <NotionLiteApp initialPageId={pageId} />
}
