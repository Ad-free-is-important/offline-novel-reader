const fs=require('fs'),path=require('path'),http=require('http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright');
const ROOT=path.resolve(__dirname,'..'),QA=path.resolve(ROOT,'../qa-v142');fs.mkdirSync(QA,{recursive:true});
const server=http.createServer((req,res)=>{const name=req.url==='/'?'index.html':req.url.slice(1);if(!/^[a-z.-]+$/.test(name))return res.writeHead(404).end();const f=path.join(ROOT,'assets',name);if(!fs.existsSync(f))return res.writeHead(404).end();res.setHeader('Content-Type',name.endsWith('.js')?'application/javascript':name.endsWith('.css')?'text/css':name.endsWith('.svg')?'image/svg+xml':'text/html');res.end(fs.readFileSync(f));});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_BINARY,args:['--no-sandbox']}),p=await browser.newPage({viewport:{width:393,height:850},deviceScaleFactor:2,isMobile:true,hasTouch:true}),passed=[],errors=[],measurements=[];
 p.on('pageerror',e=>errors.push(e.message));const wait=()=>p.waitForTimeout(200),pass=s=>{passed.push(s);console.log('PASS '+s);};
 async function controls(){if(await p.locator('#reader').evaluate(e=>e.classList.contains('quiet')))await p.locator('#readingBody').tap({position:{x:(await p.locator('#readingBody').boundingBox()).width/2,y:150}});}
 async function settings(values,mode){await controls();await p.locator('#openStyle').click();if(mode)await p.locator(`[data-mode="${mode}"]`).click();for(const [key,value] of Object.entries(values)){await p.locator(`[data-setting="${key}"]`).fill(String(value));await p.locator(`[data-setting="${key}"]`).dispatchEvent('input');}await p.locator('[data-theme="parchment"]').click();await p.locator('[data-animation="none"]').click();await p.locator('#closeSheet').click();await wait();}
 const geometry=()=>p.evaluate(()=>{
  const rect=id=>{const r=document.querySelector(id).getBoundingClientRect();return{top:r.top,bottom:r.bottom,height:r.height};},reader=rect('#reader'),frame=rect('#readingFrame'),body=rect('#readingBody'),footer=rect('.reader-foot'),glyphs=[];
  for(const el of document.querySelectorAll('#article h1,#article p')){const range=document.createRange();range.selectNodeContents(el);for(const r of range.getClientRects())if(r.left>=0&&r.right<=innerWidth+.5&&r.bottom>body.top&&r.top<body.bottom)glyphs.push({top:r.top,bottom:r.bottom});}
  return{reader,frame,body,footer,firstGlyphTop:Math.min(...glyphs.map(r=>r.top)),lastGlyphBottom:Math.max(...glyphs.map(r=>r.bottom)),page:ReaderDebug.page,pages:ReaderDebug.pages,anchor:ReaderDebug.anchor()};
 });
 try{
  await p.goto('http://127.0.0.1:'+server.address().port);await p.waitForSelector('#resumeBook');
  const text='第一章 满页阅读\n'+Array.from({length:85},(_,i)=>`第${i+1}段。晚风翻动书页，窗外是安静的街道。每一行文字都接着上一行，故事沿着纸张一直向前。`.repeat(i%3+1)).join('\n');
  await p.locator('#webImport').setInputFiles({name:'顶部满页回归.txt',mimeType:'text/plain',buffer:Buffer.from(text)});await p.waitForFunction(()=>document.querySelector('#bookCount').textContent==='2');await p.locator('.book-card').filter({hasText:'顶部满页回归'}).locator('.book-open').click();await wait();
  await settings({top:0,bottom:0,size:18,leading:1.8,pad:22},'paged');
  await p.evaluate(()=>readerVolumeTurn(1));await wait();let g=await geometry();
  assert.equal(g.frame.top,g.reader.top);assert.equal(g.body.top,g.reader.top);assert.equal(g.body.bottom,g.footer.top);assert.equal(g.frame.bottom,g.footer.top);
  assert(g.firstGlyphTop-g.reader.top>=-.75&&g.firstGlyphTop-g.reader.top<16,JSON.stringify(g));assert(g.body.bottom-g.lastGlyphBottom<16,JSON.stringify(g));
  measurements.push({mode:'paged',...g});await p.screenshot({path:QA+'/full-page-paged.png'});pass('zero margins fill the page from its top to the compact footer, with no hidden toolbar gap');
  await p.evaluate(()=>{window.fitCount=0;const fit=ReaderPagination.fit;ReaderPagination.fit=(...args)=>{fitCount++;return fit(...args);};});
  const before=await geometry();
  for(let i=0;i<4;i++){await p.locator('#readingBody').tap({position:{x:190,y:150}});await wait();assert.deepEqual(await geometry(),before);}
  assert.equal(await p.evaluate(()=>fitCount),0);await controls();
  assert.equal(await p.locator('.reader-top').evaluate(el=>getComputedStyle(el).backgroundColor),await p.locator('#readerDock').evaluate(el=>getComputedStyle(el).backgroundColor));
  assert.equal(await p.evaluate(()=>(()=>{const r=document.querySelector('#backShelf').getBoundingClientRect();return document.elementFromPoint(r.left+r.width/2,r.top+r.height/2).closest('button')?.id;})()),'backShelf');
  await p.screenshot({path:QA+'/menu-overlays-page.png'});pass('menus overlay readable controls without moving text, changing the reading record, or repaginating');
  await settings({top:0,bottom:0},'scroll');await p.locator('#footProgress').click();await p.locator('#progressRange').fill('0');await p.locator('#jumpProgress').click();await wait();
  g=await geometry();assert.equal(g.body.top,g.reader.top);assert(g.firstGlyphTop-g.reader.top>=-.75&&g.firstGlyphTop-g.reader.top<20,JSON.stringify(g));assert.equal(await p.locator('#article h1').evaluate(e=>getComputedStyle(e).fontWeight),'700');
  await p.locator('#readingBody').evaluate(e=>e.scrollTop=600);await wait();const scrolled=await geometry();assert.equal(scrolled.body.top,scrolled.reader.top);assert(await p.locator('#readingBody').evaluate(e=>e.scrollTop)>500);measurements.push({mode:'scroll',...g});pass('continuous reading also starts at zero, retains bold headings, and keeps its viewport full while scrolling');
  await settings({top:36,bottom:54},'paged');g=await geometry();assert.equal(g.body.top-g.reader.top,36);assert.equal(g.footer.top-g.body.bottom,54);
  await p.reload();await p.waitForSelector('#resumeBook');await p.locator('#resumeBook').click();await wait();g=await geometry();assert.equal(g.body.top-g.reader.top,36);assert.equal(g.footer.top-g.body.bottom,54);
  for(const size of [{width:320,height:650},{width:850,height:393}]){await p.setViewportSize(size);await wait();await settings({top:0,bottom:0});g=await geometry();assert.equal(g.body.top,g.reader.top);assert.equal(g.body.bottom,g.footer.top);assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));measurements.push({viewport:size,...g});}
  pass('custom margins survive restart and zero margins fill narrow and landscape screens');
  assert.deepEqual(errors,[]);fs.writeFileSync(QA+'/results.json',JSON.stringify({passed,measurements,errors,physicalAndroidTested:false},null,2));
 }catch(e){await p.screenshot({path:QA+'/failure.png'});throw e;}
 finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exit(1);});
