import { StrictMode } from 'react';
import { createRoot } from "react-dom/client";
import { Tabs } from './tabs';
import { RuleManage } from './rule-manage';
import { Settings } from './settings';
import '@/common/tailwind.css';
import './style.scss';

const tabs = [
  { name: 'rules', title: 'Rules', content: RuleManage},
  { name: 'settings', title: 'Settings', content: Settings },
];

const defaultActiveTab = (() => {
  const hash = window.location.hash.slice(1);
  return tabs.find(tab => tab.name === hash)?.name || tabs[0].name;
})();

function App() {
  return (
    <div className="container max-w-4xl mx-auto mt-16">
      <Tabs
        activeTab={defaultActiveTab}
        tabs={tabs}
      />
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
