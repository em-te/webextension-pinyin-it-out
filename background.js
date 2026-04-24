let isActive = true;
let rawDict = "";

// Load dictionary
fetch(chrome.runtime.getURL('cedict_ts.u8'))
  .then(response => response.text())
  .then(text => {
    rawDict = text;
    console.log(`Loaded dictionary (${rawDict.length} chars)`);
  })
  .catch(err => console.error('Failed to load dictionary:', err));

// Initialize state
chrome.storage.local.get(['isActive'], (result) => {
  isActive = result.isActive !== undefined ? result.isActive : true;
  updateIcon();
});

// Toggle state on click
chrome.action.onClicked.addListener((tab) => {
  isActive = !isActive;
  chrome.storage.local.set({ isActive });
  updateIcon();
});

function updateIcon() {
  const text = isActive ? 'ON' : '';
  const color = isActive ? '#4CAF50' : '#F44336';
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color });
}

// Handle messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'translate') {
    let { text, hoverIndex } = request;
    if (!text || hoverIndex < 0 || hoverIndex >= text.length) {
      sendResponse({ result: null });
      return true;
    }

    // Trim whitespace and adjust hoverIndex
    let newText = "";
    let newHoverIndex = hoverIndex;
    for (let i = 0; i < text.length; i++) {
      if (text[i].trim() !== '') {
        if (i === hoverIndex) newHoverIndex = newText.length;
        newText += text[i];
      } else if (i < hoverIndex) {
        newHoverIndex--;
      }
    }
    text = newText;
    hoverIndex = newHoverIndex;

    let candidates = [];
    // Forward (e.g. DEFG, DEF, DE)
    for (let i = Math.min(text.length - 1, hoverIndex + 3); i >= hoverIndex + 1; i--) {
      candidates.push(text.substring(hoverIndex, i + 1));
    }
    // Backward (e.g. ABCD, BCD, CD)
    for (let i = Math.max(0, hoverIndex - 3); i <= hoverIndex - 1; i++) {
      candidates.push(text.substring(i, hoverIndex + 1));
    }
    // Single (e.g. D)
    candidates.push(text.substring(hoverIndex, hoverIndex + 1));

    let bestMatch = null;

    for (const sub of candidates) {
      const foundLine = findLineInDict(sub);
      if (foundLine) {
        const match = foundLine.match(/^(\S+)\s+(\S+)\s+\[(.*?)\]\s+\/(.*)/);
        if (match) {
          bestMatch = {
            trad: match[1],
            simp: match[2],
            pinyin: match[3],
            english: match[4].replace(/\//g, '; ').trim(),
            raw: foundLine
          };
          break; // Found the first match in the required order
        }
      }
    }

    sendResponse({ result: bestMatch });
    return true;
  }
});

function extractLine(idx) {
  let lineStart = rawDict.lastIndexOf('\n', idx);
  if (lineStart === -1) lineStart = 0;
  else lineStart++;

  let lineEnd = rawDict.indexOf('\n', idx);
  if (lineEnd === -1) lineEnd = rawDict.length;

  return rawDict.substring(lineStart, lineEnd).trim();
}

function findLineInDict(sub) {
  if (!rawDict) return null;

  let searchIdx = 0;
  while (true) {
    let idx = rawDict.indexOf(sub, searchIdx);
    if (idx === -1) break;

    let line = extractLine(idx);
    let bracketIdx = line.indexOf('[');
    if (bracketIdx === -1) bracketIdx = line.length;

    // Ensure the match is in the Chinese part (before the pinyin bracket)
    let chinesePart = line.substring(0, bracketIdx);
    if (chinesePart.includes(sub)) {
      return line;
    }

    searchIdx = idx + 1;
  }

  return null;
}
