let isActive = true;
let rawDict = "";

fetch(chrome.runtime.getURL("cedict_ts.u8"))
  .then(response => response.text())
  .then(text => {
    rawDict = text;
  })
  .catch(err => console.error("Failed to load dictionary:", err));

chrome.storage.local.get(["isActive"], result => {
  isActive = result.isActive !== undefined ? result.isActive : true;
  updateIcon();
});

chrome.action.onClicked.addListener(tab => {
  isActive = !isActive;
  chrome.storage.local.set({ isActive });
  updateIcon();
});

function updateIcon() {
  const text = isActive ? "福" : "";
  chrome.action.setBadgeText({ text });
}

// Handle messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "translate") {
    const { text, hoverIndex, shiftKey, ctrlKey, altKey } = request;
    if (!text || hoverIndex < 0 || hoverIndex >= text.length) {
      sendResponse({ result: null });
      return;
    }

    const { newText, newHoverIndex } = sanitizeInput(text, hoverIndex);
    const candidates = generateCandidates(newText, newHoverIndex);
    const foundLine = findMatchingLine(candidates);
    const bestMatch = foundLine ? parseDictionaryLine(foundLine) : null;

    sendResponse({ result: bestMatch, shiftKey, ctrlKey, altKey });
    return true;
  }
});

function sanitizeInput(text, hoverIndex) {
  let newText = "";
  let newHoverIndex = hoverIndex;
  for (let i = 0; i < text.length; i++) {
    if (text[i].trim() !== "") {
      if (i === hoverIndex) newHoverIndex = newText.length;
      newText += text[i];
    } else if (i < hoverIndex) {
      newHoverIndex--;
    }
  }
  return { newText, newHoverIndex };
}

function generateCandidates(text, hoverIndex) {
  let candidates = [];
  // Assume input was ABCDEFG and hoverIndex points to D
  // Forward (e.g. DEFG, DEF, DE)
  for (
    let i = Math.min(text.length - 1, hoverIndex + 3);
    i >= hoverIndex + 1;
    i--
  ) {
    candidates.push(text.substring(hoverIndex, i + 1));
  }
  // Backward (e.g. ABCD, BCD, CD)
  for (let i = Math.max(0, hoverIndex - 3); i <= hoverIndex - 1; i++) {
    candidates.push(text.substring(i, hoverIndex + 1));
  }
  // Single (e.g. D)
  candidates.push(text.substring(hoverIndex, hoverIndex + 1));
  return candidates;
}

function findMatchingLine(candidates) {
  for (const sub of candidates) {
    let foundLine = findExactMatch(sub);
    if (foundLine) return foundLine;
  }
  for (const sub of candidates) {
    let foundLine = findPartialMatch(sub);
    if (foundLine) return foundLine;
  }
  return null;
}

function parseDictionaryLine(line) {
  // format: {traditional chinese} {simplified chinese} [{pinyin}{tone} {*}] /explanation 1/explanation 2*/
  // example: 備細 备细 [bei4 xi4] /details/particulars/
  const match = line.match(/^(\S+)\s+(\S+)\s+\[([^\]]+)\]\s+\/(.*)\/$/);
  if (match) {
    return {
      trad: match[1],
      simp: match[2],
      pinyin: tonesToDiacritics(match[3]),
      english: match[4],
      raw: line,
    };
  }
  return null;
}

function tonesToDiacritics(pinyin) {
  return pinyin
    .replaceAll("1", String.fromCharCode(0x0304))
    .replaceAll("2", String.fromCharCode(0x0301))
    .replaceAll("3", String.fromCharCode(0x030c))
    .replaceAll("4", String.fromCharCode(0x0300))
    .replaceAll("5", "");
}

function extractLine(idx) {
  let lineStart = rawDict.lastIndexOf("\n", idx);
  if (lineStart === -1) lineStart = 0;
  else lineStart++;

  let lineEnd = rawDict.indexOf("\n", idx);
  if (lineEnd === -1) lineEnd = rawDict.length;

  return rawDict.substring(lineStart, lineEnd).trim();
}

function findExactMatch(sub) {
  if (!rawDict) return null;

  // Traditional chinese match
  let idx = rawDict.indexOf("\n" + sub + " ");
  if (idx !== -1) {
    return extractLine(idx + 1);
  }

  if (rawDict.startsWith(sub + " ")) {
    return extractLine(0);
  }

  // Simplified chinese match
  searchIdx = 0;
  while (true) {
    let idx = rawDict.indexOf(" " + sub + " [", searchIdx);
    if (idx === -1) break;
    let line = extractLine(idx);
    if (line) {
      let chinesePart = line.substring(0, line.indexOf("["));
      if (chinesePart.includes(" " + sub + " ")) {
        return line;
      }
    }
    searchIdx = idx + 1;
  }

  return null;
}

function findPartialMatch(sub) {
  if (!rawDict) return null;

  let searchIdx = 0;
  while (true) {
    let idx = rawDict.indexOf(sub, searchIdx);
    if (idx === -1) break;

    let line = extractLine(idx);
    let bracketIdx = line.indexOf("[");
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
