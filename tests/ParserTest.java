import com.adfree.reader.ReaderParser;
import java.nio.charset.Charset;
import java.util.*;

public class ParserTest {
    static int passed=0;
    static void check(boolean yes,String message) { if(!yes)throw new AssertionError(message); passed++; System.out.println("PASS "+message); }
    public static void main(String[] args) throws Exception {
        List<ReaderParser.Chapter> c=ReaderParser.parse("书前说明\r\n第一章 初见\r\n第一段正文。\r\n第 2 章 重逢\r\n第二段正文。\nChapter III Home\nEnglish body.\n4. Return\nAnother body.");
        check(c.size()==5,"Chinese, spaced Chinese, Roman English, and numbered headings");
        check(c.get(0).title.equals("前言")&&c.get(2).title.equals("第 2 章 重逢"),"preface and titles preserved");
        check(!c.get(1).text.contains("第一章"),"headings removed from chapter body");
        String text="第一章 你好\n这里是中文、繁體字与 emoji 🌧。";
        check(ReaderParser.decode(text.getBytes("UTF-8"),"auto").equals(text),"automatic UTF-8 decode");
        check(ReaderParser.decode(text.getBytes("GB18030"),"auto").equals(text),"automatic GB18030 fallback");
        String traditional="第一章 重逢\n這是繁體小說。";
        check(ReaderParser.decode(traditional.getBytes("Big5"),"Big5").equals(traditional),"explicit Big5 decode");
        byte[] utf16=text.getBytes("UTF-16LE"),bom=new byte[utf16.length+2];bom[0]=(byte)255;bom[1]=(byte)254;System.arraycopy(utf16,0,bom,2,utf16.length);
        check(ReaderParser.decode(bom,"auto").equals(text),"UTF-16 BOM recognition");
        check(ReaderParser.parse("没有标题的正文。\n第二段。").get(0).title.equals("正文"),"untitled novel still readable");
        StringBuilder longText=new StringBuilder();for(int i=0;i<5000;i++)longText.append("长篇正文🌧，不应丢失字符。\n");
        c=ReaderParser.parse(longText.toString());check(c.size()>3&&c.stream().allMatch(x->x.text.length()<=16000),"large content split into bounded reading sections");
        check(c.stream().noneMatch(x->Character.isHighSurrogate(x.text.charAt(x.text.length()-1))),"surrogate pairs survive section splits");
        check(ReaderParser.parse("").isEmpty(),"empty file rejected by importer contract");
        c=ReaderParser.parse("第一章 开始\n第二章 中间\n第三章 结尾\n正文内容。");check(c.size()==1&&c.get(0).title.equals("第三章 结尾"),"empty heading-only entries do not become empty chapters");
        boolean invalid=false;try{ReaderParser.decode(new byte[]{(byte)255},"UTF-8");}catch(Exception ex){invalid=true;}check(invalid,"explicit malformed encoding reports failure");
        System.out.println("TOTAL "+passed);
    }
}
