import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { ThemeProvider } from './contexts/ThemeContext.jsx'
import './index.css'

// Global Error Handling
const logFrontendError = (message, source, lineno, colno, error, context) => {
  try {
    fetch('http://localhost:8000/api/error-logs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
      },
      body: JSON.stringify({
        message: message || (error ? error.message : 'Unknown error'),
        context: {
          source, lineno, colno,
          stack: error ? error.stack : null,
          additional: context
        },
        url: window.location.href
      })
    }).catch(() => {});
  } catch(e) {}
};

window.addEventListener('error', (event) => {
  logFrontendError(event.message, event.filename, event.lineno, event.colno, event.error, 'Window Error');
});

window.addEventListener('unhandledrejection', (event) => {
  logFrontendError(event.reason?.message || 'Unhandled Promise Rejection', null, null, null, event.reason, 'Promise Rejection');
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </React.StrictMode>,
)
