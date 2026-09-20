import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { RealtimeProvider } from './realtime/RealtimeProvider.jsx';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <RealtimeProvider>
      <App />
    </RealtimeProvider>
  </StrictMode>,
);
