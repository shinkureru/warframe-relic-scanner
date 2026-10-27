import React from 'react';
import { createRoot } from 'react-dom/client';
import 'bootstrap/dist/css/bootstrap-grid.min.css';
import './styles/main.scss';
import App from './App.jsx';

createRoot(document.getElementById('root')).render(
  <React.StrictMode><App /></React.StrictMode>
);
