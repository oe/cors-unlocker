import { useState, useCallback } from 'react';
export interface ITabItem {
  title: string;
  name: string;
  content: React.ComponentType
}

export interface ITabsProps {
  tabs: ITabItem[];
  activeTab?: string;
}

export function Tabs(props: ITabsProps) {
  const [activeTab, setActiveTab] = useState(props.activeTab || props.tabs[0].name);

  const changeTab = useCallback((tabName: string) => {
    location.hash = tabName;
    setActiveTab(tabName);
  }, [])
  

  const TabContent = props.tabs.find(tab => tab.name === activeTab)?.content;
  return (
  <div className="flex">
    <ul className="flex flex-col text-right pt-16">
      {props.tabs.map(tab => (
        <li key={tab.name} className="mb-2">
          <button
            className={`block w-full p-2 text-right border-r-4 ${activeTab === tab.name ? 'border-blue-600 text-blue-600' : 'hover:text-gray-600 border-transparent' }`}
            onClick={() => changeTab(tab.name)}
          >
            {tab.title}
          </button>
        </li>
      ))}
    </ul>
    <div className="flex-1 p-4">
      {TabContent && <TabContent />}
    </div>
  </div>
  );
}