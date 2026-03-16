(async function(){
  const showAlert = (message) => window.tsmsAlert ? window.tsmsAlert(message) : (alert(String(message || "")), Promise.resolve());
  const api = window.tsmsReportFieldSettings;
  if(!api){
    await showAlert("入力項目設定の読み込みに失敗しました。");
    return;
  }

  const root = document.body || document.documentElement;
  const saveRedirect = (root && root.dataset && root.dataset.saveRedirect) || "settings-home.html";

  const rideTypeButtons = document.getElementById("rideTypeButtons");
  const secRideTypeOther = document.getElementById("sec_rideTypeOther");
  const rideTypeOtherButtons = document.getElementById("rideTypeOtherButtons");
  const payMethodButtons = document.getElementById("payMethodButtons");
  const secPayMethodOther = document.getElementById("sec_payMethodOther");
  const payMethodOtherButtons = document.getElementById("payMethodOtherButtons");
  const secTicketSub = document.getElementById("sec_ticketSub");
  const ticketSubButtons = document.getElementById("ticketSubButtons");
  const saveBtn = document.getElementById("btnSaveAndBack");
  const saveStatus = document.getElementById("saveStatus");

  const modalBg = document.getElementById("fieldEditorModalBg");
  const modalTitle = document.getElementById("fieldEditorModalTitle");
  const modalTargetLabel = document.getElementById("fieldEditorTargetLabel");
  const modalNameInput = document.getElementById("fieldEditorNameInput");
  const modalHelp = document.getElementById("fieldEditorHelp");
  const modalFlagSection = document.getElementById("fieldEditorFlagSection");
  const modalCashFlag = document.getElementById("fieldEditorCashFlag");
  const modalCreditFlag = document.getElementById("fieldEditorCreditFlag");
  const modalCancelBtn = document.getElementById("fieldEditorCancelBtn");
  const modalSaveBtn = document.getElementById("fieldEditorSaveBtn");

  const SECTION_META = {
    rideType: { title: "乗車種別", sourceKey: "ridePrimary", valuesKey: "rideOptions", editableCount: 7 },
    rideTypeOther: { title: "乗車種別 その他", sourceKey: "rideOther", valuesKey: "rideOther", editableCount: 8 },
    payMethod: { title: "支払方法", sourceKey: "payPrimary", valuesKey: "payOptions", editableCount: 6, flagsKey: "payPrimaryFlags" },
    payMethodOther: { title: "支払方法 その他", sourceKey: "payOther", valuesKey: "payOther", editableCount: 8, flagsKey: "payOtherFlags" },
    ticketSub: { title: "チケット他", sourceKey: "ticketSub", valuesKey: "ticketSub", editableCount: 8 }
  };

  const draft = api.load();
  const selected = {
    rideType: null,
    rideTypeOther: null,
    payMethod: null,
    payMethodOther: null,
    ticketSub: null
  };
  let runtimeConfig = api.runtime(draft);
  let activeEdit = null;

  if(modalNameInput && api && api.LABEL_MAX_LENGTH){
    modalNameInput.maxLength = Number(api.LABEL_MAX_LENGTH) || 8;
  }

  function cloneFlags(flag){
    return {
      cash: !!(flag && flag.cash),
      credit: !!(flag && flag.credit)
    };
  }

  function getEditableSpec(group, index){
    const meta = SECTION_META[group];
    if(!meta) return null;
    return {
      title: meta.title,
      label: String(draft[meta.sourceKey][index] || ""),
      sourceKey: meta.sourceKey,
      flagsKey: meta.flagsKey || "",
      index
    };
  }

  function renderButtonRow(container, group){
    if(!container) return;
    const meta = SECTION_META[group];
    const values = runtimeConfig[meta.valuesKey];
    container.innerHTML = "";
    values.forEach((value, index) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn";
      if(selected[group] === index) btn.classList.add("is-selected");
      btn.dataset.editGroup = group;
      btn.dataset.editIndex = String(index);
      const labelMeta = api && typeof api.getLabelDisplayMeta === "function"
        ? api.getLabelDisplayMeta(value, value)
        : { text: String(value || ""), sizeClass: "" };
      if(labelMeta.sizeClass) btn.classList.add(labelMeta.sizeClass);
      const label = document.createElement("span");
      label.className = "btn-label";
      label.textContent = labelMeta.text;
      btn.appendChild(label);
      container.appendChild(btn);
    });
  }

  function isBranchToggle(group, index){
    return (group === "rideType" && index === 7) || (group === "payMethod" && (index === 6 || index === 7));
  }

  function renderPreview(){
    runtimeConfig = api.runtime(draft);
    renderButtonRow(rideTypeButtons, "rideType");
    renderButtonRow(rideTypeOtherButtons, "rideTypeOther");
    renderButtonRow(payMethodButtons, "payMethod");
    renderButtonRow(payMethodOtherButtons, "payMethodOther");
    renderButtonRow(ticketSubButtons, "ticketSub");
    secRideTypeOther.classList.toggle("is-hidden", selected.rideType !== 7);
    secPayMethodOther.classList.toggle("is-hidden", selected.payMethod !== 7);
    secTicketSub.classList.toggle("is-hidden", selected.payMethod !== 6);
  }

  function markUnsaved(){
    if(saveStatus){
      saveStatus.dataset.stateTone = "warning";
      saveStatus.textContent = "画面上の変更は未保存です。内容を確認してから保存してください。";
    }
  }

  function openModal(spec){
    if(!spec || !modalBg) return;
    activeEdit = spec;
    modalTitle.textContent = `${spec.title} の設定`;
    modalTargetLabel.textContent = `${spec.title} ボタン名`;
    modalNameInput.value = spec.label || "";
    modalNameInput.disabled = false;
    modalHelp.textContent = `変更して保存すると、日報入力画面に反映されます。ボタン名は最大${api.LABEL_MAX_LENGTH || 8}文字です。`;

    const showFlags = !!spec.flagsKey;
    modalFlagSection.classList.toggle("is-hidden", !showFlags);
    if(showFlags){
      const currentFlags = cloneFlags((draft[spec.flagsKey] || [])[spec.index] || { cash:false, credit:true });
      modalCashFlag.checked = !!currentFlags.cash;
      modalCreditFlag.checked = !!currentFlags.credit;
    }else{
      modalCashFlag.checked = false;
      modalCreditFlag.checked = true;
    }

    modalBg.classList.add("show");
    modalBg.setAttribute("aria-hidden", "false");
    modalSaveBtn.hidden = false;
    modalNameInput.focus();
  }

  function closeModal(){
    activeEdit = null;
    if(!modalBg) return;
    modalBg.classList.remove("show");
    modalBg.setAttribute("aria-hidden", "true");
  }

  function ensureAtLeastOneFlag(changedKey){
    if(modalCashFlag.checked || modalCreditFlag.checked) return;
    if(changedKey === "cash") modalCreditFlag.checked = true;
    else modalCashFlag.checked = true;
  }

  async function saveModalChanges(){
    if(!activeEdit) return;
    const nextName = String(modalNameInput.value || "").trim();
    if(!nextName){
      await showAlert("ボタン名を入力してください。");
      modalNameInput.focus();
      return;
    }

    draft[activeEdit.sourceKey][activeEdit.index] = nextName;
    if(activeEdit.flagsKey){
      if(!Array.isArray(draft[activeEdit.flagsKey])) draft[activeEdit.flagsKey] = [];
      draft[activeEdit.flagsKey][activeEdit.index] = {
        cash: !!modalCashFlag.checked,
        credit: !!modalCreditFlag.checked
      };
    }

    renderPreview();
    markUnsaved();
    closeModal();
  }

  async function saveAndExit(){
    if(!saveBtn) return;
    saveBtn.disabled = true;
    saveBtn.textContent = "保存中...";
    if(saveStatus){
      saveStatus.dataset.stateTone = "info";
      saveStatus.textContent = "ローカル保存とクラウド反映を実行しています。";
    }
    try{
      api.save(draft);
      if(!(window.tsmsCloud && typeof window.tsmsCloud.backupNow === "function")){
        throw new Error("cloud_unavailable");
      }
      await window.tsmsCloud.backupNow();
      location.href = saveRedirect;
    }catch(err){
      const reason = err && err.message ? err.message : "unknown_error";
      if(saveStatus){
        saveStatus.dataset.stateTone = "error";
        saveStatus.textContent = `ローカル保存は完了しましたが、クラウド反映に失敗しました。(${reason})`;
      }
      await showAlert("保存はローカルへ反映しましたが、クラウド反映に失敗しました。ネットワークやログイン状態を確認して再度お試しください。");
      saveBtn.disabled = false;
      saveBtn.textContent = "変更を保存して設定に戻る";
    }
  }

  document.addEventListener("click", (e) => {
    const editBtn = e.target.closest("button[data-edit-group]");
    if(editBtn){
      const group = String(editBtn.dataset.editGroup || "");
      const index = Number(editBtn.dataset.editIndex || -1);
      if(group && Number.isInteger(index) && index >= 0){
        selected[group] = index;
        if(group === "rideType" && index !== 7) selected.rideTypeOther = null;
        if(group === "payMethod"){
          if(index !== 6) selected.ticketSub = null;
          if(index !== 7) selected.payMethodOther = null;
        }
        renderPreview();
        if(!isBranchToggle(group, index)) openModal(getEditableSpec(group, index));
      }
      return;
    }

    if(e.target === modalBg) closeModal();
  });

  modalCashFlag.addEventListener("change", () => ensureAtLeastOneFlag("cash"));
  modalCreditFlag.addEventListener("change", () => ensureAtLeastOneFlag("credit"));
  modalCancelBtn.addEventListener("click", closeModal);
  modalSaveBtn.addEventListener("click", saveModalChanges);
  if(saveBtn) saveBtn.addEventListener("click", saveAndExit);
  document.addEventListener("keydown", (e) => {
    if(e.key === "Escape" && modalBg.classList.contains("show")) closeModal();
  });

  renderPreview();
})();
