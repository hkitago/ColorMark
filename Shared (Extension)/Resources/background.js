import { getCurrentLangLabelString } from './localization.js';
import { isMacOS, getDefaultColor } from './utils.js';

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
