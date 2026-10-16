/* 一页阅读 — all book content is treated as text, never executable markup. */
(async function(){
'use strict';
const M=ReaderModel,$=s=>document.querySelector(s),N=window.ReaderNative;
const E=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icon=n=>`<svg aria-hidden="true"><use href="#i-${n}"/></svg>`;
let state=M.state(N?N.loadState():localStorage.getItem('ye-reader-state'));
let books=[],book=null,current=0,page=0,pages=1,prefix=[],total=0,view='shelf',sheetType='',lastFocus=null;
let restoring=false,layoutToken=0,scrollTimer,toastTimer,queryToken=0,busy=false,failWarned=false,chapterNodes=[];
let resumeAnchor={chapter:0,offset:0},pendingLayout=0,down=null,resizeTimer;
let insetSignature='';
let db,sheetCleanup=null,pageMotion=null,pendingTurns=[],turnQueueFrame=0;
async function database(){if(db)return db;db=await new Promise((ok,no)=>{const r=indexedDB.open('ye-reader',1);r.onupgradeneeded=()=>r.result.createObjectStore('books',{keyPath:'id'});r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error);});return db;}
async function tx(mode,fn){const d=await database();return new Promise((ok,no)=>{const t=d.transaction('books',mode),r=fn(t.objectStore('books'));t.oncomplete=()=>ok(r.result);t.onerror=()=>no(t.error);t.onabort=()=>no(t.error);});}
const storage={
 async list(){return N?JSON.parse(N.listBooks()):(await tx('readonly',s=>s.getAll())).map(M.summary);},
 async get(id){if(N){const r=await fetch('/books/'+id+'.json');if(!r.ok)throw Error('书籍文件无法读取');return r.json();}return tx('readonly',s=>s.get(id));},
 async put(b){if(N){if(!N.storeBook(JSON.stringify(b)))throw Error('保存书籍失败，请检查剩余存储空间');}else await tx('readwrite',s=>s.put(b));},
 async remove(id){if(N){if(!N.deleteBook(id))throw Error('移除失败，请重试');}else await tx('readwrite',s=>s.delete(id));}
};
function notify(msg){if(!msg)return;$('#toast').textContent=msg;$('#toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),3200);}
function showBusy(on,msg='正在处理…'){busy=on;$('#busy').classList.toggle('hidden',!on);$('#busyMessage').textContent=msg;syncVolumeNavigation();}
function save(){try{const json=JSON.stringify(state);if(N){if(!N.saveState(json))throw Error();}else localStorage.setItem('ye-reader-state',json);failWarned=false;return true;}catch{if(!failWarned)notify('阅读记录保存失败，请检查存储空间');failWarned=true;return false;}}
function record(id){const x=state.books[id];if(!x||typeof x!=='object'||Array.isArray(x))state.books[id]={};const r=state.books[id];if(!Array.isArray(r.marks))r.marks=[];r.marks=r.marks.filter(m=>m&&typeof m==='object'&&Number.isInteger(m.chapter)&&m.chapter>=0&&Number.isFinite(m.offset)&&m.offset>=0).slice(0,1000);return r;}
function titleOf(meta){return record(meta.id).title||meta.title||'未命名小说';}
function authorOf(meta){return record(meta.id).author||meta.author||'本地小说';}
function count(n){return n>=10000?(n/10000).toFixed(1)+'万':String(n||0);}
const colors=['#496856','#526b7b','#96765e','#787568','#78627b','#a26c59'];
function cover(meta,mini=false){const r=record(meta.id);let hash=0;for(const c of meta.id)hash=(hash+c.charCodeAt(0))%colors.length;const color=/^#[0-9a-f]{6}$/i.test(r.color||'')?r.color:colors[hash],title=String(titleOf(meta));const long=Array.from(title).length>(mini?4:7)||/[A-Za-z0-9]/.test(title);return `<div class="cover ${mini?'mini-cover':''} ${long?'long-title':''}" style="--cover:${color}" aria-hidden="true"><span class="cover-title">${E(title)}</span><span class="cover-caption">${meta.format==='示例'?'A LITTLE STORY':'LOCAL LIBRARY'}</span></div>`;}
function percentage(meta){return M.clamp(record(meta.id).percent||0,0,100);}
async function refresh(){books=(await storage.list()).filter(b=>b&&/^[a-f0-9]{24}$/.test(b.id));renderShelf();}
function renderShelf(){
 const q=$('#shelfSearch').value.trim().toLocaleLowerCase();
 const ordered=books.filter(b=>(titleOf(b)+' '+authorOf(b)).toLocaleLowerCase().includes(q)).sort((a,b)=>state.sort==='title'?titleOf(a).localeCompare(titleOf(b),'zh'):state.sort==='added'?b.added-a.added:(record(b.id).lastRead||0)-(record(a.id).lastRead||0)||b.added-a.added);
 $('#bookCount').textContent=books.length;$('#sortBooks').value=state.sort;
 $('#shelfDescription').textContent=books.length?`已收藏 ${books.length} 本 · 每一次翻页，都是新的抵达。`:'添加一本小说，开始你的安静时光。';
 const recent=books.find(b=>b.id===state.last)||books.slice().sort((a,b)=>(record(b.id).lastRead||0)-(record(a.id).lastRead||0))[0];
 $('#continue').classList.toggle('hidden',!recent);
 if(recent){const r=record(recent.id);$('#continue').innerHTML=cover(recent,true)+`<div class="continue-copy"><span class="eyebrow">${r.lastRead?'CONTINUE READING':'A STORY AWAITS'}</span><h2>${E(titleOf(recent))}</h2><p>${E(r.chapterTitle||'从第一章，慢慢开始')}</p><div class="continue-bottom"><span>${r.lastRead?'已读 '+percentage(recent).toFixed(1)+'%':recent.chapterCount+' 章 · '+count(recent.count)+' 字符'}</span><button id="resumeBook">${r.lastRead?'继续阅读':'开始阅读'}${icon('arrow')}</button></div></div>`;$('#resumeBook').onclick=()=>openBook(recent.id);}
 const grid=$('#bookGrid');grid.innerHTML=ordered.map(b=>`<div class="book-card"><button class="book-open" data-open="${b.id}" aria-label="阅读 ${E(titleOf(b))}">${cover(b)}</button><div class="book-title-line"><h3>${E(titleOf(b))}</h3><button class="book-more iconbtn" data-more="${b.id}" aria-label="管理 ${E(titleOf(b))}">${icon('more')}</button></div><p class="book-info">${E(authorOf(b))}</p><p class="book-info">${percentage(b)>0?'已读 '+percentage(b).toFixed(1)+'%':b.chapterCount+' 章'} · ${E(b.format)}</p><div class="book-progress" style="--progress:${percentage(b)}%"><i></i></div></div>`).join('')+(q?'':`<button class="import-tile" id="importTile">${icon('plus')}<span>添加一本好书</span><small>TXT / EPUB</small></button>`);
 if(q&&!ordered.length)grid.innerHTML='<div class="empty">'+icon('search')+'<p>没有找到这本书<br>换一个书名或作者试试</p></div>';
 grid.querySelectorAll('[data-open]').forEach(el=>el.onclick=()=>openBook(el.dataset.open));grid.querySelectorAll('[data-more]').forEach(el=>el.onclick=()=>bookMenu(el.dataset.more));
 if($('#importTile'))$('#importTile').onclick=importSheet;
}
function luminance(hex){const a=hex.slice(1).match(/../g).map(v=>parseInt(v,16));return a[0]*.299+a[1]*.587+a[2]*.114<125;}
window.readerInsets=function(left,top,right,bottom){const ratio=window.devicePixelRatio||1,signature=[left,top,right,bottom,ratio].join(',');if(signature===insetSignature)return;insetSignature=signature;for(const [k,v] of Object.entries({left,top,right,bottom}))document.documentElement.style.setProperty('--safe-'+k,(v/ratio)+'px');if(view==='reader'){stopPageAnimation();clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>layoutReader(resumeAnchor),80);}};
if(N&&typeof N.insets==='function')try{window.readerInsets(...JSON.parse(N.insets()));}catch{}
function nativeScreen(){if(N){const s=state.settings;N.screen(view==='reader'&&s.awake,view==='reader'&&s.full,view==='reader'?Math.round(s.brightness):-1);}}
function canVolumeNavigate(){const a=document.activeElement,editing=a&&(a.isContentEditable||a.tagName==='TEXTAREA'||a.tagName==='SELECT'||(a.tagName==='INPUT'&&!['checkbox','radio','range','button','submit','color'].includes(a.type)));return view==='reader'&&!!book&&state.settings.volumeKeys&&!sheetType&&!busy&&!document.hidden&&!editing&&!window.getSelection()?.toString();}
function syncVolumeNavigation(){if(N&&typeof N.volumePaging==='function')N.volumePaging(!!canVolumeNavigate());}
function applyAppearance(){
 const s=state.settings,t=M.themes[s.theme]||{bg:s.customBg,text:s.customText};
 const dark=view==='reader'?luminance(t.bg):s.shelfDark;
 document.body.classList.toggle('dark',dark);
 const style=document.documentElement.style;style.setProperty('--rbg',t.bg);style.setProperty('--rtxt',t.text);style.setProperty('--size',s.size+'px');style.setProperty('--leading',s.leading);style.setProperty('--spacing',s.spacing+'px');style.setProperty('--pad',s.pad+'px');style.setProperty('--para',s.para+'px');style.setProperty('--font',s.font==='serif'?'"Noto Serif CJK SC","Source Han Serif SC",serif':s.font==='mono'?'monospace':'sans-serif');style.setProperty('--align',s.justify?'justify':'left');
 $('#reader').classList.toggle('paper-texture',s.paperTexture);style.setProperty('--paper-opacity',(s.paperStrength*.0018).toFixed(3));
 const bg=view==='reader'?t.bg:(dark?'#171d1a':'#f6f5f0');$('meta[name="theme-color"]').content=bg;
 if(N)N.chrome(bg,dark);nativeScreen();syncReadingMode();syncVolumeNavigation();
}
function syncReadingMode(){
 const paged=state.settings.mode==='paged';
 $('#readingBody').classList.toggle('curl-gestures',paged&&state.settings.pageAnimation==='curl');
 document.querySelectorAll('[data-quick-mode]').forEach(b=>{const selected=b.dataset.quickMode===state.settings.mode;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));});
 $('#pageControls').classList.toggle('hidden',!paged);$('#scrollModeHint').classList.toggle('hidden',paged);
 $('#pagePosition').textContent=`${page+1}/${pages} 页`;
 $('#prevPage').disabled=current===0&&page===0;$('#nextPage').disabled=!book||(current===book.chapters.length-1&&page===pages-1);
 $('#gestureHint').textContent=paged?'轻点两侧或左右滑动翻页 · 轻点中间显示菜单':'上下滚动阅读 · 轻点正文显示或收起菜单';
}
async function openBook(id){
 if(busy)return;showBusy(true,'正在打开小说…');
 try {
  if(view==='reader')saveReading();
  const b=await storage.get(id);if(!b||!Array.isArray(b.chapters)||!b.chapters.length)throw Error('这本书没有可读取正文');
  book=b;prefix=M.starts(b);total=b.chapters.reduce((n,c)=>n+c.text.length,0);const r=record(id),p=M.position(book,r);
  state.last=id;r.lastRead=Date.now();view='reader';$('#shelf').classList.add('hidden');$('#reader').classList.remove('hidden');$('#reader').classList.remove('quiet');
  $('#readerTitleText').textContent=titleOf(book);$('#readerTitle').setAttribute('aria-label','打开《'+titleOf(book)+'》目录');applyAppearance();closeSheet();renderChapter(p.chapter,p.offset);save();
 }catch(err){notify(err.message||'打开小说失败');}finally{showBusy(false);}
}
function mountChapterText(hits=chapterNodes.filter(p=>p.node.dataset.hit).map(p=>p.offset)){
 const article=$('#article'),c=book.chapters[current];article.classList.remove('fitted-pages');article.replaceChildren();
 const h=document.createElement('h1');h.textContent=c.title;article.append(h);
 chapterNodes=M.paragraphs(c.text).map(p=>{const node=document.createElement('p');node.textContent=p.text;node.dataset.offset=p.offset;if(hits.some(n=>n>=p.offset&&n<p.offset+p.text.length))node.dataset.hit='true';article.append(node);return{...p,node};});
}
function renderChapter(ch,offset=0,transition=null){
 stopPageAnimation();
 current=Math.floor(M.clamp(ch,0,book.chapters.length-1));const c=book.chapters[current];restoring=true;page=0;resumeAnchor={chapter:current,offset};
 const article=$('#article');article.style.transform='';article.style.width='';article.style.height='';article.style.columnWidth='';
 mountChapterText([]);
 updateChapterChrome();
 $('#gestureHint').textContent=state.settings.mode==='paged'?'左右轻点或横滑翻页 · 中间轻点收起菜单':'轻点正文收起菜单 · 上下滚动阅读';
 layoutReader({chapter:current,offset},()=>{if(transition?.ready)transition.ready();else if(transition)playPageAnimation(transition.snapshot,transition.direction);});
}
function updateChapterChrome(){
 const c=book.chapters[current];
 $('#footChapter').textContent=c.title;$('#chapterNumber').textContent=`${current+1} / ${book.chapters.length}`;
 $('#prevChapter').disabled=current===0;$('#nextChapter').disabled=current===book.chapters.length-1;
}
function rangeAt(offset){
 if(!chapterNodes.length)return null;
 let lo=0,hi=chapterNodes.length-1;while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(chapterNodes[mid].offset<=offset)lo=mid;else hi=mid-1;}
 const p=chapterNodes[lo],n=p.node.firstChild;if(!n)return null;const k=Math.floor(M.clamp(offset-p.offset,0,Math.max(0,n.length-1)));
 const r=document.createRange();r.setStart(n,k);r.setEnd(n,Math.min(n.length,k+1));return r;
}
function rectAt(offset){const r=rangeAt(offset);return r?r.getBoundingClientRect():null;}
function anchor(){
 if(!book)return{chapter:0,offset:0};if(restoring)return resumeAnchor;
 const body=$('#readingBody'),v=body.getBoundingClientRect(),paged=state.settings.mode==='paged',len=book.chapters[current].text.length;
 if((paged&&page===0)||(!paged&&body.scrollTop<8))return{chapter:current,offset:0};
 if((paged&&page===pages-1)||(!paged&&body.scrollTop+body.clientHeight>=body.scrollHeight-8)){
  if(paged&&pages===1)return{chapter:current,offset:0};
 }
 let lo=0,hi=Math.max(0,len-1);
 while(lo<hi){const mid=Math.floor((lo+hi)/2),r=rectAt(mid);const before=r&&(paged?r.right<=v.left+state.settings.pad+.5:r.bottom<=v.top+6);if(before)lo=mid+1;else hi=mid;}
 return{chapter:current,offset:lo};
}
function layoutReader(pos,onReady){
 stopPageAnimation();
 if(view!=='reader'||!book)return;const p=pos||resumeAnchor||anchor();resumeAnchor={...p};restoring=true;const ticket=++layoutToken;
 cancelAnimationFrame(pendingLayout);
 pendingLayout=requestAnimationFrame(()=>{
  if(ticket!==layoutToken||view!=='reader')return;const body=$('#readingBody'),a=$('#article'),s=state.settings,frame=$('#readingFrame'),insets=M.pageInsets(frame.clientHeight,s.top,s.bottom);
  frame.style.setProperty('--page-top',insets.top+'px');frame.style.setProperty('--page-bottom',insets.bottom+'px');
  body.classList.toggle('paged',s.mode==='paged');a.style.transform='';body.scrollTop=0;body.scrollLeft=0;
  if(a.classList.contains('fitted-pages'))mountChapterText();
  if(s.mode==='paged'){
   const w=Math.max(80,body.clientWidth-s.pad*2),h=Math.max(1,body.clientHeight);
   a.style.width=w+'px';a.style.height=h+'px';a.style.columnWidth=w+'px';
   // Column spacing is exactly two side margins; each page advances a full viewport.
   const fitted=ReaderPagination.fit(a,body,chapterNodes);pages=fitted.pages;chapterNodes=fitted.nodes;
   const r=rectAt(p.offset);page=p.offset===0?0:Math.floor(Math.max(0,(r?r.left-body.getBoundingClientRect().left:0))/body.clientWidth);page=Math.floor(M.clamp(page,0,pages-1));a.style.transform=`translateX(${-page*body.clientWidth}px)`;
  }else{
   a.style.width='';a.style.height='';a.style.columnWidth='';pages=1;page=0;
   if(p.offset>0){const r=rectAt(p.offset);if(r)body.scrollTop=r.top-body.getBoundingClientRect().top-10;}
  }
  requestAnimationFrame(()=>{if(ticket!==layoutToken)return;restoring=false;resumeAnchor={...anchor()};updateFoot();if(onReady)onReady();drainTurns();});
 });
}
window.layoutReader=()=>layoutReader(resumeAnchor);
function saveReading(){
 if(view!=='reader'||!book)return save();const p=anchor();resumeAnchor={...p};const r=record(book.id);r.chapter=p.chapter;r.offset=p.offset;r.chapterTitle=book.chapters[p.chapter].title;r.lastRead=Date.now();
 r.percent=M.progress(book,p);const body=$('#readingBody');
 if(current===book.chapters.length-1&&((state.settings.mode==='paged'&&page===pages-1)||(state.settings.mode==='scroll'&&body.scrollTop+body.clientHeight>=body.scrollHeight-12)))r.percent=100;
 state.last=book.id;return save();
}
window.saveReading=saveReading;
function updateFoot(){if(!book)return;const p=anchor();let percent=M.progress(book,p);const body=$('#readingBody');if(current===book.chapters.length-1&&((state.settings.mode==='paged'&&page===pages-1)||(state.settings.mode==='scroll'&&body.scrollTop+body.clientHeight>=body.scrollHeight-12)))percent=100;
 syncReadingMode();
 $('#footProgress').textContent=state.settings.mode==='paged'?`${page+1} / ${pages} 页 · ${percent.toFixed(1)}%`:`${percent.toFixed(1)}%`;
 const marked=record(book.id).marks.some(m=>m.chapter===current&&Math.abs(m.offset-p.offset)<60);$('#toggleMark').classList.toggle('active',marked);$('#toggleMark').setAttribute('aria-label',marked?'移除此处书签':'添加书签');
}
function canAnimatePage(){return view==='reader'&&state.settings.mode==='paged'&&state.settings.pageAnimation!=='none'&&!matchMedia('(prefers-reduced-motion: reduce)').matches&&typeof $('#article').animate==='function';}
function capturePage(source,index,width,height){
 const snapshot=document.createElement('div');snapshot.className='reading-body paged page-snapshot';snapshot.setAttribute('aria-hidden','true');
 snapshot.style.width=width+'px';snapshot.style.height=height+'px';snapshot.style.margin='0';
 const fitted=source.classList.contains('fitted-pages'),article=source.cloneNode(!fitted);article.removeAttribute('id');
 if(fitted){article.style.transform='translateX(0px)';article.style.marginTop='0';for(const child of source.children){if(Math.round(parseFloat(child.style.left||0)/width)!==index)continue;const copy=child.cloneNode(true);copy.style.left='0px';article.append(copy);}}
 article.querySelectorAll('[id]').forEach(n=>n.removeAttribute('id'));snapshot.append(article);return snapshot;
}
function snapshotPage(index=page){
 if(!canAnimatePage())return null;const body=$('#readingBody');return capturePage($('#article'),index,body.clientWidth,body.clientHeight);
}
function previewPage(direction){
 const nextPage=page+direction,body=$('#readingBody');
 if(nextPage>=0&&nextPage<pages)return{chapter:current,page:nextPage,snapshot:snapshotPage(nextPage)};
 const chapter=current+direction;if(chapter<0||chapter>=book.chapters.length)return null;
 return previewChapter(chapter,direction<0);
}
function previewChapter(chapter,atEnd=false){
 const body=$('#readingBody');
 // Lay out an adjacent chapter in a hidden, disposable viewport. The live chapter,
 // reading record and selected page stay untouched until the gesture is accepted.
 const holder=document.createElement('div'),article=document.createElement('article'),c=book.chapters[chapter],w=body.clientWidth-state.settings.pad*2;
 holder.className='reading-body paged';Object.assign(holder.style,{position:'absolute',left:'0px',top:'0px',width:body.clientWidth+'px',height:body.clientHeight+'px',margin:'0',visibility:'hidden',pointerEvents:'none'});holder.setAttribute('aria-hidden','true');
 Object.assign(article.style,{width:w+'px',height:body.clientHeight+'px',columnWidth:w+'px'});
 const title=document.createElement('h1');title.textContent=c.title;article.append(title);
 const nodes=M.paragraphs(c.text).map(p=>{const node=document.createElement('p');node.textContent=p.text;article.append(node);return{...p,node};});holder.append(article);$('#readingFrame').append(holder);
 try{const fitted=ReaderPagination.fit(article,holder,nodes),index=atEnd?fitted.pages-1:0;return{chapter,page:index,pages:fitted.pages,article,nodes:fitted.nodes,snapshot:capturePage(article,index,body.clientWidth,body.clientHeight)};}finally{holder.remove();}
}
function makeCurl(outgoing,incoming,direction){
 const body=$('#readingBody'),surface=$('#reader'),engine=ReaderCurl.create({mount:surface,front:outgoing,under:incoming,direction,contentTop:body.getBoundingClientRect().top-surface.getBoundingClientRect().top,contentLeft:body.getBoundingClientRect().left-surface.getBoundingClientRect().left});body.classList.add('curl-active');return engine;
}
function stopPageAnimation(){
 const motion=pageMotion;if(!motion)return;pageMotion=null;
 if(down?.curl===motion){releasePointer(down);down=null;}
 clearTimeout(motion.timer);motion.animations.forEach(a=>a.cancel());if(motion.engine)motion.engine.destroy();else motion.layer.remove();$('#readingBody').classList.remove('page-animating','curl-dragging','curl-active');
}
function playPageAnimation(outgoing,direction){
 if(!outgoing||!canAnimatePage())return;stopPageAnimation();const incoming=snapshotPage(),body=$('#readingBody');if(!incoming)return;
 if(state.settings.pageAnimation==='curl'){
  const engine=makeCurl(outgoing,incoming,direction),motion={layer:engine.layer,engine,animations:[],timer:0};pageMotion=motion;body.classList.add('page-animating');engine.animate(1,state.settings.animationMs,()=>{if(pageMotion===motion)stopPageAnimation();});return;
 }
 const layer=document.createElement('div');
 layer.className='page-motion';layer.setAttribute('aria-hidden','true');layer.append(outgoing,incoming);body.append(layer);body.classList.add('page-animating');
 const duration=state.settings.animationMs,width=body.clientWidth,motion={layer,animations:[],timer:0};pageMotion=motion;
 const options={duration,easing:'cubic-bezier(.22,.61,.36,1)',fill:'both'};
 if(state.settings.pageAnimation==='fade'){
  motion.animations.push(outgoing.animate([{opacity:1},{opacity:0}],options),incoming.animate([{opacity:0},{opacity:1}],options));
 }else{
  motion.animations.push(outgoing.animate([{transform:'translateX(0px)'},{transform:`translateX(${-direction*width}px)`}],options),incoming.animate([{transform:`translateX(${direction*width}px)`},{transform:'translateX(0px)'}],options));
 }
 motion.animations[1].onfinish=()=>{if(pageMotion===motion)stopPageAnimation();};motion.timer=setTimeout(()=>{if(pageMotion===motion)stopPageAnimation();},duration+100);
}
function releasePointer(pointer){try{const body=$('#readingBody');if(body.hasPointerCapture(pointer.id))body.releasePointerCapture(pointer.id);}catch{}}
function eventClock(event){return event.timeStamp>0?event.timeStamp:performance.now();}
function prepareCurl(direction,target=previewPage(direction)){
 if(!target)return null;
 const engine=makeCurl(snapshotPage(),target.snapshot,direction),motion={layer:engine.layer,engine,animations:[],timer:0,target,direction};pageMotion=motion;$('#readingBody').classList.add('page-animating');return motion;
}
function beginCurl(pointer,direction){
 if(restoring||!canAnimatePage()||state.settings.pageAnimation!=='curl')return false;
 const motion=prepareCurl(direction);if(!motion)return false;motion.drag=true;pointer.curl=motion;
 $('#reader').classList.add('quiet');$('#readingBody').classList.add('page-animating','curl-dragging');try{$('#readingBody').setPointerCapture(pointer.id);}catch{}return true;
}
function finishCurl(pointer,commit){
 const motion=pointer.curl;if(pageMotion!==motion)return;motion.drag=false;$('#readingBody').classList.remove('curl-dragging');
 const settle=()=>{if(pageMotion!==motion)return;const goal=commit?1:0,duration=Math.max(90,state.settings.animationMs*Math.sqrt(Math.abs(goal-motion.engine.progress)));motion.engine.animate(goal,duration,()=>{if(pageMotion===motion)stopPageAnimation();});};
 if(!commit){settle();return;}
 if(motion.target.chapter!==current){
  // Adopt the already measured preview instead of rebuilding the chapter while
  // the fold is moving. The opaque cover stays above a continuously visible page.
  const target=motion.target;++layoutToken;cancelAnimationFrame(pendingLayout);current=target.chapter;pages=target.pages;chapterNodes=target.nodes;
  target.article.id='article';$('#article').replaceWith(target.article);updateChapterChrome();restoring=false;
 }
 page=motion.target.page;$('#article').style.transform=`translateX(${-page*$('#readingBody').clientWidth}px)`;resumeAnchor=anchor();updateFoot();saveReading();settle();
}
function clearTurnQueue(){pendingTurns=[];cancelAnimationFrame(turnQueueFrame);}
function drainTurns(){
 if(view!=='reader'||sheetType||state.settings.mode!=='paged'){clearTurnQueue();return;}
 if(restoring||!pendingTurns.length)return;const direction=pendingTurns.shift();turnPage(direction);if(!restoring&&pendingTurns.length)turnQueueFrame=requestAnimationFrame(drainTurns);
}
function changeChapter(delta){if(!book)return;clearTurnQueue();stopPageAnimation();const next=current+delta;if(next<0){notify('已经是第一章了');return;}if(next>=book.chapters.length){notify('已经读到最后了');return;}if(canAnimatePage()&&state.settings.pageAnimation==='curl'){const motion=prepareCurl(delta>0?1:-1,previewChapter(next));finishCurl({curl:motion},true);return;}const snapshot=snapshotPage();saveReading();renderChapter(next,0,{snapshot,direction:delta>0?1:-1});setTimeout(saveReading,60);}
function turnPage(delta){
 if(state.settings.mode!=='paged'||!book)return;delta=delta>0?1:-1;
 if(restoring){pendingTurns.push(delta);return;}stopPageAnimation();
 if(canAnimatePage()&&state.settings.pageAnimation==='curl'){
  const motion=prepareCurl(delta);if(!motion){notify(delta<0?'已经是第一页了':'已经读到最后了');return;}finishCurl({curl:motion},true);return;
 }
 if((delta<0&&page===0)||(delta>0&&page===pages-1)){
  const next=current+delta;if(next<0){notify('已经是第一页了');return;}if(next>=book.chapters.length){notify('已经读到最后了');return;}
  const snapshot=snapshotPage();saveReading();renderChapter(next,delta<0?Math.max(0,book.chapters[next].text.length-1):0,{snapshot,direction:delta});return;
 }
 const snapshot=snapshotPage();page=Math.floor(M.clamp(page+delta,0,pages-1));$('#article').style.transform=`translateX(${-page*$('#readingBody').clientWidth}px)`;restoring=false;resumeAnchor=anchor();updateFoot();saveReading();playPageAnimation(snapshot,delta);
}
window.readerVolumeTurn=function(delta){
 if(!canVolumeNavigate())return false;delta=delta>0?1:-1;$('#reader').classList.add('quiet');
 if(state.settings.mode==='paged'){turnPage(delta);return true;}
 if(restoring)return false;
 const body=$('#readingBody');
 if(delta>0&&body.scrollTop+body.clientHeight>=body.scrollHeight-2){changeChapter(1);return true;}
 if(delta<0&&body.scrollTop<=2){if(current===0){notify('已经是第一页了');return true;}saveReading();renderChapter(current-1,Math.max(0,book.chapters[current-1].text.length-1));return true;}
 const line=parseFloat(getComputedStyle($('#article')).lineHeight)||40;
 body.scrollTop+=delta*Math.max(60,body.clientHeight-line*2);resumeAnchor=anchor();updateFoot();saveReading();return true;
};
function backShelf(){stopPageAnimation();clearTurnQueue();saveReading();view='shelf';book=null;$('#reader').classList.add('hidden');$('#shelf').classList.remove('hidden');closeSheet();applyAppearance();renderShelf();}
function quiet(){ $('#reader').classList.toggle('quiet'); }
function openSheet(type,title,subtitle,html){
 stopPageAnimation();clearTurnQueue();
 if(sheetCleanup){sheetCleanup();sheetCleanup=null;}
 saveReading();lastFocus=document.activeElement;sheetType=type;$('#sheet').classList.toggle('is-toc',type==='toc');$('#sheetTitle').textContent=title;$('#sheetSubtitle').textContent=subtitle||'';$('#sheetBody').innerHTML=html;ReaderControls.dragOnlyRanges($('#sheetBody'));$('#sheetBody').scrollTop=0;$('#overlay').classList.remove('hidden');$('#reader').classList.add('quiet');$('#closeSheet').focus({preventScroll:true});syncVolumeNavigation();
}
function closeSheet(){if(sheetCleanup){sheetCleanup();sheetCleanup=null;}queryToken++;$('#overlay').classList.add('hidden');sheetType='';if(lastFocus&&lastFocus.isConnected)try{lastFocus.focus({preventScroll:true});}catch{}lastFocus=null;syncVolumeNavigation();}
function importSheet(){openSheet('import','添加本地小说','你的书，只保存在你的设备上',`
 <div class="book-details"><div><strong>TXT</strong><p>自动识别章节</p></div><div><strong>EPUB</strong><p>读取原书顺序</p></div><div><strong>30 MB</strong><p>单文件上限</p></div></div>
 <div class="row"><div><strong>TXT 文本编码</strong><p>乱码时可切换编码，移除后重新导入。</p></div><select id="importEncoding" aria-label="TXT 文本编码"><option value="auto">自动识别</option><option value="UTF-8">UTF-8</option><option value="GB18030">GB18030 / GBK</option><option value="Big5">Big5 繁体</option><option value="UTF-16LE">UTF-16 LE</option><option value="UTF-16BE">UTF-16 BE</option></select></div>
 <p class="note">TXT 支持“第一章”“第 1 章”、Chapter 1、数字标题等常见格式。无章节标题时按正文分段，较长章节会拆为续页。EPUB 支持未加密、以文字为主的小说；图片与原书排版会简化。${N?'系统文件选择器中可以一次选择多本，最多 20 本。':'当前网页预览支持 TXT；安装安卓版本可导入 EPUB。'}</p>
 <button id="chooseBooks" class="primary wide">${icon('plus')}选择本地文件</button>`);
 $('#importEncoding').value=state.settings.encoding;$('#importEncoding').onchange=e=>{state.settings.encoding=e.target.value;save();};$('#chooseBooks').onclick=()=>{closeSheet();saveReading();if(N){showBusy(true,'等待选择小说…');N.importBooks(state.settings.encoding);}else $('#webImport').click();};
}
async function webImport(files){showBusy(true,'正在导入…');let ok=0,error='';try{for(const file of Array.from(files).slice(0,20)){try{if(!/\.txt$/i.test(file.name))throw Error('网页预览仅支持 TXT');if(file.size>30*1024*1024)throw Error('文件超过 30 MB');const buffer=await file.arrayBuffer();let encoding=state.settings.encoding,text;if(encoding==='auto'){const a=new Uint8Array(buffer);encoding=a[0]===255&&a[1]===254?'utf-16le':a[0]===254&&a[1]===255?'utf-16be':'utf-8';try{text=new TextDecoder(encoding,{fatal:true}).decode(buffer);}catch{text=new TextDecoder('gb18030',{fatal:true}).decode(buffer);}}else text=new TextDecoder(encoding.toLowerCase(),{fatal:true}).decode(buffer);
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',buffer))).slice(0,12).map(n=>n.toString(16).padStart(2,'0')).join('');if(books.some(b=>b.id===hash))throw Error('这本书已经在书架中');const chapters=M.detect(text);if(!chapters.length)throw Error('文件为空');await storage.put({id:hash,title:file.name.slice(0,-4),author:'本地小说',format:'TXT',added:Date.now(),chapters});ok++;await refresh();}catch(e){error=file.name+'：'+e.message;}}}finally{showBusy(false);notify(ok?'已导入 '+ok+' 本'+(error?'；'+error:''):error);$('#webImport').value='';}}
function bookMenu(id){const meta=books.find(b=>b.id===id);if(!meta)return;const r=record(id);openSheet('book','书籍详情',meta.format+' · 本地保存',`
 <div class="book-details"><div><strong>${meta.chapterCount}</strong><p>章节</p></div><div><strong>${count(meta.count)}</strong><p>正文字符</p></div><div><strong>${percentage(meta).toFixed(1)}%</strong><p>阅读进度</p></div></div>
 <label class="form-field">书名<input id="editTitle" maxlength="100" value="${E(titleOf(meta))}"></label><label class="form-field">作者<input id="editAuthor" maxlength="100" value="${E(authorOf(meta))}"></label>
 <div class="custom-colors"><label>封面颜色 <input type="color" id="coverColor" value="${E(r.color||colors[0])}"></label></div>
 <div class="action-row"><button class="secondary" id="saveBookInfo">保存信息</button><button class="primary" id="readBookNow">继续阅读</button></div>
 <div class="row"><div><strong>重置阅读进度</strong><p>回到第一章，保留书签。</p></div><button id="resetProgress" class="secondary">重置</button></div>
 <div class="row"><div><strong>移出书架</strong><p>移除此书及其阅读记录，原文件不受影响。</p></div><button id="deleteBook" class="secondary danger">移除</button></div>`);
 $('#saveBookInfo').onclick=()=>{const t=$('#editTitle').value.trim();if(!t){notify('书名不能为空');return;}r.title=t;r.author=$('#editAuthor').value.trim()||'本地小说';r.color=$('#coverColor').value;save();renderShelf();closeSheet();notify('书籍信息已保存');};
 $('#readBookNow').onclick=()=>openBook(id);
 $('#resetProgress').onclick=()=>confirmSheet('重置阅读进度？','书签会保留，下一次从第一章开始。',()=>{Object.assign(r,{chapter:0,offset:0,percent:0,chapterTitle:'',lastRead:0});save();renderShelf();closeSheet();notify('阅读进度已重置');});
 $('#deleteBook').onclick=()=>confirmSheet('移出这本书？','将删除《'+titleOf(meta)+'》在本应用中的内容、进度和书签。你的原始文件会保留。',async()=>{try{await storage.remove(id);delete state.books[id];if(state.last===id)state.last='';save();closeSheet();await refresh();notify('已移出书架');}catch(e){notify(e.message);}});
}
function confirmSheet(title,message,action){openSheet('confirm',title,'',`<p class="note">${E(message)}</p><div class="action-row"><button class="secondary" id="cancelAction">取消</button><button class="primary" id="confirmAction">确认</button></div>`);$('#cancelAction').onclick=closeSheet;$('#confirmAction').onclick=action;}
function addMark(toggle=false){if(!book)return;const p=anchor(),r=record(book.id),found=r.marks.findIndex(m=>m.chapter===current&&Math.abs(m.offset-p.offset)<60);if(found>=0){if(toggle){r.marks.splice(found,1);notify('已移除书签');}else notify('这里已经有书签了');}else{if(r.marks.length>=1000){notify('每本书最多保存 1000 个书签');return;}r.marks.push({id:Date.now().toString(36),chapter:current,offset:p.offset,note:'',excerpt:book.chapters[current].text.slice(p.offset,p.offset+80).replace(/\n/g,' '),created:Date.now()});notify('已添加书签，可在目录中查看');}saveReading();updateFoot();}
function tocSheet(tab='toc'){
 if(!book)return;openSheet('toc','目录与书签',titleOf(book),`<div class="tabs"><button id="tocTab" class="${tab==='toc'?'selected':''}">章节目录</button><button id="marksTab" class="${tab==='marks'?'selected':''}">我的书签 <small>${record(book.id).marks.length}</small></button></div><div id="tocPanel"></div>`);
 $('#tocTab').onclick=()=>tocSheet('toc');$('#marksTab').onclick=()=>tocSheet('marks');
 if(tab==='marks'){$('#tocPanel').classList.add('bookmarks-view');renderMarks();return;}
 $('#tocPanel').innerHTML=`<label class="searchbox">${icon('search')}<input id="tocFilter" placeholder="搜索章节名称或序号" aria-label="搜索章节"></label><div class="toc-tools"><span id="tocCount"></span><button id="tocStart">开头</button><button id="locateCurrent">当前章节</button><button id="tocEnd">末尾</button></div><nav id="tocViewport" class="toc-viewport" aria-label="连续章节目录" tabindex="0"><div id="tocItems" class="toc-window"></div></nav>`;
 const ROW=72,viewport=$('#tocViewport'),items=$('#tocItems'),filter=$('#tocFilter');
 const all=book.chapters.map((c,i)=>({c,i}));let entries=all,frame=0,disposed=false,drawn='';
 // Only the visible rows occupy DOM nodes. Every chapter remains in one
 // continuous scroll range, with no pagination or chapter-count cutoff.
 function draw(force=false){
  if(disposed)return;const start=Math.max(0,Math.floor(viewport.scrollTop/ROW)-6),end=Math.min(entries.length,start+Math.ceil(viewport.clientHeight/ROW)+13),key=start+':'+end;
  if(!force&&key===drawn)return;drawn=key;items.style.height=(entries.length*ROW)+'px';
  items.innerHTML=entries.slice(start,end).map(({c,i},k)=>`<button class="list-item toc-row ${i===current?'current':''}" style="top:${(start+k)*ROW}px;height:${ROW}px" data-ch="${i}" aria-label="第 ${i+1} 章，${E(c.title)}" ${i===current?'aria-current="true"':''}><span class="index">${i+1}</span><span class="item-main"><strong>${E(c.title)}</strong></span>${i===current?icon('check'):''}</button>`).join('')||(entries.length?'':'<p class="note">没有找到相关章节。</p>');
 }
 function schedule(){cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>draw());}
 function countEntries(){ $('#tocCount').textContent=entries===all?`共 ${all.length} 章`:`${entries.length} / ${all.length} 章`;$('#tocStart').disabled=$('#tocEnd').disabled=entries.length===0; }
 function go(index){items.style.height=(entries.length*ROW)+'px';viewport.scrollTop=Math.max(0,index*ROW-(viewport.clientHeight-ROW)/2);draw(true);}
 filter.oninput=()=>{const query=filter.value.trim().toLowerCase();entries=query?all.filter(({c,i})=>c.title.toLowerCase().includes(query)||String(i+1)===query):all;viewport.scrollTop=0;countEntries();draw(true);};
 $('#locateCurrent').onclick=()=>{filter.value='';entries=all;countEntries();go(current);};
 $('#tocStart').onclick=()=>go(0);$('#tocEnd').onclick=()=>go(entries.length-1);
 items.onclick=e=>{const row=e.target.closest('[data-ch]');if(!row)return;saveReading();closeSheet();renderChapter(+row.dataset.ch,0);setTimeout(saveReading,80);};
 viewport.addEventListener('scroll',schedule,{passive:true});
 let observer;if(typeof ResizeObserver!=='undefined'){observer=new ResizeObserver(schedule);observer.observe(viewport);}
 sheetCleanup=()=>{disposed=true;cancelAnimationFrame(frame);if(observer)observer.disconnect();};
 countEntries();go(current);
}
function renderMarks(){
 const r=record(book.id);$('#tocPanel').innerHTML=r.marks.length?r.marks.slice().sort((a,b)=>a.chapter-b.chapter||a.offset-b.offset).map(m=>`<div class="list-item"><button class="item-main" data-jumpmark="${E(m.id)}"><strong>${E(book.chapters[m.chapter]?.title||'未知章节')}</strong><p>${E(m.note||m.excerpt||'我的书签')}</p></button><button class="iconbtn" data-editmark="${E(m.id)}" aria-label="编辑书签">${icon('more')}</button></div>`).join(''):`<div class="empty">${icon('mark')}<p>把喜欢的地方留下来<br>阅读时轻点书签按钮即可添加</p></div>`;
 $('#tocPanel').querySelectorAll('[data-jumpmark]').forEach(el=>el.onclick=()=>{const m=r.marks.find(x=>x.id===el.dataset.jumpmark);if(!m)return;const p=M.position(book,m);saveReading();closeSheet();renderChapter(p.chapter,p.offset);setTimeout(saveReading,80);});
 $('#tocPanel').querySelectorAll('[data-editmark]').forEach(el=>el.onclick=()=>{const m=r.marks.find(x=>x.id===el.dataset.editmark);openSheet('editmark','书签备注',book.chapters[m.chapter]?.title||'',`<label class="form-field">备注<input id="markNote" maxlength="180" placeholder="记下你喜欢它的理由" value="${E(m.note)}"></label><div class="action-row"><button class="secondary danger" id="removeMark">删除书签</button><button class="primary" id="saveMark">保存备注</button></div>`);$('#removeMark').onclick=()=>{r.marks=r.marks.filter(x=>x.id!==m.id);save();tocSheet('marks');};$('#saveMark').onclick=()=>{m.note=$('#markNote').value.trim();save();tocSheet('marks');};});
}
function rangeControl(k,label,min,max,step,unit=''){return `<label class="range-setting"><div><span>${label}</span><output id="value-${k}">${state.settings[k]}${unit}</output></div><input type="range" data-setting="${k}" min="${min}" max="${max}" step="${step}" value="${state.settings[k]}" aria-label="${label}"></label>`;}
function changeSetting(k,v){stopPageAnimation();clearTurnQueue();const p=anchor();if(book)saveReading();state.settings[k]=v;applyAppearance();save();if(view==='reader'&&['size','leading','pad','top','bottom','para','spacing','font','mode','justify'].includes(k))layoutReader(p);}
function currentPalette(){const s=state.settings;return M.themes[s.theme]||{bg:s.customBg,text:s.customText};}
function styleSheet(){
 const s=state.settings;openSheet('style','让这一页，刚刚好','设置会自动记住，下次继续使用',`
 <div class="theme-choices">${[...Object.entries(M.themes),['custom',{bg:s.customBg,text:s.customText}]].map(([key,t])=>`<button class="theme-choice ${s.theme===key?'selected':''}" data-theme="${key}"><span class="theme-chip " style="--chip:${t.bg};--ink:${t.text}">文</span>${({paper:'素纸',cream:'暖纸',parchment:'麦黄',green:'青竹',night:'夜读',custom:'自定义'})[key]}</button>`).join('')}</div>
 <div class="custom-colors">${[['customBg','背景'],['customText','文字']].map(([k,label])=>`<button class="color-choice" id="${k}" aria-label="调整${label}颜色"><i></i><span>${label}<small id="${k}Value"></small></span>${icon('right')}</button>`).join('')}</div>
 <div id="colorEditor" class="color-editor hidden" role="group" aria-labelledby="colorEditorTitle"><div class="color-editor-head"><strong id="colorEditorTitle"></strong><button id="closeColorEditor" class="color-done">完成</button></div><div id="colorPreview" class="color-preview">山有木兮，心有所属。</div>${[['h','色相',360],['s','饱和度',100],['v','明度',100]].map(([k,label,max])=>`<label class="range-setting"><div><span>${label}</span><output id="colorValue-${k}"></output></div><input type="range" data-color="${k}" min="0" max="${max}" step="1" aria-label="${label}"></label>`).join('')}<label class="color-hex">颜色代码<input id="colorHex" maxlength="7" spellcheck="false" autocomplete="off" aria-label="颜色代码"></label></div>
 <label class="row"><div><strong>仿纸纹理</strong><p>叠加在当前背景色上，所有配色均可使用。</p></div><input type="checkbox" id="paperTexture" ${s.paperTexture?'checked':''}></label>
 <div id="paperStrengthControl" class="${s.paperTexture?'':'hidden'}">${rangeControl('paperStrength','纸纹强度',0,100,5,'%')}</div>
 <p class="setting-title">FONT & LAYOUT · 字体与排版</p><div class="segmented" id="fontChoices">${[['serif','宋体 / 衬线'],['sans','黑体 / 无衬线'],['mono','等宽']].map(([k,t])=>`<button data-font="${k}" class="${s.font===k?'selected':''}">${t}</button>`).join('')}</div>
 ${rangeControl('size','字号',14,36,1,' px')}${rangeControl('leading','行距',1.4,2.6,.1,' 倍')}${rangeControl('pad','左右页边距',12,44,2,' px')}${rangeControl('top','上页边距',0,120,2,' px')}${rangeControl('bottom','下页边距',0,120,2,' px')}${rangeControl('para','段间距',4,28,2,' px')}${rangeControl('spacing','字间距',0,4,.5,' px')}
 <p class="setting-title">READING · 阅读方式</p><div class="segmented" id="modeChoices"><button data-mode="scroll" class="${s.mode==='scroll'?'selected':''}">上下滚动</button><button data-mode="paged" class="${s.mode==='paged'?'selected':''}">左右分页</button></div>
 ${rangeControl('swipeSensitivity','翻页灵敏度',0,100,5,'%')}<p class="note">灵敏度越高，滑动越短即可翻页。轻点左右两侧仍可直接翻页；竖向滑动不会触发翻页。</p>
 <p class="setting-title">翻页动画</p><div class="segmented animation-choices" id="animationChoices">${[['curl','仿真翻页'],['slide','平移'],['fade','淡入淡出'],['none','关闭']].map(([k,t])=>`<button data-animation="${k}" class="${s.pageAnimation===k?'selected':''}">${t}</button>`).join('')}</div><div id="animationSpeed" class="${s.pageAnimation==='none'?'hidden':''}">${rangeControl('animationMs','动画时长',120,420,20,' ms')}</div>
 <label class="row"><div><strong>音量键翻页</strong><p>音量减下一页，音量加上一页。滚动模式翻一屏；关闭后可正常调音量。</p></div><input type="checkbox" id="volumeKeys" ${s.volumeKeys?'checked':''}></label>
 <label class="row"><div><strong>两端对齐</strong><p>让每行文字左右对齐。</p></div><input type="checkbox" id="justify" ${s.justify?'checked':''}></label>
 <label class="row"><div><strong>阅读时保持屏幕常亮</strong></div><input type="checkbox" id="awake" ${s.awake?'checked':''}></label>
 <label class="row"><div><strong>全屏阅读</strong><p>隐藏系统栏，边缘滑动可暂时唤出。</p></div><input type="checkbox" id="full" ${s.full?'checked':''}></label>
 <label class="row"><div><strong>亮度跟随系统</strong></div><input type="checkbox" id="systemBrightness" ${s.brightness<0?'checked':''}></label><div id="brightnessControl" class="${s.brightness<0?'hidden':''}">${rangeControl('brightness','阅读亮度',3,100,1,'%')}</div>
 <p class="note">字体显示以手机系统提供的字体为准。分页模式：点左／右侧翻页；仿真翻页可跟手拖动，松手完成或回弹；点中间显示菜单。滚动模式可在一章末尾通过菜单切换章节。</p><button class="secondary wide" id="resetStyle">恢复默认阅读页面</button>`);
 let colorKey=null,colorHsv=null,painting=false;
 function updateColors(){const t=currentPalette();for(const [k,c] of [['customBg',t.bg],['customText',t.text]]){$('#'+k).style.setProperty('--swatch',c);$('#'+k+'Value').textContent=c.toUpperCase();}const chip=$('[data-theme="custom"] .theme-chip');chip.style.setProperty('--chip',s.customBg);chip.style.setProperty('--ink',s.customText);$('#colorPreview').style.background=t.bg;$('#colorPreview').style.color=t.text;}
 function paintEditor(hex){
  painting=true;try{
  $('#colorHex').value=hex.toUpperCase();for(const k of ['h','s','v']){const el=$('[data-color="'+k+'"]');el.value=colorHsv[k];el.dispatchEvent(new Event('input',{bubbles:true}));$('#colorValue-'+k).textContent=Math.round(colorHsv[k])+(k==='h'?'°':'%');}
  $('[data-color="h"]').style.setProperty('--range-bg','linear-gradient(90deg,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)');
  const hue=ReaderControls.hsvToHex({h:colorHsv.h,s:100,v:100});$('[data-color="s"]').style.setProperty('--range-bg',`linear-gradient(90deg,#fff,${hue})`);$('[data-color="v"]').style.setProperty('--range-bg',`linear-gradient(90deg,#000,${ReaderControls.hsvToHex({...colorHsv,v:100})})`);updateColors();
  }finally{painting=false;}
 }
 function seedEditor(){if(!colorKey)return;const hex=currentPalette()[colorKey==='customBg'?'bg':'text'];colorHsv=ReaderControls.rgbToHsv(hex);paintEditor(hex);}
 function selectTheme(k){if(k==='custom'&&s.theme!=='custom'){const t=currentPalette();s.customBg=t.bg;s.customText=t.text;}changeSetting('theme',k);$('#sheetBody').querySelectorAll('[data-theme]').forEach(b=>b.classList.toggle('selected',b.dataset.theme===k));updateColors();seedEditor();}
 $('#sheetBody').querySelectorAll('[data-theme]').forEach(b=>b.onclick=()=>selectTheme(b.dataset.theme));
 for(const k of ['customBg','customText'])$('#'+k).onclick=()=>{colorKey=k;$('#colorEditorTitle').textContent=k==='customBg'?'背景颜色':'文字颜色';$('#colorEditor').classList.remove('hidden');$('#customBg').classList.toggle('selected',k==='customBg');$('#customText').classList.toggle('selected',k==='customText');seedEditor();$('#colorEditor').scrollIntoView({block:'nearest'});};
 function applyColor(hex){if(s.theme!=='custom'){const t=currentPalette();s.customBg=t.bg;s.customText=t.text;s.theme='custom';}changeSetting(colorKey,hex);$('#sheetBody').querySelectorAll('[data-theme]').forEach(b=>b.classList.toggle('selected',b.dataset.theme==='custom'));updateColors();}
 $('#sheetBody').querySelectorAll('[data-color]').forEach(el=>el.oninput=()=>{if(painting||!colorKey)return;colorHsv[el.dataset.color]=+el.value;const hex=ReaderControls.hsvToHex(colorHsv);applyColor(hex);paintEditor(hex);});
 $('#colorHex').onchange=e=>{const hex=e.target.value.trim();if(/^#[0-9a-f]{6}$/i.test(hex)){colorHsv=ReaderControls.rgbToHsv(hex);applyColor(hex.toLowerCase());paintEditor(hex);}else seedEditor();};
 $('#closeColorEditor').onclick=()=>{$('#colorEditor').classList.add('hidden');$('#customBg').classList.remove('selected');$('#customText').classList.remove('selected');colorKey=null;};updateColors();
 $('#paperTexture').onchange=e=>{changeSetting('paperTexture',e.target.checked);$('#paperStrengthControl').classList.toggle('hidden',!e.target.checked);};
 $('#sheetBody').querySelectorAll('[data-font]').forEach(b=>b.onclick=()=>{changeSetting('font',b.dataset.font);$('#fontChoices').querySelectorAll('button').forEach(x=>x.classList.toggle('selected',x===b));});
 $('#sheetBody').querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{changeSetting('mode',b.dataset.mode);$('#modeChoices').querySelectorAll('button').forEach(x=>x.classList.toggle('selected',x===b));$('#gestureHint').textContent=b.dataset.mode==='paged'?'左右轻点或横滑翻页 · 中间轻点显示菜单':'轻点正文显示菜单 · 上下滚动阅读';});
 $('#sheetBody').querySelectorAll('[data-animation]').forEach(b=>b.onclick=()=>{changeSetting('pageAnimation',b.dataset.animation);$('#animationChoices').querySelectorAll('button').forEach(x=>x.classList.toggle('selected',x===b));$('#animationSpeed').classList.toggle('hidden',b.dataset.animation==='none');});
 $('#sheetBody').querySelectorAll('[data-setting]').forEach(el=>el.oninput=()=>{const k=el.dataset.setting,v=Number(el.value);changeSetting(k,v);$('#value-'+k).textContent=v+(k==='leading'?' 倍':['brightness','paperStrength','swipeSensitivity'].includes(k)?'%':k==='animationMs'?' ms':' px');});
 for(const k of ['justify','awake','full','volumeKeys'])$('#'+k).onchange=e=>changeSetting(k,e.target.checked);
 $('#systemBrightness').onchange=e=>{changeSetting('brightness',e.target.checked?-1:60);$('#brightnessControl').classList.toggle('hidden',e.target.checked);if(!e.target.checked){$('[data-setting="brightness"]').value=60;$('#value-brightness').textContent='60%';}};
 $('#resetStyle').onclick=()=>{const p=anchor();state.settings={...M.defaults,encoding:s.encoding,shelfDark:s.shelfDark};applyAppearance();save();layoutReader(p);styleSheet();notify('已恢复默认页面');};
}
function progressSheet(){const r=record(book.id);openSheet('progress','跳转阅读进度',`${current+1} / ${book.chapters.length} 章`,`
 <label class="range-setting"><div><span>全书进度</span><output id="progressValue">${(r.percent||0).toFixed(1)}%</output></div><input id="progressRange" type="range" min="0" max="100" step=".1" value="${r.percent||0}" aria-label="全书进度"></label><p id="targetChapter" class="note"></p><button id="jumpProgress" class="primary wide">跳转到这里</button>`);
 function target(){const n=total*Number($('#progressRange').value)/100;let i=prefix.length-1;while(i>0&&prefix[i]>n)i--;return M.position(book,{chapter:i,offset:Math.floor(n-prefix[i])});}
 function update(){const p=target();$('#progressValue').textContent=Number($('#progressRange').value).toFixed(1)+'%';$('#targetChapter').textContent=book.chapters[p.chapter].title;}
 $('#progressRange').oninput=update;$('#jumpProgress').onclick=()=>{const p=target();saveReading();closeSheet();renderChapter(p.chapter,p.offset);setTimeout(saveReading,90);};update();
}
function searchSheet(){
 openSheet('search','全文搜索',titleOf(book),`<label class="searchbox">${icon('search')}<input id="bookSearch" maxlength="80" placeholder="输入你想找的词句" aria-label="搜索小说正文"></label><div class="search-meta" id="searchMeta">输入至少 2 个字符，搜索整本小说。</div><div id="searchResults"></div>`);
 let timer;$('#bookSearch').oninput=()=>{clearTimeout(timer);const ticket=++queryToken;timer=setTimeout(()=>runSearch($('#bookSearch')?.value.trim()||'',ticket),220);};
}
async function runSearch(q,ticket){
 if(ticket!==queryToken||sheetType!=='search')return;
 if(q.length<2){$('#searchMeta').textContent='输入至少 2 个字符，搜索整本小说。';$('#searchResults').innerHTML='';return;}
 $('#searchMeta').textContent='正在查找…';const results=[],lower=q.toLowerCase();
 for(let i=0;i<book.chapters.length;i++){const c=book.chapters[i],text=c.text.toLowerCase();let at=0;
  while(results.length<80&&(at=text.indexOf(lower,at))>=0){results.push({chapter:i,offset:at,start:Math.max(0,at-25),end:Math.min(c.text.length,at+q.length+50)});at+=q.length;}
  if(results.length>=80)break;if(i%20===0){await new Promise(r=>setTimeout(r,0));if(ticket!==queryToken||sheetType!=='search')return;}
 }
 if(ticket!==queryToken||sheetType!=='search')return;$('#searchMeta').textContent=results.length?'找到 '+results.length+(results.length===80?' 处以上，显示前 80 处':' 处匹配'):'没有找到相关内容';
 $('#searchResults').innerHTML=results.map((r,i)=>{const c=book.chapters[r.chapter];return `<button class="list-item search-result" data-hit="${i}"><span class="item-main"><strong>${E(c.title)}</strong><p>${E(c.text.slice(r.start,r.offset))}<mark>${E(c.text.slice(r.offset,r.offset+q.length))}</mark>${E(c.text.slice(r.offset+q.length,r.end))}</p></span></button>`;}).join('');
 $('#searchResults').querySelectorAll('[data-hit]').forEach(el=>el.onclick=()=>{const r=results[+el.dataset.hit];saveReading();closeSheet();renderChapter(r.chapter,r.offset);setTimeout(()=>{let p=chapterNodes.findLast?chapterNodes.findLast(p=>p.offset<=r.offset):chapterNodes.slice().reverse().find(p=>p.offset<=r.offset);if(p)p.node.dataset.hit='true';saveReading();},100);});
}
function globalSettings(){const s=state.settings;openSheet('global','阅读，也可以很简单','一页阅读 1.0.0 · 完全离线',`
 <label class="row"><div><strong>深色书架</strong><p>阅读页面的主题可以单独设置。</p></div><input type="checkbox" id="shelfDark" ${s.shelfDark?'checked':''}></label>
 <button class="row wide" id="globalImport"><div><strong>导入本地小说</strong><p>TXT / EPUB，自动识别章节。</p></div>${icon('right')}</button>
 <button class="row wide" id="globalStyle"><div><strong>默认阅读页面</strong><p>字体、背景、翻页、常亮和亮度。</p></div>${icon('right')}</button>
 <button class="row wide" id="exportBackup"><div><strong>导出完整备份</strong><p>保存全部小说、进度、书签和页面设置为 ZIP。</p></div>${icon('right')}</button>
 <button class="row wide" id="restoreBackup"><div><strong>从备份恢复</strong><p>用一页阅读备份替换本机数据。</p></div>${icon('right')}</button>
 <button class="row wide" id="addDemo"><div><strong>添加示例小说</strong><p>《雨停之后》· 八章原创短篇。</p></div>${icon('plus')}</button>
 <p class="setting-title">使用小提示</p><p class="note">阅读进度会在滚动、翻页、切换章节和离开页面时自动保存。通过目录可查看或编辑书签，点右下角进度可跳转全书。返回键会先关闭菜单，再返回书架。</p><p class="note">不需要账号或网络权限。书籍会复制到应用私有空间；原文件移动后仍可阅读。卸载或清除应用数据会删除所有本地内容，请提前导出完整备份。单本导入上限 30 MB，备份恢复展开上限 250 MB。EPUB 图片、复杂排版和 DRM 加密不支持。</p>`);
 $('#shelfDark').onchange=e=>{state.settings.shelfDark=e.target.checked;save();applyAppearance();};$('#globalImport').onclick=importSheet;$('#globalStyle').onclick=styleSheet;
 $('#exportBackup').onclick=()=>{if(!N){notify('请在安卓安装版中导出完整备份');return;}saveReading();closeSheet();showBusy(true,'等待选择备份保存位置…');N.backup(false);};
 $('#restoreBackup').onclick=()=>{if(!N){notify('请在安卓安装版中恢复备份');return;}confirmSheet('用备份替换本机数据？','当前全部小说、书签和进度将被替换，建议先导出一份当前备份。选择文件后会先校验，失败时保留当前数据。',()=>{closeSheet();showBusy(true,'等待选择备份文件…');N.backup(true);});};
 $('#addDemo').onclick=async()=>{if(books.some(b=>b.id===M.demo().id)){notify('示例小说已经在书架里');return;}try{await storage.put(M.demo());await refresh();closeSheet();notify('示例小说已添加');}catch(e){notify(e.message);}};
}
window.nativeEvent=async(kind,message)=>{
 if(kind==='busy'){showBusy(true,message);return;}showBusy(false);
 if(kind==='imported'){try{await refresh();}catch{notify('书架刷新失败，请重新打开应用');}notify(message);}
 else if(kind==='restored'){view='shelf';book=null;state=M.state(N.loadState());$('#reader').classList.add('hidden');$('#shelf').classList.remove('hidden');applyAppearance();closeSheet();await refresh();notify(message);}
 else if(kind!=='cancel')notify(message);
};
window.handleBack=()=>{stopPageAnimation();down=null;if(busy)return true;if(sheetType){closeSheet();return true;}if(view==='reader'){if(!$('#reader').classList.contains('quiet')){$('#reader').classList.add('quiet');return true;}backShelf();return true;}save();return false;};
$('#importTop').onclick=importSheet;$('#globalSettings').onclick=globalSettings;$('#shelfSearch').oninput=renderShelf;$('#sortBooks').onchange=e=>{state.sort=e.target.value;save();renderShelf();};
$('#backShelf').onclick=backShelf;$('#readerTitle').onclick=()=>tocSheet();$('#toggleMark').onclick=()=>addMark(true);$('#addMark').onclick=()=>addMark();$('#openToc').onclick=()=>tocSheet();$('#openStyle').onclick=styleSheet;$('#openSearch').onclick=searchSheet;$('#prevChapter').onclick=()=>changeChapter(-1);$('#nextChapter').onclick=()=>changeChapter(1);$('#footProgress').onclick=progressSheet;
document.querySelectorAll('[data-quick-mode]').forEach(b=>b.onclick=()=>{changeSetting('mode',b.dataset.quickMode);});$('#prevPage').onclick=()=>turnPage(-1);$('#nextPage').onclick=()=>turnPage(1);
$('#closeSheet').onclick=closeSheet;$('#overlay').onclick=e=>{if(e.target===$('#overlay'))closeSheet();};$('#webImport').onchange=e=>webImport(e.target.files);
$('#readingBody').addEventListener('scroll',()=>{if(restoring||view!=='reader')return;clearTimeout(scrollTimer);scrollTimer=setTimeout(()=>{resumeAnchor=anchor();updateFoot();saveReading();},220);},{passive:true});
$('#readingBody').addEventListener('pointerdown',e=>{
 if(e.isPrimary===false){stopPageAnimation();down=null;return;}if(e.button!==0||sheetType||busy)return;
 stopPageAnimation();const now=eventClock(e);down={id:e.pointerId,x:e.clientX,y:e.clientY,time:now,samples:[{x:e.clientX,time:now}]};
},{passive:true});
$('#readingBody').addEventListener('pointermove',e=>{
 const p=down;if(!p||p.id!==e.pointerId||sheetType)return;
 const now=eventClock(e),dx=e.clientX-p.x,dy=e.clientY-p.y;
 p.samples.push({x:e.clientX,time:now});p.samples=p.samples.slice(-8);
 if(!p.curl){
  if(Math.abs(dx)<Math.min(10,M.swipeDistance(state.settings.swipeSensitivity)/2)||Math.abs(dx)<Math.abs(dy)*1.3||now-p.time>500||window.getSelection()?.toString())return;
  if(!beginCurl(p,dx<0?1:-1))return;
 }
 if(pageMotion!==p.curl)return;if(e.cancelable)e.preventDefault();
 const progress=M.clamp(-dx*p.curl.direction/$('#readingBody').clientWidth,0,1),tilt=M.clamp(dy/$('#readingBody').clientHeight*.2,-.09,.09);p.curl.engine.render(progress,tilt);
},{passive:false});
$('#readingBody').addEventListener('pointercancel',()=>{stopPageAnimation();down=null;},{passive:true});
$('#readingBody').addEventListener('lostpointercapture',e=>{if(e.target===$('#readingBody')&&down?.curl){stopPageAnimation();down=null;}},{passive:true});
$('#readingFrame').onclick=e=>{if(e.target===$('#readingFrame'))quiet();};
$('#readingBody').addEventListener('pointerup',e=>{
 if(!down||sheetType||down.id!==e.pointerId)return;const p=down;down=null;releasePointer(p);
 const now=eventClock(e),dx=e.clientX-p.x,dy=e.clientY-p.y,dt=now-p.time;
 if(p.curl){
  p.curl.engine.render(M.clamp(-dx*p.curl.direction/$('#readingBody').clientWidth,0,1),M.clamp(dy/$('#readingBody').clientHeight*.2,-.09,.09));
  if(p.samples[p.samples.length-1].x!==e.clientX)p.samples.push({x:e.clientX,time:now});
  const last=p.samples[p.samples.length-1],previous=p.samples[p.samples.length-2],velocity=previous&&now-last.time<100?-(last.x-previous.x)*p.curl.direction/Math.max(8,last.time-previous.time):0;
  finishCurl(p,ReaderCurl.shouldCommit(p.curl.engine.progress,velocity,M.swipeDistance(state.settings.swipeSensitivity)/$('#readingBody').clientWidth));return;
 }
 if(window.getSelection()?.toString())return;
 if(state.settings.pageAnimation==='curl'&&dt>500&&Math.abs(dx)>12)return;
 if(state.settings.mode==='paged'&&Math.abs(dx)>=M.swipeDistance(state.settings.swipeSensitivity)&&Math.abs(dx)>Math.abs(dy)*1.3&&dt<900){turnPage(dx<0?1:-1);return;}
 if(Math.abs(dx)>Math.min(12,M.swipeDistance(state.settings.swipeSensitivity)/2)||Math.abs(dy)>12||dt>400)return;
 if(state.settings.mode==='paged'){const box=$('#readingBody').getBoundingClientRect(),x=(e.clientX-box.left)/box.width;if(x<.26){turnPage(-1);return;}if(x>.74){turnPage(1);return;}}
 quiet();
},{passive:true});
document.addEventListener('keydown',e=>{
 if((e.key==='AudioVolumeDown'||e.key==='AudioVolumeUp')&&canVolumeNavigate()){e.preventDefault();window.readerVolumeTurn(e.key==='AudioVolumeDown'?1:-1);return;}
 if(e.key==='Escape'){window.handleBack();return;}
 if(sheetType&&e.key==='Tab'){const nodes=$('#sheet').querySelectorAll('button:not([disabled]),input,select,[tabindex="0"]');const active=Array.from(nodes).filter(n=>n.getClientRects().length);if(!active.length)return;const first=active[0],last=active[active.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}return;}
 if(view!=='reader'||sheetType||/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName))return;
 if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();if(state.settings.mode==='paged')turnPage(e.key==='ArrowRight'?1:-1);else changeChapter(e.key==='ArrowRight'?1:-1);}
});
window.addEventListener('resize',()=>{if(view!=='reader')return;stopPageAnimation();down=null;clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>layoutReader(resumeAnchor),80);});
document.addEventListener('visibilitychange',()=>{if(document.hidden){stopPageAnimation();down=null;clearTurnQueue();saveReading();}syncVolumeNavigation();});document.addEventListener('focusin',syncVolumeNavigation);document.addEventListener('focusout',()=>setTimeout(syncVolumeNavigation,0));document.addEventListener('selectionchange',syncVolumeNavigation);window.addEventListener('pagehide',()=>{stopPageAnimation();down=null;saveReading();});
const motionPreference=matchMedia('(prefers-reduced-motion: reduce)'),onMotionPreference=()=>{if(motionPreference.matches){stopPageAnimation();down=null;}};if(motionPreference.addEventListener)motionPreference.addEventListener('change',onMotionPreference);else motionPreference.addListener(onMotionPreference);
try{await refresh();if(!state.initialized){if(!books.length){await storage.put(M.demo());await refresh();}state.initialized=true;save();}applyAppearance();}
catch(e){notify('初始化失败：'+(e.message||'存储不可用'));}
// Small read-only hook used by the packaged interaction checks.
window.ReaderDebug={get state(){return state;},get current(){return current;},get book(){return book;},get page(){return page;},get pages(){return pages;},anchor};
})();
