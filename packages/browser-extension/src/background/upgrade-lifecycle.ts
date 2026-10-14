import browser from 'webextension-polyfill';
import { recordLegacyUpgrade } from '@/common/upgrade-notice-state';

// Register before other modules initialize browser state. Firefox's first-run
// install event must already have a listener when its background starts.
browser.runtime.onInstalled.addListener((details) => {
  return recordLegacyUpgrade(details).catch((error) => console.error('Unable to record upgrade notice:', error));
});
