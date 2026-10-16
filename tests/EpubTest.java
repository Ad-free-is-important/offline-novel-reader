import com.adfree.reader.EpubReader;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.zip.*;

public class EpubTest {
    static int passed=0;
    static void check(boolean yes,String message){if(!yes)throw new AssertionError(message);passed++;System.out.println("PASS "+message);}
    static String text(String html){return html.replaceAll("(?is)<(head|script|style)\\b[^>]*>.*?</\\1>","").replaceAll("(?i)</?(p|h[1-3])[^>]*>","\n").replaceAll("<[^>]*>","").trim();}
    static File zip(Map<String,String> files)throws Exception{File f=File.createTempFile("epub-test-",".epub");try(ZipOutputStream out=new ZipOutputStream(new FileOutputStream(f))){for(Map.Entry<String,String> e:files.entrySet()){out.putNextEntry(new ZipEntry(e.getKey()));out.write(e.getValue().getBytes(StandardCharsets.UTF_8));out.closeEntry();}}return f;}
    static EpubReader.Result parse(Map<String,String> files)throws Exception{File f=zip(files);try{return EpubReader.read(f,EpubTest::text);}finally{f.delete();}}
    static boolean rejects(Map<String,String> files){try{parse(files);return false;}catch(Exception e){return true;}}
    public static void main(String[] args)throws Exception{
        Map<String,String> f=new LinkedHashMap<>();
        f.put("META-INF/container.xml","<container xmlns='urn:oasis:names:tc:opendocument:xmlns:container'><rootfiles><rootfile full-path='OEBPS/package.opf'/></rootfiles></container>");
        String opf="<package xmlns='http://www.idpf.org/2007/opf'><metadata xmlns:dc='http://purl.org/dc/elements/1.1/'><dc:title>测试小说</dc:title><dc:creator>作者甲</dc:creator></metadata><manifest><item id='b' href='text/b.xhtml' media-type='application/xhtml+xml'/><item id='a' href='text/a.xhtml' media-type='application/xhtml+xml'/><item id='toc' href='toc.ncx' media-type='application/x-dtbncx+xml'/></manifest><spine toc='toc'><itemref idref='a'/><itemref idref='b'/></spine></package>";
        f.put("OEBPS/package.opf",opf);f.put("OEBPS/text/a.xhtml","<html><head><title>错误的正文</title></head><body><h1>第一章 出发</h1><p>甲章节正文。</p></body></html>");
        f.put("OEBPS/text/b.xhtml","<html><body><p>乙章节正文。</p></body></html>");
        f.put("OEBPS/toc.ncx","<ncx xmlns='http://www.daisy.org/z3986/2005/ncx/'><navMap><navPoint><navLabel><text>第二章 归来</text></navLabel><content src='text/b.xhtml#start'/></navPoint></navMap></ncx>");
        EpubReader.Result r=parse(f);check(r.title.equals("测试小说")&&r.author.equals("作者甲"),"EPUB metadata");check(r.chapters.size()==2&&r.chapters.get(0).text.equals("甲章节正文。"),"spine order overrides ZIP/manifest order and headings do not duplicate");check(r.chapters.get(1).title.equals("第二章 归来"),"NCX supplies titles for heading-free chapters");
        check(!r.chapters.get(0).text.contains("错误的正文"),"head content excluded by renderer contract");
        f.put("OEBPS/package.opf",opf.replace("href='text/b.xhtml'","href='text/missing.xhtml'"));check(rejects(f),"missing spine file fails without silently dropping chapters");f.put("OEBPS/package.opf",opf);
        f.put("META-INF/encryption.xml","<encryption xmlns='urn:oasis:names:tc:opendocument:xmlns:container' xmlns:e='http://www.w3.org/2001/04/xmlenc#'><e:EncryptedData><e:CipherData><e:CipherReference URI='OEBPS/text/a.xhtml'/></e:CipherData></e:EncryptedData></encryption>");check(rejects(f),"DRM-encrypted reading content rejected");f.remove("META-INF/encryption.xml");
        f.put("OEBPS/package.opf",opf.replace("href='text/a.xhtml'","href='https://example.test/book.xhtml'"));check(rejects(f),"external EPUB resource paths rejected");f.put("OEBPS/package.opf",opf);
        f.put("OEBPS/package.opf",opf.replace("href='text/a.xhtml'","href='../../../secret.xhtml'"));check(rejects(f),"parent traversal paths rejected");f.put("OEBPS/package.opf",opf);
        String nav="<html xmlns='http://www.w3.org/1999/xhtml'><body><nav><a href='text/b.xhtml'>第二章 EPUB3</a></nav></body></html>";
        f.put("OEBPS/nav.xhtml",nav);f.remove("OEBPS/toc.ncx");f.put("OEBPS/package.opf",opf.replace("<item id='toc' href='toc.ncx' media-type='application/x-dtbncx+xml'/>","<item id='nav' href='nav.xhtml' media-type='application/xhtml+xml' properties='nav'/>"));r=parse(f);check(r.chapters.get(1).title.equals("第二章 EPUB3"),"EPUB3 navigation labels");
        System.out.println("TOTAL "+passed);
    }
}
