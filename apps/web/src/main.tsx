import React from 'react';
import ReactDOM from 'react-dom/client';
import { Provider } from 'react-redux';
import { BrowserRouter } from 'react-router-dom';
import { store } from './store';
import App from './App';
import PWAUpdateBanner from './components/PWAUpdateBanner';
import { installGlobalErrorReporter } from './services/clientErrorReporter';
import './index.css';

// Catch errors that escape <ErrorBoundary> — `window.onerror` fires for
// non-React JS errors (event handlers, async setTimeouts) and
// `unhandledrejection` covers floating promise rejections. Both feed
// into the same `reportClientError` sink.
installGlobalErrorReporter();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Provider store={store}>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <App />
        {/* Sibling of <App /> so the SW registers + install prompt
            works for logged-out visitors and admin routes too, not
            just the post-login game shell. */}
        <PWAUpdateBanner />
      </BrowserRouter>
    </Provider>
  </React.StrictMode>,
);
