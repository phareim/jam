// jam.phareim.no: Nuxt 3 on a Cloudflare Worker behind Reader login. The
// music runs client-side on the radio's engine (the `radio/` submodule);
// the Worker renders the shell and proxies saving and Opus to radio-api.
import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('.', import.meta.url))
/** Where radio/ really lives: a symlink to the radio worktree during development, a submodule in CI. */
const radioDir = (() => { try { return realpathSync(new URL('./radio', import.meta.url)) } catch { return root } })()

export default defineNuxtConfig({
  compatibilityDate: '2024-09-23',
  devtools: { enabled: false },
  ssr: true,

  css: ['~/radio/scene/assets/pixel.css', '~/assets/css/main.css'],

  // Components by file name alone: components/instruments/InstrumentPiano.vue
  // is <InstrumentPiano>, components/dialogs/HelpDialog.vue is <HelpDialog>.
  components: [{ path: '~/components', pathPrefix: false }],

  app: {
    head: {
      title: 'Jam',
      htmlAttrs: { lang: 'en' },
      meta: [
        { name: 'description', content: 'An instrument on the radio\'s engine: loops of eight-bar phrases you play, write, grow and hand to Opus.' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no' },
        { name: 'theme-color', content: '#0b0616' },
        { name: 'color-scheme', content: 'dark' },
        { name: 'mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' },
        { name: 'apple-mobile-web-app-title', content: 'Jam' },
        { property: 'og:title', content: 'Jam · phareim.no' },
        { property: 'og:url', content: 'https://jam.phareim.no/' },
      ],
      link: [
        { rel: 'manifest', href: '/manifest.webmanifest' },
      ],
    },
  },

  nitro: {
    preset: 'cloudflare-module',
  },

  runtimeConfig: {
    radioApiUrl: '', // NUXT_RADIO_API_URL (wrangler [vars])
    radioApiKey: '', // NUXT_RADIO_API_KEY (Worker secret)
    allowedUserEmails: '', // NUXT_ALLOWED_USER_EMAILS (wrangler [vars], comma-separated)
  },

  typescript: {
    strict: true,
    typeCheck: false,
    // The radio's engine imports with `.ts` extensions (Node runs it with type stripping).
    tsConfig: { compilerOptions: { allowImportingTsExtensions: true, noEmit: true } },
  },

  // The radio submodule is a whole Nuxt app; only its engine and scene are used here.
  ignore: ['radio/**'],

  experimental: { checkOutdatedBuildInterval: 5 * 60_000 },

  devServer: { port: 3041 },

  // The dev server may serve the engine and the font from radio/'s real path.
  vite: { server: { fs: { allow: [root, radioDir] } } },
})
