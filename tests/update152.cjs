/* Change the covered page's ink/background and compare pixels inside the fold.
   CSS opacity=1 alone cannot detect a transformed paper missing its clip. */
const fs=require('fs'),path=require('path'),http=require('http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright');
const ROOT=path.resolve(__dirname,'..'),QA=path.resolve(ROOT,'../qa-v152');fs.mkdirSync(QA,{recursive:true});
const server=http.createServer((req,res)=>{const n=req.url==='/'?'index.html':req.url.slice(1);if(!/^[a-z.-]+$/.test(n))return res.writeHead(404).end();const f=path.join(ROOT,'assets',n);if(!fs.existsSync(f))return res.writeHead(404).end();res.setHeader('Content-Type',n.endsWith('.js')?'application/javascript':n.endsWith('.css')?'text/css':n.endsWith('.svg')?'image/svg+xml':'text/html');res.end(fs.readFileSync(f));});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({executablePath:process.env.CHROMIUM_BINARY,args:['--no-sandbox']}),p=await browser.newPage({viewport:{width:393,height:850},deviceScaleFactor:2}),errors=[],measurements=[];p.on('pageerror',e=>errors.push(e.message));
 const wait=()=>p.waitForTimeout(55);
 async function compare(a,b,roi){return p.evaluate(async({a,b,roi})=>{async function pixels(data){const img=new Image();img.src='data:image/png;base64,'+data;await img.decode();const cv=document.createElement('canvas');cv.width=img.width;cv.height=img.height;const ctx=cv.getContext('2d');ctx.drawImage(img,0,0);return ctx.getImageData(roi.x,roi.y,roi.width,roi.height).data;}const [x,y]=await Promise.all([pixels(a),pixels(b)]);let sum=0,changed=0;for(let i=0;i<x.length;i+=4){let max=0;for(let c=0;c<3;c++){const d=Math.abs(x[i+c]-y[i+c]);sum+=d;max=Math.max(max,d);}if(max>8)changed++;}return{meanChannelDifference:sum/(x.length/4*3),changedPixelFraction:changed/(x.length/4)};},{a:a.toString('base64'),b:b.toString('base64'),roi});}
 try{
  await p.goto('http://127.0.0.1:'+server.address().port);await p.waitForSelector('#resumeBook');await p.locator('#resumeBook').click();await wait();await p.locator('#reader').evaluate(e=>e.classList.add('quiet'));await p.waitForTimeout(250);
  for(const theme of [{name:'cream',bg:'#f6f1e7',texture:false},{name:'paper',bg:'#f5e9c2',texture:true},{name:'night',bg:'#1c231f',texture:false},{name:'custom-paper',bg:'#384c60',texture:true}]){
   await p.evaluate(theme=>{document.documentElement.style.setProperty('--rbg',theme.bg);document.querySelector('#reader').classList.toggle('paper-texture',theme.texture);document.body.classList.toggle('dark',theme.name==='night'||theme.name==='custom-paper');},theme);
   for(const direction of [1,-1]){
    await p.evaluate(direction=>{const mount=document.querySelector('#reader'),body=document.querySelector('#readingBody'),box=body.getBoundingClientRect(),root=mount.getBoundingClientRect();function snapshot(color,text){const s=document.createElement('div');s.className='reading-body page-snapshot';Object.assign(s.style,{width:body.clientWidth+'px',height:body.clientHeight+'px',backgroundColor:color,color:'#000',fontSize:'32px',lineHeight:'1.5'});s.textContent=text.repeat(300);return s;}window.underProbe=snapshot('#fa00cf','AAAA透出检测');window.frontProbe=snapshot('#ffb000','BBBB纸背检测');window.probeEngine=ReaderCurl.create({mount,front:frontProbe,under:underProbe,direction,contentTop:box.top-root.top,contentLeft:box.left-root.left});},direction);
    for(const progress of [.04,.2,.5,.8,.96]){
     await p.evaluate(progress=>{underProbe.style.backgroundColor='#fa00cf';underProbe.style.color='#000';probeEngine.render(progress);},progress);await wait();
     const roi=await p.locator('.curl-fold').evaluate(el=>{const r=el.getBoundingClientRect(),body=document.querySelector('#readingBody').getBoundingClientRect(),d=devicePixelRatio,x=Math.ceil((Math.max(0,r.left)+2)*d),end=Math.floor((Math.min(innerWidth,r.right)-2)*d),y=Math.ceil((body.top+15)*d),bottom=Math.floor((body.bottom-15)*d);return{x,y,width:end-x,height:bottom-y};});assert(roi.width>0);
     const a=await p.screenshot();await p.evaluate(()=>{underProbe.style.backgroundColor='#00ffe0';underProbe.style.color='#fff';underProbe.textContent='CCCC下一页完全换字'.repeat(300);});await wait();const b=await p.screenshot();const delta=await compare(a,b,roi);measurements.push({theme:theme.name,direction,progress,roi,...delta});
     assert(delta.meanChannelDifference<.05&&delta.changedPixelFraction===0,'covered content leaked through fold '+JSON.stringify(measurements.at(-1)));
    }
    assert.equal(await p.locator('.curl-fold .page-snapshot').count(),0,'reverse paper must not clone body text');
    assert.equal(await p.locator('.curl-stage .page-snapshot').count(),2);
    await p.evaluate(()=>probeEngine.destroy());
   }
  }
  assert.deepEqual(errors,[]);fs.writeFileSync(QA+'/results.json',JSON.stringify({passed:['covered-page colour and text changes produce identical fold pixels at five positions, in both directions and four themes','the rolled side is a matching blank opaque paper surface with no copied text','two text snapshots retain bounded animation structure'],measurements,errors,physicalAndroidTested:false},null,2));console.log('PASS 40 pixel occlusion comparisons: no underlying ink or colour visible through the fold.');
 }catch(e){await p.screenshot({path:QA+'/'+(process.env.CAPTURE_BASELINE?'baseline-leak.png':'failure.png')});fs.writeFileSync(QA+'/'+(process.env.CAPTURE_BASELINE?'baseline.json':'failure.json'),JSON.stringify({measurements,error:e.message},null,2));throw e;}finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e.message);process.exit(1)});
