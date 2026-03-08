(function () {
  const KEY = "tsms_report_field_settings";

  const DEFAULTS = Object.freeze({
    ridePrimary: ["無線", "付待", "流し", "乗場", "連続", "予約", "GO"],
    rideOther: ["追加1", "追加2", "追加3", "追加4", "追加5", "追加6", "追加7", "追加8"],
    payPrimary: ["現金", "QR", "クレカ", "電子M", "GO Pay", "乗込GO Pay"],
    payOther: ["追加1", "追加2", "追加3", "追加4", "追加5", "追加6", "追加7", "追加8"],
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

  function normalize(raw) {
    const base = cloneDefaults();
    const src = raw && typeof raw === "object" ? raw : {};
    return {
      ridePrimary: normalizeList(src.ridePrimary, base.ridePrimary),
      rideOther: normalizeList(src.rideOther, base.rideOther),
      payPrimary: normalizeList(src.payPrimary, base.payPrimary),
      payOther: normalizeList(src.payOther, base.payOther),
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
      payOptions: normalized.payPrimary.concat(["その他"]),
      payOther: normalized.payOther.slice(),
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
