/**
 * Dialogs: one open at a time, shown by DialogHost (mounted once in JamApp).
 *
 * Convention: a dialog is `components/dialogs/<Name>Dialog.vue` and opens with
 * `useDialogs().open('<name>', props)`, where <name> is the file name's
 * first word in lower case: 'new' → NewDialog.vue, 'pieces' → PiecesDialog,
 * 'library', 'step', 'snippet', 'opus', 'feel', 'channel', 'help'. The
 * component is loaded on first open (a lazy chunk). It receives `props` as
 * its props and emits `close` when done; build it on `DialogFrame.vue` (the
 * notched box, title, veil, Escape) like HelpDialog.vue. While it is open the
 * page's keys are off; it may take keys with `useKeys().setDialog()`
 * (DialogHost sets a handler that closes on Escape).
 *
 * `open()` of a dialog that is not built yet says so in a toast and returns false.
 */
import { shallowRef } from 'vue'
import type { Component } from 'vue'

const loaders = import.meta.glob<{ default: Component }>('../components/dialogs/*Dialog.vue')

/** 'step' → '../components/dialogs/StepDialog.vue' */
function fileOf(name: string): string {
  return `../components/dialogs/${name.charAt(0).toUpperCase()}${name.slice(1)}Dialog.vue`
}

export interface OpenDialog {
  name: string
  props: Record<string, unknown>
  /** Bumps on every open, so reopening the same dialog remounts it. */
  n: number
}

const current = shallowRef<OpenDialog | null>(null)
let n = 0

export function useDialogs() {
  return {
    current,
    /** Is there a component for this dialog? */
    has(name: string): boolean { return !!loaders[fileOf(name)] },
    loader(name: string): (() => Promise<{ default: Component }>) | null { return loaders[fileOf(name)] ?? null },
    open(name: string, props: Record<string, unknown> = {}): boolean {
      if (!loaders[fileOf(name)]) {
        useJam().say(`${name.toUpperCase()} IS NOT BUILT YET`, 'warn')
        return false
      }
      current.value = { name, props, n: ++n }
      return true
    },
    close(): void { current.value = null },
  }
}
