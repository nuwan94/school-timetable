import React from 'react';
import ReactDOM from 'react-dom/client';
import './ui/fonts';
import './index.css';
import { App } from './App';
import { setupPwa } from './pwa';

setupPwa();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
