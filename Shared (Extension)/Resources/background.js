import { labelStrings, getCurrentLangCode } from './localization.js';
const langCode = getCurrentLangCode();

const isMacOS = () => {
  const isPlatformMac = navigator.platform.toLowerCase().indexOf('mac') !== -1;

  const isUserAgentMac = /Mac/.test(navigator.userAgent) &&
                         !/iPhone/.test(navigator.userAgent) &&
                         !/iPad/.test(navigator.userAgent);
  
  return (isPlatformMac || isUserAgentMac) && !('ontouchend' in document);
};

// ContextMenu for macOS
if (isMacOS()) {

  const saveDefaultColor = async (newColor) => {
    if (!newColor) {
      throw new Error('Color value is required');
    }
    
    try {
      await browser.storage.local.set({ defaultColor: newColor });
      return true;
    } catch (error) {
      console.error("Error saving default color to storage:", error);
      throw error;
    }
  };

  const getDefaultColor = async () => {
    const DEFAULT_COLOR = '#fffb00';
    let color = DEFAULT_COLOR;
    
    try {
      const result = await browser.storage.local.get('defaultColor');
      if (result.defaultColor) {
        color = result.defaultColor;
        return color;
      }
    } catch (error) {
      console.error('Error retrieving default color from storage:', error);
    } finally {
      if (color === DEFAULT_COLOR) {
        await saveDefaultColor(DEFAULT_COLOR);
      }
      return color;
    }
  };

  browser.contextMenus.create({
    id: 'selectionColorMark',
    title: `${labelStrings[langCode].contextMenu}`,
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
