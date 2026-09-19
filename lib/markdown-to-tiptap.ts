// 마크다운 텍스트를 Tiptap JSON 구조로 변환하는 프로덕션급 파서임
export interface TiptapMark {
  type: string
  attrs?: Record<string, unknown>
}

export interface TiptapNode {
  type: string
  attrs?: Record<string, unknown>
  content?: TiptapNode[]
  text?: string
  marks?: TiptapMark[]
}

// 인라인 마크다운 텍스트 파싱함 (bold, italic, strike, code, link, mathInline)
export function parseInlineText(text: string): TiptapNode[] {
  if (!text) return []

  const nodes: TiptapNode[] = []
  const tokenRegex = /(!?\[([^\]]*)\]\(([^)]+)\))|(`([^`]+)`)|(\$([^$\n]+)\$)|(\*\*([^*]+)\*\*)|(\*([^*]+)\*)|(~~([^~]+)~~)/g

  let match: RegExpExecArray | null
  let lastIndex = 0

  while ((match = tokenRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      const plain = text.substring(lastIndex, match.index)
      if (plain) {
        nodes.push({ type: 'text', text: plain })
      }
    }

    const fullMatch = match[0]
    if (fullMatch.startsWith('![')) {
      const alt = match[2] || ''
      const src = match[3] || ''
      nodes.push({
        type: 'image',
        attrs: { src, alt },
      })
    } else if (fullMatch.startsWith('[')) {
      const linkText = match[2] || ''
      const href = match[3] || ''
      nodes.push({
        type: 'text',
        text: linkText,
        marks: [{ type: 'link', attrs: { href } }],
      })
    } else if (fullMatch.startsWith('`')) {
      const codeText = match[5] || ''
      nodes.push({
        type: 'text',
        text: codeText,
        marks: [{ type: 'code' }],
      })
    } else if (fullMatch.startsWith('$')) {
      const latex = match[7] || ''
      nodes.push({
        type: 'mathInline',
        attrs: { latex },
      })
    } else if (fullMatch.startsWith('**')) {
      const boldText = match[9] || ''
      nodes.push({
        type: 'text',
        text: boldText,
        marks: [{ type: 'bold' }],
      })
    } else if (fullMatch.startsWith('*')) {
      const italicText = match[11] || ''
      nodes.push({
        type: 'text',
        text: italicText,
        marks: [{ type: 'italic' }],
      })
    } else if (fullMatch.startsWith('~~')) {
      const strikeText = match[13] || ''
      nodes.push({
        type: 'text',
        text: strikeText,
        marks: [{ type: 'strike' }],
      })
    }

    lastIndex = match.index + fullMatch.length
  }

  if (lastIndex < text.length) {
    const trailing = text.substring(lastIndex)
    if (trailing) {
      nodes.push({ type: 'text', text: trailing })
    }
  }

  return nodes.length > 0 ? nodes : [{ type: 'text', text }]
}

