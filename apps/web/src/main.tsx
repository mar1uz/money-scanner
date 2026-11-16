import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App.js';
import { LanguageProvider } from './i18n.js';
import './index.css';
import './theme.css';
import './motion.css';
import './styles/shell.css';
import './styles/market.css';
import './styles/views.css';

document.addEventListener('touchstart', () => {}, { passive: true }); // lets :active fire reliably on iOS

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <LanguageProvider>
      <App />
    </LanguageProvider>
  </React.StrictMode>
);
