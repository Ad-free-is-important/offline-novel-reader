/* Drag ranges relative to their starting value; a tap never moves a setting. */
(function(root){
'use strict';
const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));
function rgbToHsv(hex){
 const [r,g,b]=hex.slice(1).match(/../g).map(n=>parseInt(n,16)/255),max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min;
 let h=0;if(d)h=max===r?((g-b)/d)%6:max===g?(b-r)/d+2:(r-g)/d+4;
 return{h:(h*60+360)%360,s:max?d/max*100:0,v:max*100};
}
function hsvToHex({h,s,v}){
 const c=v/100*s/100,x=c*(1-Math.abs((h/60)%2-1)),m=v/100-c;
 const rgb=h<60?[c,x,0]:h<120?[x,c,0]:h<180?[0,c,x]:h<240?[0,x,c]:h<300?[x,0,c]:[c,0,x];
 return'#'+rgb.map(n=>Math.round((n+m)*255).toString(16).padStart(2,'0')).join('');
}
function dragOnlyRanges(container){
 container.querySelectorAll('input[type="range"]').forEach(el=>{
  if(el.dataset.dragOnly)return;el.dataset.dragOnly='true';let pointer=null;
  const target=document.createElement('span');target.className='range-gesture';el.before(target);target.append(el);
  const paint=()=>el.style.setProperty('--range-progress',((+el.value-+el.min)/(+el.max-+el.min)*100)+'%');paint();el.addEventListener('input',paint);
  target.addEventListener('pointerdown',e=>{
   if(e.button!==0||e.isPrimary===false)return;e.preventDefault();el.focus({preventScroll:true});
   pointer={id:e.pointerId,x:e.clientX,y:e.clientY,value:+el.value,dragging:false,vertical:false};
   try{target.setPointerCapture(e.pointerId);}catch{}
  });
  target.addEventListener('pointermove',e=>{
   const p=pointer;if(!p||e.pointerId!==p.id||p.vertical)return;const dx=e.clientX-p.x,dy=e.clientY-p.y;
   if(!p.dragging){if(Math.abs(dy)>8&&Math.abs(dy)>Math.abs(dx)){p.vertical=true;return;}if(Math.abs(dx)<4||Math.abs(dx)<Math.abs(dy)*1.15)return;p.dragging=true;}
   if(e.cancelable)e.preventDefault();const step=+el.step||1,min=+el.min,max=+el.max,width=Math.max(1,el.getBoundingClientRect().width-18);
   const value=clamp(min+Math.round((p.value+dx/width*(max-min)-min)/step)*step,min,max);
   if(+el.value!==value){el.value=String(value);el.dispatchEvent(new Event('input',{bubbles:true}));}
  },{passive:false});
  const release=e=>{if(!pointer||pointer.id!==e.pointerId)return;const moved=pointer.dragging;pointer=null;try{if(target.hasPointerCapture(e.pointerId))target.releasePointerCapture(e.pointerId);}catch{}if(moved)el.dispatchEvent(new Event('change',{bubbles:true}));};
  target.addEventListener('pointerup',release);target.addEventListener('pointercancel',release);target.addEventListener('lostpointercapture',()=>pointer=null);
  target.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();});
 });
}
root.ReaderControls={rgbToHsv,hsvToHex,dragOnlyRanges};if(typeof module!=='undefined')module.exports=root.ReaderControls;
})(typeof window==='undefined'?globalThis:window);
