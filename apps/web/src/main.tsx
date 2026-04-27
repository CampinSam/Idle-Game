import React from 'react';
import ReactDOM from 'react-dom/client';
import { Provider } from 'react-redux';
import { BrowserRouter } from 'react-router-dom';
import { store } from './store';
import App from './App';
import PWAUpdateBanner from './components/PWAUpdateBanner';
import './index.css';

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
