import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    define: {
      // Credenziali OAuth Google Drive iniettate dai secrets CI a build time.
      // In sviluppo locale si possono impostare tramite variabili d'ambiente.
      __GOOGLE_CLIENT_ID__: JSON.stringify(process.env.GOOGLE_CLIENT_ID ?? ''),
      __GOOGLE_CLIENT_SECRET__: JSON.stringify(process.env.GOOGLE_CLIENT_SECRET ?? ''),
      // PAT GitHub read-only per l'auto-update da repo privato.
      __GITHUB_UPDATE_TOKEN__: JSON.stringify(process.env.GITHUB_UPDATE_TOKEN ?? '')
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts')
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.ts')
        }
      }
    }
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html')
        }
      }
    },
    resolve: {
      alias: {
        '@renderer': resolve(__dirname, 'src/renderer/src')
      }
    },
    plugins: [react()]
  }
})
