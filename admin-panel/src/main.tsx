import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './sentry';
import { Sentry } from './sentry';
import './index.css';
import App from './App.tsx';

createRoot(document.getElementById('root')!).render(
  <Sentry.ErrorBoundary
    fallback={
      <div style={{ padding: 24, fontFamily: 'sans-serif' }}>
        Something went wrong. Reload the page.
      </div>
    }
  >
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </Sentry.ErrorBoundary>
);
