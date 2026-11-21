import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { installSessionCacheGuard } from '@/lib/sessionCacheGuard'

// Armed before the first render so no screen can ever mount against another session's cache.
installSessionCacheGuard()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
