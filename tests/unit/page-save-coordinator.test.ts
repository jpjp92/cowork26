import { describe, expect, it } from 'vitest'
import { PageSaveCoordinator } from '../../hooks/use-page-save-coordinator'

describe('PageSaveCoordinator', () => {
  it('serializes saves for the same page', async () => {
    const coordinator = new PageSaveCoordinator()
    const events: string[] = []
    let releaseFirst: (() => void) | undefined
    const firstGate = new Promise<void>(resolve => { releaseFirst = resolve })

    const first = coordinator.enqueue('page-1', async () => {
      events.push('first:start')
      await firstGate
      events.push('first:end')
      return 1
    })
    const second = coordinator.enqueue('page-1', async () => {
      events.push('second:start')
      return 2
    })

    await Promise.resolve()
    await Promise.resolve()
    expect(events).toEqual(['first:start'])
    releaseFirst?.()
    await expect(Promise.all([first, second])).resolves.toEqual([1, 2])
    expect(events).toEqual(['first:start', 'first:end', 'second:start'])
  })

  it('allows different pages to save independently', async () => {
    const coordinator = new PageSaveCoordinator()
    const events: string[] = []

    await Promise.all([
      coordinator.enqueue('page-1', async () => { events.push('page-1') }),
      coordinator.enqueue('page-2', async () => { events.push('page-2') }),
    ])

    expect(new Set(events)).toEqual(new Set(['page-1', 'page-2']))
  })

  it('continues the queue after a failed save', async () => {
    const coordinator = new PageSaveCoordinator()
    const failed = coordinator.enqueue('page-1', async () => {
      throw new Error('save failed')
    })
    const recovered = coordinator.enqueue('page-1', async () => 'saved')

    await expect(failed).rejects.toThrow('save failed')
    await expect(recovered).resolves.toBe('saved')
    await coordinator.waitFor(['page-1'])
    expect(coordinator.hasPending('page-1')).toBe(false)
  })
})
