package com.adfree.reader;

import android.app.Activity;
import android.os.*;
import android.content.Intent;
import android.content.res.Configuration;
import android.database.Cursor;
import android.graphics.Color;
import android.net.Uri;
import android.provider.OpenableColumns;
import android.view.*;
import android.webkit.*;
import android.widget.FrameLayout;
import android.text.Html;
import android.util.AtomicFile;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.zip.*;
import org.json.*;

public class MainActivity extends Activity {
    private static final String ORIGIN="https://reader.local/";
    private static final int IMPORT=71, BACKUP=72, RESTORE=73, MAX_FILE=30*1024*1024;
    private WebView web; private FrameLayout root;
    private volatile boolean destroyed;
    private String encoding="auto", chromeColor="#F6F5F0";
    private boolean darkChrome=false;
    private boolean resumed=false,volumeRequested=false;
    private volatile int safeLeft=0,safeTop=0,safeRight=0,safeBottom=0;
    private final VolumeKeyController volumeKeys=new VolumeKeyController();
    private final Object lock=new Object();
    private final AtomicBoolean working=new AtomicBoolean(false);
    private File dataDir() { return new File(getFilesDir(),"reader-data"); }
    private File booksDir() { return new File(dataDir(),"books"); }

    @Override public void onCreate(Bundle bundle) {
        super.onCreate(bundle);
        // Recover an interrupted directory swap before creating a fresh library.
        File prior=new File(getFilesDir(),"reader-old");
        if(!dataDir().exists()&&prior.exists()) prior.renameTo(dataDir());
        booksDir().mkdirs();
        if (Build.VERSION.SDK_INT>=30) getWindow().setDecorFitsSystemWindows(false);
        else getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE|View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN|View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
        root=new FrameLayout(this);
        root.setOnApplyWindowInsetsListener((view,insets)->{
            int keyboard=0;
            if (Build.VERSION.SDK_INT>=30) {
                android.graphics.Insets bars=insets.getInsets(WindowInsets.Type.systemBars()|WindowInsets.Type.displayCutout());
                android.graphics.Insets ime=insets.getInsets(WindowInsets.Type.ime());
                safeLeft=bars.left; safeTop=bars.top; safeRight=bars.right;
                keyboard=ime.bottom>bars.bottom?ime.bottom:0; safeBottom=keyboard>0?0:bars.bottom;
            } else {
                safeLeft=insets.getSystemWindowInsetLeft(); safeTop=insets.getSystemWindowInsetTop(); safeRight=insets.getSystemWindowInsetRight();
                int bottom=insets.getSystemWindowInsetBottom();
                keyboard=bottom>getResources().getDisplayMetrics().heightPixels/4?bottom:0; safeBottom=keyboard>0?0:bottom;
            }
            // Paint the same paper beneath system bars; only text/control insets
            // belong in CSS. The IME still reduces the WebView's usable height.
            view.setPadding(0,0,0,keyboard);
            if(web!=null)eval("window.readerInsets && window.readerInsets("+safeLeft+","+safeTop+","+safeRight+","+safeBottom+")");
            return insets;
        });
        web=new WebView(this);
        if(Build.VERSION.SDK_INT>=33) getOnBackInvokedDispatcher().registerOnBackInvokedCallback(android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT,()->handleBack());
        WebSettings s=web.getSettings(); s.setJavaScriptEnabled(true); s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false); s.setAllowContentAccess(false); s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setSupportMultipleWindows(false);
        if (Build.VERSION.SDK_INT>=33) s.setAlgorithmicDarkeningAllowed(false);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.addJavascriptInterface(new Bridge(),"ReaderNative");
        web.setWebViewClient(new WebViewClient(){
            @Override public WebResourceResponse shouldInterceptRequest(WebView view,WebResourceRequest req) {
                Uri uri=req.getUrl(); String path=uri.getPath();
                if (!"https".equals(uri.getScheme())||!"reader.local".equals(uri.getHost())) return empty(403,"Forbidden");
                try {
                    if (path!=null && path.matches("/books/[a-f0-9]{24}\\.json")) {
                        synchronized(lock) { return new WebResourceResponse("application/json","UTF-8",new AtomicFile(new File(booksDir(),path.substring(7))).openRead()); }
                    }
                    if (path==null||path.equals("/")) path="/index.html";
                    if (!path.matches("/[A-Za-z0-9_.-]+")) return empty(404,"Not Found");
                    String mime=path.endsWith(".html")?"text/html":path.endsWith(".js")?"application/javascript":path.endsWith(".css")?"text/css":path.endsWith(".svg")?"image/svg+xml":"text/plain";
                    return new WebResourceResponse(mime,"UTF-8",getAssets().open(path.substring(1)));
                } catch(Exception ex) { return empty(404,"Not Found"); }
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request) { return true; }
        });
        root.addView(web,new FrameLayout.LayoutParams(-1,-1)); setContentView(root); applyChrome(chromeColor,false); root.requestApplyInsets(); web.loadUrl(ORIGIN);
    }
    private WebResourceResponse empty(int code,String reason) { return new WebResourceResponse("text/plain","UTF-8",code,reason,null,new ByteArrayInputStream(new byte[0])); }
    private void eval(String js) { if (!destroyed) web.evaluateJavascript(js,null); }
    private void event(String kind,String message) {
        runOnUiThread(()->eval("window.nativeEvent && window.nativeEvent("+JSONObject.quote(kind)+","+JSONObject.quote(message)+")"));
    }
    private static byte[] readLimited(InputStream stream,int max) throws IOException {
        if (stream==null) throw new IOException("无法读取文件");
        ByteArrayOutputStream out=new ByteArrayOutputStream(); byte[] buffer=new byte[16384]; int n;
        while ((n=stream.read(buffer))!=-1) { if (out.size()+n>max) throw new IOException("文件超过允许大小"); out.write(buffer,0,n); }
        return out.toByteArray();
    }
    private static String readText(File file,int limit) throws IOException {
        AtomicFile af=new AtomicFile(file);
        try(InputStream in=af.openRead()) { return new String(readLimited(in,limit),StandardCharsets.UTF_8); }
    }
    private static void atomic(File file,String text) throws IOException {
        file.getParentFile().mkdirs(); AtomicFile af=new AtomicFile(file); FileOutputStream out=null;
        try { out=af.startWrite(); out.write(text.getBytes(StandardCharsets.UTF_8)); af.finishWrite(out); }
        catch(IOException ex) { if(out!=null) af.failWrite(out); throw ex; }
    }
    private static boolean idValid(String id) { return id!=null && id.matches("[a-f0-9]{24}"); }
    private JSONObject validateBook(JSONObject book) throws Exception {
        String id=book.getString("id"); if(!idValid(id)) throw new Exception("书籍标识无效");
        JSONArray chapters=book.getJSONArray("chapters"); if(chapters.length()==0) throw new Exception("小说没有可读取的章节");
        long count=0;
        for(int i=0;i<chapters.length();i++) { JSONObject c=chapters.getJSONObject(i); if(c.getString("title").length()>300) throw new Exception("章节标题过长"); count+=c.getString("text").length(); }
        if(count>MAX_FILE) throw new Exception("小说正文过大");
        JSONObject meta=new JSONObject();
        meta.put("id",id); meta.put("title",book.optString("title","未命名小说").substring(0,Math.min(150,book.optString("title","未命名小说").length())));
        String author=book.optString("author","本地小说");
        meta.put("author",author.substring(0,Math.min(150,author.length()))); meta.put("format",book.optString("format","TXT"));
        meta.put("count",count); meta.put("chapterCount",chapters.length()); meta.put("added",book.optLong("added",System.currentTimeMillis()));
        return meta;
    }
    private void writeBook(JSONObject book,File destination) throws Exception {
        JSONObject meta=validateBook(book); String id=meta.getString("id");
        book.put("title",meta.getString("title")); book.put("author",meta.getString("author"));
        atomic(new File(destination,id+".json"),book.toString()); atomic(new File(destination,id+".meta"),meta.toString());
    }
    private void applyChrome(String color,boolean dark) {
        chromeColor=color; darkChrome=dark; int bg=Color.parseColor(color); root.setBackgroundColor(bg); web.setBackgroundColor(bg);
        getWindow().setStatusBarColor(Color.TRANSPARENT); getWindow().setNavigationBarColor(Color.TRANSPARENT);
        if(Build.VERSION.SDK_INT>=29) { getWindow().setStatusBarContrastEnforced(false); getWindow().setNavigationBarContrastEnforced(false); }
        int flags=getWindow().getDecorView().getSystemUiVisibility(), light=View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR|View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
        getWindow().getDecorView().setSystemUiVisibility(dark?flags&~light:flags|light);
    }
    public final class Bridge {
        @JavascriptInterface public String insets() { return "["+safeLeft+","+safeTop+","+safeRight+","+safeBottom+"]"; }
        @JavascriptInterface public String loadState() { synchronized(lock) { try { return readText(new File(dataDir(),"state.json"),3*1024*1024); } catch(Exception ex) { return ""; } } }
        @JavascriptInterface public boolean saveState(String json) {
            if(json==null||json.length()>3*1024*1024||destroyed) return false;
            synchronized(lock) { try { new JSONObject(json); atomic(new File(dataDir(),"state.json"),json); return true; } catch(Exception ex) { return false; } }
        }
        @JavascriptInterface public String listBooks() {
            synchronized(lock) {
                JSONArray list=new JSONArray(); File[] files=booksDir().listFiles(); if(files==null) return "[]";
                for(File f:files) if(f.getName().endsWith(".meta")) try { list.put(new JSONObject(readText(f,50000))); } catch(Exception ex) { }
                return list.toString();
            }
        }
        @JavascriptInterface public boolean storeBook(String json) { synchronized(lock) { try { if(json==null||json.length()>MAX_FILE) return false; writeBook(new JSONObject(json),booksDir()); return true; } catch(Exception ex) { return false; } } }
        @JavascriptInterface public boolean deleteBook(String id) {
            if(!idValid(id)) return false;
            synchronized(lock) { File f=new File(booksDir(),id+".json"); if(f.exists()&&!f.delete()) return false; new AtomicFile(f).delete(); new AtomicFile(new File(booksDir(),id+".meta")).delete(); return true; }
        }
        @JavascriptInterface public void importBooks(String charset) {
            if(!working.compareAndSet(false,true)) { event("error","已有文件任务正在进行"); return; }
            encoding=Arrays.asList("auto","UTF-8","GB18030","Big5","UTF-16LE","UTF-16BE").contains(charset)?charset:"auto";
            runOnUiThread(()->{
                Intent intent=new Intent(Intent.ACTION_OPEN_DOCUMENT); intent.addCategory(Intent.CATEGORY_OPENABLE); intent.setType("*/*"); intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE,true);
                try { startActivityForResult(intent,IMPORT); } catch(Exception ex) { working.set(false); event("error","无法打开文件选择器"); }
            });
        }
        @JavascriptInterface public void backup(boolean restore) {
            if(!working.compareAndSet(false,true)) { event("error","已有文件任务正在进行"); return; }
            runOnUiThread(()->{
                Intent intent=new Intent(restore?Intent.ACTION_OPEN_DOCUMENT:Intent.ACTION_CREATE_DOCUMENT); intent.addCategory(Intent.CATEGORY_OPENABLE); intent.setType(restore?"*/*":"application/zip");
                if(!restore) intent.putExtra(Intent.EXTRA_TITLE,"一页阅读-完整备份-"+new java.text.SimpleDateFormat("yyyyMMdd-HHmmss",Locale.US).format(new Date())+".zip");
                try { startActivityForResult(intent,restore?RESTORE:BACKUP); } catch(Exception ex) { working.set(false); event("error","无法打开文件选择器"); }
            });
        }
        @JavascriptInterface public void chrome(String color,boolean dark) { if(color!=null&&color.matches("#[a-fA-F0-9]{6}")) runOnUiThread(()->{if(!destroyed) applyChrome(color,dark);}); }
        @JavascriptInterface public void volumePaging(boolean enabled) {
            runOnUiThread(()->{volumeRequested=enabled;volumeKeys.setEnabled(enabled&&resumed&&!working.get()&&!destroyed);});
        }
        @JavascriptInterface public void screen(boolean awake,boolean full,int brightness) {
            runOnUiThread(()->{
                if(destroyed) return;
                if(awake) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON); else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                WindowManager.LayoutParams p=getWindow().getAttributes(); p.screenBrightness=brightness<0?-1f:Math.max(.03f,Math.min(1f,brightness/100f)); getWindow().setAttributes(p);
                if(Build.VERSION.SDK_INT>=30) {
                    WindowInsetsController c=getWindow().getInsetsController();
                    if(c!=null) { c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE); if(full) c.hide(WindowInsets.Type.systemBars()); else c.show(WindowInsets.Type.systemBars()); }
                } else {
                    int flags=getWindow().getDecorView().getSystemUiVisibility();
                    int mask=View.SYSTEM_UI_FLAG_FULLSCREEN|View.SYSTEM_UI_FLAG_HIDE_NAVIGATION|View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY;
                    getWindow().getDecorView().setSystemUiVisibility(full?flags|mask:flags&~mask);
                }
            });
        }
    }
    private String displayName(Uri uri) {
        try(Cursor c=getContentResolver().query(uri,new String[]{OpenableColumns.DISPLAY_NAME},null,null,null)) { if(c!=null&&c.moveToFirst()) return c.getString(0); } catch(Exception ex) { }
        return "未命名.txt";
    }
    private String digest(byte[] bytes) throws Exception {
        byte[] hash=MessageDigest.getInstance("SHA-256").digest(bytes); StringBuilder s=new StringBuilder(); for(int i=0;i<12;i++) s.append(String.format(Locale.US,"%02x",hash[i]&255)); return s.toString();
    }
    private JSONObject importOne(Uri uri,String charset) throws Exception {
        String name=displayName(uri); String lower=name.toLowerCase(Locale.ROOT);
        if(!lower.endsWith(".txt")&&!lower.endsWith(".epub")) throw new Exception("仅支持 TXT 或未加密 EPUB");
        byte[] bytes; try(InputStream input=getContentResolver().openInputStream(uri)) { bytes=readLimited(input,MAX_FILE); }
        if(bytes.length==0) throw new Exception("文件为空");
        String id=digest(bytes);
        synchronized(lock) { if(new File(booksDir(),id+".meta").exists()) throw new Exception("这本书已经在书架中"); }
        JSONObject book;
        if(lower.endsWith(".epub")) book=parseEpub(bytes,name);
        else {
            String text=ReaderParser.decode(bytes,charset);
            if(text.trim().length()==0) throw new Exception("文件没有正文");
            book=new JSONObject(); book.put("title",name.substring(0,name.length()-4)); book.put("author","本地小说"); book.put("format","TXT");
            book.put("chapters",chaptersJson(ReaderParser.parse(text)));
        }
        book.put("id",id); book.put("added",System.currentTimeMillis());
        synchronized(lock) { writeBook(book,booksDir()); }
        return validateBook(book);
    }
    private JSONArray chaptersJson(List<ReaderParser.Chapter> chapters) throws Exception {
        JSONArray a=new JSONArray(); for(ReaderParser.Chapter c:chapters) { JSONObject o=new JSONObject(); o.put("title",c.title); o.put("text",c.text); a.put(o); } return a;
    }
    private String plain(String html) { return Html.fromHtml(html.replaceAll("(?is)<(script|style|head)\\b[^>]*>.*?</\\1>",""),Html.FROM_HTML_MODE_LEGACY).toString().replace('\u00a0',' ').trim(); }
    private JSONObject parseEpub(byte[] bytes,String name) throws Exception {
        File temp=File.createTempFile("epub-",".zip",getCacheDir());
        try {
            try(FileOutputStream out=new FileOutputStream(temp)) { out.write(bytes); }
            EpubReader.Result result=EpubReader.read(temp, html->plain(html));
            JSONObject book=new JSONObject(); book.put("title",result.title.isEmpty()?name.substring(0,name.length()-5):result.title);
            book.put("author",result.author.isEmpty()?"本地小说":result.author); book.put("format","EPUB"); book.put("chapters",chaptersJson(result.chapters)); return book;
        } finally { temp.delete(); }
    }
    private void zipFile(ZipOutputStream zip,String name,File file) throws Exception {
        zip.putNextEntry(new ZipEntry(name)); try(InputStream input=new FileInputStream(file)) { byte[] b=new byte[16384]; int n; while((n=input.read(b))!=-1) zip.write(b,0,n); } zip.closeEntry();
    }
    private void exportBackup(Uri uri) throws Exception {
        synchronized(lock) {
            try(ZipOutputStream zip=new ZipOutputStream(getContentResolver().openOutputStream(uri,"wt"))) {
                zip.putNextEntry(new ZipEntry("backup.json")); zip.write("{\"format\":\"ye-reader\",\"version\":1}".getBytes(StandardCharsets.UTF_8)); zip.closeEntry();
                File state=new File(dataDir(),"state.json"); if(state.exists()) zipFile(zip,"state.json",state);
                File[] files=booksDir().listFiles(); if(files!=null) for(File f:files) if(f.getName().matches("[a-f0-9]{24}\\.json")) zipFile(zip,"books/"+f.getName(),f);
            }
        }
    }
    private static void deleteTree(File f) { File[] a=f.listFiles(); if(a!=null) for(File child:a) deleteTree(child); f.delete(); }
    private void restoreBackup(Uri uri) throws Exception {
        File stage=new File(getFilesDir(),"restore-staging"),old=new File(getFilesDir(),"reader-old"); deleteTree(stage); stage.mkdirs(); boolean manifest=false; int count=0; long total=0; Set<String> seen=new HashSet<>();
        try {
            try(ZipInputStream zip=new ZipInputStream(getContentResolver().openInputStream(uri))) {
                ZipEntry e;
                while((e=zip.getNextEntry())!=null) {
                    String n=e.getName(); if(e.isDirectory()) continue;
                    if(!n.equals("backup.json")&&!n.equals("state.json")&&!n.matches("books/[a-f0-9]{24}\\.json")) throw new Exception("不是一页阅读备份");
                    if(!seen.add(n)||++count>1002) throw new Exception("备份文件无效");
                    byte[] bytes=readLimited(zip,64*1024*1024); total+=bytes.length; if(total>250L*1024*1024) throw new Exception("备份展开后超过 250 MB");
                    JSONObject obj=new JSONObject(new String(bytes,StandardCharsets.UTF_8));
                    if(n.equals("backup.json")) { if(!"ye-reader".equals(obj.optString("format"))||obj.optInt("version")!=1) throw new Exception("备份版本不支持"); manifest=true; }
                    else if(n.equals("state.json")) { if(bytes.length>3*1024*1024) throw new Exception("阅读记录过大"); atomic(new File(stage,"state.json"),obj.toString()); }
                    else { if(!n.equals("books/"+obj.optString("id")+".json")) throw new Exception("书籍标识不匹配"); writeBook(obj,new File(stage,"books")); }
                }
            }
            if(!manifest) throw new Exception("不是一页阅读备份");
            new File(stage,"books").mkdirs();
            synchronized(lock) {
                deleteTree(old);
                if(!dataDir().renameTo(old)) throw new Exception("无法替换本机数据");
                if(!stage.renameTo(dataDir())) { old.renameTo(dataDir()); throw new Exception("恢复失败，已保留原数据"); }
            }
            deleteTree(old);
        } finally { deleteTree(stage); }
    }
    @Override protected void onActivityResult(int req,int result,Intent data) {
        super.onActivityResult(req,result,data);
        if(req!=IMPORT&&req!=BACKUP&&req!=RESTORE) return;
        if(result!=RESULT_OK||data==null) { working.set(false); event("cancel",""); return; }
        List<Uri> uris=new ArrayList<>();
        if(req==IMPORT&&data.getClipData()!=null) { for(int i=0;i<Math.min(20,data.getClipData().getItemCount());i++) uris.add(data.getClipData().getItemAt(i).getUri()); }
        else if(data.getData()!=null) uris.add(data.getData());
        if(uris.isEmpty()) { working.set(false); event("cancel",""); return; }
        String chosenEncoding=encoding;
        new Thread(()->{
            try {
                if(req==IMPORT) {
                    int ok=0; String lastError="";
                    for(int i=0;i<uris.size();i++) {
                        event("busy","正在导入 "+(i+1)+" / "+uris.size());
                        try { importOne(uris.get(i),chosenEncoding); ok++; } catch(Exception ex) { lastError=displayName(uris.get(i))+"："+(ex.getMessage()==null?"解码失败，请切换 TXT 编码重试":ex.getMessage()); }
                    }
                    event("imported",ok>0?"已导入 "+ok+" 本"+(ok<uris.size()?"；"+lastError:""):lastError);
                } else if(req==BACKUP) { event("busy","正在导出完整备份…"); exportBackup(uris.get(0)); event("done","完整备份已保存"); }
                else { event("busy","正在恢复备份…"); restoreBackup(uris.get(0)); event("restored","备份已恢复"); }
            } catch(Exception ex) { event("error",ex.getMessage()==null?"文件处理失败，请重试":ex.getMessage()); }
            finally { working.set(false); }
        },"reader-files").start();
    }
    private void handleBack() { web.evaluateJavascript("window.handleBack ? window.handleBack() : false",result->{if(!"true".equals(result)) finish();}); }
    @Override public void onBackPressed() { handleBack(); }
    @Override public boolean dispatchKeyEvent(KeyEvent event) {
        int action=volumeKeys.event(event.getKeyCode(),event.getAction(),event.getRepeatCount(),event.getEventTime());
        if(action==VolumeKeyController.PASS)return super.dispatchKeyEvent(event);
        if(action==VolumeKeyController.PREVIOUS||action==VolumeKeyController.NEXT) {
            int direction=action==VolumeKeyController.NEXT?1:-1;
            eval("window.readerVolumeTurn && window.readerVolumeTurn("+direction+")");
        }
        return true;
    }
    @Override protected void onPause() { resumed=false;volumeKeys.reset();if(web!=null) eval("window.saveReading && window.saveReading()"); super.onPause(); }
    @Override protected void onResume() { super.onResume();resumed=true;volumeKeys.setEnabled(volumeRequested&&!working.get()); }
    @Override public void onConfigurationChanged(Configuration c) { super.onConfigurationChanged(c); applyChrome(chromeColor,darkChrome); eval("window.layoutReader && window.layoutReader()"); }
    @Override protected void onDestroy() { destroyed=true; if(web!=null) { web.removeJavascriptInterface("ReaderNative"); web.destroy(); } super.onDestroy(); }
}
