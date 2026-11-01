package in.shazverse.srktorrent;

import java.io.BufferedReader;
import java.io.File;
import java.io.InputStreamReader;
import java.io.PrintStream;
import java.lang.reflect.Method;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Desktop host (Windows app): the engine runs in this process, the Electron app talks to it with JSON lines.
 *   stdin : {"m":"addMagnet","a":["magnet:?…","{}"],"r":7}
 *   stdout: E {event json}        — engine events
 *           R {"r":7,"v":result}  — return values
 * args: dataDir saveDir [platform]
 */
public final class StdioMain {
    public static void main(String[] args) throws Exception {
        final File data = new File(args.length > 0 ? args[0] : System.getProperty("user.home") + "/.srk-torrent"); data.mkdirs();
        final String saveDir = args.length > 1 ? args[1] : System.getProperty("user.home") + File.separator + "Downloads" + File.separator + "SRK Torrent";
        final String platform = args.length > 2 ? args[2] : "windows";
        final PrintStream out = new PrintStream(new java.io.FileOutputStream(java.io.FileDescriptor.out), true, "UTF-8");
        final Prefs prefs = new Prefs(new File(data, "prefs.json"));
        final TorrentEngine engine = new TorrentEngine(new TorrentEngine.Host() {
            public void emit(String json) { synchronized (out) { out.println("E " + json); } }
            public String pref(String k) { return prefs.get(k); }
            public void setPref(String k, String v) { prefs.set(k, v); }
            public File dataDir() { return data; }
            public String defaultSaveDir() { return saveDir; }
            public String platform() { return platform; }
        });
        Runtime.getRuntime().addShutdownHook(new Thread(engine::stop));
        engine.start();
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8));
        String line;
        while ((line = in.readLine()) != null) {
            line = line.trim(); if (line.isEmpty()) continue;
            if (line.equals("quit")) break;
            Map<String, Object> msg; try { msg = Json.obj(line); } catch (Exception e) { continue; }
            String m = Json.s(msg, "m"); Object r = msg.get("r");
            Object a = msg.get("a"); List<?> args2 = a instanceof List ? (List<?>) a : java.util.Collections.emptyList();
            Object v;
            try { v = call(engine, m, args2); } catch (Throwable e) { v = null; System.err.println("[srk-torrent] call " + m + " failed: " + e); }
            if (r != null) synchronized (out) { out.println("R " + Json.str(Json.map("r", r, "v", v))); }
        }
        engine.stop(); System.exit(0);
    }

    static Object call(TorrentEngine e, String name, List<?> args) throws Exception {
        for (Method mt : TorrentEngine.class.getMethods()) {
            if (!mt.getName().equals(name) || mt.getParameterCount() != args.size() || mt.getDeclaringClass() != TorrentEngine.class) continue;
            if (name.equals("stop") || name.equals("start")) return null;
            Class<?>[] ps = mt.getParameterTypes(); Object[] v = new Object[ps.length];
            for (int i = 0; i < ps.length; i++) {
                Object x = args.get(i);
                if (ps[i] == String.class) v[i] = x == null ? null : (x instanceof String ? x : Json.str(x));
                else if (ps[i] == int.class) v[i] = x instanceof Number ? ((Number) x).intValue() : Integer.parseInt(String.valueOf(x));
                else if (ps[i] == boolean.class) v[i] = Boolean.TRUE.equals(x) || "true".equals(x);
                else if (ps[i] == byte[].class) v[i] = java.util.Base64.getDecoder().decode(String.valueOf(x));
                else throw new IllegalArgumentException("unsupported " + ps[i]);
            }
            Object res = mt.invoke(e, v);
            return res instanceof long[] ? java.util.Arrays.toString((long[]) res) : (res instanceof String || res instanceof Number || res instanceof Boolean ? res : null);
        }
        throw new NoSuchMethodException(name + "/" + args.size());
    }

    /** tiny JSON-file settings store */
    static final class Prefs {
        private final File f; private final Map<String, String> m = new ConcurrentHashMap<>();
        Prefs(File f) { this.f = f; try { if (f.exists()) for (Map.Entry<String, Object> e : Json.obj(new String(TorrentEngine.readAll(f), StandardCharsets.UTF_8)).entrySet()) if (e.getValue() != null) m.put(e.getKey(), String.valueOf(e.getValue())); } catch (Exception ignored) { } }
        String get(String k) { return m.get(k); }
        synchronized void set(String k, String v) { if (v == null) m.remove(k); else m.put(k, v); try { TorrentEngine.writeAll(f, Json.str(new java.util.TreeMap<String, Object>(m)).getBytes(StandardCharsets.UTF_8)); } catch (Exception ignored) { } }
    }
}
