import { getCurrentLangLabelString, applyRTLSupport } from './localization.js';
import { isIOS, isMacOS, isValidHexColor, saveDefaultColor, getDefaultColor } from './utils.js';

const normalizeUrl = (url) => {
  try {
    let u = new URL(url);
    u.hash = u.hash.includes("~:text=") ? "" : u.hash;
    return u.toString();
  } catch (error) {
      console.error('[ColorMarkExtension] Invalid URL:', url);
      return url;
  }
};

const updateMarkedColor = async (newColor, id, url) => {
  if (!isValidHexColor(newColor) || !id || !url) return { success: false, reason: 'invalid-argument' };

  try {
    const result = await browser.storage.local.get(url);
    const markedTexts = result[url] || [];

    const updatedMarkedTexts = markedTexts.map(item => {
      if (item.id === id) {
        return {
          ...item,
          color: newColor
        };
      }
      return item;
    });

    await browser.storage.local.set({ [url]: updatedMarkedTexts });
    return { success: true };
  } catch (error) {
    console.error('[ColorMarkExtension] Failed to update the marked color to storage:', error);
    return { success: false, reason: 'storage-error' };
  }
};

const showOnError = (ul, clearAllMarks, restoreScrollPosition) => {
  ul.innerHTML = '';
  const li = document.createElement('li');
  const p = document.createElement('p');
  p.textContent = `${getCurrentLangLabelString('onError')}`;

  p.style.userSelect = 'none';
  p.style.cursor = 'default';

  li.appendChild(p);
  ul.appendChild(li);

  clearAllMarks.style.display = 'none';
  restoreScrollPosition.style.display = 'none';
};

const isBlockElement = (htmlString) => {
  if (typeof htmlString !== 'string') {
    return false;
  }

  const blockElementRegex = /<(h[1-6]|p|div)\b[^>]*>/i;
  return blockElementRegex.test(htmlString);
};

const constructFragmentUrl = (tabUrl, markedText) => {
  const url = normalizeUrl(tabUrl);

  let fragmentParam = `${encodeURIComponent(markedText.text)}`;

  if (isBlockElement(markedText.html)) {
    const container = document.createElement('div');
    container.innerHTML = markedText.html;

    const extractTextNodes = (node) => {
      let textNodes = [];

      for (const child of node.childNodes) {
        if (child.nodeType === Node.TEXT_NODE) {
          const trimmedText = child.textContent.trim();
          if (trimmedText) {
            textNodes.push(trimmedText);
          }
        } else if (child.nodeType === Node.ELEMENT_NODE) {
          textNodes = textNodes.concat(extractTextNodes(child));
        }
      }

      return textNodes;
    };

    const textNodes = extractTextNodes(container).filter(text => text.trim() !== '');

    if (textNodes.length >= 1) {
      const startText = encodeURIComponent(textNodes[0]);
      const endText = encodeURIComponent(textNodes[textNodes.length - 1]);
      fragmentParam = `${startText},${endText}`;
    }
  }

  const selectorPrefix = markedText?.target?.selectors?.textQuote?.prefix || '';
  const selectorSuffix = markedText?.target?.selectors?.textQuote?.suffix || '';
  const contextPrefix = markedText.prefix || selectorPrefix;
  const contextSuffix = markedText.suffix || selectorSuffix;
  const hasContext = Boolean(contextPrefix || contextSuffix);

  let params = '';
  if (hasContext || isBlockElement(markedText.html)) {
    params = (contextPrefix ? `${encodeURIComponent(contextPrefix)}-,` : '') +
             `${fragmentParam}` +
             (contextSuffix ? `,-${encodeURIComponent(contextSuffix)}` : '');
  } else {
    params = `${fragmentParam}`;
  }

  return `${url}#:~:text=${params}`;
};

