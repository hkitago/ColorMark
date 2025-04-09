(() => {
  const normalizeUrl = (url) => {
    try {
      let u = new URL(url);
      u.hash = u.hash.includes('~:text=') ? '' : u.hash;
      return u.toString();
    } catch (error) {
        console.error('Invalid URL:', url);
        return url;
    }
  };

  const generateUUID = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  };

  const getUniqueMarkIds = () => {
    const colorMarkElements = document.querySelectorAll('.colorMarkText');
    if (!colorMarkElements) return;
    
    return Array.from(colorMarkElements)
      .map(node => node.getAttribute('data-id'))
      .filter((id, index, array) => array.indexOf(id) === index);
  };
  
  const createMarkElement = (color, id) => {
    const wrapper = document.createElement('mark');
    wrapper.style.color = 'inherit';
    wrapper.style.fontStyle = 'initial';
    wrapper.style.fontWeight = 'inherit';
    wrapper.style.fontSize = 'inherit';
    wrapper.style.backgroundColor = color;
    wrapper.dataset.id = id;
    wrapper.classList.add('colorMarkText');
    return wrapper;
  };
  
  const serializeRange = (range) => {
    const startContainer = range.startContainer;
    const endContainer = range.endContainer;
    const startOffset = range.startOffset;
    const endOffset = range.endOffset;

    const startParent = startContainer.parentNode;
    const endParent = endContainer.parentNode;

    const fragment = range.cloneContents();
    const container = document.createElement('div');
    container.appendChild(fragment);

    const normalizedText = container.textContent.replace(/\s+/g, ' ').trim();

    return {
      text: normalizedText,
      html: container.innerHTML
    };
  };

  const highlightText = (range, color, id) => {
    const wrapper = createMarkElement(color, id);
    const startContainer = range.startContainer;
    const endContainer = range.endContainer;
    
    // only one-line text node
    if (startContainer === endContainer) {
      const { html } = serializeRange(range);
      range.deleteContents();
      wrapper.innerHTML = html;
      range.insertNode(wrapper);
      return;
    }

    // in case of multiple tags
    const ranges = [];
    
    const startRange = document.createRange();
    startRange.setStart(range.startContainer, range.startOffset);
    startRange.setEnd(startContainer, startContainer.length);
    ranges.push(startRange);
    
    const endRange = document.createRange();
    endRange.setStart(endContainer, 0);
    endRange.setEnd(endContainer, range.endOffset);
    ranges.push(endRange);
    
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

    // Insert selected html
    ranges.forEach(subRange => {
      const { html } = serializeRange(subRange);
      if (html.trim() === '') return;

      const subWrapper = wrapper.cloneNode(false);
      subRange.deleteContents();
      subWrapper.innerHTML = html;
      subRange.insertNode(subWrapper);
    });
  };
  
  /* GET PREFIX AND SUFFIX */
  const getTextDirection = (node) => {
    const parent = node.parentElement || node;
    return window.getComputedStyle(parent).direction;
  };

  const getAdjacentTextNode = (node, offset, direction) => {
    const textDirection = getTextDirection(node);
    
    if (node.nodeType === Node.TEXT_NODE) {
      let extractedText;
      
      if (direction === 'previous') {
        if (textDirection === 'rtl') {
          extractedText = offset > 0 ? node.textContent.substring(0, offset).trim() : '';
        } else {
          extractedText = offset > 0 ? node.textContent.substring(0, offset).trim() : '';
        }
      } else if (direction === 'next') {
        extractedText = node.textContent.substring(offset);
      }

      if (extractedText) {
        return {
          node: node,
          text: extractedText
        };
      }
    }

    const walker = document.createTreeWalker(
      node.ownerDocument.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (currentNode) =>
          currentNode.textContent.trim()
            ? NodeFilter.FILTER_ACCEPT
            : NodeFilter.FILTER_REJECT,
      },
      false
    );

    walker.currentNode = node;
    let textNode;

    if (direction === 'previous') {
      textNode = walker.previousNode();
      while (textNode && textNode.nodeType !== Node.TEXT_NODE) {
        textNode = walker.previousNode();
      }
    } else if (direction === 'next') {
      textNode = walker.nextNode();
      while (textNode && textNode.nodeType !== Node.TEXT_NODE) {
        textNode = walker.nextNode();
      }
    }

    return textNode ? {
      node: textNode,
      text: textNode.textContent
    } : null;
  };

  const getPrefixAndSuffix = (range) => {
    const prevResult = getAdjacentTextNode(range.startContainer, range.startOffset, 'previous');
    const nextResult = getAdjacentTextNode(range.endContainer, range.endOffset, 'next');

    const prefix = prevResult ? prevResult.text.trim() : '';
    const suffix = nextResult ? nextResult.text.trim() : '';

    return { prefix, suffix };
  };

  const isTextDuplicateInPage = (text) => {
    const bodyText = document.body.innerText.replace(/[\u200E\u200F\u202A-\u202E]/g, '').replace(/\s+/g, ' ').trim();
    const normalizedText = text.replace(/[\u200E\u200F\u202A-\u202E]/g, '').replace(/\s+/g, ' ').trim();

    const regex = new RegExp(normalizedText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');

    const matches = bodyText.match(regex);
    return matches ? matches.length > 1 : false;
  };
  
  const scrollToMark = (dataId) => {
    const targetNode = document.querySelector(`[data-id="${dataId}"]`);
    if (targetNode) {
      targetNode.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      console.warn(`Node with data-id="${dataId}" not found`);
    }
  }

  const removeAllColorMarks = () => {
    const markToRemoves = document.querySelectorAll('.colorMarkText');

    markToRemoves.forEach((mark) => {
      const parent = mark.parentNode;
      const textNode = document.createTextNode(mark.textContent);
      parent.replaceChild(textNode, mark);
    });
  };
  
  /* GET MESSAGE */
  browser.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
    if (request.type === 'scrollToMark') {
      scrollToMark(request.dataId);
      return;
    }

    if (request.type === 'removeAllColorMarks' || request.type === 'syncColorMark') {
//      const markToRemoves = document.querySelectorAll('.colorMarkText');
//
//      markToRemoves.forEach((mark) => {
//        const parent = mark.parentNode;
//        const textNode = document.createTextNode(mark.textContent);
//        parent.replaceChild(textNode, mark);
//      });
      removeAllColorMarks();
      
      if (request.type === 'syncColorMark') {
        initializeContent();
      }

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
        const sortedIds = getUniqueMarkIds();

        sendResponse({
          success: false,
          sortedIds: sortedIds
        });

        return;
      }

      const range = selection.getRangeAt(0);
      const serialized = serializeRange(range);
      const rawUrl = request.url ? request.url : window.location.href;
      const url = normalizeUrl(rawUrl);

      const defaultColor = request.color ? request.color : getDefaultColor();
      const id = generateUUID();

      const { prefix, suffix } = getPrefixAndSuffix(range);
      const isDuplicate = isTextDuplicateInPage(serialized.text);

      const result = await browser.storage.local.get(url);
      const colorMarks = result[url] || [];

      if (!colorMarks.some(mark => mark.text === serialized.text)) {
        colorMarks.push({
          id: id,
          text: serialized.text,
          html: serialized.html,
          prefix: prefix,
          suffix: suffix,
          color: defaultColor,
          isDuplicate: isDuplicate
        });
        await browser.storage.local.set({ [url]: colorMarks });
      }

      highlightText(range, defaultColor, id);
      selection.removeAllRanges();

      const sortedIds = getUniqueMarkIds();

      sendResponse({
        success: true,
        sortedIds: sortedIds
      });

      return true;
    }
  });

  const initializeContent = async () => {
    try {
      const url = normalizeUrl(window.location.href);
      const result = await browser.storage.local.get(url);
      const colorMarks = result[url] || [];

      if (colorMarks.length === 0) return;

      const applyHighlightMark = (mark) => {
        const collectTextNodesWithPositions = (root) => {
          const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
          const nodeInfo = [];
          let totalLength = 0;
          let currentNode;
          
          while ((currentNode = walker.nextNode())) {
            const nodeText = currentNode.textContent;
            if (nodeText.trim()) {
              nodeInfo.push({
                node: currentNode,
                start: totalLength,
                length: nodeText.length
              });
              totalLength += nodeText.length;
            }
          }
          
          return nodeInfo;
        };

        const findNodesForRange = (nodeInfo, startPos, endPos) => {
          const result = [];
          
          for (const info of nodeInfo) {
            const nodeStart = info.start;
            const nodeEnd = info.start + info.length;
            
            if (nodeStart < endPos && nodeEnd > startPos) {
              result.push({
                node: info.node,
                startOffset: Math.max(0, startPos - nodeStart),
                endOffset: Math.min(info.length, endPos - nodeStart)
              });
            }
          }
          
          return result;
        };

        const findMatches = (nodeInfo, searchText) => {
          const mapping = [];
          let fullText = '';
          let fullTextIndex = 0;
          
          nodeInfo.forEach(info => {
            const text = info.node.textContent;
            const normalizedText = text
              .replace(/[\s\u3000]+/g, ' ')
              .replace(/\u200F/g, '')
              .trim();
            
            if (fullText) {
              mapping.push({
                originalIndex: info.start,
                normalizedIndex: fullTextIndex
              });
              fullText += ' ';
              fullTextIndex += 1;
            }
            
            for (let i = 0; i < normalizedText.length; i++) {
              mapping.push({
                originalIndex: info.start + i,
                normalizedIndex: fullTextIndex + i
              });
            }
            
            fullText += normalizedText;
            fullTextIndex += normalizedText.length;
          });
          
          const normalizedSearchText = searchText
            .replace(/[\s\u3000]+/g, ' ')
            .replace(/\u200F/g, '')
            .trim();
          
          const matches = [];
          let startIndex = 0;
          
          while (true) {
            const index = fullText.indexOf(normalizedSearchText, startIndex);
            if (index === -1) break;
            
            const startMapping = mapping.find(m => m.normalizedIndex === index);
            const endMapping = mapping.find(m => m.normalizedIndex === index + normalizedSearchText.length - 1);
            
            if (startMapping && endMapping) {
              matches.push({
                start: startMapping.originalIndex,
                end: endMapping.originalIndex + 1
              });
            }
            
            startIndex = index + 1;
          }
          
          return matches;
        };

        const matchWithPrefixSuffix = (nodeInfo, mark) => {
          let start = 0;
          let ends = [];

          nodeInfo.forEach(({ node, start: nodeStart }, index) => {
            const nodeText = node.textContent.replace(/\s+/g, ' ').trim();

            const prefixStart = nodeText.indexOf(mark.prefix);
            if (prefixStart !== -1) {
              const prefixEnd = prefixStart + mark.prefix.length;
              
              const nodeTextWithoutPrefix = nodeText.replace(mark.prefix, '');
              const isPrefixAndTextMixed = nodeTextWithoutPrefix !== '' && mark.text.startsWith(nodeTextWithoutPrefix);

              if (isPrefixAndTextMixed) {
                start = nodeStart + prefixEnd;
              } else if (index + 1 < nodeInfo.length) {
                const nextNodeInfo = nodeInfo[index + 1];
                const nextNodeText = nextNodeInfo.node.textContent.replace(/\s+/g, ' ').trim();
                
                if (mark.text.startsWith(nextNodeText)) {
                  start = nextNodeInfo.start + prefixStart;
                }
              }
            }

            if (start > 0) {
              const suffixStart = nodeText.indexOf(mark.suffix);
              if (suffixStart !== -1) {
                if (mark.suffix !== '' && nodeText.includes(mark.suffix)) {
                  ends.push(nodeStart + suffixStart);
                } else {
                  if (index > 0) {
                    const prevNodeInfo = nodeInfo[index - 1];
                    const prevNodeText = prevNodeInfo.node.textContent.replace(/\s+/g, ' ').trim();
                    if (mark.text.endsWith(prevNodeText)) {
                      ends.push(nodeStart + suffixStart);
                    }
                  }
                }
              }
            }
          });

          if (start === 0 || ends.length === 0) return [];

          const validEnds = ends.filter(end => end > start);
          const end = validEnds.length > 0 ? Math.min(...validEnds) : null;

          return end !== null ? [{ start, end }] : [];
        };
        
        const isRangeAlreadyHighlighted = (range) => {
          const startNode = range.startContainer;
          const endNode = range.endContainer;

          if (startNode === endNode) {
            return startNode.parentNode && startNode.parentNode.tagName === 'MARK';
          }

          let currentNode = startNode;
          while (currentNode !== endNode) {
            if (currentNode.nodeType === 1 && currentNode.tagName === 'MARK') {
              return true;
            }
            currentNode = currentNode.nextSibling || currentNode.parentNode;
          }

          return false;
        };

        const applyHighlight = (nodeRanges, mark) => {
          for (let i = nodeRanges.length - 1; i >= 0; i--) {
            const { node, startOffset, endOffset } = nodeRanges[i];
            const range = document.createRange();
            range.setStart(node, startOffset);
            range.setEnd(node, endOffset);
            
            if (isRangeAlreadyHighlighted(range)) {
              continue;
            }
            
            const wrapper = createMarkElement(mark.color, mark.id);
            const fragment = range.extractContents();
            wrapper.appendChild(fragment);
            range.insertNode(wrapper);
          }
          
          return true;
        };

        const nodeInfo = collectTextNodesWithPositions(document.body);
        let matches = matchWithPrefixSuffix(nodeInfo, mark);
        
        if (matches.length === 0) {
          matches = findMatches(nodeInfo, mark.text);
        }
        
        if (matches.length > 0) {
          const match = matches[0];
          const nodeRanges = findNodesForRange(nodeInfo, match.start, match.end);

          if (nodeRanges.length > 0) {
            applyHighlight(nodeRanges, mark);
          }
        }
      };

      for (const mark of colorMarks) {
        applyHighlightMark(mark);
      }
    } catch (error) {
      console.error('Failed to initialize highlights:', error);
    }
  };

  const observer = new MutationObserver((mutationsList) => {
    for (let mutation of mutationsList) {
      if (mutation.type === 'childList') {
        initializeContent();
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeContent, { once: true });
  } else {
    initializeContent();
  }
})();
