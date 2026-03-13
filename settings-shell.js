(function(){
  const menu = document.getElementById("tsmsMenu");
  const bg = document.getElementById("tsmsMenuBg");
  const burger = document.getElementById("tsmsHamburger");

  function openMenu(){
    if(menu) menu.classList.add("open");
    if(bg) bg.classList.add("show");
  }

  function closeMenu(){
    if(menu) menu.classList.remove("open");
    if(bg) bg.classList.remove("show");
  }

  if(menu && bg && burger){
    burger.addEventListener("click", openMenu);
    burger.addEventListener("keydown", (e) => {
      if(e.key === "Enter" || e.key === " ") openMenu();
    });
    bg.addEventListener("click", closeMenu);
    menu.querySelectorAll("a").forEach((a) => a.addEventListener("click", closeMenu));
  }

  const iconMap = {
    report: '<svg viewBox="0 0 24 24"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>',
    confirm: '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="m8 12 3 3 5-6"/></svg>',
    detail: '<svg viewBox="0 0 24 24"><path d="M4 19h16"/><rect x="6" y="10" width="3" height="6"/><rect x="11" y="7" width="3" height="9"/><rect x="16" y="5" width="3" height="11"/></svg>',
    ops: '<svg viewBox="0 0 24 24"><rect x="3" y="8" width="18" height="8" rx="2"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/><path d="M6 8l2-3h8l2 3"/></svg>',
    more: '<svg viewBox="0 0 24 24"><circle cx="6" cy="7" r="1.5"/><circle cx="6" cy="12" r="1.5"/><circle cx="6" cy="17" r="1.5"/><path d="M10 7h10M10 12h10M10 17h10"/></svg>'
  };

  document.querySelectorAll(".tsms-bottom-nav [data-tab]").forEach((a) => {
    const key = a.getAttribute("data-tab");
    const ico = a.querySelector(".ico");
    if(ico && iconMap[key]) ico.innerHTML = iconMap[key];
  });

  const moreIco = document.querySelector("#tsmsMoreBtn .ico");
  if(moreIco) moreIco.innerHTML = iconMap.more;

  const moreBtn = document.getElementById("tsmsMoreBtn");
  const moreBg = document.getElementById("tsmsMoreBg");
  const moreSheet = document.getElementById("tsmsMoreSheet");

  function closeMore(){
    if(moreSheet) moreSheet.classList.remove("show");
    if(moreBg) moreBg.classList.remove("show");
  }

  if(moreBtn && moreBg && moreSheet){
    moreBtn.addEventListener("click", () => {
      moreSheet.classList.add("show");
      moreBg.classList.add("show");
    });
    moreBg.addEventListener("click", closeMore);
  }
})();
