import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { CatalogProvider } from './state';
import './index.css';

const pending = sessionStorage.getItem('wts-catalog-qr-redirect');
if (pending) {
  sessionStorage.removeItem('wts-catalog-qr-redirect');
  if (pending !== window.location.pathname + window.location.search + window.location.hash) {
    window.history.replaceState(null, '', pending);
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <CatalogProvider>
        <App />
      </CatalogProvider>
    </BrowserRouter>
  </StrictMode>,
);
