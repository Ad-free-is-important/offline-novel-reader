package com.adfree.reader;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.regex.*;
import java.util.zip.*;
import javax.xml.parsers.*;
import org.w3c.dom.*;
import org.xml.sax.InputSource;

/** EPUB package/spine/TOC handling. Rendering to plain text is supplied by Android. */
public final class EpubReader {
    public interface PlainText { String convert(String html); }
    public static final class Result {
        public String title="",author="";
        public final List<ReaderParser.Chapter> chapters=new ArrayList<>();
    }
    private static Document xml(byte[] bytes) throws Exception {
        DocumentBuilderFactory f=DocumentBuilderFactory.newInstance();f.setNamespaceAware(true);f.setExpandEntityReferences(false);
        try { f.setFeature("http://xml.org/sax/features/external-general-entities",false);f.setFeature("http://xml.org/sax/features/external-parameter-entities",false); } catch(Exception ignored) { }
        DocumentBuilder b=f.newDocumentBuilder();b.setEntityResolver((publicId,systemId)->new InputSource(new StringReader("")));return b.parse(new ByteArrayInputStream(bytes));
    }
    private static byte[] entry(ZipFile zip,String path) throws Exception {
        ZipEntry e=zip.getEntry(path);if(e==null||e.isDirectory())throw new Exception("EPUB 缺少内容："+path);
        try(InputStream in=zip.getInputStream(e)) {
            ByteArrayOutputStream out=new ByteArrayOutputStream();byte[] b=new byte[16384];int n;
            while((n=in.read(b))!=-1) { if(out.size()+n>5*1024*1024)throw new Exception("EPUB 单章节内容超过 5 MB");out.write(b,0,n); }return out.toByteArray();
        }
    }
    private static String path(String base,String href) throws Exception {
        java.net.URI resolved=new java.net.URI("/"+base).resolve(href.replace(" ","%20")).normalize();
        String value=resolved.getPath();
        if(resolved.isAbsolute()||resolved.getHost()!=null||value==null||!value.startsWith("/")||value.contains("../"))throw new Exception("EPUB 路径无效");
        return value.substring(1);
    }
    private static String first(Document doc,String tag) { NodeList a=doc.getElementsByTagNameNS("*",tag);return a.getLength()==0?"":a.item(0).getTextContent().trim(); }
    private static String first(Element node,String tag) { NodeList a=node.getElementsByTagNameNS("*",tag);return a.getLength()==0?"":a.item(0).getTextContent().trim(); }
    private static void toc(ZipFile zip,String tocFile,boolean ncx,Map<String,String> labels) {
        try {
            Document doc=xml(entry(zip,tocFile));NodeList nodes=doc.getElementsByTagNameNS("*",ncx?"navPoint":"a");
            for(int i=0;i<nodes.getLength();i++) {
                Element e=(Element)nodes.item(i);String href,label;
                if(ncx){NodeList content=e.getElementsByTagNameNS("*","content");if(content.getLength()==0)continue;href=((Element)content.item(0)).getAttribute("src");label=first(e,"text");}
                else { href=e.getAttribute("href");label=e.getTextContent().trim(); }
                if(href.isEmpty()||label.isEmpty())continue;String key=path(tocFile,href);if(!labels.containsKey(key))labels.put(key,label);
            }
        }catch(Exception ignored) { /* TOC is optional; the required spine remains authoritative. */ }
    }
    public static Result read(File file,PlainText plain) throws Exception {
        try(ZipFile zip=new ZipFile(file)) {
            if(zip.size()>10000)throw new Exception("EPUB 文件条目过多");
            Document container=xml(entry(zip,"META-INF/container.xml"));NodeList roots=container.getElementsByTagNameNS("*","rootfile");
            if(roots.getLength()==0)throw new Exception("无效的 EPUB 文件");
            String opf=((Element)roots.item(0)).getAttribute("full-path");Document pkg=xml(entry(zip,opf));
            Result result=new Result();result.title=first(pkg,"title");result.author=first(pkg,"creator");
            Map<String,String> paths=new HashMap<>(),labels=new HashMap<>();Set<String> navs=new HashSet<>(),known=new HashSet<>(),encrypted=new HashSet<>();
            NodeList items=pkg.getElementsByTagNameNS("*","item");String ncxFile="",navFile="";
            for(int i=0;i<items.getLength();i++) {
                Element e=(Element)items.item(i);String id=e.getAttribute("id"),href=e.getAttribute("href"),type=e.getAttribute("media-type");known.add(id);
                if(type.contains("html")){paths.put(id,path(opf,href));if(e.getAttribute("properties").contains("nav")){navs.add(id);navFile=path(opf,href);}}
                if(type.equals("application/x-dtbncx+xml"))ncxFile=path(opf,href);
            }
            if(!ncxFile.isEmpty())toc(zip,ncxFile,true,labels);if(!navFile.isEmpty())toc(zip,navFile,false,labels);
            if(zip.getEntry("META-INF/encryption.xml")!=null){Document enc=xml(entry(zip,"META-INF/encryption.xml"));NodeList refs=enc.getElementsByTagNameNS("*","CipherReference");for(int i=0;i<refs.getLength();i++)encrypted.add(path("",((Element)refs.item(i)).getAttribute("URI")));}
            NodeList spine=pkg.getElementsByTagNameNS("*","itemref");long total=0;
            for(int i=0;i<spine.getLength();i++) {
                Element e=(Element)spine.item(i);String ref=e.getAttribute("idref");if("no".equals(e.getAttribute("linear"))||navs.contains(ref))continue;
                if(!known.contains(ref))throw new Exception("EPUB 章节索引缺失");String chapterFile=paths.get(ref);if(chapterFile==null)continue;
                if(encrypted.contains(chapterFile))throw new Exception("不支持 DRM 加密 EPUB，请导入未加密版本");
                byte[] bytes=entry(zip,chapterFile);String html=(bytes.length>1&&((bytes[0]&255)==255||(bytes[0]&255)==254))?ReaderParser.decode(bytes,"auto"):new String(bytes,StandardCharsets.UTF_8);
                String body=ReaderParser.clean(plain.convert(html)).trim();if(body.isEmpty())continue;
                total+=body.length();if(total>30*1024*1024)throw new Exception("EPUB 正文超过 30 MB");
                Matcher h=Pattern.compile("(?is)<h[1-3]\\b[^>]*>(.*?)</h[1-3]>").matcher(html);
                String heading=h.find()?plain.convert(h.group(1)).trim():"";
                String title=!heading.isEmpty()?heading:labels.get(chapterFile);
                if(title==null||title.isEmpty()){Matcher t=Pattern.compile("(?is)<title\\b[^>]*>(.*?)</title>").matcher(html);title=t.find()?plain.convert(t.group(1)).trim():"第 "+(result.chapters.size()+1)+" 节";}
                if(title.length()>100)title=title.substring(0,100);
                if(!heading.isEmpty()&&body.startsWith(heading))body=body.substring(heading.length()).trim();
                if(!body.isEmpty())ReaderParser.split(result.chapters,title,body);
            }
            if(result.chapters.isEmpty())throw new Exception("EPUB 没有可读取正文");return result;
        }
    }
}
