import browser from 'webextension-polyfill';

const configKey = 'extConfig';

export interface IExtConfig {
  /**
   * whether enable credentials by default
   */
  dftEnableCredentials: boolean;
}

const config: IExtConfig = {
  dftEnableCredentials: false,
};

export const extConfig = {
  get() {
    return Object.assign({}, config);
  },
  async init() {
    const cfg = await browser.storage.local.get(configKey).then((res) => res[configKey]);
    Object.assign(config, cfg);
  },
  async save(cfg: Partial<IExtConfig>) {
    Object.assign(config, cfg);
    return browser.storage.local.set({
      [configKey]: config,
    });
  },
}

/**
 * sync ext config changes
 */
browser.storage.onChanged.addListener((changes, areaName) => {
  console.log(`browser.storage.onChanged-${configKey}`, changes, areaName);
  const changed = changes[configKey];
  if (areaName !== 'local' || !changed) return;
  extConfig.save(changed.newValue);
});

extConfig.init();
