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

export const isValidHexColor = (s) => {
  return typeof s === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(s);
};

export const saveDefaultColor = async (newColor) => {
  if (!isValidHexColor(newColor)) return { ok: false, reason: 'invalid-argument' };

  try {
    await browser.storage.local.set({ defaultColor: newColor });
    return { ok: true };
  } catch (error) {
    console.error('[ColorMarkExtension] Failed to save default color to storage:', error);
    return { ok: false, reason: 'storage-error' };
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
    console.error('[ColorMarkExtension] Error retrieving default color from storage:', error);
  } finally {
    if (color === DEFAULT_COLOR) {
      await saveDefaultColor(DEFAULT_COLOR);
    }
    return color;
  }
};

