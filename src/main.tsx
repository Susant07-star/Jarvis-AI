import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { TelegramCallUI } from './components/jarvis/TelegramCallUI.tsx';
import './index.css';

const path = window.location.pathname;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {path === '/telegram-call' ? <TelegramCallUI /> : <App />}
  </StrictMode>,
);
