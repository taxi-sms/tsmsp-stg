(function () {
  const KEY = "tsms_report_field_settings";
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

  function normalizeLabel(value, fallback) {
    const text = String(value == null ? "" : value).trim();
    return text || String(fallback || "").trim();
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
    defaults: cloneDefaults(),
    load,
    save,
    normalize,
    runtime
  };
})();
