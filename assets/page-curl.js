/* Two text snapshots and a fully covered, blank reverse paper surface. */
(function(root){
'use strict';
const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));
function shouldCommit(progress,velocity,threshold=.32){return velocity<-.35?false:progress>=threshold||(progress>Math.min(.045,threshold*.45)&&velocity>.5);}
function create({mount,front,under,direction,contentTop,contentLeft=0}){
 const width=mount.clientWidth,height=mount.clientHeight,bandWidth=Math.min(width*.23,105),shadowWidth=80;
 const layer=document.createElement('div');layer.className='page-motion curl-stage';layer.setAttribute('aria-hidden','true');layer.style.setProperty('--page-content-left',contentLeft+'px');
 function paper(snapshot){const el=document.createElement('div');el.className='curl-paper';el.style.width=width+'px';el.style.height=height+'px';if(snapshot){snapshot.style.top=contentTop+'px';el.append(snapshot);}return el;}
 const below=paper(under),face=paper(front),clip=document.createElement('div'),fold=document.createElement('div'),back=paper(null),shade=document.createElement('div'),shadow=document.createElement('div'),edge=document.createElement('div');
 clip.className='curl-front-clip';clip.style.width=width+'px';clip.style.height=height+'px';face.classList.add('curl-face');clip.append(face);
 fold.className='curl-fold';fold.style.width=bandWidth+'px';back.classList.add('curl-back');back.style.width=bandWidth+'px';shade.className='curl-shade';fold.append(back,shade);
 shadow.className='curl-shadow';shadow.style.width=shadowWidth+'px';edge.className='curl-edge';layer.append(below,clip,shadow,fold,edge);
 let value=0,frame=0,pending=null,dead=false;
 function render(progress){
  if(dead)return;value=clamp(progress,0,1);
  const wave=Math.sin(Math.PI*value),band=bandWidth*Math.pow(Math.max(0,wave),.72),left=width*(1-value)-band*.26,crease=left+band;
  const shift=direction>0?left-width:width-left;
  // Fixed-size clipping boxes move over counter-translated page textures. No
  // changing clip paths, strip widths or full-page visibility at frame time.
  clip.style.transform=`translate3d(${shift}px,0,0)`;face.style.transform=`translate3d(${-shift}px,0,0)`;
  fold.style.transform=direction>0?`translate3d(${left}px,0,0) scaleX(${band/bandWidth})`:`translate3d(${width-left}px,0,0) scaleX(${-band/bandWidth})`;
  shadow.style.transform=direction>0?`translate3d(${crease}px,0,0) scaleX(${band/bandWidth})`:`translate3d(${width-crease}px,0,0) scaleX(${-band/bandWidth})`;shadow.style.opacity=String(wave*.35);
  edge.style.transform=`translate3d(${direction>0?left:width-left}px,0,0)`;edge.style.opacity=String(wave*.35);
  layer.dataset.progress=value.toFixed(4);layer.dataset.fold=(direction>0?left:width-left).toFixed(2);
 }
 function flush(){frame=0;if(pending!==null){const p=pending;pending=null;render(p);}}
 function setProgress(progress){if(dead)return;value=clamp(progress,0,1);pending=value;if(!frame)frame=requestAnimationFrame(flush);}
 function animate(target,duration,done){
  cancelAnimationFrame(frame);pending=null;const from=value,start=performance.now();
  const tick=now=>{if(dead)return;const t=clamp((now-start)/Math.max(1,duration),0,1),e=1-Math.pow(1-t,3);render(from+(target-from)*e);if(t<1)frame=requestAnimationFrame(tick);else{frame=0;if(done)done();}};
  frame=requestAnimationFrame(tick);
 }
 function destroy(){dead=true;cancelAnimationFrame(frame);layer.remove();}
 render(0);mount.append(layer);return{layer,render:setProgress,animate,destroy,get progress(){return value;}};
}
root.ReaderCurl={create,shouldCommit};if(typeof module!=='undefined')module.exports=root.ReaderCurl;
})(typeof window==='undefined'?globalThis:window);
