/* Installation is progressive enhancement. No accounts, payments or bids are cached or replayed. */
(()=>{
  let installPrompt=null,installedThisSession=false,installing=false;
  const native=()=>!!window.Capacitor?.isNativePlatform?.();
  const standalone=()=>native()||window.matchMedia('(display-mode: standalone)').matches||window.navigator.standalone===true;
  const isIOS=()=>/iPad|iPhone|iPod/.test(navigator.userAgent)||navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1;
  const installed=()=>installedThisSession||standalone();
  function refreshInstallButtons(){document.querySelectorAll('[data-install-app]').forEach(button=>{button.hidden=installed()});document.documentElement.classList.toggle('app-installed',installed())}
  async function promptInstall(){
    if(installing)return;
    if(installed()){toast(standalone()?'Приложение уже открыто в установленном режиме.':'Приложение установлено. Откройте ФАС торги с главного экрана.');return}
    if(installPrompt){const prompt=installPrompt;installPrompt=null;installing=true;try{await prompt.prompt();const choice=await prompt.userChoice;if(choice.outcome==='accepted')toast('Подтвердите установку в браузере.');else toast('Установку можно повторить через меню браузера.')}catch{showInstallHelp()}finally{installing=false;refreshInstallButtons()}return}
    showInstallHelp();
  }
  function showInstallHelp(){
    const ios=isIOS();showModalContent(`<div class="modal-body install-body"><div class="eyebrow">ФАС ТОРГИ НА ТЕЛЕФОНЕ</div><img class="install-app-icon" src="assets/app/icon-192.png?v=20261116-gradient1" alt="Иконка ФАС торги"><h2>Ваши лоты —<br>на главном экране</h2><p>Установите ФАС торги с сайта. Приложение откроется отдельным окном с той же лентой, поиском и избранным.</p><ol class="install-steps">${ios?'<li>Откройте этот сайт в Safari.</li><li>Нажмите «Поделиться» в меню браузера.</li><li>Выберите «На экран Домой» и подтвердите добавление.</li>':'<li>Откройте этот сайт в Chrome или Samsung Internet.</li><li>Откройте меню браузера ⋮.</li><li>Выберите «Установить приложение» или «Добавить на главный экран».</li>'}</ol><p class="note">Если сайт открыт внутри другого приложения, сначала выберите «Открыть в браузере». Для входа и актуальных данных понадобится интернет. Установка не включает реальные торги, SMS или оплату — они пока не подключены.</p><button type="button" class="primary" data-dismiss-install>Понятно</button></div>`);
    document.querySelector('[data-dismiss-install]')?.addEventListener('click',()=>document.querySelector('#modal').close());
  }
  window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;refreshInstallButtons()});
  window.addEventListener('appinstalled',()=>{installPrompt=null;installedThisSession=true;refreshInstallButtons();toast('ФАС торги добавлено на главный экран.')});
  document.addEventListener('click',event=>{if(event.target.closest('[data-install-app]'))promptInstall()});
  window.matchMedia('(display-mode: standalone)').addEventListener?.('change',refreshInstallButtons);
  refreshInstallButtons();
  if(!native()&&'serviceWorker'in navigator&&window.isSecureContext){window.addEventListener('load',()=>{navigator.serviceWorker.register('sw.js',{scope:'./',updateViaCache:'none'}).catch(()=>{/* The website remains available; browser menu instructions stay truthful. */})})}
  if(new URLSearchParams(location.search).get('view')==='favorites'){setTab('fav');document.querySelector('#lot-results').scrollIntoView?.({block:'start'})}
})();