const buildPopup = async (url, color, sortedIds) => {
  if (isIOS()) {
    document.body.style.width = 'initial';
  }
  
  applyRTLSupport();
  
  /* HEADER */
  let bulletTarget;
  
  document.getElementById('defaultColorLabel').textContent = `${getCurrentLangLabelString('defaultColor')}`;
  
  const colorBulletId = `setDefaultColorBullet-${(isMacOS() ? 'MACOS' : 'IOS')}`;
  const defaultColorBullet = document.getElementById(colorBulletId);
  
  /* FOR MACOS to handle Color Picker */
  const dummyColorPicker = document.getElementById('dummyColorInput');
  const bulletClickHandler = (event) => {
    bulletTarget = event.target;
    
    // Tricky part for the position of color picker
    const id = bulletTarget.parentNode.dataset.id;
    if (id) {
      const bulletTargetY = bulletTarget.getBoundingClientRect().top;
      dummyColorPicker.style.bottom = `${bulletTargetY}px`;
      setTimeout(() => {
        dummyColorPicker.removeAttribute('style');
      }, 100);
    }
    
    setTimeout(() => {
      dummyColorPicker.click();
    }, 1);
    
  };
  
  if (isMacOS()) {
    defaultColorBullet.title = `${getCurrentLangLabelString('tooltip')['bulletColor']}`;
    defaultColorBullet.style.backgroundColor = color;
    defaultColorBullet.addEventListener('click', bulletClickHandler);
    
    document.getElementById('setDefaultColorBullet-IOS').style.display = 'none';
  } else {
    defaultColorBullet.value = color;
    
    document.getElementById('dummyColorInput').style.display = 'none';
    document.getElementById('setDefaultColorBullet-MACOS').style.display = 'none';
  }
  
  const dummyColorPickerChangeHandler = async (event) => {
    const newColor = event.target.value;
    const id = bulletTarget.parentNode.dataset.id;
    const previousColor = bulletTarget.style.backgroundColor;

    bulletTarget.style.backgroundColor = newColor;

    let saveResult = { success: true };

    try {
      if (id) {
        saveResult = await updateMarkedColor(newColor, id, url);
      } else {
        saveResult = await saveDefaultColor(newColor);
      }

      if (!saveResult.success) {
        bulletTarget.style.backgroundColor = previousColor;
        return;
      }

      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        await browser.tabs.sendMessage(tab.id, { type: 'updateColorMark', color: newColor, id: id });
      }
    } catch (error) {
      bulletTarget.style.backgroundColor = previousColor;
      console.warn('[ColorMarkExtension] Failed to updating the color:', error);
    }
  };
  
  /* FOR IOS to handle Color Picker */
  const colorPickerChangeHandler = async (event) => {
    const input = event.target;
    const newColor = input.value;
    const id = input.parentNode?.dataset?.id;

    const previousColor = input.getAttribute('value') || newColor;

    let saveResult = { success: true };

    try {
      if (id) {
        saveResult = await updateMarkedColor(newColor, id, url);
      } else {
        saveResult = await saveDefaultColor(newColor);
      }

      if (!saveResult.success) {
        input.value = previousColor;
        return;
      }

      input.setAttribute('value', newColor);

      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        await browser.tabs.sendMessage(tab.id, { type: 'updateColorMark', color: newColor, id });
      }
    } catch (error) {
      input.value = previousColor;
      console.warn('[ColorMarkExtension] Failed to updating the color of mark:', error);
    }
  };
  
  const defaultColorPickerChangeHandler = async (event) => {
    const newColor = event.target.value;
    const previousColor = defaultColorBullet.value;

    // Optimistic UI update
    defaultColorBullet.value = newColor;

    const saveResult = await saveDefaultColor(newColor);
    if (!saveResult.success) {
      // Revert UI on failure
      defaultColorBullet.value = previousColor;
      console.warn('[ColorMarkExtension] Failed to updating the color:', saveResult.reason);
    }
  };
  
  if (isMacOS()) {
    dummyColorPicker.addEventListener('change', dummyColorPickerChangeHandler);
  } else {
    defaultColorBullet.addEventListener('change', defaultColorPickerChangeHandler);
  }
  
  const scrollToMark = async (id) => {
    if (!id) return;
    
    try {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        const response = await browser.tabs.sendMessage(tab.id, { type: 'scrollToMark', dataId: id });
        const styleDisplay = response.success ? 'none' : 'inline-block';
        restoreScrollPosition.style.display = styleDisplay;
      }
    } catch (error) {
      console.error('[ColorMarkExtension] Failed to scroll to the mark:', error);
    }
  };

  let isScrolling = false;
  let lastScrolledId = null;
  let hoverTimeout = null;

  const onMouseOver = (event) => {
    event.target.closest('li')?.classList.add('hover');

    const target = event.target.closest('li');
    if (!target) return;
    
    const dataId = target.dataset.id;
    
    if (lastScrolledId === dataId) return;

    clearTimeout(hoverTimeout);
    
    hoverTimeout = setTimeout(async () => {
      if (lastScrolledId === dataId) return;
      if (isScrolling) return;

      isScrolling = true;

      try {
        const success = await scrollToMark(dataId);
        if (success !== false) {
          lastScrolledId = dataId;
        }
      } finally {
        isScrolling = false;
      }
    }, 100);
  };

  const onMouseOut = (event) => {
    event.target.closest('li')?.classList.remove('hover');
  };

  const onMouseLeave = (event) => {
    lastScrolledId = null;
  };

  /* MAIN */
  const result = await browser.storage.local.get(url);
  const markedTexts = result[url] || [];
  
  let sortedMarks = sortedIds.map(id => markedTexts.find(mark => mark.id === id));
  
  if (sortedMarks.some(mark => mark === undefined)) {
    console.warn('[ColorMarkExtension] ID mismatch detected. Falling back to original order.');
    sortedMarks = markedTexts;
  }
  
  const ul = document.getElementById('colorMarkList');
  const clearAllMarks = document.getElementById('clearAllMarks');
  const restoreScrollPosition = document.getElementById('restoreScrollPosition');
  
  if (sortedMarks.length === 0) {
    showOnError(ul, clearAllMarks, restoreScrollPosition);
    return;
  }
  
  sortedMarks.forEach((markedText) => {
    const li = document.createElement('li');
    li.dataset.id = markedText.id;
    
    if (isMacOS()) {
      li.addEventListener('mouseover', onMouseOver);
      li.addEventListener('mouseout', onMouseOut);
      li.addEventListener('mouseleave', onMouseLeave);
    }
    
    // Btn to delete the item
    const deleteIcon = document.createElement('img');
    deleteIcon.title = `${getCurrentLangLabelString('tooltip')['removeItem']}`;
    deleteIcon.src = './images/icon-minus.svg';
    li.appendChild(deleteIcon);
    
    deleteIcon.addEventListener('click', async (event) => {
      const li = event.target.closest('li');
      const id = li.dataset.id;
      
      const updatedTexts = sortedMarks.filter(item => item.id !== id);
      li.remove();
      
      const ul = document.getElementById('colorMarkList');
      if (ul.children.length === 0) {
        await browser.storage.local.remove(url);
        showOnError(ul, clearAllMarks, restoreScrollPosition);
      } else {
        await browser.storage.local.set({ [url]: updatedTexts });
        
        if (ul.children.length === 1) {
          clearAllMarks.style.display = 'none';
        }
      }
      
      try {
        const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
        if (tab?.id) {
          await browser.tabs.sendMessage(tab.id, { type: 'removeColorMark', id: id });
        }
      } catch (error) {
        console.error('[ColorMarkExtension] Failed to remove the mark:', error);
      }
    });
    
    // Display text content
    const div = document.createElement('div');
    div.textContent = markedText.text;
    
    li.appendChild(div);
    
    // Btn to share the item
    const shareSpan = document.createElement('span');
    shareSpan.classList.add('colorLink');
    if (isMacOS()) {
      shareSpan.title = `${getCurrentLangLabelString('tooltip')['shareLink']}`;
      shareSpan.classList.add('macos');
    }
    li.appendChild(shareSpan);
    
    shareSpan.addEventListener('click', async (event) => {
      try {
        let [tab] = await browser.tabs.query({ active: true, currentWindow: true });
        if (tab?.url) {
          const fragmentUrl = constructFragmentUrl(tab.url, markedText);
          navigator.share({
            url: fragmentUrl
          });
        }
      } catch (error) {
        console.error('[ColorMarkExtension] Failed to get the current tab:', error.message);
      }
    });
    
    // Btn to find the item
    const findSpan = document.createElement('span');
    findSpan.classList.add('colorFind');
    if (isMacOS()) {
      findSpan.classList.add('macos');
    }
    li.appendChild(findSpan);
    
    findSpan.addEventListener('click', async (event) => {
      const target = event.target.closest('li');
      if (target) {
        const dataId = target.dataset.id;
        scrollToMark(dataId);
      }
    });
    
    // Color Bullet to change the color
    if (isMacOS()) {
      const bulletSpan = document.createElement('span');
      bulletSpan.style.backgroundColor = markedText.color;
      bulletSpan.dataset.id = markedText.id;
      bulletSpan.title = `${getCurrentLangLabelString('tooltip')['bulletColor']}`;
      bulletSpan.classList.add('colorBullet');
      bulletSpan.addEventListener('click', bulletClickHandler);
      li.appendChild(bulletSpan);
    } else {
      const bulletColorInput = document.createElement('input');
      bulletColorInput.type = 'color';
      bulletColorInput.value = markedText.color;
      bulletColorInput.classList.add('colorBullet');
      
      bulletColorInput.addEventListener('change', colorPickerChangeHandler);
      bulletColorInput.addEventListener('click', (event) => {
        findSpan.click();
      });
      
      li.appendChild(bulletColorInput);
    }
    
    ul.appendChild(li);
  });
  /* FOOTER */
  clearAllMarks.textContent = getCurrentLangLabelString('clearAllMarks');
  clearAllMarks.title = getCurrentLangLabelString('clearAllMarks');
  clearAllMarks.addEventListener('click', async () => {
    try {
      await browser.storage.local.remove(url);
      showOnError(ul, clearAllMarks, restoreScrollPosition);
      
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        await browser.tabs.sendMessage(tab.id, { type: 'removeAllColorMarks' });
      }
    } catch (error) {
      console.error('[ColorMarkExtension] Failed to clear all marks:', error);
    }
  });
  
  clearAllMarks.addEventListener('touchstart', (event) => {
    event.target.classList.add('active');
  });
  
  clearAllMarks.addEventListener('touchend', (event) => {
    event.target.classList.remove('active');
  });
  
  clearAllMarks.addEventListener('touchcancel', (event) => {
    event.target.classList.remove('active');
  });

  restoreScrollPosition.textContent = getCurrentLangLabelString('restoreScrollPosition');
  restoreScrollPosition.title = getCurrentLangLabelString('restoreScrollPosition');
  restoreScrollPosition.addEventListener('click', async () => {
    try {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        await browser.tabs.sendMessage(tab.id, { type: 'RESTORE_SCROLL' });
      }
      lastScrolledId = null;
      restoreScrollPosition.style.display = 'none';
    } catch (error) {
      console.error('[ColorMarkExtension] Failed to restore scroll:', error);
    }
  });

  restoreScrollPosition.addEventListener('touchstart', (event) => {
    event.target.classList.add('active');
  });

  restoreScrollPosition.addEventListener('touchend', (event) => {
    event.target.classList.remove('active');
  });

  restoreScrollPosition.addEventListener('touchcancel', (event) => {
    event.target.classList.remove('active');
  });

  if (ul.children.length > 1) {
    clearAllMarks.style.display = 'inline-block';
  }
};

let isInitialized = false;

const initializePopup = async () => {
  if (isInitialized) return;
  isInitialized = true;

  try {
    const defaultColor = await getDefaultColor();

    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab?.url && tab?.id) {
      const tabUrl = await normalizeUrl(tab.url);

      const response = await browser.tabs.sendMessage(tab.id, {
        type: 'addColorMark',
        color: defaultColor
      });

      const sortedIds = (response && response.sortedIds) ? response.sortedIds : [];

      await buildPopup(tabUrl, defaultColor, sortedIds);
    }
  } catch (error) {
    console.error('[ColorMarkExtension] Failed to initialize to build the popup:', error);
    isInitialized = false;
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializePopup, { once: true });
} else {
  initializePopup();
}
