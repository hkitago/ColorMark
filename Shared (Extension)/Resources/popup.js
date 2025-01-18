import { labelStrings, getCurrentLangCode } from './localization.js';
const langCode = getCurrentLangCode();

const isMacOS = () => {
  const isPlatformMac = navigator.platform.toLowerCase().indexOf('mac') !== -1;

  const isUserAgentMac = /Mac/.test(navigator.userAgent) &&
                         !/iPhone/.test(navigator.userAgent) &&
                         !/iPad/.test(navigator.userAgent);
  
  return (isPlatformMac || isUserAgentMac) && !('ontouchend' in document);
};

const updateMarkedColor = async (newColor, id, url) => {
  if (!newColor) {
    throw new Error('Color value is required');
  }
  
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
    console.log(`Color value for id ${id} updated to ${newColor}`);
  } catch (error) {
    console.error("Fail to update the marked color to storage:", error);
  }
};

const saveDefaultColor = async (newColor) => {
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
    console.error('Fail to retrieve default color from storage:', error);
  } finally {
    if (color === DEFAULT_COLOR) {
      await saveDefaultColor(DEFAULT_COLOR);
    }
    return color;
  }
};

const showOnError = (ul, clearAllMarks) => {
  ul.innerHTML = '';
  const li = document.createElement('li');
  const p = document.createElement('p');
  p.textContent = `${labelStrings[langCode].onError}`;
  li.appendChild(p);
  ul.appendChild(li);
  
  clearAllMarks.style.display = 'none';
};

const buildPopup = async (url, color) => {
  if (navigator.userAgent.indexOf('iPhone') > -1) {
    document.body.style.width = 'initial';
  }

  /* HEADER */
  let bulletTarget;

  document.getElementById('defaultColorLabel').textContent = `${labelStrings[langCode].defaultColor}`;

  const colorBulletId = `setDefaultColorBullet-${(isMacOS() ? 'MACOS' : 'IOS')}`;
  const defaultColorBullet = document.getElementById(colorBulletId);
  
  /* FOR MACOS */
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
    defaultColorBullet.style.backgroundColor = color;
    defaultColorBullet.addEventListener('click', bulletClickHandler);
    
    document.getElementById('setDefaultColorBullet-IOS').style.display = 'none';
  } else {
    defaultColorBullet.value = color;
    
    document.getElementById('dummyColorInput').style.display = 'none';
    document.getElementById('setDefaultColorBullet-MACOS').style.display = 'none';
  }
  
  const colorPickerChangeHandler = async (event) => {
    const newColor = event.target.value;
    const id = bulletTarget.parentNode.dataset.id;

    if (isMacOS()) {
      bulletTarget.style.backgroundColor = newColor;

      if (id) {
        await updateMarkedColor(newColor, id, url);
      } else {
        await saveDefaultColor(newColor);
      }
    } else {
      defaultColorBullet.value = newColor;
      await saveDefaultColor(newColor);
    }
    
    try {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      await browser.tabs.sendMessage(tab.id, { type: 'updateColorMark', color: newColor, id: id });
    } catch (error) {
      console.error('Fail to updating the color of mark:', error);
    }

  };
  
  if (isMacOS()) {
    dummyColorPicker.addEventListener('change', colorPickerChangeHandler);
  } else {
    defaultColorBullet.addEventListener('change', colorPickerChangeHandler);
  }
  
  /* MAIN */
  const result = await browser.storage.local.get(url);
  const markedTexts = result[url] || [];
  
  const ul = document.getElementById('colorMarkList');
  const clearAllMarks = document.getElementById('clearAllMarks');
  
  if (markedTexts.length === 0) {
    showOnError(ul, clearAllMarks);
    return;
  }
  
  markedTexts.forEach((markedText) => {
    console.log(markedText);
    const li = document.createElement('li');
    li.dataset.id = markedText.id;
    
    // Btn to delete the item
    const deleteIcon = document.createElement('img');
    deleteIcon.src = './images/icon-minus.svg';
    li.appendChild(deleteIcon);
    
    deleteIcon.addEventListener('click', async (event) => {
      const li = event.target.closest('li');
      const id = li.dataset.id;
      
      const updatedTexts = markedTexts.filter(item => item.id !== id);
      li.remove();
      
      const ul = document.getElementById('colorMarkList');
      if (ul.children.length === 0) {
        await browser.storage.local.remove(url);
        showOnError(ul, clearAllMarks);
      } else {
        await browser.storage.local.set({ [url]: updatedTexts });
      }
      
      try {
        const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
        await browser.tabs.sendMessage(tab.id, { type: 'removeColorMark', id: id });
      } catch (error) {
        console.error('Fail to remove the mark:', error);
      }
    });
    
    // Diplay text content
    const div = document.createElement('div');
    div.textContent = markedText.text;
    li.appendChild(div);

    // Btn to share the item
    const shareSpan = document.createElement('span');
    shareSpan.classList.add('colorLink');
    li.appendChild(shareSpan);
    
    shareSpan.addEventListener('click', async (event) => {
      try {
        let [tab] = await browser.tabs.query({ active: true, currentWindow: true });
        const fragmentUrl = `${tab.url}#:~:text=${encodeURIComponent(markedText.text)}`;
        navigator.share({
          url: fragmentUrl
        });
      } catch (error) {
        console.error('Fail to get the current tab:', error.message);
      }
    });
    
    // Color Bullet to change the color
    if (isMacOS()) {
      const bulletSpan = document.createElement('span');
      bulletSpan.style.backgroundColor = markedText.color;
      bulletSpan.dataset.id = markedText.id;
      bulletSpan.classList.add('colorBullet');
      bulletSpan.addEventListener('click', bulletClickHandler);
      li.appendChild(bulletSpan);
    } else {
      const bulletColorInput = document.createElement('input');
      bulletColorInput.type = 'color';
      bulletSpan.value = markedText.color;
      bulletColorInput.classList.add('colorBullet');
      li.appendChild(bulletColorInput);
    }
    
    ul.appendChild(li);
  });
  /* FOOTER */
  clearAllMarks.textContent = labelStrings[langCode].clearAllMarks;
  if (ul.children.length > 1) {
    clearAllMarks.style.display = 'inline-block';
  }
  clearAllMarks.addEventListener('click', async () => {
    try {
      await browser.storage.local.remove(url);
      showOnError(ul, clearAllMarks);

      // send to content.js to remove all marks
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      await browser.tabs.sendMessage(tab.id, { type: 'removeAllColorMarks' });

    } catch (error) {
      console.error('Failed to clear all marks:', error);
    }
  });

};

const generateUUID = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

let isInitialized = false;

const initializePopup = async () => {
  if (isInitialized) return;
  isInitialized = true;

  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    const defaultColor = await getDefaultColor();
    const tabUrl = tab.url;
  
    await browser.tabs.sendMessage(tab.id, { type: 'addColorMark', color: defaultColor, id: generateUUID() });
    await buildPopup(tabUrl, defaultColor);
  } catch (error) {
    console.error('Fail to initialize to build the popup:', error);
    isInitialized = false;
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializePopup, { once: true });
} else {
  initializePopup();
}
