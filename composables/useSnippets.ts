/**
 * Snippets: bars of one track kept for the library. Members keep them on
 * radio-api (/api/jam/snippets); signed out they live in this browser
 * (localStorage 'jam.snippets'). The library shows both, local ones marked.
 */
import { ref } from 'vue'
import type { Snippet } from './useJamApi'
import { load, save } from './storage'

const LS = 'jam.snippets'
const MAX_LOCAL = 100

/** A snippet as the library lists it: `local` ones have a string id. */
export interface AnySnippet extends Omit<Snippet, 'id'> { id: number | string; local?: boolean }

const remote = ref<AnySnippet[]>([])
const local = ref<AnySnippet[]>([])
const state = ref<'idle' | 'loading' | 'ok' | 'error'>('idle')

function readLocal(): void {
  const raw = load<AnySnippet[]>(LS, [])
  local.value = Array.isArray(raw) ? raw.filter(s => s && Array.isArray(s.track?.bars)).map(s => ({ ...s, local: true })) : []
}

async function refresh(): Promise<void> {
  readLocal()
  if (!useAuth().allowed.value) { remote.value = []; state.value = 'ok'; return }
  state.value = 'loading'
  try {
    const r = await useJamApi().listSnippets()
    remote.value = r.snippets
    state.value = 'ok'
  } catch {
    remote.value = []
    state.value = 'error'
  }
}

function saveLocal(s: Omit<Snippet, 'id' | 'createdAt'>): AnySnippet {
  readLocal()
  const row: AnySnippet = { ...s, id: `l-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4)}`, createdAt: new Date().toISOString(), local: true }
  local.value = [row, ...local.value].slice(0, MAX_LOCAL)
  save(LS, local.value.map(({ local: _l, ...rest }) => rest))
  return row
}

/** Keep a snippet: on radio-api for members (in this browser when that fails or when signed out). Returns where it went. */
async function add(s: Omit<Snippet, 'id' | 'createdAt'>): Promise<'saved' | 'local'> {
  if (useAuth().allowed.value) {
    try {
      const r = await useJamApi().postSnippet(s)
      remote.value = [r.snippet, ...remote.value]
      return 'saved'
    } catch { /* fall through: keep it here */ }
  }
  saveLocal(s)
  return 'local'
}

async function remove(s: AnySnippet): Promise<boolean> {
  if (s.local || typeof s.id === 'string') {
    readLocal()
    local.value = local.value.filter(x => x.id !== s.id)
    save(LS, local.value.map(({ local: _l, ...rest }) => rest))
    return true
  }
  try {
    await useJamApi().deleteSnippet(s.id)
    remote.value = remote.value.filter(x => x.id !== s.id)
    return true
  } catch {
    return false
  }
}

export function useSnippets() {
  return { remote, local, state, refresh, add, remove }
}
