let isActive = true;
let popup = null;
let hoverTimer = null;

chrome.storage.local.get(["isActive"], result => {
  isActive = result.isActive !== undefined ? result.isActive : true;
});

chrome.storage.onChanged.addListener(changes => {
  if (changes.isActive) {
    isActive = changes.isActive.newValue;
    if (!isActive && popup) {
      popup.remove();
      popup = null;
    }
  }
});

function isChinese(char) {
  return /[\u4e00-\u9fa5]/.test(char);
}

function getTextContentAroundCaret(node, offset) {
  // We need to find 3 chars before and 3 chars after, considering text nodes.
  let textBefore = "";
  let textAfter = "";
  let hoveredChar = "";

  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent;
    if (offset < text.length) {
      hoveredChar = text[offset];
    } else {
      return null;
    }

    // Get before
    let currentOffset = offset - 1;
    let currentNode = node;
    while (textBefore.length < 3 && currentNode) {
      if (currentNode.nodeType === Node.TEXT_NODE) {
        let str = currentNode.textContent;
        if (currentNode === node) {
          str = str.substring(0, offset);
        }
        textBefore =
          str.substring(Math.max(0, str.length - (3 - textBefore.length))) +
          textBefore;
      }
      if (textBefore.length < 3) {
        currentNode = getPreviousTextNode(currentNode);
      }
    }

    // Get after
    currentOffset = offset + 1;
    currentNode = node;
    while (textAfter.length < 3 && currentNode) {
      if (currentNode.nodeType === Node.TEXT_NODE) {
        let str = currentNode.textContent;
        if (currentNode === node) {
          str = str.substring(offset + 1);
        }
        textAfter = textAfter + str.substring(0, 3 - textAfter.length);
      }
      if (textAfter.length < 3) {
        currentNode = getNextTextNode(currentNode);
      }
    }
  } else {
    return null;
  }

  return {
    text: textBefore + hoveredChar + textAfter,
    hoverIndex: textBefore.length,
  };
}

function getPreviousTextNode(node) {
  let walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    null,
    false,
  );
  walker.currentNode = node;
  return walker.previousNode();
}

function getNextTextNode(node) {
  let walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    null,
    false,
  );
  walker.currentNode = node;
  return walker.nextNode();
}

document.addEventListener("mousemove", e => {
  if (!isActive) return;

  clearTimeout(hoverTimer);

  if (popup && !(e.shiftKey || e.ctrlKey)) {
    popup.classList.remove("visible");
  }

  hoverTimer = setTimeout(() => {
    let range, textNode, offset;

    // Firefox
    if (document.caretPositionFromPoint) {
      const position = document.caretPositionFromPoint(e.clientX, e.clientY);
      if (position) {
        textNode = position.offsetNode;
        offset = position.offset;
      }
    } else if (document.caretRangeFromPoint) {
      range = document.caretRangeFromPoint(e.clientX, e.clientY);
      if (range) {
        textNode = range.startContainer;
        offset = range.startOffset;
      }
    }

    if (textNode && textNode.nodeType === Node.TEXT_NODE) {
      const char = textNode.textContent[offset];
      if (char && isChinese(char)) {
        const context = getTextContentAroundCaret(textNode, offset);
        if (context) {
          chrome.runtime.sendMessage(
            {
              action: "translate",
              text: context.text,
              hoverIndex: context.hoverIndex,
              shiftKey: e.shiftKey,
              ctrlKey: e.ctrlKey,
              altKey: e.altKey || e.metaKey,
            },
            resp => {
              if (resp?.result) {
                showPopup(resp);
              }
            },
          );
        }
      }
    }
  }, 100); // Debounce
});

function showPopup({ result, shiftKey, ctrlKey, altKey }) {
  if (!popup) createPopup();

  const sound = popup.querySelector(".pinyin-sound");
  const word = popup.querySelector(".pinyin-word");
  const explain = popup.querySelector(".pinyin-explain");

  sound.textContent = result.pinyin;
  sound.dataset.value = result.pinyin;

  word.textContent = result.simp;
  word.dataset.value = result.simp;

  let eng = result.english?.trim();
  if (eng.endsWith(";")) eng = eng.slice(0, -1);
  explain.textContent = eng;
  explain.dataset.value = eng;

  popup.classList.add("visible");
  popup.classList[shiftKey ? "add" : "remove"]("shiftkey");
  popup.classList[ctrlKey ? "add" : "remove"]("ctrlkey");
  popup.classList[altKey ? "add" : "remove"]("altkey");
}

function createPopup() {
  popup = document.createElement("div");
  popup.className = "pinyin-extension-popup";
  popup.lang = "en";

  popup.appendChild(document.createElement("div")).className = "pinyin-sound";
  popup.appendChild(document.createElement("div")).className = "pinyin-word";
  popup.appendChild(document.createElement("div")).className = "pinyin-explain";

  document.body.appendChild(popup);
}
