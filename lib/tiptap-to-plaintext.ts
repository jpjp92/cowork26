type TiptapNode = {
  type?: string
  content?: TiptapNode[]
  text?: string
}

function collect(node: TiptapNode, out: string[]): void {
  if (typeof node.text === 'string' && node.text.length > 0) {
    out.push(node.text)
  }
  if (Array.isArray(node.content)) {
    for (const child of node.content) collect(child, out)
  }
}

// ProseMirror 문서 JSON에서 검색용 평문을 추출한다. text 노드를 이어붙이되
// 블록 경계 정보 없이 단순 결합하면 단어가 붙으므로 각 text 조각을 공백으로 잇고
// 중복 공백을 접는다. 마크다운 기호는 포함하지 않아 검색 정확도를 높인다.
export function tiptapToPlainText(content: Record<string, unknown> | null): string {
  if (!content) return ''
  const parts: string[] = []
  collect(content as TiptapNode, parts)
  return parts.join(' ').replace(/\s+/g, ' ').trim()
}
