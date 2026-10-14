import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { initializeLocale } from '@/common/i18n';
import { initializeTheme } from '@/common/theme';
import { Inspector } from './inspector';
import '@/common/tailwind.css';
import './style.scss';

void Promise.all([initializeLocale(), initializeTheme()]).then(() => createRoot(document.getElementById('root')!).render(<StrictMode><Inspector /></StrictMode>));
