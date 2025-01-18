(() => {
  const generateUUID = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  };

  const serializeRange = (range) => {
    const fragment = range.cloneContents();
    const container = document.createElement('div');
    container.appendChild(fragment);

    // すべての子要素を走査して、タグ間にスペースを挿入
    const addSpaceBetweenElements = (node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        return node.textContent;
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        let text = '';
        // 子要素がある場合、それぞれを走査
        for (let child of node.childNodes) {
          text += addSpaceBetweenElements(child);
        }
        // 要素間にスペースを挿入（要素の間にスペースを入れる）
        if (node.nextSibling && node.nextSibling.nodeType === Node.ELEMENT_NODE) {
          text += ' ';
        }
        return text;
      }
      return '';
    };

    const normalizedText = addSpaceBetweenElements(container).replace(/\s+/g, ' ').trim();

    return {
      text: normalizedText,
      html: container.innerHTML
    };
  };

  const highlightText = (range, color, id) => {
    const wrapper = document.createElement('mark');
    wrapper.style.backgroundColor = color;
    wrapper.dataset.id = id;
    wrapper.classList.add('colorMarkText');
    
    const startContainer = range.startContainer;
    const endContainer = range.endContainer;
    
    // 単一ノード内の選択の場合
    if (startContainer === endContainer) {
      const { html } = serializeRange(range);
      range.deleteContents();
      wrapper.innerHTML = html;
      range.insertNode(wrapper);
      return;
    }

    // 複数段落にまたがる選択の場合
    const ranges = [];
    
    // 開始ノード用の Range
    const startRange = document.createRange();
    startRange.setStart(range.startContainer, range.startOffset);
    startRange.setEnd(startContainer, startContainer.length);
    ranges.push(startRange);
    
    // 終了ノード用の Range
    const endRange = document.createRange();
    endRange.setStart(endContainer, 0);
    endRange.setEnd(endContainer, range.endOffset);
    ranges.push(endRange);
    
    // 中間ノード用の Range
    const iterator = document.createNodeIterator(
      range.commonAncestorContainer,
      NodeFilter.SHOW_TEXT,
      node => {
        if (node !== startContainer &&
            node !== endContainer &&
            range.intersectsNode(node)) {
          return NodeFilter.FILTER_ACCEPT;
        }
        return NodeFilter.FILTER_REJECT;
      }
    );
    
    let node;
    while (node = iterator.nextNode()) {
      const middleRange = document.createRange();
      middleRange.selectNode(node);
      ranges.push(middleRange);
    }

    // 各Rangeに対して単一ノード処理と同じ方法でハイライトを適用
    ranges.forEach(subRange => {
      const { html } = serializeRange(subRange);
      const subWrapper = wrapper.cloneNode(false);
      subRange.deleteContents();
      subWrapper.innerHTML = html;
      subRange.insertNode(subWrapper);
    });
  };
  
  browser.runtime.onMessage.addListener(async (request, sender, sendResponse) => {

    if (request.type === 'removeAllColorMarks') {
      const markToRemoves = document.querySelectorAll('.colorMarkText');

      markToRemoves.forEach((mark) => {
        const parent = mark.parentNode;
        const textNode = document.createTextNode(mark.textContent);
        parent.replaceChild(textNode, mark);
      });
      
      return;
    }

    if (request.type === 'removeColorMark') {
      const marksToRemove = document.querySelectorAll(`mark[data-id="${request.id}"]`);

      marksToRemove.forEach((mark) => {
        const parent = mark.parentNode;
        if (parent) {
          const textNode = document.createTextNode(mark.textContent);
          parent.replaceChild(textNode, mark);
        }
      });
      
      return;
    }

    if (request.type === 'updateColorMark') {
      const marksToUpdate = document.querySelectorAll(`mark[data-id="${request.id}"]`);

      marksToUpdate.forEach((mark) => {
        mark.style.backgroundColor = request.color;
      });
      
      return;
    }

    if (request.type === 'addColorMark') {
      const selection = window.getSelection();
      
      if (selection.rangeCount === 0 || !selection.toString().trim()) {
        sendResponse({ success: false });
        return;
      }

      const range = selection.getRangeAt(0);
      const serialized = serializeRange(range);
      const url = request.url ? request.url : window.location.href;
      const defaultColor = request.color ? request.color : '#fffb00';
      const id = request.id ? request.id : generateUUID();

      const result = await browser.storage.local.get(url);
      const colorMarks = result[url] || [];

      if (!colorMarks.some(mark => mark.text === serialized.text)) {
        colorMarks.push({
          id: id,
          text: serialized.text,
          html: serialized.html,
          color: defaultColor
        });

        await browser.storage.local.set({ [url]: colorMarks });
      }

      highlightText(range, defaultColor, id);
      selection.removeAllRanges();
      sendResponse({ success: true });
      
      return;
    }
  });

  const initializeContent = async () => {
    try {
      const url = window.location.href;
      const result = await browser.storage.local.get(url);
      const colorMarks = result[url] || [];

      if (colorMarks.length === 0) return;

      const highlightTextAcrossNodes = (searchText, color, mark) => {
        const flattenTextNodes = (node) => {
          const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
          let text = '';
          let currentNode;
          const nodes = [];
          while ((currentNode = walker.nextNode())) {
            text += currentNode.textContent;
            nodes.push(currentNode);
          }
          return { text, nodes };
        };

        const findRanges = (parent, searchText) => {
          const { text, nodes } = flattenTextNodes(parent);
          const startIndex = text.indexOf(searchText);
          if (startIndex === -1) return null;

          let currentIndex = 0;
          const ranges = [];
          const searchEnd = startIndex + searchText.length;

          for (const node of nodes) {
            const endIndex = currentIndex + node.textContent.length;

            if (currentIndex < searchEnd && startIndex < endIndex) {
              const range = document.createRange();
              range.setStart(node, Math.max(0, startIndex - currentIndex));
              range.setEnd(node, Math.min(node.textContent.length, searchEnd - currentIndex));
              ranges.push(range);
            }
            currentIndex = endIndex;
          }
          return ranges;
        };

        const ranges = findRanges(document.body, searchText);
        if (!ranges || ranges.length === 0) {
          console.warn(`No matching nodes found for: "${searchText}"`);
          return;
        }

        ranges.forEach((range) => {
          const parent = range.commonAncestorContainer.parentElement;
          if (parent && parent.nodeType === Node.ELEMENT_NODE) {
            const fragment = range.cloneContents();
            const wrapper = document.createElement('mark');
            wrapper.style.backgroundColor = color;
            wrapper.dataset.id = mark.id;
            wrapper.classList.add('colorMarkText');
            wrapper.appendChild(fragment);

            range.deleteContents();
            range.insertNode(wrapper);
          }
        });
      };

      for (const mark of colorMarks) {
        const searchText = mark.text.replace(/\s+/g, ' ').trim();
        highlightTextAcrossNodes(searchText, mark.color, mark);
      }
    } catch (error) {
      console.error('Failed to initialize highlights:', error);
    }
  };


  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeContent, { once: true });
  } else {
    initializeContent();
  }
})();
