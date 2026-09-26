/**
 * The computer keyboard. One window listener (installed by JamApp) runs:
 *
 *   1. nothing while the focus is in a text field (inputs, selects, textareas);
 *   2. the open dialog's own keys (it handles Escape itself; the host closes
 *      it on Escape otherwise) and nothing else while a dialog is open;
 *   3. the transport keys (JamApp's `global` handler): Space, Enter, [ ],
 *      Tab, Ctrl/Cmd+Z / Shift+Z, Ctrl/Cmd+C / V, Delete, ?, Escape;
 *   4. the registered handlers, newest first, until one returns true.
 *
 * Instruments register here while mounted:
 *
 *   const keys = useKeys()
 *   let off = () => {}
 *   onMounted(() => { off = keys.register({ id: 'piano', down: e => ..., up: e => ..., blur: releaseAll }) })
 *   onBeforeUnmount(() => off())
 *
 * `down` returns true when it used the key (the event's default is then
 * prevented); it sees auto-repeats (check e.repeat). Every `up` sees every
 * key-up, so a held note always ends even when another handler took the
 * down. `blur` runs when the window loses focus: release everything held.
 * `keyboardUsed` turns true on the first key press outside a field, so the
 * instruments can print their key mapping on the keys.
 */
import { ref } from 'vue'

export interface KeyHandler {
  id: string
  down?: (e: KeyboardEvent) => boolean | void
  up?: (e: KeyboardEvent) => boolean | void
  blur?: () => void
}

const handlers: KeyHandler[] = []
const keyboardUsed = ref(false)
let global: KeyHandler | null = null
let dialog: KeyHandler | null = null
let installed = false

/** True while the event comes from a text field (the page's keys stay out of the way). */
export function isTyping(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null
  if (!el || !el.tagName) return false
  if (el.isContentEditable) return true
  if (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return true
  if (el.tagName === 'INPUT') {
    const type = (el as HTMLInputElement).type
    return !['button', 'checkbox', 'radio', 'range', 'submit', 'reset'].includes(type)
  }
  return false
}

function onDown(e: KeyboardEvent): void {
  if (isTyping(e.target)) return
  if (!e.metaKey && !e.ctrlKey && !e.altKey) keyboardUsed.value = true
  if (dialog) {
    if (dialog.down?.(e)) e.preventDefault()
    return
  }
  if (global?.down?.(e)) {
    e.preventDefault()
    // A focused button would also fire on this key's release.
    if ((e.key === ' ' || e.key === 'Enter') && document.activeElement instanceof HTMLButtonElement) document.activeElement.blur()
    return
  }
  if (e.metaKey || e.ctrlKey || e.altKey) return
  for (let i = handlers.length - 1; i >= 0; i--) {
    if (handlers[i]!.down?.(e)) { e.preventDefault(); return }
  }
}

function onUp(e: KeyboardEvent): void {
  for (const h of [...handlers]) h.up?.(e)
}

function onBlur(): void {
  for (const h of [...handlers]) h.blur?.()
}

export function useKeys() {
  return {
    keyboardUsed,
    /** Add a handler; returns the function that removes it. A handler with the same id replaces the old one. */
    register(h: KeyHandler): () => void {
      const i = handlers.findIndex(x => x.id === h.id)
      if (i >= 0) handlers.splice(i, 1)
      handlers.push(h)
      return () => {
        const j = handlers.indexOf(h)
        if (j >= 0) handlers.splice(j, 1)
      }
    },
    /** The transport keys (JamApp). They run before the registered handlers. */
    setGlobal(h: KeyHandler | null): void { global = h },
    /** While a dialog is open only its handler runs (DialogHost sets it). */
    setDialog(h: KeyHandler | null): void { dialog = h },
    /** Attach the window listeners once; returns a detach. */
    install(): () => void {
      if (installed || typeof window === 'undefined') return () => {}
      installed = true
      window.addEventListener('keydown', onDown)
      window.addEventListener('keyup', onUp)
      window.addEventListener('blur', onBlur)
      return () => {
        installed = false
        window.removeEventListener('keydown', onDown)
        window.removeEventListener('keyup', onUp)
        window.removeEventListener('blur', onBlur)
      }
    },
  }
}
