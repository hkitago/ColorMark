//
//  utils.js
//  ColorMark
//
//  Created by Hiroyuki KITAGO on 2025/01/20.
//

export const isMacOS = () => {
  const isPlatformMac = navigator.platform.toLowerCase().indexOf('mac') !== -1;

  const isUserAgentMac = /Mac/.test(navigator.userAgent) &&
                         !/iPhone/.test(navigator.userAgent) &&
                         !/iPad/.test(navigator.userAgent);

  return (isPlatformMac || isUserAgentMac) && !('ontouchend' in document);
};

export const saveDefaultColor = async (newColor) => {
  if (!newColor) {
    throw new Error('Color value is required');
  }
  
  try {
    await browser.storage.local.set({ defaultColor: newColor });
    return true;
  } catch (error) {
    console.error("Fail to save default color to storage:", error);
    throw error;
  }
};

export const getDefaultColor = async () => {
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

