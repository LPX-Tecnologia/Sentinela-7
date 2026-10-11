// Bridge: página ↔ extensão
(function(){
  const sendToPage = (data) => window.postMessage({ __sentinela:true, ...data }, '*');

  // anuncia que a extensão está presente
  sendToPage({ type:'READY' });

  window.addEventListener('message', async e => {
    if(e.source !== window) return;
    const d = e.data;
    if(!d || !d.__sentinela || d.type !== 'LOOKUP') return;

    try{
      const res = await chrome.runtime.sendMessage({
        type:'SENTINELA_LOOKUP',
        network: d.network,
        number: d.number
      });
      sendToPage({
        type:'RESULT',
        requestId: d.requestId,
        network: d.network,
        data: res || {}
      });
    }catch(err){
      sendToPage({
        type:'RESULT',
        requestId: d.requestId,
        network: d.network,
        data: { error:String(err) }
      });
    }
  });
})();
