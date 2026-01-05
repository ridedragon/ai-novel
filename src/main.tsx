import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary'
import { LayoutProvider } from './contexts/LayoutContext'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <LayoutProvider>
        <App />
      </LayoutProvider>
    </ErrorBoundary>
  </React.StrictMode>,
)
