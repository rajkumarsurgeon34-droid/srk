package in.shazverse.srkshare;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Tiny JSON reader/writer (maps, lists, strings, numbers, booleans, null). */
public final class Json {
    private final String s; private int i;
    private Json(String s) { this.s = s; }
    public static Object parse(String s) { Json j = new Json(s); j.ws(); Object v = j.val(); return v; }
    @SuppressWarnings("unchecked") public static Map<String, Object> obj(String s) { Object o = parse(s); return o instanceof Map ? (Map<String, Object>) o : new LinkedHashMap<>(); }
    private void ws() { while (i < s.length() && Character.isWhitespace(s.charAt(i))) i++; }
    private Object val() {
        ws(); if (i >= s.length()) throw new IllegalArgumentException("end");
        char c = s.charAt(i);
        if (c == '{') { i++; Map<String, Object> m = new LinkedHashMap<>(); ws(); if (s.charAt(i) == '}') { i++; return m; }
            while (true) { ws(); String k = str(); ws(); i++; m.put(k, val()); ws(); char d = s.charAt(i++); if (d == '}') return m; } }
        if (c == '[') { i++; List<Object> l = new ArrayList<>(); ws(); if (s.charAt(i) == ']') { i++; return l; }
            while (true) { l.add(val()); ws(); char d = s.charAt(i++); if (d == ']') return l; } }
        if (c == '"') return str();
        if (s.startsWith("true", i)) { i += 4; return Boolean.TRUE; }
        if (s.startsWith("false", i)) { i += 5; return Boolean.FALSE; }
        if (s.startsWith("null", i)) { i += 4; return null; }
        int st = i; while (i < s.length() && "+-0123456789.eE".indexOf(s.charAt(i)) >= 0) i++;
        String n = s.substring(st, i); if (n.isEmpty()) throw new IllegalArgumentException("bad json at " + i);
        if (n.contains(".") || n.contains("e") || n.contains("E")) return Double.parseDouble(n);
        try { return Long.parseLong(n); } catch (NumberFormatException e) { return Double.parseDouble(n); }
    }
    private String str() {
        StringBuilder b = new StringBuilder(); i++;
        while (true) { char c = s.charAt(i++); if (c == '"') return b.toString();
            if (c == '\\') { char e = s.charAt(i++);
                switch (e) { case 'n': b.append('\n'); break; case 't': b.append('\t'); break; case 'r': b.append('\r'); break; case 'b': b.append('\b'); break; case 'f': b.append('\f'); break;
                    case 'u': b.append((char) Integer.parseInt(s.substring(i, i + 4), 16)); i += 4; break; default: b.append(e); } }
            else b.append(c); }
    }
    public static String str(Object o) { StringBuilder b = new StringBuilder(); write(b, o); return b.toString(); }
    @SuppressWarnings("unchecked") private static void write(StringBuilder b, Object o) {
        if (o == null) b.append("null");
        else if (o instanceof String) quote(b, (String) o);
        else if (o instanceof Number || o instanceof Boolean) { if (o instanceof Double && ((Double) o) == Math.rint((Double) o) && !Double.isInfinite((Double) o)) b.append(((Double) o).longValue()); else b.append(o); }
        else if (o instanceof Map) { b.append('{'); boolean f = true; for (Map.Entry<String, Object> e : ((Map<String, Object>) o).entrySet()) { if (!f) b.append(','); f = false; quote(b, e.getKey()); b.append(':'); write(b, e.getValue()); } b.append('}'); }
        else if (o instanceof List) { b.append('['); boolean f = true; for (Object x : (List<Object>) o) { if (!f) b.append(','); f = false; write(b, x); } b.append(']'); }
        else quote(b, String.valueOf(o));
    }
    private static void quote(StringBuilder b, String s) {
        b.append('"'); for (int k = 0; k < s.length(); k++) { char c = s.charAt(k);
            switch (c) { case '"': b.append("\\\""); break; case '\\': b.append("\\\\"); break; case '\n': b.append("\\n"); break; case '\r': b.append("\\r"); break; case '\t': b.append("\\t"); break;
                default: if (c < 0x20 || c == 0x2028 || c == 0x2029) b.append(String.format("\\u%04x", (int) c)); else b.append(c); } }
        b.append('"');
    }
    /** small helpers */
    public static Map<String, Object> map(Object... kv) { Map<String, Object> m = new LinkedHashMap<>(); for (int k = 0; k + 1 < kv.length; k += 2) m.put((String) kv[k], kv[k + 1]); return m; }
    public static String s(Map<String, Object> m, String k) { Object v = m == null ? null : m.get(k); return v == null ? null : String.valueOf(v); }
    public static long l(Map<String, Object> m, String k) { Object v = m == null ? null : m.get(k); return v instanceof Number ? ((Number) v).longValue() : 0; }
}
