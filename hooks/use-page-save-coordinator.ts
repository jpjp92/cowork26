export class PageSaveCoordinator {
  private readonly tails = new Map<string, Promise<void>>()

  enqueue<T>(pageId: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(pageId) ?? Promise.resolve()
    const result = previous.catch(() => undefined).then(operation)
    const tail = result.then(() => undefined, () => undefined)
    this.tails.set(pageId, tail)
    tail.then(() => {
      if (this.tails.get(pageId) === tail) this.tails.delete(pageId)
    })
    return result
  }

  hasPending(pageId: string) {
    return this.tails.has(pageId)
  }

  async waitFor(pageIds?: Iterable<string>) {
    const pending = pageIds
      ? Array.from(pageIds, pageId => this.tails.get(pageId)).filter(Boolean)
      : Array.from(this.tails.values())
    await Promise.all(pending)
  }
}

