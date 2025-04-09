import { getCurrentLangLabelString } from './localization.js';
import { isMacOS, getDefaultColor } from './utils.js';

browser.runtime.onInstalled.addListener(async () => {
  const tabs = await browser.tabs.query({});

  for (const tab of tabs) {
    if (tab.url.startsWith('http') || tab.url.startsWith('https')) {
      await browser.tabs.reload(tab.id);
    }
  }
});

// ContextMenu for macOS
if (isMacOS()) {
  browser.contextMenus.create({
    id: 'selectionColorMark',
    title: `${getCurrentLangLabelString('contextMenu')}`,
    contexts: ['selection']
  });

  browser.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId === 'selectionColorMark' && info.selectionText) {
      const defaultColor = await getDefaultColor();
      browser.tabs.sendMessage(tab.id, {
        type: 'addColorMark',
        url: tab.url,
        color: defaultColor
      });
    }
  });
}

// Send a message to content.js on when switching tab
browser.tabs.onActivated.addListener((activeInfo) => {
  browser.tabs.sendMessage(activeInfo.tabId, { type: 'syncColorMark' })
    .catch(error => console.error('Error getting page info:', error));
});

// Send a message to content.js when the tab's status is complete
browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    browser.tabs.sendMessage(tabId, { type: 'syncColorMark' })
      .catch(error => console.error('Error getting page info after update:', error));
  }
});
