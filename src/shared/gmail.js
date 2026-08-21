(() => {
  const MESSAGE_ROOT_SELECTORS = [
    "[data-legacy-message-id]",
    "[data-message-id]",
    ".adn",
  ];

  function isGmailWebPage(locationLike = globalThis.location) {
    const hostname = String(locationLike?.hostname || "").toLowerCase();
    return hostname === "mail.google.com" || hostname.endsWith(".mail.google.com");
  }

  function parseGmailDateValue(value) {
    const raw = String(value || "").replace(/\u00a0/g, " ").trim();
    if (!raw || raw.length > 220) return null;

    const chinese = raw.match(/(20\d{2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日(?:\s*(上午|下午)?\s*([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?)?/);
    if (chinese) {
      let hour = Number(chinese[5] || 0);
      const minute = Number(chinese[6] || 0);
      const second = Number(chinese[7] || 0);
      if (chinese[4] === "下午" && hour < 12) hour += 12;
      if (chinese[4] === "上午" && hour === 12) hour = 0;
      // Gmail renders this localized header in the viewer's local time zone.
      const date = new Date(Number(chinese[1]), Number(chinese[2]) - 1, Number(chinese[3]), hour, minute, second);
      if (Number.isFinite(date.getTime())) return date;
    }

    const normalized = raw
      .replace(/[，、]/g, ",")
      .replace(/年/g, "/")
      .replace(/月/g, "/")
      .replace(/日/g, "")
      .replace(/上午/g, "AM")
      .replace(/下午/g, "PM");
    const direct = new Date(normalized);
    return Number.isFinite(direct.getTime()) ? direct : null;
  }

  function asElement(node) {
    if (!node) return null;
    if (node.nodeType === 1) return node;
    return node.parentElement || null;
  }

  function findMessageRoot(node) {
    const element = asElement(node);
    if (!element) return null;
    for (const selector of MESSAGE_ROOT_SELECTORS) {
      const root = element.closest?.(selector);
      if (root) return root;
    }
    return null;
  }

  function addDateCandidate(candidates, element, attribute) {
    if (!element) return;
    const value = attribute ? element.getAttribute?.(attribute) : element.textContent;
    const parsed = parseGmailDateValue(value);
    if (parsed) candidates.push({ element, date: parsed });
  }

  function findGmailTimestamp(root) {
    if (!root?.querySelectorAll) return null;
    const candidates = [];
    const addAll = (selector, attribute) => {
      for (const element of root.querySelectorAll(selector)) addDateCandidate(candidates, element, attribute);
    };

    // Gmail's expanded message header uses a full date in the g3 title.
    addAll(".g3[title]", "title");
    addAll("time[datetime]", "datetime");
    addAll(".g3", null);
    addAll("[data-tooltip][title]", "title");

    // Keep this broad fallback last so dates in the message body do not win.
    if (!candidates.length) addAll("[title]", "title");
    if (!candidates.length) return null;

    return candidates[0].date;
  }

  function extractMessageContext(node, locationLike = globalThis.location) {
    if (!isGmailWebPage(locationLike)) return null;
    const root = findMessageRoot(node);
    const reference = findGmailTimestamp(root);
    if (!reference) return null;

    const messageId = root?.getAttribute?.("data-legacy-message-id") || root?.getAttribute?.("data-message-id") || "";
    return {
      kind: "gmail_message",
      referenceInstant: reference.toISOString(),
      messageId: String(messageId),
      source: "gmail_message_header",
    };
  }

  globalThis.TimeTranslatorGmail = {
    isGmailWebPage,
    parseGmailDateValue,
    extractMessageContext,
  };
})();
