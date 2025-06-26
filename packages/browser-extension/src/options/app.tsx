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
  const [tab] = hash.split('?');
  return tabs.find(t => t.name === tab)?.name || tabs[0].name;
})();

/**
 * Extract URL parameters from hash
 */
function getUrlParams(): URLSearchParams {
  const hash = window.location.hash.slice(1);
  const [, queryString] = hash.split('?');
  return new URLSearchParams(queryString || '');
}

function App() {
  const urlParams = getUrlParams();
  const editRuleId = urlParams.get('edit') ? parseInt(urlParams.get('edit')!, 10) : null;

  return (
    <div className="container max-w-4xl mx-auto mt-16">
      <Tabs
        activeTab={defaultActiveTab}
        tabs={tabs}
        editRuleId={editRuleId}
      />
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
