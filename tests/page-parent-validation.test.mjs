import assert from 'node:assert/strict'
import { getPageParentValidationError } from '../lib/notion-lite/page-tree.ts'

const workspaceId = '11111111-1111-4111-8111-111111111111'
const otherWorkspaceId = '22222222-2222-4222-8222-222222222222'
const pages = [
  { id: 'root', workspace_id: workspaceId, parent_id: null },
  { id: 'child', workspace_id: workspaceId, parent_id: 'root' },
  { id: 'grandchild', workspace_id: workspaceId, parent_id: 'child' },
  { id: 'foreign', workspace_id: otherWorkspaceId, parent_id: null },
]

assert.equal(getPageParentValidationError(pages, 'new', workspaceId, null), null)
assert.equal(getPageParentValidationError(pages, 'new', workspaceId, 'root'), null)
assert.match(getPageParentValidationError(pages, 'root', workspaceId, 'root'), /own parent/)
assert.match(getPageParentValidationError(pages, 'root', workspaceId, 'grandchild'), /cycle/)
assert.match(getPageParentValidationError(pages, 'new', workspaceId, 'foreign'), /same workspace/)
assert.match(getPageParentValidationError(pages, 'new', workspaceId, 'missing'), /same workspace/)

const alreadyCyclic = [
  { id: 'a', workspace_id: workspaceId, parent_id: 'b' },
  { id: 'b', workspace_id: workspaceId, parent_id: 'a' },
]
assert.match(getPageParentValidationError(alreadyCyclic, 'new', workspaceId, 'a'), /already contains a cycle/)

console.log('page parent validation security test: passed')
