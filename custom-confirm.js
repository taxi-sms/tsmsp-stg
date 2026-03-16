(function(){
  if (window.tsmsConfirm && window.tsmsAlert) return;

  var queue = Promise.resolve();

  function ensureModal(){
    if (document.getElementById("tsmsConfirmOverlay")) return;

    var overlay = document.createElement("div");
    overlay.id = "tsmsConfirmOverlay";
    overlay.className = "tsms-confirm-overlay";
    overlay.setAttribute("aria-hidden", "true");
    overlay.innerHTML = '' +
      '<div class="tsms-confirm-card" id="tsmsConfirmCard" role="dialog" aria-modal="true" aria-labelledby="tsmsConfirmTitle">' +
      '  <p class="tsms-confirm-title" id="tsmsConfirmTitle"></p>' +
      '  <div class="tsms-confirm-actions" id="tsmsConfirmActions">' +
      '    <button class="btn" type="button" id="tsmsConfirmNoBtn">いいえ</button>' +
      '    <button class="btn next" type="button" id="tsmsConfirmYesBtn">はい</button>' +
      '  </div>' +
      '</div>';
    (document.body || document.documentElement).appendChild(overlay);
  }

  function focusIfPossible(node){
    if (!node || typeof node.focus !== "function") return;
    try {
      node.focus();
    } catch (_) {}
  }

  function showDialog(options){
    ensureModal();

    var overlay = document.getElementById("tsmsConfirmOverlay");
    var card = document.getElementById("tsmsConfirmCard");
    var title = document.getElementById("tsmsConfirmTitle");
    var noBtn = document.getElementById("tsmsConfirmNoBtn");
    var yesBtn = document.getElementById("tsmsConfirmYesBtn");
    var mode = options && options.mode === "alert" ? "alert" : "confirm";
    var activeElement = document.activeElement;

    title.textContent = String(
      (options && options.message) ||
      (mode === "alert" ? "お知らせ" : "この操作を実行しますか？")
    );
    card.dataset.mode = mode;
    noBtn.hidden = mode === "alert";
    noBtn.textContent = String((options && options.cancelText) || "いいえ");
    yesBtn.textContent = String((options && options.okText) || (mode === "alert" ? "閉じる" : "はい"));

    return new Promise(function(resolve){
      var closed = false;

      function cleanup(result){
        if (closed) return;
        closed = true;
        overlay.classList.remove("show");
        overlay.setAttribute("aria-hidden", "true");
        overlay.removeEventListener("click", onOverlayClick);
        noBtn.removeEventListener("click", onNo);
        yesBtn.removeEventListener("click", onYes);
        document.removeEventListener("keydown", onKeyDown);
        focusIfPossible(activeElement);
        resolve(result);
      }

      function onOverlayClick(e){
        if (e.target !== overlay) return;
        cleanup(mode === "confirm" ? false : undefined);
      }
      function onNo(){ cleanup(false); }
      function onYes(){ cleanup(mode === "confirm" ? true : undefined); }
      function onKeyDown(e){
        if (e.key !== "Escape") return;
        cleanup(mode === "confirm" ? false : undefined);
      }

      overlay.addEventListener("click", onOverlayClick);
      noBtn.addEventListener("click", onNo);
      yesBtn.addEventListener("click", onYes);
      document.addEventListener("keydown", onKeyDown);

      overlay.classList.add("show");
      overlay.setAttribute("aria-hidden", "false");
      focusIfPossible(mode === "alert" ? yesBtn : noBtn);
    });
  }

  function enqueue(factory){
    var next = queue.then(factory, factory);
    queue = next.then(function(){}, function(){});
    return next;
  }

  window.tsmsAlert = function(message, options){
    return enqueue(function(){
      var dialogOptions = (options && typeof options === "object") ? options : {};
      dialogOptions.mode = "alert";
      dialogOptions.message = message;
      return showDialog(dialogOptions);
    });
  };

  window.tsmsConfirm = function(message, options){
    return enqueue(function(){
      var dialogOptions = (options && typeof options === "object") ? options : {};
      dialogOptions.mode = "confirm";
      dialogOptions.message = message;
      return showDialog(dialogOptions);
    });
  };
})();
