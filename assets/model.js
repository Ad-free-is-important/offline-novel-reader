(function(root){
'use strict';
const defaults={theme:'cream',customBg:'#f1e7d4',customText:'#40392f',font:'serif',size:21,leading:1.9,spacing:0,pad:26,para:14,mode:'scroll',justify:false,awake:true,full:false,brightness:-1,encoding:'auto',shelfDark:false,volumeKeys:true,paperStrength:65,paperTexture:false,swipeSensitivity:50,top:20,bottom:24,pageAnimation:'slide',animationMs:220};
const themes={paper:{bg:'#faf9f5',text:'#30332e'},cream:{bg:'#f6f1e7',text:'#393d34'},parchment:{bg:'#f5e9c2',text:'#514b3b'},green:{bg:'#e3ecdf',text:'#354537'},night:{bg:'#1c231f',text:'#b8c3b6'}};
function clamp(v,lo,hi){v=Number(v);return Number.isFinite(v)?Math.min(hi,Math.max(lo,v)):lo;}
function state(raw){let x={};try{x=typeof raw==='string'?JSON.parse(raw):raw||{};}catch{}const s={...defaults,...x.settings};
for(const [k,lo,hi] of [['size',14,36],['leading',1.4,2.6],['spacing',0,4],['pad',12,44],['para',4,28],['brightness',-1,100],['paperStrength',0,100],['top',0,120],['bottom',0,120],['animationMs',120,420],['swipeSensitivity',0,100]])s[k]=clamp(s[k],lo,hi);
if(![...Object.keys(themes),'custom'].includes(s.theme))s.theme='cream';
if(typeof x.settings?.paperTexture!=='boolean')s.paperTexture=s.theme==='parchment';
if(!['scroll','paged'].includes(s.mode))s.mode='scroll';if(!['serif','sans','mono'].includes(s.font))s.font='serif';
if(!['curl','slide','fade','none'].includes(s.pageAnimation))s.pageAnimation='slide';
if(!x.animationFix&&s.pageAnimation==='curl')s.pageAnimation='slide';
for(const k of ['customBg','customText'])if(!/^#[a-f0-9]{6}$/i.test(s[k]))s[k]=defaults[k];
for(const k of ['awake','full','justify','shelfDark','volumeKeys','paperTexture'])s[k]=!!s[k];
return{version:1,curlIntroduced:true,animationFix:1,settings:s,books:x.books&&typeof x.books==='object'&&!Array.isArray(x.books)?x.books:{},last:typeof x.last==='string'?x.last:'',sort:['recent','added','title'].includes(x.sort)?x.sort:'recent',initialized:!!x.initialized};}
function position(book,pos){const ch=Math.floor(clamp(pos?.chapter||0,0,book.chapters.length-1));return{chapter:ch,offset:Math.floor(clamp(pos?.offset||0,0,Math.max(0,book.chapters[ch].text.length-1)))}}
function starts(book){let sum=0;return book.chapters.map(c=>{const n=sum;sum+=c.text.length;return n;});}
function pageInsets(height,top,bottom){height=Math.max(0,Number(height)||0);top=clamp(top,0,120);bottom=clamp(bottom,0,120);const available=Math.max(0,height-80),sum=top+bottom,scale=sum>available&&sum>0?available/sum:1;return{top:top*scale,bottom:bottom*scale};}
function progress(book,pos){const p=position(book,pos);const total=book.chapters.reduce((n,c)=>n+c.text.length,0);return total?Math.min(100,((starts(book)[p.chapter]+p.offset)/total)*100):0;}
function paragraphs(text){const out=[];for(const m of text.matchAll(/[^\n]+/g)){const line=m[0].trim();if(!line)continue;const offset=m.index+m[0].indexOf(line);out.push({text:line,offset});}return out;}
function detect(text){text=text.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').trim();const regex=/^[\t \u3000]{0,8}((?:第[\t \u3000]*[0-9０-９零〇一二三四五六七八九十百千万两兩]+[\t \u3000]*[章节節回卷部篇集][^\n]{0,65}|(?:chapter|book|part)\s+[0-9ivxlcdm]+[^\n]{0,65}|(?:楔子|序章|序言|前言|引子|终章|尾声|后记|番外)(?:[ ：:·—-][^\n]{0,55})?|[0-9]{1,5}[.、．]\s*[^\n。！？!?；;]{1,45}))[\t \u3000]*$/gim;let from=0,title='前言',matched=false;const out=[];
function push(t,b){b=b.trim();let part=1;while(b.length){let n=Math.min(16000,b.length);if(n<b.length){const k=b.lastIndexOf('\n',n);if(k>8000)n=k;if(/[\uD800-\uDBFF]/.test(b[n-1]))n--;}out.push({title:t+(part===1?'':' · 续'+part),text:b.slice(0,n).trim()});b=b.slice(n).trim();part++;}}
for(const m of text.matchAll(regex)){const b=text.slice(from,m.index);if(b.trim())push(matched?title:'前言',b);title=m[1].trim();from=m.index+m[0].length;matched=true;}if(text.slice(from).trim())push(matched?title:'正文',text.slice(from));return out;}
function summary(book){return{id:book.id,title:book.title,author:book.author||'本地小说',format:book.format||'TXT',added:book.added,count:book.chapters.reduce((n,c)=>n+c.text.length,0),chapterCount:book.chapters.length};}
function demo(){const passages=[
['第一章 旧书店的灯','傍晚六点，城市刚刚下过一场雨。林舟站在路口，看见巷子深处的那盏灯又亮了。\n那是一家没有招牌的旧书店。玻璃窗上蒙着一层薄雾，门口搁着两盆绿萝，叶尖还挂着水珠。\n他记得这里上个月就已经关门了。\n“进来躲一会儿吧。”门里有人说。\n林舟推开门，铃铛轻轻响了一声。扑面而来的，是纸张、木头和一点点茶的气味。窗外的车流好像忽然远了，只剩下墙上那只老钟，一下一下地走。\n柜台后坐着一位头发花白的老人。她没有抬头，只将手里的书翻过一页。\n“我不是来买书的。”林舟说。\n“没关系。大多数故事，也不是从准备好的时候开始。”\n老人指了指窗边的椅子。桌上放着一本灰绿色的笔记本，封面没有名字，第一页却写着一句话：如果雨停了，你想去哪里？'],
['第二章 没有寄出的信','笔记本的纸页泛着温柔的米黄色。林舟伸手摸了摸，指腹感到细小的纹理。他忽然想起很久以前，母亲也有这样一本本子，用来记录菜价、电话号码，以及一些旁人看来无关紧要的事。\n书店的老人端来一杯热茶。\n“这是谁留下的？”\n“一个赶路的人。”\n“他还会回来吗？”\n老人看着窗外，没有马上回答。雨水沿着玻璃慢慢滑下，将对面的灯光拉成长长的线。\n笔记本里夹着一封没有封口的信。信纸上只有很短的一段话：我到海边了。这里的风很大，连难过的事情，也能吹散一点。等你有空，我们一起去看看。\n落款的日期，是十年前的今天。\n林舟把信放回原处。窗外有人撑伞经过，伞面是一片明亮的黄色。那颜色在灰蒙蒙的街道里一闪，像一只忽然飞起的小鸟。'],
['第三章 去海边的车票','林舟已经很久没有坐过慢车。他的生活总是在赶路，赶地铁，赶会议，赶那些连自己也说不清终点的日子。\n但那个周六，他买了一张去临海小城的车票。没有订返程，也没有做攻略。出门时，他把那本笔记本放进了背包。老人说，借走就好，什么时候读完，什么时候再还。\n火车沿着河岸向南。窗边的树木一棵接着一棵后退，远处的山慢慢变矮，天空开始露出淡淡的蓝。\n邻座的小女孩正在画画。她画了一座房子，一只猫，还有一片比房子大得多的海。\n“你见过海吗？”她问。\n“见过，不过很久了。”\n“那你今天可以重新见一次。”\n林舟笑了。原来有些事情，是可以重新见一次的。\n他翻开笔记本，在那句问话下面，认真写下了两个字：海边。'],
['第四章 风经过的地方','小城的车站很小，走出站台，就能闻到空气里淡淡的咸味。街边的早餐店还没有收摊，老板把蒸笼一层层摞起来，热气在阳光里散开。\n林舟沿着一条缓缓下坡的路，走到了海边。\n海并没有想象中那么蓝。近岸的水是灰绿色的，浪花很轻，带着细碎的泡沫，反复抚平沙地上的脚印。远处停着几艘渔船，像纸上没有写完的字。\n他在防波堤上坐下，第一次没有拿出手机。\n风从海面上来，翻动笔记本的纸页。某一页里，画着和眼前几乎一样的灯塔。灯塔旁写着：这里的日落很好看，可惜今天阴天。\n林舟抬头，望向逐渐放晴的天空。\n“那就替你等一次吧。”他小声说。\n有些等待并不需要结果。只要坐在这里，听见风，听见海，就已经足够。'],
['第五章 灯塔下的咖啡馆','灯塔下有一家小咖啡馆。门口的黑板上写着：今天的特调，是不着急。\n店主是个年轻女人，正在给一只胖橘猫梳毛。看见林舟进来，她把猫轻轻放下，问他想喝什么。\n“一杯不着急。”\n她笑起来，拿出一个有缺口的陶杯。\n林舟把笔记本放在桌上。女人的目光停了一瞬。\n“这个本子，我好像见过。”\n原来十年前，她父亲也曾经来过这家咖啡馆。那时这里还是一家渔具店。他在店门口坐了一下午，画了灯塔，又写了一封信。\n“后来呢？”林舟问。\n“后来他回家了。他说，有时候出发，是为了知道自己想回到哪里。”\n咖啡很烫。林舟捧着杯子，看猫在阳光里伸了个懒腰。许多绕了很远的路，似乎都在那个普通的下午，悄悄接上了。'],
['第六章 一场缓慢的日落','日落开始的时候，整个海面都安静下来。云层从灰白变成浅金，再一点一点变成橘红。远处的灯塔还没有亮灯，轮廓像一枚放在天边的书签。\n林舟坐在堤岸上，把这些颜色写进笔记本。他写得很慢，像怕惊动什么。\n小时候，他觉得长大就是可以去很多地方。后来，他才发现，长大也可能是越来越少有时间，认真看一个地方。\n手机振动了一下，是母亲发来的消息：今天吃饭了吗？\n他拍了一张海的照片，发了过去。\n没过多久，电话响了。\n“你怎么跑海边去了？”\n“想来看看。”\n电话那头安静了一会儿，然后母亲笑了。\n“挺好的。多坐一会儿吧。”\n太阳沉下去之前，林舟忽然觉得，自己并没有错过所有的事情。还有一些风景，还来得及看。'],
['第七章 把故事带回去','回程的火车比来时更慢。林舟靠着车窗，听车轮经过轨道接缝时，发出有节奏的轻响。\n笔记本里多了一张车票，一张日落的照片，以及咖啡馆店主写下的地址。\n他没有找到什么惊人的答案。生活还是原来的生活，明天依然有工作，账单依然要付，城市里的雨也不会就此停下。\n但有些东西好像变了。\n他知道，从家里到海边，只需要三个小时。他知道，那家旧书店还亮着灯。他还知道，母亲其实也很久没有出门旅行了。\n“下次一起去吧。”他发了一条消息。\n窗外的天空渐渐暗了，田野里亮起稀疏的灯。每一盏灯后面，都有某个人正在过自己的日子。\n林舟将笔记本合上，轻轻放进背包。故事暂时停在这里。但停下来，也是一种继续。'],
['第八章 雨停之后','一周后，林舟又走进了那条巷子。书店的门开着，绿萝长出了两片新叶。\n老人还是坐在柜台后，戴着细框眼镜，正在给一本书贴新的封皮。\n“读完了？”\n“还没有。”林舟说，“不过，我想先还给你。”\n他把笔记本放在桌上。老人翻到最后，看见新添的车票和照片，点了点头。\n“看来天气不错。”\n“是的。”\n门外又下起了雨。这一次，林舟没有急着离开。他选了一本书，坐到窗边那把椅子上。\n有一个年轻人站在门口，犹豫着要不要进来。老人抬起头，说了那句熟悉的话：\n“进来躲一会儿吧。”\n铃铛响了。茶还是热的。那只老钟，一下一下地走。\n林舟低下头，翻开了新的一页。']];
return{id:'a11e00000000000000000001',title:'雨停之后',author:'原创示例',format:'示例',added:Date.now(),chapters:passages.map(([title,text])=>({title,text:text+'\n\n'+['窗外的光线缓缓移动，落在书页上，像一条安静的小河。林舟没有急着翻页。他发现，读得慢一些的时候，每一个字都会有自己的声音。','城市里的声音渐渐退到很远的地方。他把呼吸放轻，给这个故事，也给自己，留下一点不被打扰的时间。'].join('\n')}))};}
function swipeDistance(sensitivity){return 100-clamp(sensitivity,0,100)*.92;}
root.ReaderModel={swipeDistance,defaults,themes,state,clamp,position,starts,pageInsets,progress,paragraphs,detect,summary,demo};
if(typeof module!=='undefined')module.exports=root.ReaderModel;
})(typeof window==='undefined'?globalThis:window);