// 마크다운 전체 문자열을 Tiptap Root Document JSON으로 파싱함
export function markdownToTiptap(markdown: string): { type: string; content: TiptapNode[] } {
  if (!markdown || !markdown.trim()) {
    return {
      type: 'doc',
      content: [{ type: 'paragraph' }],
    }
  }

  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const content: TiptapNode[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    if (line.trim() === '') {
      i++
      continue
    }

    if (line.trim().startsWith('$$')) {
      let latex = ''
      const inlineMathEnd = line.trim().slice(2).indexOf('$$')
      if (inlineMathEnd !== -1 && line.trim().length > 4) {
        latex = line.trim().slice(2, -2).trim()
        i++
      } else {
        i++
        const latexLines: string[] = []
        while (i < lines.length && !lines[i].trim().endsWith('$$')) {
          latexLines.push(lines[i])
          i++
        }
        if (i < lines.length && lines[i].trim().endsWith('$$')) {
          const lastLine = lines[i].trim().replace(/\$\$$/, '')
          if (lastLine) latexLines.push(lastLine)
          i++
        }
        latex = latexLines.join('\n').trim()
      }
      content.push({
        type: 'mathBlock',
        attrs: { latex },
      })
      continue
    }

    if (line.trim().startsWith('```')) {
      const lang = line.trim().replace(/^```/, '').trim()
      i++
      const codeLines: string[] = []
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i])
        i++
      }
      if (i < lines.length) i++

      const rawCode = codeLines.join('\n')
      if (lang === 'mermaid') {
        content.push({
          type: 'mermaidBlock',
          attrs: { code: rawCode },
        })
      } else {
        content.push({
          type: 'codeBlock',
          attrs: { language: lang || 'text' },
          content: rawCode ? [{ type: 'text', text: rawCode }] : [],
        })
      }
      continue
    }

    if (/^(\*{3,}|-{3,}|_{3,})$/.test(line.trim())) {
      content.push({ type: 'horizontalRule' })
      i++
      continue
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/)
    if (headingMatch) {
      const level = headingMatch[1].length
      const headingText = headingMatch[2].trim()
      content.push({
        type: 'heading',
        attrs: { level },
        content: parseInlineText(headingText),
      })
      i++
      continue
    }

    if (line.trim().startsWith('>')) {
      const quoteLines: string[] = []
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ''))
        i++
      }
      const quoteContent: TiptapNode[] = quoteLines.map(qLine => ({
        type: 'paragraph',
        content: parseInlineText(qLine),
      }))
      content.push({
        type: 'blockquote',
        content: quoteContent,
      })
      continue
    }

    if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
      const tableRows: TiptapNode[] = []
      let isHeader = true

      while (i < lines.length && lines[i].trim().startsWith('|') && lines[i].trim().endsWith('|')) {
        const curLine = lines[i].trim()
        if (/^\|(\s*:?-+:?\s*\|)+$/.test(curLine)) {
          i++
          isHeader = false
          continue
        }

        const rawCells = curLine
          .slice(1, -1)
          .split('|')
          .map(c => c.trim())

        const rowContent: TiptapNode[] = rawCells.map(cellText => ({
          type: isHeader ? 'tableHeader' : 'tableCell',
          content: [{
            type: 'paragraph',
            content: parseInlineText(cellText),
          }],
        }))

        tableRows.push({
          type: 'tableRow',
          content: rowContent,
        })

        i++
      }

      if (tableRows.length > 0) {
        content.push({
          type: 'table',
          content: tableRows,
        })
      }
      continue
    }

    if (/^\s*[-*]\s+(.*)$/.test(line)) {
      const listItems: TiptapNode[] = []
      while (i < lines.length && /^\s*[-*]\s+(.*)$/.test(lines[i])) {
        const itemMatch = lines[i].match(/^\s*[-*]\s+(.*)$/)
        const itemText = itemMatch ? itemMatch[1] : ''
        listItems.push({
          type: 'listItem',
          content: [{
            type: 'paragraph',
            content: parseInlineText(itemText),
          }],
        })
        i++
      }
      content.push({
        type: 'bulletList',
        content: listItems,
      })
      continue
    }

    if (/^\s*\d+\.\s+(.*)$/.test(line)) {
      const listItems: TiptapNode[] = []
      while (i < lines.length && /^\s*\d+\.\s+(.*)$/.test(lines[i])) {
        const itemMatch = lines[i].match(/^\s*\d+\.\s+(.*)$/)
        const itemText = itemMatch ? itemMatch[1] : ''
        listItems.push({
          type: 'listItem',
          content: [{
            type: 'paragraph',
            content: parseInlineText(itemText),
          }],
        })
        i++
      }
      content.push({
        type: 'orderedList',
        content: listItems,
      })
      continue
    }

    content.push({
      type: 'paragraph',
      content: parseInlineText(line),
    })
    i++
  }

  return {
    type: 'doc',
    content: content.length > 0 ? content : [{ type: 'paragraph' }],
  }
}
