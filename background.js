// Recebe pedido do SENTINELA-7, abre aba do Facebook, lê, devolve

const NETWORKS = {
  facebook:  n => `https://www.facebook.com/search/top?q=${encodeURIComponent(n)}`,
  instagram: n => `https://www.instagram.com/web/search/topsearch/?query=${encodeURIComponent(n)}`,
  tiktok:    n => `https://www.tiktok.com/search/user?q=${encodeURIComponent(n)}`
};

const READERS = {
  facebook: () => {
    const out = { name:'', handle:'', url:'' };
    // perfis aparecem como <a href="/username/..."> ou /profile.php?id=
    const links = [...document.querySelectorAll('a[role="link"][href]')];
    for(const a of links){
      const href = a.getAttribute('href') || '';
      if(!href.match(/^\/(?!search|friends|messages|notifications|watch|marketplace)/)) continue;
      const txt = (a.innerText || '').trim().split('\n')[0];
      if(!txt || txt.length < 2 || txt.length > 60) continue;
      if(/^(ver|see|join|entrar|curtir|like|seguir|follow|foto|video)/i.test(txt)) continue;
      out.name = txt;
      out.url  = 'https://www.facebook.com' + href.split('?')[0];
      const m = out.url.match(/facebook\.com\/([^\/?]+)/);
      if(m && m[1] !== 'profile.php') out.handle = '@' + m[1];
      return out;
    }
    return out;
  },
  instagram: () => {
    // A página de search do IG é SPA; o JSON-LD traz usuários
    const out = { name:'', handle:'', url:'' };
    const scripts = [...document.querySelectorAll('script[type="application/ld+json"]')];
    for(const s of scripts){
      try{
        const j = JSON.parse(s.textContent);
        const items = j?.mainEntity?.itemListElement || j?.itemListElement || [];
        for(const it of items){
          const u = it?.item?.url || it?.url || '';
          const n = it?.item?.name || it?.name || it?.item?.alternateName || '';
          if(u.includes('instagram.com/')){
            const handle = u.replace(/\/$/,'').split('instagram.com/')[1];
            out.handle = '@' + handle;
            out.name = n || handle;
            out.url = u;
            return out;
          }
        }
      }catch(e){}
    }
    // fallback: links de perfil visíveis
    const links = [...document.querySelectorAll('a[href^="/"]')];
    for(const a of links){
      const h = a.getAttribute('href');
      if(h.match(/^\/[A-Za-z0-9._]{3,30}\/$/)){
        out.handle = '@' + h.replace(/\//g,'');
        out.name = out.name || out.handle;
        out.url = 'https://www.instagram.com' + h;
        return out;
      }
    }
    return out;
  },
  tiktok: () => {
    const out = { name:'', handle:'', url:'' };
    const links = [...document.querySelectorAll('a[href*="/@"]')];
    for(const a of links){
      const h = a.getAttribute('href') || '';
      const m = h.match(/@([A-Za-z0-9._]{2,30})/);
      if(m){
        out.handle = '@' + m[1];
        out.name = (a.innerText || '').trim().split('\n')[0] || m[1];
        out.url = 'https://www.tiktok.com/@' + m[1];
        return out;
      }
    }
    return out;
  }
};

chrome.runtime.onMessage.addListener((msg, sender, respond) => {
  if(msg?.type === 'SENTINELA_LOOKUP'){
    handleLookup(msg.network, msg.number).then(respond).catch(e => respond({ error:String(e) }));
    return true;   // async
  }
  if(msg?.type === 'SENTINELA_PING'){
    respond({ ok:true, version:'1.0.0' });
    return true;
  }
});

async function handleLookup(network, number){
  const urlFn = NETWORKS[network];
  if(!urlFn) return { error:'Rede não suportada' };

  const url = urlFn(number);

  // abre aba em background
  const tab = await chrome.tabs.create({ url, active:false });

  // espera carregar (timeout 15s)
  const loaded = await waitForComplete(tab.id, 15000);
  if(!loaded){
    try{ await chrome.tabs.remove(tab.id); }catch(e){}
    return { error:'Timeout ao carregar ' + network };
  }

  // pequena espera pra SPA renderizar
  await new Promise(r => setTimeout(r, 2500));

  // injeta leitor
  let result = { name:'', handle:'', url:'' };
  try{
    const [inj] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: READERS[network]
    });
    result = inj?.result || result;
  }catch(e){
    result.error = String(e);
  }

  try{ await chrome.tabs.remove(tab.id); }catch(e){}
  return result;
}

function waitForComplete(tabId, timeout){
  return new Promise(resolve => {
    const t0 = Date.now();
    const check = () => {
      chrome.tabs.get(tabId, tab => {
        if(chrome.runtime.lastError || !tab) return resolve(false);
        if(tab.status === 'complete') return resolve(true);
        if(Date.now() - t0 > timeout) return resolve(false);
        setTimeout(check, 400);
      });
    };
    check();
  });
}
