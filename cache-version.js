(function(){
  function extractCacheName(src){
    var m = src && src.match(/CACHE_NAME\s*=\s*['\"]([^'\"]+)['\"]/);
    return m ? m[1] : '';
  }

  function formatCacheName(name){
    if(!name) return '';
    return name.replace(/^tsms-cache-/, 'cache-');
  }

  function renderCacheName(name){
    var displayName = formatCacheName(name);
    if(!displayName) return;
    var inline = document.getElementById('cacheVersionInline');
    if(inline){
      inline.textContent = displayName;
      return;
    }
    var el = document.createElement('div');
    el.textContent = displayName;
    el.setAttribute('aria-label', 'cache-version');
    var hasBottomNav = !!document.querySelector('.tsms-bottom-nav');
    var bottomGap = hasBottomNav ? '66px' : '8px';
    el.style.cssText = [
      'font-size:10px',
      'line-height:1.2',
      'color:var(--text-muted,#7a7a7a)',
      'text-align:right',
      'margin:8px 10px calc(' + bottomGap + ' + env(safe-area-inset-bottom))',
      'opacity:.85',
      'pointer-events:none',
      'user-select:text'
    ].join(';');
    document.body.appendChild(el);
  }

  async function load(){
    try{
      var res = await fetch('./sw.js?v=' + Date.now(), { cache: 'no-store' });
      if(!res.ok) return;
      var text = await res.text();
      renderCacheName(extractCacheName(text));
    }catch(_e){}
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', load, { once:true });
    return;
  }
  load();
})();
