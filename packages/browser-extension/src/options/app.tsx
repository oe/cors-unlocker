import { StrictMode } from 'react';
import { createRoot } from "react-dom/client";
import { Tabs } from './tabs';
import { RuleManage } from './rule-manage';
import { Settings } from './settings';
import './style.scss';

const tabs = [
  { name: 'rules', title: 'Rules', content: RuleManage},
  { name: 'settings', title: 'Settings', content: Settings },
];

function App() {

  return (
    <div className="container mx-auto mt-16">
      <Tabs
        tabs={tabs}
      />
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
