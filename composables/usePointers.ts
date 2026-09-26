/**
 * Several fingers on one playing surface. Bind the returned handlers on the
 * surface element (which has `touch-action: none`):
 *
 *   <div @pointerdown="p.down" @pointermove="p.move" @pointerup="p.up"
 *        @pointercancel="p.up" @lostpointercapture="p.up" @contextmenu.prevent>
 *
 * Each pointerId gets its own state (usually the note it holds): `start`
 * makes it (null ignores the pointer), `move` may return a new one (a finger
 * sliding onto another key: start the new note, then release the old), and
 * `end` lets it go. The surface captures each pointer, so a finger that
 * leaves it still ends its note. `endAll` for blur and unmount.
 */
export interface PointerOps<T> {
  start(e: PointerEvent, rect: DOMRect): T | null
  move?(e: PointerEvent, rect: DOMRect, state: T): T | void
  end(state: T): void
}

export function usePointers<T>(ops: PointerOps<T>) {
  const held = new Map<number, T>()

  function down(e: PointerEvent): void {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    const el = e.currentTarget as HTMLElement
    e.preventDefault()
    const s = ops.start(e, el.getBoundingClientRect())
    if (s === null) return
    const old = held.get(e.pointerId)
    if (old !== undefined) ops.end(old)
    held.set(e.pointerId, s)
    try { el.setPointerCapture(e.pointerId) } catch { /* the pointer is gone already */ }
  }

  function move(e: PointerEvent): void {
    const s = held.get(e.pointerId)
    if (s === undefined || !ops.move) return
    const el = e.currentTarget as HTMLElement
    const n = ops.move(e, el.getBoundingClientRect(), s)
    if (n !== undefined) held.set(e.pointerId, n as T)
  }

  function up(e: PointerEvent): void {
    const s = held.get(e.pointerId)
    if (s === undefined) return
    held.delete(e.pointerId)
    ops.end(s)
  }

  function endAll(): void {
    const all = [...held.values()]
    held.clear()
    for (const s of all) ops.end(s)
  }

  return { down, move, up, endAll, held }
}
