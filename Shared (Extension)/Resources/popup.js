import { getCurrentLangLabelString, applyRTLSupport } from './localization.js';
import { isMacOS, saveDefaultColor, getDefaultColor } from './utils.js';

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
  } catch (error) {
    console.error('Fail to update the marked color to storage:', error);
  }
};

const showOnError = (ul, clearAllMarks) => {
  ul.innerHTML = '';
  const li = document.createElement('li');
  const p = document.createElement('p');
  p.textContent = `${getCurrentLangLabelString('onError')}`;
  li.appendChild(p);
  ul.appendChild(li);
  
  clearAllMarks.style.display = 'none';
};

const isBlockElement = (htmlString) => {
  if (typeof htmlString !== 'string') {
    return false;
  }
  
  const blockElementRegex = /<(h[1-6]|p|div)\b[^>]*>/i;
  return blockElementRegex.test(htmlString);
};

const formatHtmlWithBreaks = (htmlString) => {
  const container = document.createElement('div');
  container.innerHTML = htmlString;

  const extractTextWithBreaks = (node) => {
    let textContent = '';

    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        textContent += child.textContent.trim();
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const tagName = child.tagName.toLowerCase();

        if (isBlockElement(`<${tagName}>`)) {
          textContent += '\n' + extractTextWithBreaks(child) + '\n';
        } else {
          textContent += extractTextWithBreaks(child);
        }
      }
    }

    return textContent;
  };

  let finalText = extractTextWithBreaks(container);
  finalText = finalText.replace(/\n\s*\n/g, '\n').trim();

  return finalText.replace(/\n/g, '<br>');
};

const constructFragmentUrl = (tabUrl, markedText) => {
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

  let params = '';
  if (markedText.isDuplicate || isBlockElement(markedText.html)) {
    params = (markedText.prefix ? `${encodeURIComponent(markedText.prefix)}-,` : '') +
             `${fragmentParam}` +
             (markedText.suffix ? `,-${encodeURIComponent(markedText.suffix)}` : '');
  } else {
    params = `${fragmentParam}`;
  }

  return `${tabUrl}#:~:text=${params}`;
};

const buildPopup = async (url, color, sortedIds) => {
  if (navigator.userAgent.indexOf('iPhone') > -1) {
    document.body.style.width = 'initial';
  }

  applyRTLSupport();
  
  /* HEADER */
  let bulletTarget;

  document.getElementById('defaultColorLabel').textContent = `${getCurrentLangLabelString('defaultColor')}`;

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
  
  const onMouseOver = (event) => {
    event.target.closest('li').classList.add('hover');
  }

  const onMouseOut = (event) => {
    event.target.closest('li').classList.remove('hover');
  }

  /* MAIN */
  const result = await browser.storage.local.get(url);
  const markedTexts = result[url] || [];
  
  const sortedMarks = sortedIds.map(id => markedTexts.find(mark => mark.id === id));

  if (sortedMarks.some(mark => mark === undefined)) {
    console.warn('ID mismatch detected. Falling back to original order.');
    sortedMarks = markedTexts;
  }

  const ul = document.getElementById('colorMarkList');
  const clearAllMarks = document.getElementById('clearAllMarks');

  if (sortedMarks.length === 0) {
    showOnError(ul, clearAllMarks);
    return;
  }

  sortedMarks.forEach((markedText) => {
    const li = document.createElement('li');
    li.dataset.id = markedText.id;
    li.addEventListener('mouseover', onMouseOver);
    li.addEventListener('mouseout', onMouseOut);

    // Btn to delete the item
    const deleteIcon = document.createElement('img');
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
    
    // Display text content
    const div = document.createElement('div');
    const formattedHtml = isBlockElement(markedText.html) ? formatHtmlWithBreaks(markedText.html) : markedText.text;
    div.innerHTML = formattedHtml;

    li.appendChild(div);
    
    // Btn to share the item
    const shareSpan = document.createElement('span');
    shareSpan.classList.add('colorLink');
    li.appendChild(shareSpan);
    
    shareSpan.addEventListener('click', async (event) => {
      try {
        let [tab] = await browser.tabs.query({ active: true, currentWindow: true });
        const fragmentUrl = constructFragmentUrl(tab.url, markedText);
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
  clearAllMarks.textContent = getCurrentLangLabelString('clearAllMarks');
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

let isInitialized = false;

const initializePopup = async () => {
  if (isInitialized) return;
  isInitialized = true;

  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    const defaultColor = await getDefaultColor();
    const tabUrl = tab.url;
  
    const response = await browser.tabs.sendMessage(tab.id, {
      type: 'addColorMark',
      color: defaultColor
    });
    
    const sortedIds = (response && response.sortedIds) ? response.sortedIds : [];

    await buildPopup(tabUrl, defaultColor, sortedIds);
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
