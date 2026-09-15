import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import './styles/index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);

// Register after `load` so the worker's install (which precaches the
// shell) never competes for bandwidth with the first paint. A service
// worker that slows down the first visit to speed up the second is a bad
// trade for anyone who bounces.
//
// Dev is excluded: Vite serves unbundled modules there, and a worker
// caching them produces stale-module errors that look like real bugs.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js').catch((err) => {
      console.error('Service worker registration failed:', err);
    });
  });
}