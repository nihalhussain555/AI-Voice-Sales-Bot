import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './styles/index.css';

// StrictMode intentionally omitted: its dev-only double effect invocation
// interferes with speech-synthesis / recognition lifecycle handling.
ReactDOM.createRoot(document.getElementById('root')).render(<App />);
