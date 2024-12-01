/**
 * local storage key for allowed domains
 */
const storageKey = 'allowedDomains';

/**
 * Default domains to allow
 * * cors.forth.ink is the homepage of this extension
 */
const DEFAULT_DOMAINS = ['cors.forth.ink', 'www.google.com'];

// Initialize rules on browser startup
chrome.runtime.onStartup.addListener(() => {
  chrome.storage.local.get(storageKey, (result) => {
    updateRules(result[storageKey]);
  });
});

// Initialize default rules on installation
chrome.runtime.onInstalled.addListener((e) => {
  // only run on install
  if (e.reason !== 'install') return;
  // will trigger events to update rules
  chrome.storage.local.set({ [storageKey]: DEFAULT_DOMAINS });
});

// Update rules when storage changes
chrome.storage.onChanged.addListener((changes, areaName) => {
  console.log('storage changed', changes, areaName);
  if (areaName !== 'local' || !changes[storageKey]) return
  updateRules(changes[storageKey].newValue);
});

function updateRules(domains: string[] = []) {
  // clear rules if no domains are set
  if (!domains || !domains.length) {
    chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [1]
    });
    return;
  }

  const rules = [
    {
      id: 1,
      priority: 1,
      action: {
        type: 'modifyHeaders',
        responseHeaders: [
          {
            header: 'Access-Control-Allow-Origin',
            operation: 'set',
            value: '*'
          }
        ]
      },
      condition: {
        urlFilter: '*',
        initiatorDomains: domains,
        resourceTypes: ['xmlhttprequest']
      }
    }
  ];

  chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [1],
    // @ts-expect-error ignore for type missing
    addRules: rules
  });

}
