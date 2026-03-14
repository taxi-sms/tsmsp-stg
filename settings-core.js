(function(){
  const SETTINGS_KEY = "tsms_settings";
  const defaults = {
    taxRate: 10,
    feeRate: 4,
    goFeeYen: 100,
    walkRate: 50,
    closeStartDay: 16,
    closeEndDay: 15,
    shiftNote: ""
  };
  const SAFE_RESTORE_SKIP_KEYS = [
    "tsms_reports",
    "ops",
    "tsms_report_current_day",
    "tsms_confirm_force_empty",
    "ops_sync_rev_v1"
  ];

  const BACKUP_KEYS = [
    "tsms_reports",
    "tsms_reports_archive",
    "ops",
    "ops_archive_v1",
    "tsms_settings",
    "tsms_sales_plan",
    "tsms_sales_manual_v1",
    "tsms_sales_manual_mode",
    "tsms_sales_reset_token",
    "tsms_report_current_day",
    "tsms_report_field_settings",
    "tsms_confirm_force_empty",
    "tsms_holidays_jp_v1",
    "tsms_theme",
    "tsms_storage_schema_version",
    "ops_sync_rev_v1",
    "tsms_cloud_last_success_at",
    "tsms_cloud_last_failure_at",
    "tsms_supabase_config"
  ];

  function loadJson(key, fallback){
    try{
      const value = JSON.parse(localStorage.getItem(key) || "null");
      return value == null ? fallback : value;
    }catch(_){
      return fallback;
    }
  }

  function saveJson(key, value){
    localStorage.setItem(key, JSON.stringify(value));
  }

  function clamp(value, min, max){
    return Math.min(max, Math.max(min, value));
  }

  function applyTheme(mode){
    const theme = mode === "dark" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", theme);
    const meta = document.querySelector('meta[name="theme-color"]');
    if(meta) meta.setAttribute("content", theme === "dark" ? "#0F1417" : "#F3F6F8");
    localStorage.setItem("tsms_theme", theme);
    return theme;
  }

  function loadSettings(){
    return Object.assign({}, defaults, loadJson(SETTINGS_KEY, {}));
  }

  function saveSettings(next){
    const value = Object.assign({}, defaults, next || {});
    saveJson(SETTINGS_KEY, value);
    return value;
  }

  function readNumber(el, fallback){
    const raw = (((el && el.value) || "") + "").trim();
    const num = Number(raw);
    return Number.isFinite(num) ? num : fallback;
  }

  function fillCalcFields(els, settings){
    const value = Object.assign({}, defaults, settings || {});
    const themeMode = localStorage.getItem("tsms_theme") || "light";
    if(els.themeMode) els.themeMode.value = themeMode;
    if(els.taxRate) els.taxRate.value = String(value.taxRate ?? defaults.taxRate);
    if(els.feeRate) els.feeRate.value = String(value.feeRate ?? defaults.feeRate);
    if(els.goFeeYen) els.goFeeYen.value = String(value.goFeeYen ?? defaults.goFeeYen);
    if(els.walkRate) els.walkRate.value = String(value.walkRate ?? defaults.walkRate);
  }

  function fillPeriodFields(els, settings){
    const value = Object.assign({}, defaults, settings || {});
    if(els.closeStartDay) els.closeStartDay.value = String(value.closeStartDay ?? defaults.closeStartDay);
    if(els.closeEndDay) els.closeEndDay.value = String(value.closeEndDay ?? defaults.closeEndDay);
    if(els.shiftNote) els.shiftNote.value = String(value.shiftNote ?? defaults.shiftNote);
  }

  function readCalcFields(els){
    return {
      taxRate: clamp(readNumber(els.taxRate, defaults.taxRate), 0, 100),
      feeRate: clamp(readNumber(els.feeRate, defaults.feeRate), 0, 100),
      goFeeYen: Math.max(0, Math.round(readNumber(els.goFeeYen, defaults.goFeeYen))),
      walkRate: clamp(readNumber(els.walkRate, defaults.walkRate), 0, 100)
    };
  }

  function readPeriodFields(els){
    return {
      closeStartDay: clamp(Math.round(readNumber(els.closeStartDay, defaults.closeStartDay)), 1, 31),
      closeEndDay: clamp(Math.round(readNumber(els.closeEndDay, defaults.closeEndDay)), 1, 31),
      shiftNote: ((((els.shiftNote && els.shiftNote.value) || "") + "").trim())
    };
  }

  function persistCalcSettings(els){
    const current = loadSettings();
    const next = Object.assign({}, current, readCalcFields(els));
    saveSettings(next);
    fillCalcFields(els, next);
    applyTheme((els.themeMode && els.themeMode.value) || (localStorage.getItem("tsms_theme") || "light"));
    return next;
  }

  function persistPeriodSettings(els){
    const current = loadSettings();
    const next = Object.assign({}, current, readPeriodFields(els));
    saveSettings(next);
    fillPeriodFields(els, next);
    return next;
  }

  function resetPeriodSettings(els){
    const current = loadSettings();
    const next = Object.assign({}, current, {
      closeStartDay: defaults.closeStartDay,
      closeEndDay: defaults.closeEndDay,
      shiftNote: defaults.shiftNote
    });
    saveSettings(next);
    fillPeriodFields(els, next);
    return next;
  }

  function buildBackupPayload(){
    const data = {};
    BACKUP_KEYS.forEach((key) => {
      const raw = localStorage.getItem(key);
      if(raw !== null) data[key] = raw;
    });
    return {
      schema: "tsms-backup-v1",
      exportedAt: new Date().toISOString(),
      data
    };
  }

  function exportBackup(){
    const payload = buildBackupPayload();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    const now = new Date();
    const stamp = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
    link.href = URL.createObjectURL(blob);
    link.download = `tsms-backup-${stamp}.json`;
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      URL.revokeObjectURL(link.href);
      link.remove();
    }, 0);
  }

  function restoreBackupObject(payload){
    if(!payload || typeof payload !== "object") throw new Error("バックアップファイルの形式が不正です");
    if(payload.schema !== "tsms-backup-v1") throw new Error("対応していないバックアップ形式です");
    if(!payload.data || typeof payload.data !== "object") throw new Error("バックアップデータが見つかりません");

    BACKUP_KEYS.forEach((key) => {
      if(SAFE_RESTORE_SKIP_KEYS.includes(key)) return;
      if(Object.prototype.hasOwnProperty.call(payload.data, key)){
        localStorage.setItem(key, String(payload.data[key]));
      }
    });

    const theme = localStorage.getItem("tsms_theme") || "light";
    applyTheme(theme);
    return loadSettings();
  }

  window.tsmsSettingsCore = {
    defaults,
    BACKUP_KEYS,
    SAFE_RESTORE_SKIP_KEYS,
    applyTheme,
    loadSettings,
    saveSettings,
    fillCalcFields,
    fillPeriodFields,
    persistCalcSettings,
    persistPeriodSettings,
    resetPeriodSettings,
    buildBackupPayload,
    exportBackup,
    restoreBackupObject
  };
})();
