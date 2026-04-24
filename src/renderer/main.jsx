import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../../styles.css';
import './react-renderer.css';
import { App } from './App.jsx';

const root = document.getElementById('root');

if (!root) {
    document.documentElement.dataset.tftReady = '0';
    window.dispatchEvent(new CustomEvent('tft-renderer-ready', { detail: { ready: false } }));
    throw new Error('React renderer root was not found.');
}

createRoot(root).render(
    <StrictMode>
        <App />
    </StrictMode>
);
