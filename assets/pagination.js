/* Native text wrapping, with explicit page fragments to keep full-page bottoms aligned. */
(function(root){
'use strict';
function fit(article,body,paragraphs){
 const viewport=body.getBoundingClientRect(),width=body.clientWidth,source=new Map(paragraphs.map(p=>[p.node,p]));
 const byPage=[];
 function charPage(node,index){const r=document.createRange();r.setStart(node,index);r.setEnd(node,Math.min(node.length,index+1));const x=r.getBoundingClientRect();return Math.max(0,Math.floor((x.left+x.width/2-viewport.left)/width));}
 // Read every native column before changing the DOM. The browser supplies line breaks,
 // punctuation rules and font shaping; binary searches find the exact source offsets.
 for(const element of article.children){
  const node=element.firstChild;if(!node?.length)continue;
  const style=getComputedStyle(element),leading=parseFloat(style.lineHeight),range=document.createRange();range.selectNodeContents(element);
  const groups=[];
  for(const r of range.getClientRects()){
   const page=Math.max(0,Math.floor((r.left+r.width/2-viewport.left)/width));
   let group=groups[groups.length-1];if(!group||group.page!==page){group={page,lines:[]};groups.push(group);}
   const line=group.lines[group.lines.length-1];
   if(line&&Math.abs((line.top+line.bottom-r.top-r.bottom)/2)<leading*.45){line.top=Math.min(line.top,r.top);line.bottom=Math.max(line.bottom,r.bottom);}
   else group.lines.push({top:r.top,bottom:r.bottom});
  }
  let start=0;
  for(const group of groups){
   let lo=start,hi=node.length;
   while(lo<hi){const mid=Math.floor((lo+hi)/2);if(charPage(node,mid)<=group.page)lo=mid+1;else hi=mid;}
   const end=lo;if(end<=start)continue;
   const first=group.lines[0],last=group.lines[group.lines.length-1],text=node.data.slice(start,end),original=source.get(element);
   const f={tag:element.tagName.toLowerCase(),page:group.page,text,start,leading,lines:group.lines.length,
    top:first.top-viewport.top-(leading-(first.bottom-first.top))/2,
    bottom:last.bottom-viewport.top+(leading-(last.bottom-last.top))/2,
    offset:original?original.offset+start:null,hit:!!element.dataset.hit,justifyEnd:style.textAlign==='justify'&&end<node.length};
   (byPage[f.page]||(byPage[f.page]=[])).push(f);start=end;
  }
 }
 const pages=Math.max(1,byPage.length),output=document.createDocumentFragment(),nodes=[];
 byPage.forEach((items,index)=>{
  const lines=items.reduce((n,f)=>n+f.lines,0),last=items[items.length-1];
  // Spread the sub-line remainder across inter-line spaces. Leave chapter endings
  // at the user's natural spacing; a short final page must not be stretched.
  const extra=index<pages-1&&lines>1?Math.max(0,body.clientHeight-last.bottom)/(lines-1):0;
  let preceding=0;
  for(const f of items){
   const element=document.createElement(f.tag);element.className='page-fragment';element.textContent=f.text;
   element.style.left=f.page*width+'px';element.style.top=(f.top+preceding*extra-extra/2)+'px';element.style.lineHeight=f.leading+extra+'px';
   if(f.start>0)element.style.textIndent='0';
   if(f.justifyEnd)element.style.textAlignLast='justify';
   if(f.offset!==null){element.dataset.offset=f.offset;if(f.hit)element.dataset.hit='true';nodes.push({text:f.text,offset:f.offset,node:element});}
   output.append(element);preceding+=f.lines;
  }
 });
 article.classList.add('fitted-pages');article.style.columnWidth='';article.replaceChildren(output);
 return{pages,nodes};
}
root.ReaderPagination={fit};
})(window);
