type TiptapNode = {
  type: string
  attrs?: Record<string, unknown>
  content?: TiptapNode[]
  text?: string
  marks?: { type: string; attrs?: Record<string, unknown> }[]
}

function inlineText(node: TiptapNode): string {
  if (node.type === 'text') {
    let text = node.text ?? ''
    const marks = node.marks ?? []

    // apply marks inside-out: code → bold → italic → strike → link
    const hasCode = marks.some(m => m.type === 'code')
    if (hasCode) return `\`${text}\``

    const link = marks.find(m => m.type === 'link')
    const hasBold = marks.some(m => m.type === 'bold')
    const hasItalic = marks.some(m => m.type === 'italic')
    const hasStrike = marks.some(m => m.type === 'strike')

    if (hasStrike) text = `~~${text}~~`
    if (hasBold) text = `**${text}**`
    if (hasItalic) text = `*${text}*`
    if (link) text = `[${text}](${link.attrs?.href ?? ''})`

    return text
  }

  if (node.type === 'hardBreak') return '  \n'

  return (node.content ?? []).map(inlineText).join('')
}

function convertNode(node: TiptapNode, listDepth = 0): string {
  switch (node.type) {
    case 'doc':
      return (node.content ?? []).map(n => convertNode(n, listDepth)).join('\n')

    case 'paragraph': {
      const text = (node.content ?? []).map(inlineText).join('')
      return text
    }

    case 'heading': {
      const level = (node.attrs?.level as number) ?? 1
      const prefix = '#'.repeat(level)
      const text = (node.content ?? []).map(inlineText).join('')
      return `${prefix} ${text}`
    }

    case 'bulletList':
      return (node.content ?? []).map(n => convertNode(n, listDepth)).join('\n')

    case 'orderedList': {
      return (node.content ?? []).map((n, i) => convertListItem(n, listDepth, i + 1)).join('\n')
    }

    case 'listItem': {
      const indent = '  '.repeat(listDepth)
      const [first, ...rest] = node.content ?? []
      const firstText = first ? (first.content ?? []).map(inlineText).join('') : ''
      const nested = rest.map(n => convertNode(n, listDepth + 1)).filter(Boolean).join('\n')
      return nested
        ? `${indent}- ${firstText}\n${nested}`
        : `${indent}- ${firstText}`
    }

    case 'blockquote': {
      const inner = (node.content ?? []).map(n => convertNode(n)).join('\n')
      return inner.split('\n').map(line => `> ${line}`).join('\n')
    }

    case 'codeBlock': {
      const lang = (node.attrs?.language as string) ?? ''
      const code = (node.content ?? []).map(n => n.text ?? '').join('')
      return `\`\`\`${lang}\n${code}\n\`\`\``
    }

    case 'mermaidBlock': {
      const code = (node.attrs?.code as string) ?? ''
      return `\`\`\`mermaid\n${code}\n\`\`\``
    }

    case 'image': {
      const src = typeof node.attrs?.src === 'string' ? node.attrs.src : ''
      if (!src) return ''
      const alt = typeof node.attrs?.alt === 'string' ? node.attrs.alt : ''
      const title = typeof node.attrs?.title === 'string' ? node.attrs.title : ''
      return title ? `![${alt}](${src} "${title}")` : `![${alt}](${src})`
    }

    case 'table': {
      const rows = node.content ?? []
      if (rows.length === 0) return ''
      const lines: string[] = []
      rows.forEach((row, rowIndex) => {
        const cells = (row.content ?? []).map(cell => {
          const text = (cell.content ?? []).map(n => convertNode(n)).join(' ').replace(/\n/g, ' ')
          return text.trim()
        })
        lines.push(`| ${cells.join(' | ')} |`)
        if (rowIndex === 0) {
          lines.push(`| ${cells.map(() => '---').join(' | ')} |`)
        }
      })
      return lines.join('\n')
    }

    case 'horizontalRule':
      return '---'

    default:
      return (node.content ?? []).map(n => convertNode(n, listDepth)).join('\n')
  }
}

function convertListItem(node: TiptapNode, depth: number, index: number): string {
  const indent = '  '.repeat(depth)
  const [first, ...rest] = node.content ?? []
  const firstText = first ? (first.content ?? []).map(inlineText).join('') : ''
  const nested = rest.map(n => convertNode(n, depth + 1)).filter(Boolean).join('\n')
  return nested
    ? `${indent}${index}. ${firstText}\n${nested}`
    : `${indent}${index}. ${firstText}`
}

export function tiptapToMarkdown(title: string, content: Record<string, unknown> | null): string {
  const header = `# ${title}\n\n`
  if (!content) return header

  const lines = ((content as TiptapNode).content ?? []).map(node => convertNode(node))
  const body = lines
    .join('\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd()

  return header + body
}
