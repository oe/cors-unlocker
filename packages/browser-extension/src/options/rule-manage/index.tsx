import { useState, useEffect } from 'react';
import './style.scss';

export function RuleManage() {
  const [domains, setDomains] = useState<string[]>([]);
  const [newDomain, setNewDomain] = useState('');

  useEffect(() => {
    // Load domains from storage on component mount
    chrome.storage.sync.get('domains', (result) => {
      if (result.domains) {
        setDomains(result.domains);
      }
    });
  }, []);

  const addDomain = () => {
    if (newDomain && !domains.includes(newDomain)) {
      const updatedDomains = [...domains, newDomain];
      setDomains(updatedDomains);
      setNewDomain('');
      chrome.storage.sync.set({ domains: updatedDomains });
    }
  };

  const removeDomain = (domainToRemove: string) => {
    const updatedDomains = domains.filter(domain => domain !== domainToRemove);
    setDomains(updatedDomains);
    chrome.storage.sync.set({ domains: updatedDomains });
  };

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold">Manage Rules</h1>
      <div className="mt-4 flex">
        <input
          type="text"
          value={newDomain}
          onChange={(e) => setNewDomain(e.target.value)}
          placeholder="Enter domain"
          className="border p-2 flex-grow mr-2 rounded-sm"
        />
        <button onClick={addDomain} className="bg-blue-500 text-white px-4 py-2 rounded-sm">
          Add
        </button>
      </div>
      <ul className="mt-4">
        {domains.map((domain) => (
          <li key={domain} className="flex justify-between items-center p-2 border-b">
            <span>{domain}</span>
            <button onClick={() => removeDomain(domain)} className="text-red-500">
              Remove
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

