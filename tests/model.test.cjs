const {test}=require('node:test'),assert=require('node:assert/strict');
const M=require('../assets/model.js');
test('chapter detection handles mixed headings, CRLF, prefatory material and no headings',()=>{
 const c=M.detect('\uFEFF前言正文\r\n第一章 开始\r\n中文正文。\r\n第 2 章 重逢\n继续。\nChapter III End\nEnd text.\n4. A final note\nMore text.');
 assert.equal(c.length,5);assert.equal(c[2].title,'第 2 章 重逢');assert.equal(c[1].text,'中文正文。');assert.equal(M.detect('单独的正文')[0].title,'正文');assert.deepEqual(M.detect(''),[]);
});
test('large novels produce bounded chunks without broken emoji',()=>{
 const c=M.detect(('长篇小说🌧\n').repeat(20000));assert(c.length>5);assert(c.every(x=>x.text.length<=16000));assert(c.every(x=>!/[\uD800-\uDBFF]$/.test(x.text)));assert.equal(c.map(x=>x.text).join('').replace(/\s/g,'').length,('长篇小说🌧').repeat(20000).length);
});
test('progress and positions are based on logical character offsets',()=>{
 const b={chapters:[{text:'abc'},{text:'1234567'}]};assert.deepEqual(M.position(b,{chapter:99,offset:999}),{chapter:1,offset:6});assert.equal(M.progress(b,{chapter:1,offset:2}),50);assert.deepEqual(M.starts(b),[0,3]);
});
test('paragraph map preserves original offsets despite indentation and blank lines',()=>{
 const text='　 第一段。\n\n  第二段。\n';const p=M.paragraphs(text);assert.equal(p.length,2);for(const x of p)assert.equal(text.slice(x.offset,x.offset+x.text.length),x.text);
});
test('settings recover from malformed data and constrain unsafe values',()=>{
 assert.equal(M.state('{bad').settings.theme,'cream');const s=M.state({settings:{size:999,pad:-9,leading:0,mode:'bad',theme:'bad',customBg:'url(x)',shelfDark:1}}).settings;assert.equal(s.size,36);assert.equal(s.pad,12);assert.equal(s.leading,1.4);assert.equal(s.theme,'cream');assert.equal(s.mode,'scroll');assert.equal(s.customBg,M.defaults.customBg);assert.equal(s.shelfDark,true);
});
test('original sample and metadata are consistent',()=>{
 const b=M.demo(),s=M.summary(b);assert.equal(b.chapters.length,8);assert.equal(s.chapterCount,8);assert(s.count>3000);assert.equal(s.id.length,24);
});
test('paper texture and volume controls migrate from previous state and validate settings',()=>{
 const old=M.state({settings:{theme:'cream',mode:'paged'},books:{a:{chapter:9}},initialized:true});assert.equal(old.settings.volumeKeys,true);assert.equal(old.settings.paperStrength,65);assert.equal(old.settings.theme,'cream');assert.equal(old.books.a.chapter,9);
 const fresh=M.state({settings:{theme:'parchment',paperStrength:300,volumeKeys:false}});assert.equal(fresh.settings.theme,'parchment');assert.equal(fresh.settings.paperStrength,100);assert.equal(fresh.settings.volumeKeys,false);assert(M.themes.parchment.bg.startsWith('#'));
});
test('vertical insets and animation preferences migrate and constrain values',()=>{
 const s=M.state({settings:{theme:'parchment',volumeKeys:true}}).settings;assert.equal(s.top,20);assert.equal(s.bottom,24);assert.equal(s.pageAnimation,'slide');assert.equal(s.animationMs,220);
 const bad=M.state({settings:{top:-50,bottom:999,pageAnimation:'weird',animationMs:3000}}).settings;assert.equal(bad.top,0);assert.equal(bad.bottom,120);assert.equal(bad.pageAnimation,'slide');assert.equal(bad.animationMs,420);
 assert.deepEqual(M.pageInsets(500,80,40),{top:80,bottom:40});assert.deepEqual(M.pageInsets(120,120,120),{top:20,bottom:20});assert.deepEqual(M.pageInsets(50,120,120),{top:0,bottom:0});
});

test('stability update restores a light effect once and preserves later choices and reading data',()=>{
 const old=M.state({curlIntroduced:true,settings:{pageAnimation:'curl',theme:'parchment',size:23},books:{x:{chapter:3022,offset:987}}});assert.equal(old.settings.pageAnimation,'slide');assert.equal(old.settings.size,23);assert.equal(old.settings.theme,'parchment');assert.equal(old.books.x.offset,987);
 for(const pageAnimation of ['slide','fade','none','curl'])assert.equal(M.state({animationFix:1,settings:{pageAnimation}}).settings.pageAnimation,pageAnimation);
 for(const pageAnimation of ['fade','none'])assert.equal(M.state({settings:{pageAnimation}}).settings.pageAnimation,pageAnimation);
});
test('independent texture migration preserves old paper appearance and explicit choices on every colour',()=>{
 assert.equal(M.state({settings:{theme:'parchment'}}).settings.paperTexture,true);
 assert.equal(M.state({settings:{theme:'cream'}}).settings.paperTexture,false);
 for(const theme of [...Object.keys(M.themes),'custom'])for(const paperTexture of [true,false])assert.equal(M.state({settings:{theme,paperTexture}}).settings.paperTexture,paperTexture);
 assert.equal(M.state({settings:{swipeSensitivity:500}}).settings.swipeSensitivity,100);
 assert.equal(M.state({settings:{swipeSensitivity:-4}}).settings.swipeSensitivity,0);
 assert(M.swipeDistance(100)<M.swipeDistance(50)&&M.swipeDistance(50)<M.swipeDistance(0));
 assert(M.swipeDistance(100)<=9);
});
test('colour editing starts from the exact current RGB colour, including greys and saturated hues',()=>{
 const C=require('../assets/reader-controls.js');
 for(const hex of ['#000000','#ffffff','#808080','#ff0000','#00ff00','#0000ff','#e3ecdf','#f5e9c2','#354537','#ab7943'])assert.equal(C.hsvToHex(C.rgbToHsv(hex)),hex);
 const curl=require('../assets/page-curl.js');assert.equal(curl.shouldCommit(.03,0,.02),true);assert.equal(curl.shouldCommit(.03,0,.2),false);assert.equal(curl.shouldCommit(.4,-.8,.2),false);
});
