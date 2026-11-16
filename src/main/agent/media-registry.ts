/** Maps saved source ids to absolute paths for the local media protocol. */

const mediaPaths = new Map<string, string>()
const maxMediaPaths = 4_000

export function registerMediaPath(id: string, path: string): void {
  mediaPaths.delete(id)
  mediaPaths.set(id, path)
  while (mediaPaths.size > maxMediaPaths) {
    const oldest = mediaPaths.keys().next().value
    if (oldest === undefined) break
    mediaPaths.delete(oldest)
  }
}

export function resolveMediaPath(id: string): string | undefined {
  return mediaPaths.get(id)
}
