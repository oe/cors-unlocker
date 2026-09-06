import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { initializeLocale } from '@/common/i18n';
import { Inspector } from './inspector';
import '@/common/tailwind.css';
import './style.scss';

void initializeLocale().then(() => createRoot(document.getElementById('root')!).render(<StrictMode><Inspector /></StrictMode>));
