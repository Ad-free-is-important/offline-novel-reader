package com.adfree.reader;

import java.nio.ByteBuffer;
import java.nio.charset.*;
import java.util.*;
import java.util.regex.*;

/** Pure Java text decoding and heading recognition, shared by the importer tests. */
public final class ReaderParser {
    public static final class Chapter {
        public final String title, text;
        public Chapter(String title, String text) { this.title = title; this.text = text; }
    }
    private static final Pattern HEADING = Pattern.compile(
        "(?m)^[\\t \\u3000]{0,8}((?:第[\\t \u3000]*[0-9０-９零〇一二三四五六七八九十百千万两兩壹贰叁肆伍陆柒捌玖拾佰仟]+[\\t \u3000]*[章节節回卷部篇集](?:[^\\n]{0,65})|(?:Chapter|CHAPTER|chapter|Book|BOOK|Part|PART)\\s+[0-9IVXLCDMivxlcdm]+(?:[^\\n]{0,65})|(?:楔子|序章|序言|前言|引子|终章|終章|尾声|尾聲|后记|後記|番外)(?:[ ：:·—-][^\\n]{0,55})?|[0-9]{1,5}[.、．]\\s*[^\\n。！？!?；;]{1,45}))[\\t \\u3000]*$");
    public static String decode(byte[] bytes, String encoding) throws Exception {
        int start = 0;
        String charset = encoding;
        if (charset == null || charset.equals("auto")) {
            if (bytes.length >= 3 && (bytes[0]&255)==239 && (bytes[1]&255)==187 && (bytes[2]&255)==191) { charset="UTF-8"; start=3; }
            else if (bytes.length>=2 && (bytes[0]&255)==255 && (bytes[1]&255)==254) { charset="UTF-16LE"; start=2; }
            else if (bytes.length>=2 && (bytes[0]&255)==254 && (bytes[1]&255)==255) { charset="UTF-16BE"; start=2; }
            else {
                try { return clean(Charset.forName("UTF-8").newDecoder().onMalformedInput(CodingErrorAction.REPORT).onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes)).toString()); }
                catch (CharacterCodingException ex) { charset="GB18030"; }
            }
        }
        if (!Arrays.asList("UTF-8","GB18030","Big5","UTF-16LE","UTF-16BE").contains(charset)) throw new Exception("不支持此文本编码");
        String text = Charset.forName(charset).newDecoder().onMalformedInput(CodingErrorAction.REPORT).onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes,start,bytes.length-start)).toString();
        return clean(text);
    }
    public static String clean(String text) {
        return text.replace("\uFEFF", "").replace("\r\n", "\n").replace('\r','\n').replace('\u2028','\n').replace('\u0000',' ').replaceAll("[\\x01-\\x08\\x0B\\x0C\\x0E-\\x1F]", "");
    }
    public static List<Chapter> parse(String raw) {
        String text = clean(raw).trim();
        List<Chapter> result = new ArrayList<>();
        Matcher matcher = HEADING.matcher(text);
        int previous = 0; String title = "前言"; boolean matched = false;
        while (matcher.find()) {
            String body = text.substring(previous, matcher.start()).trim();
            if (!body.isEmpty()) split(result, matched ? title : "前言", body);
            title = matcher.group(1).trim(); previous = matcher.end(); matched = true;
        }
        String last = text.substring(previous).trim();
        if (!last.isEmpty()) split(result, matched ? title : "正文", last);
        if (result.isEmpty() && !text.isEmpty()) result.add(new Chapter("正文",text));
        return result;
    }
    public static void split(List<Chapter> output, String title, String body) {
        int from=0, part=1;
        while (from < body.length()) {
            int end = Math.min(body.length(),from+16000);
            if (end < body.length()) {
                int newline = body.lastIndexOf('\n',end);
                if (newline>from+8000) end=newline;
                // Do not split UTF-16 surrogate pairs.
                if (end>from && Character.isHighSurrogate(body.charAt(end-1))) end--;
            }
            String chunk=body.substring(from,end).trim();
            if (!chunk.isEmpty()) output.add(new Chapter(title+(part==1 ? "" : " · 续"+part),chunk));
            from=end; part++;
        }
    }
}
