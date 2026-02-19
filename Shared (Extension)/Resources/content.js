(() => {
  let savedScroll = null; // to restore scroll position
  let isInitializingHighlights = false;
  let initializeTimer = null;
  const SCROLL_THRESHOLD = 5;
  const DEFAULT_MARK_COLOR = '#fffb00';
  const MARK_SCHEMA_VERSION = 3;
  const CONTEXT_CHAR_LIMIT = 48;
  const BIDI_CONTROL_REGEX = /[\u200E\u200F\u202A-\u202E]/g;
  const BIDI_CONTROL_CHAR_REGEX = /[\u200E\u200F\u202A-\u202E]/u;

  const normalizeUrl = (url) => {
    try {
      let u = new URL(url);
      u.hash = u.hash.includes('~:text=') ? '' : u.hash;
      return u.toString();
    } catch (error) {
        console.warn('[ColorMarkExtension] Invalid URL:', url);
        return url;
    }
  };

  const getStorageIndexKey = (url) => `colorMarks:index:${url}`;
  const getStorageItemKey = (url, id) => `colorMarks:item:${url}:${id}`;

  const normalizeStoredMark = (mark, url) => ({
    ...mark,
    id: mark?.id || generateUUID(),
    url: mark?.url || url,
    color: mark?.color || DEFAULT_MARK_COLOR
  });

  const loadColorMarksForUrl = async (url) => {
    const indexKey = getStorageIndexKey(url);
    const result = await browser.storage.local.get([indexKey, url]);
    const index = result[indexKey];

    if (index && Array.isArray(index.ids)) {
      const ids = [...new Set(index.ids.filter(Boolean))];
      if (ids.length === 0) {
        return [];
      }

      const itemKeys = ids.map(id => getStorageItemKey(url, id));
      const itemResult = await browser.storage.local.get(itemKeys);
      const marks = ids
        .map(id => itemResult[getStorageItemKey(url, id)])
        .filter(Boolean)
        .map(mark => normalizeStoredMark(mark, url));

      if (marks.length !== ids.length) {
        const repairedIds = marks.map(mark => mark.id);
        await browser.storage.local.set({
          [indexKey]: {
            rev: (index.rev || 0) + 1,
            ids: repairedIds
          }
        });
      }

      return marks;
    }

    const legacyMarks = Array.isArray(result[url]) ? result[url] : [];
    if (legacyMarks.length === 0) {
      return [];
    }

    const normalizedMarks = legacyMarks.map(mark => normalizeStoredMark(mark, url));
    const payload = {
      [indexKey]: {
        rev: 1,
        ids: normalizedMarks.map(mark => mark.id)
      }
    };

    normalizedMarks.forEach((mark) => {
      payload[getStorageItemKey(url, mark.id)] = mark;
    });

    await browser.storage.local.set(payload);
    await browser.storage.local.remove(url);

    return normalizedMarks;
  };

  const appendColorMark = async (url, mark) => {
    const indexKey = getStorageIndexKey(url);
    const current = await browser.storage.local.get(indexKey);
    const index = current[indexKey] || { rev: 0, ids: [] };
    const ids = Array.isArray(index.ids) ? [...index.ids] : [];

    if (!ids.includes(mark.id)) {
      ids.push(mark.id);
    }

    await browser.storage.local.set({
      [getStorageItemKey(url, mark.id)]: mark,
      [indexKey]: {
        rev: (index.rev || 0) + 1,
        ids
      }
    });
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

  const getAppliedMarkIdSet = () => {
    const nodes = document.querySelectorAll('.colorMarkText[data-id]');
    return new Set(
      Array.from(nodes)
        .map(node => node.getAttribute('data-id'))
        .filter(Boolean)
    );
  };
  
  const getTextColorForBackground = (backgroundColor) => {
    let hex = backgroundColor.replace(/^#/, '');
    
    if (hex.length === 3) {
      hex = hex.split('').map(char => char + char).join('');
    }
    
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    
    const brightness = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
    
    if (brightness > 0.8) {
      return '#000000';
    } else if (brightness < 0.3) {
      return '#FFFFFF';
    } else {
      return 'inherit';
    }
  };
  
  const createMarkElement = (color, id) => {
    const wrapper = document.createElement('mark');
    const textColor = getTextColorForBackground(color);
    
    wrapper.style.backgroundColor = color;
    wrapper.style.color = textColor;
    wrapper.dataset.id = id;

    wrapper.style.fontStyle = 'initial';
    wrapper.style.fontWeight = 'inherit';
    wrapper.style.fontSize = 'inherit';
    wrapper.classList.add('colorMarkText');
    return wrapper;
  };
  
  const serializeRange = (range) => {
    const fragment = range.cloneContents();
    const container = document.createElement('div');
    container.appendChild(fragment);

    const normalizedText = container.textContent.replace(/\s+/g, ' ').trim();

    return {
      text: normalizedText,
      html: container.innerHTML
    };
  };

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  const normalizeTextForMatch = (text) => {
    if (typeof text !== 'string') return '';

    return text
      .normalize('NFC')
      .replace(BIDI_CONTROL_REGEX, '')
      .replace(/[\s\u3000]+/g, ' ')
      .trim();
  };

  const sliceFromEndByChars = (text, limit) => {
    if (!text) return '';
    const chars = Array.from(text);
    return chars.slice(-limit).join('');
  };

  const sliceFromStartByChars = (text, limit) => {
    if (!text) return '';
    const chars = Array.from(text);
    return chars.slice(0, limit).join('');
  };

  const collectTextNodesWithPositions = (root) => {
    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          const parentTag = node.parentElement?.tagName;
          if (parentTag && ['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE'].includes(parentTag)) {
            return NodeFilter.FILTER_REJECT;
          }
          return node.textContent.length > 0
            ? NodeFilter.FILTER_ACCEPT
            : NodeFilter.FILTER_REJECT;
        }
      }
    );

    const nodeInfo = [];
    const nodeMap = new Map();
    let totalLength = 0;
    let currentNode;

    while ((currentNode = walker.nextNode())) {
      const text = currentNode.textContent || '';
      const info = {
        node: currentNode,
        start: totalLength,
        length: text.length
      };

      nodeInfo.push(info);
      nodeMap.set(currentNode, info);
      totalLength += text.length;
    }

    return { nodeInfo, nodeMap, totalLength };
  };

  const buildNormalizedTextIndex = (nodeInfo) => {
    let normalizedText = '';
    const normalizedToOriginal = [];
    let previousWasSpace = true;

    nodeInfo.forEach((info) => {
      const text = info.node.textContent || '';

      for (let i = 0; i < text.length; i++) {
        const originalChar = text[i];
        const originalIndex = info.start + i;

        if (BIDI_CONTROL_CHAR_REGEX.test(originalChar)) {
          continue;
        }

        if (/[\s\u3000]/u.test(originalChar)) {
          if (!previousWasSpace && normalizedText.length > 0) {
            normalizedText += ' ';
            normalizedToOriginal.push(originalIndex);
            previousWasSpace = true;
          }
          continue;
        }

        const normalizedChar = originalChar.normalize('NFC');
        const chars = Array.from(normalizedChar);
        chars.forEach((char) => {
          normalizedText += char;
          normalizedToOriginal.push(originalIndex);
        });
        previousWasSpace = false;
      }
    });

    while (normalizedText.endsWith(' ')) {
      normalizedText = normalizedText.slice(0, -1);
      normalizedToOriginal.pop();
    }

    return { normalizedText, normalizedToOriginal };
  };

  const buildTextIndex = (root) => {
    const { nodeInfo, nodeMap, totalLength } = collectTextNodesWithPositions(root);
    const { normalizedText, normalizedToOriginal } = buildNormalizedTextIndex(nodeInfo);

    return {
      nodeInfo,
      nodeMap,
      totalLength,
      normalizedText,
      normalizedToOriginal
    };
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

  const getNodeLength = (node) => {
    if (!node) return 0;
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent?.length || 0;
    }
    return node.childNodes?.length || 0;
  };

  const getGlobalOffset = (container, offset, textIndex) => {
    if (container?.nodeType === Node.TEXT_NODE) {
      const info = textIndex.nodeMap.get(container);
      if (info) {
        return info.start + clamp(offset, 0, info.length);
      }
    }

    try {
      const probeRange = document.createRange();
      probeRange.selectNodeContents(document.body);
      probeRange.setEnd(container, offset);
      const fragment = probeRange.cloneContents();
      const text = fragment.textContent || '';
      return text.length;
    } catch (error) {
      return 0;
    }
  };

  const getGlobalTextPosition = (range, textIndex) => {
    const safeTotal = textIndex.totalLength > 0 ? textIndex.totalLength : 1;
    let start = getGlobalOffset(range.startContainer, range.startOffset, textIndex);
    let end = getGlobalOffset(range.endContainer, range.endOffset, textIndex);

    if (end < start) {
      [start, end] = [end, start];
    }

    return {
      start,
      end,
      totalLength: textIndex.totalLength,
      ratio: clamp(start / safeTotal, 0, 1)
    };
  };

  const findExactMatches = (textIndex, searchText) => {
    const normalizedSearchText = normalizeTextForMatch(searchText);
    if (!normalizedSearchText) return [];

    const matches = [];
    let startIndex = 0;

    while (true) {
      const normalizedStart = textIndex.normalizedText.indexOf(normalizedSearchText, startIndex);
      if (normalizedStart === -1) break;

      const normalizedEnd = normalizedStart + normalizedSearchText.length - 1;
      const start = textIndex.normalizedToOriginal[normalizedStart];
      const end = textIndex.normalizedToOriginal[normalizedEnd];

      if (typeof start === 'number' && typeof end === 'number') {
        matches.push({
          start,
          end: end + 1,
          normalizedStart,
          normalizedEnd
        });
      }

      startIndex = normalizedStart + 1;
    }

    return matches.map((match, exactIndex) => ({
      ...match,
      exactIndex
    }));
  };

  const getXPath = (node) => {
    if (!node) return '';

    const segments = [];
    let current = node;

    while (current && current.nodeType !== Node.DOCUMENT_NODE) {
      if (current.nodeType === Node.TEXT_NODE) {
        const parent = current.parentNode;
        if (!parent) break;

        const textNodes = Array.from(parent.childNodes).filter(
          child => child.nodeType === Node.TEXT_NODE
        );
        const index = textNodes.indexOf(current) + 1;
        segments.unshift(`text()[${index}]`);
        current = parent;
        continue;
      }

      if (current.nodeType === Node.ELEMENT_NODE) {
        const tagName = current.nodeName.toLowerCase();
        const siblings = current.parentNode
          ? Array.from(current.parentNode.children).filter(
            sibling => sibling.nodeName === current.nodeName
          )
          : [current];
        const index = siblings.indexOf(current) + 1;
        segments.unshift(`${tagName}[${index}]`);
      }

      current = current.parentNode;
    }

    return segments.length > 0 ? `/${segments.join('/')}` : '';
  };

  const resolveXPath = (xpath) => {
    if (!xpath) return null;

    try {
      return document.evaluate(
        xpath,
        document,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null
      ).singleNodeValue;
    } catch (error) {
      return null;
    }
  };

  const createRangeFromDomAnchor = (domRange) => {
    if (!domRange) return null;

    const startNode = resolveXPath(domRange.startXPath);
    const endNode = resolveXPath(domRange.endXPath);
    if (!startNode || !endNode) return null;

    const range = document.createRange();
    const startOffset = clamp(domRange.startOffset || 0, 0, getNodeLength(startNode));
    const endOffset = clamp(domRange.endOffset || 0, 0, getNodeLength(endNode));

    try {
      range.setStart(startNode, startOffset);
      range.setEnd(endNode, endOffset);
    } catch (error) {
      return null;
    }

    if (range.collapsed) return null;
    return range;
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

    const normalizedPrefix = prevResult
      ? normalizeTextForMatch(prevResult.text)
      : '';
    const normalizedSuffix = nextResult
      ? normalizeTextForMatch(nextResult.text)
      : '';

    const prefix = sliceFromEndByChars(normalizedPrefix, CONTEXT_CHAR_LIMIT);
    const suffix = sliceFromStartByChars(normalizedSuffix, CONTEXT_CHAR_LIMIT);

    return { prefix, suffix };
  };

  const findScrollContainer = (el) => {
    let node = el.parentElement;
    while (node) {
      const style = getComputedStyle(node);
      if (/(auto|scroll)/.test(style.overflowY)) {
        return node;
      }
      node = node.parentElement;
    }
    return document.scrollingElement;
  };

  const scrollToMark = async (dataId) => {
    const targetNode = document.querySelector(`[data-id="${dataId}"]`);
    if (!targetNode) return;
    
    const container = findScrollContainer(targetNode);

    if (!savedScroll) {
      savedScroll = {
        container,
        top: Math.round(container.scrollTop)
      };
    }

    const blockPosition = /iPhone/.test(navigator.userAgent) ? 'start' : 'center';
    targetNode.scrollIntoView({ behavior: 'smooth', block: blockPosition });

    await new Promise((resolve) => {
      let timeoutId;
      
      const handleScrollEnd = () => {
        clearTimeout(timeoutId);
        resolve();
      };
      
      container.addEventListener('scrollend', handleScrollEnd, { once: true });
      timeoutId = setTimeout(() => {
        container.removeEventListener('scrollend', handleScrollEnd);
        resolve();
      }, 1000); // Fallback
    });

    return Math.abs(savedScroll.top - container.scrollTop) <= SCROLL_THRESHOLD;
  }

  const unwrapColorMark = (mark) => {
    const parent = mark?.parentNode;
    if (!parent) return;

    while (mark.firstChild) {
      parent.insertBefore(mark.firstChild, mark);
    }
    parent.removeChild(mark);
    parent.normalize();
  };

  const removeAllColorMarks = () => {
    const markToRemoves = document.querySelectorAll('.colorMarkText');

    markToRemoves.forEach((mark) => {
      unwrapColorMark(mark);
    });
  };
  
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState !== 'visible') return;

    removeAllColorMarks();
    initializeContent();
  });

  /* GET MESSAGE */
  browser.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
    if (request.type === 'RESTORE_SCROLL') {
      if (!savedScroll || !savedScroll.container) {
        console.error('[ColorMarkExtension] No saved scroll position to restore.');
        return;
      }

      const { container, top } = savedScroll;

      try {
        if (
          container === document.scrollingElement ||
          container === document.documentElement ||
          container === document.body
        ) {
          window.scrollTo({
            top,
            behavior: 'smooth'
          });
        } else {
          container.scrollTo({
            top,
            behavior: 'smooth'
          });
        }
      } catch (error) {
        console.error('[ColorMarkExtension] Failed to restore scroll position:', error);
      }
      
      savedScroll = null;
      
      return;
    }

    if (request.type === 'scrollToMark') {
      const result = await scrollToMark(request.dataId);

      sendResponse({
        success: result,
      });

      return true;
    }

    if (request.type === 'removeAllColorMarks') {
      removeAllColorMarks();
      
      return;
    }

    if (request.type === 'removeColorMark') {
      const marksToRemove = document.querySelectorAll(`mark[data-id="${request.id}"]`);

      marksToRemove.forEach((mark) => {
        unwrapColorMark(mark);
      });
      
      return;
    }

    if (request.type === 'updateColorMark') {
      const marksToUpdate = document.querySelectorAll(`mark[data-id="${request.id}"]`);
      const textColor = getTextColorForBackground(request.color);

      marksToUpdate.forEach((mark) => {
        mark.style.backgroundColor = request.color;
        mark.style.color = textColor;
      });
      
      return;
    }

    if (request.type === 'addColorMark') {
      savedScroll = null;
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

      const defaultColor = request.color || DEFAULT_MARK_COLOR;
      const id = generateUUID();
      const { prefix, suffix } = getPrefixAndSuffix(range);
      const textIndex = buildTextIndex(document.body);
      const positionInfo = getGlobalTextPosition(range, textIndex);
      const exactMatches = findExactMatches(textIndex, serialized.text);
      const targetPosition = positionInfo.start;
      let byExactIndex = -1;

      if (exactMatches.length > 0) {
        let closest = exactMatches[0];
        let closestDistance = Math.abs(closest.start - targetPosition);

        for (const candidate of exactMatches) {
          const distance = Math.abs(candidate.start - targetPosition);
          if (distance < closestDistance) {
            closest = candidate;
            closestDistance = distance;
          }
        }

        byExactIndex = closest.exactIndex;
      }

      await loadColorMarksForUrl(url);

      const newMark = {
        version: MARK_SCHEMA_VERSION,
        id,
        url,
        color: defaultColor,
        createdAt: Date.now(),
        locale: document.documentElement.lang || navigator.language,
        text: serialized.text,
        html: serialized.html,
        prefix,
        suffix,
        target: {
          normalization: {
            unicode: 'NFC',
            whitespace: 'collapse'
          },
          selectors: {
            textQuote: {
              exact: serialized.text,
              prefix,
              suffix
            },
            textPosition: {
              start: positionInfo.start,
              end: positionInfo.end,
              totalLength: positionInfo.totalLength,
              ratio: positionInfo.ratio
            },
            domRange: {
              startXPath: getXPath(range.startContainer),
              startOffset: range.startOffset,
              endXPath: getXPath(range.endContainer),
              endOffset: range.endOffset
            },
            occurrence: {
              byExactIndex,
              exactCountAtSave: exactMatches.length
            }
          }
        }
      };

      await appendColorMark(url, newMark);

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

  const getFiniteNumber = (value) => (
    typeof value === 'number' && Number.isFinite(value)
      ? value
      : null
  );

  const getMarkSelectors = (mark) => {
    const selectors = mark?.target?.selectors || {};
    const quote = selectors.textQuote || {};
    const position = selectors.textPosition || {};

    return {
      textQuote: {
        exact: quote.exact || mark.text || '',
        prefix: quote.prefix || mark.prefix || '',
        suffix: quote.suffix || mark.suffix || ''
      },
      textPosition: {
        start: getFiniteNumber(position.start),
        end: getFiniteNumber(position.end),
        totalLength: getFiniteNumber(position.totalLength),
        ratio: getFiniteNumber(position.ratio) ?? getFiniteNumber(mark.positionRatio)
      },
      domRange: selectors.domRange || mark.domAnchor || null,
      occurrence: selectors.occurrence || {}
    };
  };

  const createRangeSignature = (start, end) => `${start}:${end}`;

  const hasColorMarkAncestor = (node) => {
    let current = node?.parentNode;

    while (current) {
      if (
        current.nodeType === Node.ELEMENT_NODE &&
        current.classList?.contains('colorMarkText')
      ) {
        return true;
      }
      current = current.parentNode;
    }

    return false;
  };

  const applyHighlightToNodeRanges = (nodeRanges, mark) => {
    if (!mark.id) {
      mark.id = generateUUID();
    }
    if (!mark.color) {
      mark.color = DEFAULT_MARK_COLOR;
    }

    let applied = false;

    // Reverse-order wrapping avoids offset shifts when selection spans nested tags.
    for (let i = nodeRanges.length - 1; i >= 0; i--) {
      const { node, startOffset, endOffset } = nodeRanges[i];
      if (!node || !node.parentNode) continue;
      if (endOffset <= startOffset) continue;
      if (hasColorMarkAncestor(node)) continue;

      const range = document.createRange();
      try {
        range.setStart(node, clamp(startOffset, 0, node.length));
        range.setEnd(node, clamp(endOffset, 0, node.length));
      } catch (error) {
        continue;
      }

      if (range.collapsed) continue;

      const wrapper = createMarkElement(mark.color, mark.id);
      const fragment = range.extractContents();
      if (!fragment.textContent) continue;

      wrapper.appendChild(fragment);
      range.insertNode(wrapper);
      applied = true;
    }

    return applied;
  };

  const applyHighlightByOffsets = (textIndex, start, end, mark) => {
    if (!Number.isFinite(start) || !Number.isFinite(end)) return false;
    if (end <= start) return false;

    const nodeRanges = findNodesForRange(textIndex.nodeInfo, start, end);
    if (nodeRanges.length === 0) return false;

    return applyHighlightToNodeRanges(nodeRanges, mark);
  };

  const doesRangeMatchExact = (range, exactText) => {
    const normalizedExact = normalizeTextForMatch(exactText);
    if (!normalizedExact) return true;

    const serialized = serializeRange(range);
    const rangeText = normalizeTextForMatch(serialized.text);
    return rangeText === normalizedExact;
  };

  const getContextScore = (textIndex, candidate, normalizedPrefix, normalizedSuffix) => {
    let score = 0;

    if (normalizedPrefix) {
      const prefixStart = Math.max(0, candidate.normalizedStart - normalizedPrefix.length);
      const actualPrefix = textIndex.normalizedText.slice(prefixStart, candidate.normalizedStart);
      if (actualPrefix === normalizedPrefix) {
        score += 2;
      }
    }

    if (normalizedSuffix) {
      const suffixStart = candidate.normalizedEnd + 1;
      const actualSuffix = textIndex.normalizedText.slice(
        suffixStart,
        suffixStart + normalizedSuffix.length
      );
      if (actualSuffix === normalizedSuffix) {
        score += 2;
      }
    }

    return score;
  };

  const chooseBestMatch = (matches, textIndex, selectors, usedRangeSignatures) => {
    const normalizedPrefix = normalizeTextForMatch(selectors.textQuote.prefix);
    const normalizedSuffix = normalizeTextForMatch(selectors.textQuote.suffix);
    const rawOccurrence = selectors.occurrence?.byExactIndex;
    const targetOccurrence = Number.isInteger(rawOccurrence) && rawOccurrence >= 0
      ? rawOccurrence
      : null;
    const targetStart = selectors.textPosition.start;

    let targetRatio = selectors.textPosition.ratio;
    if (targetRatio === null && targetStart !== null && textIndex.totalLength > 0) {
      targetRatio = clamp(targetStart / textIndex.totalLength, 0, 1);
    }

    const ranked = matches
      .filter(candidate => !usedRangeSignatures.has(createRangeSignature(candidate.start, candidate.end)))
      .map((candidate) => {
        const candidateRatio = textIndex.totalLength > 0
          ? candidate.start / textIndex.totalLength
          : 0;

        return {
          ...candidate,
          contextScore: getContextScore(textIndex, candidate, normalizedPrefix, normalizedSuffix),
          occurrenceDistance: targetOccurrence === null
            ? Number.POSITIVE_INFINITY
            : Math.abs(candidate.exactIndex - targetOccurrence),
          ratioDistance: targetRatio === null
            ? Number.POSITIVE_INFINITY
            : Math.abs(candidateRatio - targetRatio),
          startDistance: targetStart === null
            ? Number.POSITIVE_INFINITY
            : Math.abs(candidate.start - targetStart)
        };
      });

    if (ranked.length === 0) {
      return null;
    }

    ranked.sort((a, b) => {
      if (a.contextScore !== b.contextScore) {
        return b.contextScore - a.contextScore;
      }
      if (a.occurrenceDistance !== b.occurrenceDistance) {
        return a.occurrenceDistance - b.occurrenceDistance;
      }
      if (a.ratioDistance !== b.ratioDistance) {
        return a.ratioDistance - b.ratioDistance;
      }
      if (a.startDistance !== b.startDistance) {
        return a.startDistance - b.startDistance;
      }
      return a.start - b.start;
    });

    return ranked[0];
  };

  const applyHighlightMark = (mark, usedRangeSignatures, textIndex, exactMatchCache) => {
    const selectors = getMarkSelectors(mark);
    const exactText = selectors.textQuote.exact || mark.text || '';
    if (!exactText) return false;

    const anchoredRange = createRangeFromDomAnchor(selectors.domRange);
    if (anchoredRange && doesRangeMatchExact(anchoredRange, exactText)) {
      const anchoredPosition = getGlobalTextPosition(anchoredRange, textIndex);
      const anchoredSignature = createRangeSignature(anchoredPosition.start, anchoredPosition.end);

      if (!usedRangeSignatures.has(anchoredSignature)) {
        const applied = applyHighlightByOffsets(
          textIndex,
          anchoredPosition.start,
          anchoredPosition.end,
          mark
        );

        if (applied) {
          usedRangeSignatures.add(anchoredSignature);
          return true;
        }
      }
    }

    const normalizedExact = normalizeTextForMatch(exactText);
    if (!normalizedExact) return false;

    let exactMatches = exactMatchCache.get(normalizedExact);
    if (!exactMatches) {
      exactMatches = findExactMatches(textIndex, exactText);
      exactMatchCache.set(normalizedExact, exactMatches);
    }

    if (exactMatches.length === 0) return false;

    const bestMatch = chooseBestMatch(exactMatches, textIndex, selectors, usedRangeSignatures);
    if (!bestMatch) return false;

    const applied = applyHighlightByOffsets(textIndex, bestMatch.start, bestMatch.end, mark);
    if (applied) {
      usedRangeSignatures.add(createRangeSignature(bestMatch.start, bestMatch.end));
    }

    return applied;
  };

  const getMarkSortRatio = (mark) => {
    const selectors = getMarkSelectors(mark);
    if (selectors.textPosition.ratio !== null) {
      return selectors.textPosition.ratio;
    }
    if (selectors.textPosition.start !== null && selectors.textPosition.totalLength) {
      return clamp(selectors.textPosition.start / selectors.textPosition.totalLength, 0, 1);
    }
    return Number.POSITIVE_INFINITY;
  };

  const initializeContent = async () => {
    if (isInitializingHighlights) return;

    isInitializingHighlights = true;
    try {
      const url = normalizeUrl(window.location.href);
      const colorMarks = await loadColorMarksForUrl(url);
      if (colorMarks.length === 0) return;

      const usedRangeSignatures = new Set();
      const appliedMarkIds = getAppliedMarkIdSet();
      const textIndex = buildTextIndex(document.body);
      const exactMatchCache = new Map();
      const sortedMarks = [...colorMarks].sort((a, b) => {
        const ratioA = getMarkSortRatio(a);
        const ratioB = getMarkSortRatio(b);

        if (ratioA !== ratioB) {
          return ratioA - ratioB;
        }

        const createdAtA = getFiniteNumber(a.createdAt) || 0;
        const createdAtB = getFiniteNumber(b.createdAt) || 0;
        return createdAtA - createdAtB;
      });

      for (const mark of sortedMarks) {
        if (mark?.id && appliedMarkIds.has(mark.id)) continue;
        applyHighlightMark(mark, usedRangeSignatures, textIndex, exactMatchCache);
      }
    } catch (error) {
      console.error('[ColorMarkExtension] Failed to initialize highlights:', error);
    } finally {
      isInitializingHighlights = false;
    }
  };

  const hasNonExtensionMutations = (mutationsList) => mutationsList.some((mutation) => {
    if (mutation.type !== 'childList') return false;

    const nodes = [...mutation.addedNodes, ...mutation.removedNodes];
    return nodes.some((node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        return !node.parentElement?.closest('.colorMarkText');
      }
      if (node.nodeType !== Node.ELEMENT_NODE) {
        return false;
      }
      if (node.classList?.contains('colorMarkText')) {
        return false;
      }
      return !node.closest('.colorMarkText');
    });
  });

  const scheduleInitializeContent = () => {
    if (initializeTimer) {
      clearTimeout(initializeTimer);
    }

    initializeTimer = setTimeout(() => {
      initializeTimer = null;
      initializeContent();
    }, 120);
  };

  const observer = new MutationObserver((mutationsList) => {
    if (!hasNonExtensionMutations(mutationsList)) {
      return;
    }
    scheduleInitializeContent();
  });

  observer.observe(document.body, { childList: true, subtree: true });
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeContent, { once: true });
  } else {
    initializeContent();
  }
})();
