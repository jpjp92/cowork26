type JsonNode = {
  type?: string
  attrs?: Record<string, unknown>
  text?: string
  content?: JsonNode[]
}

function textNode(text: string): JsonNode {
  return { type: 'text', text }
}

function paragraph(lines: string[]): JsonNode | null {
  const text = lines.join(' ').trim()
  if (!text) return null
  return { type: 'paragraph', content: [textNode(text)] }
}

function listItem(text: string): JsonNode {
  return {
    type: 'listItem',
    content: [{ type: 'paragraph', content: [textNode(text)] }],
  }
}

export function markdownToTiptap(markdown: string): Record<string, unknown> {
  const nodes: JsonNode[] = []
  const paragraphLines: string[] = []
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  let codeFence: { language: string | null; lines: string[] } | null = null

  const flushParagraph = () => {
    const node = paragraph(paragraphLines)
    if (node) nodes.push(node)
    paragraphLines.length = 0
  }

  for (const line of lines) {
    const fenceMatch = line.match(/^```(\w+)?\s*$/)
    if (fenceMatch) {
      if (codeFence) {
        nodes.push({
          type: 'codeBlock',
          attrs: { language: codeFence.language },
          content: codeFence.lines.length ? [textNode(codeFence.lines.join('\n'))] : undefined,
        })
        codeFence = null
      } else {
        flushParagraph()
        codeFence = { language: fenceMatch[1] ?? null, lines: [] }
      }
      continue
    }

    if (codeFence) {
      codeFence.lines.push(line)
      continue
    }

    if (!line.trim()) {
      flushParagraph()
      continue
    }

    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/)
    if (headingMatch) {
      flushParagraph()
      nodes.push({
        type: 'heading',
        attrs: { level: headingMatch[1].length },
        content: [textNode(headingMatch[2])],
      })
      continue
    }

    const quoteMatch = line.match(/^>\s?(.+)$/)
    if (quoteMatch) {
      flushParagraph()
      nodes.push({
        type: 'blockquote',
        content: [{ type: 'paragraph', content: [textNode(quoteMatch[1])] }],
      })
      continue
    }

    const bulletMatch = line.match(/^[-*]\s+(.+)$/)
    if (bulletMatch) {
      flushParagraph()
      nodes.push({ type: 'bulletList', content: [listItem(bulletMatch[1])] })
      continue
    }

    const orderedMatch = line.match(/^\d+\.\s+(.+)$/)
    if (orderedMatch) {
      flushParagraph()
      nodes.push({ type: 'orderedList', content: [listItem(orderedMatch[1])] })
      continue
    }

    paragraphLines.push(line)
  }

  if (codeFence) {
    nodes.push({
      type: 'codeBlock',
      attrs: { language: codeFence.language },
      content: codeFence.lines.length ? [textNode(codeFence.lines.join('\n'))] : undefined,
    })
  }
  flushParagraph()

  return {
    type: 'doc',
    content: nodes.length ? nodes : [{ type: 'paragraph' }],
  }
}

function nodeText(node: JsonNode | undefined): string {
  if (!node) return ''
  if (node.text) return node.text
  return node.content?.map(nodeText).join('') ?? ''
}

function renderList(node: JsonNode, ordered: boolean): string {
  return (node.content ?? [])
    .map((item, index) => {
      const marker = ordered ? `${index + 1}.` : '-'
      return `${marker} ${nodeText(item).trim()}`
    })
    .join('\n')
}

function renderNode(node: JsonNode): string {
  switch (node.type) {
    case 'heading':
      return `${'#'.repeat(Number(node.attrs?.level ?? 1))} ${nodeText(node).trim()}`
    case 'paragraph':
      return nodeText(node).trim()
    case 'blockquote':
      return `> ${nodeText(node).trim()}`
    case 'bulletList':
      return renderList(node, false)
    case 'orderedList':
      return renderList(node, true)
    case 'codeBlock':
      return `\`\`\`${node.attrs?.language ?? ''}\n${nodeText(node)}\n\`\`\``
    case 'horizontalRule':
      return '---'
    default:
      return nodeText(node).trim()
  }
}

export function tiptapToMarkdown(content: Record<string, unknown> | null): string {
  const root = content as JsonNode | null
  return (root?.content ?? [])
    .map(renderNode)
    .filter(Boolean)
    .join('\n\n')
}
