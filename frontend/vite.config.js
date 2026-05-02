import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const apiProxyTarget = process.env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:8000'
const chatbotProxyTarget = process.env.VITE_CHATBOT_PROXY_TARGET || 'http://127.0.0.1:5000'
const additionalAllowedHosts = (process.env.VITE_ALLOWED_HOSTS || '')
  .split(',')
  .map(host => host.trim())
  .filter(Boolean)

const allowedHosts = [
  '.ngrok-free.dev',
  '.ngrok-free.app',
  ...additionalAllowedHosts,
]

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts,
    proxy: {
      '/api': {
        target: apiProxyTarget,
        changeOrigin: true,
      },
      '/ai-chatbot': {
        target: chatbotProxyTarget,
        changeOrigin: true,
        rewrite: path => path.replace(/^\/ai-chatbot/, ''),
      }
    }
  }
})
