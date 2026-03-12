(function () {
  const KEY = "tsms_report_field_settings";
  const LABEL_MAX_LENGTH = 8;
  const LABEL_LONG_THRESHOLD = 6;
  const LABEL_XLONG_THRESHOLD = 8;
  const FIXED_PAY_OPTIONS = Object.freeze(["チケット他", "その他"]);
  const DEFAULT_PAY_OTHER_FLAGS = Object.freeze([
    { cash: false, credit: true },
    { cash: false, credit: true },
    { cash: false, credit: true },
    { cash: false, credit: true },
    { cash: false, credit: true },
    { cash: false, credit: true },
    { cash: false, credit: true },
    { cash: false, credit: true }
  ]);

  const DEFAULTS = Object.freeze({
    ridePrimary: ["無線", "付待", "流し", "乗場", "連続", "予約", "GO"],
    rideOther: ["追加1", "追加2", "追加3", "追加4", "追加5", "追加6", "追加7", "追加8"],
    payPrimary: ["現金", "QR", "クレカ", "電子M", "GO Pay", "乗込GO Pay"],
    payPrimaryFlags: [
      { cash: true, credit: false },
      { cash: false, credit: true },
      { cash: false, credit: true },
      { cash: false, credit: true },
      { cash: false, credit: true },
      { cash: false, credit: true }
    ],
    payOther: ["追加1", "追加2", "追加3", "追加4", "追加5", "追加6", "追加7", "追加8"],
    payOtherFlags: DEFAULT_PAY_OTHER_FLAGS,
    ticketSub: ["Aチケット", "自社チケット", "臨時チケット", "JCBチケット", "福祉チケット", "社内扱い", "その他", "GOチケット"]
  });

  function cloneDefaults() {
    return JSON.parse(JSON.stringify(DEFAULTS));
  }

  function clipLabel(value) {
    return Array.from(String(value == null ? "" : value).trim()).slice(0, LABEL_MAX_LENGTH).join("");
  }

  function countDenseChars(value) {
    return Array.from(String(value == null ? "" : value).replace(/\s+/g, "").trim()).length;
  }

  function normalizeLabel(value, fallback) {
    const text = clipLabel(value);
    return text || clipLabel(fallback || "");
  }

  function getLabelSizeClass(value) {
    const denseLength = countDenseChars(value);
    if (denseLength >= LABEL_XLONG_THRESHOLD) return "is-label-xlong";
    if (denseLength >= LABEL_LONG_THRESHOLD) return "is-label-long";
    return "";
  }

  function getLabelDisplayMeta(value, fallback) {
    const text = normalizeLabel(value, fallback);
    return {
      text,
      sizeClass: getLabelSizeClass(text)
    };
  }

  function normalizeList(input, fallbackList) {
    const source = Array.isArray(input) ? input : [];
    return fallbackList.map((fallback, index) => normalizeLabel(source[index], fallback));
  }

  function normalizeFlag(input, fallback) {
    const src = input && typeof input === "object" ? input : {};
    let cash = typeof src.cash === "boolean" ? src.cash : !!(fallback && fallback.cash);
    let credit = typeof src.credit === "boolean" ? src.credit : !!(fallback && fallback.credit);
    if (!cash && !credit) {
      cash = !!(fallback && fallback.cash);
      credit = !!(fallback && fallback.credit);
      if (!cash && !credit) credit = true;
    }
    return { cash, credit };
  }

  function normalizeFlagList(input, fallbackList) {
    const source = Array.isArray(input) ? input : [];
    return fallbackList.map((fallback, index) => normalizeFlag(source[index], fallback));
  }

  function normalize(raw) {
    const base = cloneDefaults();
    const src = raw && typeof raw === "object" ? raw : {};
    return {
      ridePrimary: normalizeList(src.ridePrimary, base.ridePrimary),
      rideOther: normalizeList(src.rideOther, base.rideOther),
      payPrimary: normalizeList(src.payPrimary, base.payPrimary),
      payPrimaryFlags: normalizeFlagList(src.payPrimaryFlags, base.payPrimaryFlags),
      payOther: normalizeList(src.payOther, base.payOther),
      payOtherFlags: normalizeFlagList(src.payOtherFlags, base.payOtherFlags),
      ticketSub: normalizeList(src.ticketSub, base.ticketSub)
    };
  }

  function load() {
    try {
      return normalize(JSON.parse(localStorage.getItem(KEY) || "null"));
    } catch (_) {
      return normalize(null);
    }
  }

  function save(nextValue) {
    const normalized = normalize(nextValue);
    localStorage.setItem(KEY, JSON.stringify(normalized));
    return normalized;
  }

  function runtime(input) {
    const normalized = normalize(input || load());
    return {
      ridePrimary: normalized.ridePrimary.slice(),
      rideOptions: normalized.ridePrimary.concat(["その他"]),
      rideOther: normalized.rideOther.slice(),
      payPrimary: normalized.payPrimary.slice(),
      payPrimaryFlags: normalized.payPrimaryFlags.map((flag) => ({ cash: !!flag.cash, credit: !!flag.credit })),
      payOptions: normalized.payPrimary.concat(FIXED_PAY_OPTIONS),
      payOther: normalized.payOther.slice(),
      payOtherFlags: normalized.payOtherFlags.map((flag) => ({ cash: !!flag.cash, credit: !!flag.credit })),
      ticketSub: normalized.ticketSub.slice()
    };
  }

  window.tsmsReportFieldSettings = {
    KEY,
    LABEL_MAX_LENGTH,
    defaults: cloneDefaults(),
    load,
    save,
    normalize,
    runtime,
    normalizeLabel,
    getLabelDisplayMeta
  };
})();
