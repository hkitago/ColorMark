//
//  utils.js
//  ColorMark
//
//  Created by Hiroyuki KITAGO on 2025/01/20.
//

export const isIOS = () => {
  return /iPhone|iPod/.test(navigator.userAgent);
};

export const isIPadOS = () => {
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
};

export const isMacOS = () => {
  return navigator.platform.includes('Mac') && !isIPadOS();
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

