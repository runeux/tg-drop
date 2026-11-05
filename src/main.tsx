import { createRoot } from 'react-dom/client';
import { MotionConfig } from 'motion/react';
import { App } from './App';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('app root missing');
createRoot(root).render(
  <MotionConfig
    reducedMotion="user"
    transition={{ type: 'spring', bounce: 0, duration: 0.32 }}
  >
    <App />
  </MotionConfig>,
);
