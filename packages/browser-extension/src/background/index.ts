// Initialize rules on startup
chrome.runtime.onStartup.addListener(() => {
  updateRules();
});

// Initialize rules on installation
chrome.runtime.onInstalled.addListener(() => {
  updateRules();
});

// Update rules when storage changes
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes.allowedDomains) {
    updateRules();
  }
});

function updateRules() {
  chrome.storage.sync.get('domains', (result) => {
    const domains = result.domains || [];
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
  });
}
