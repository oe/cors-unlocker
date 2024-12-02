import { StrictMode } from 'react';
import { createRoot } from "react-dom/client";
import { Tabs } from './tabs';
import { RuleManage } from './rule-manage';
import './style.scss';

const tabs = [
  { name: 'tab1', title: 'Rules', content: RuleManage},
  { name: 'tab2', title: 'Settings', content: () => <div>Settings</div> },
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
