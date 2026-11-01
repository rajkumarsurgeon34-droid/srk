package in.shazverse.srkshare;

import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.HttpURLConnection;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.InterfaceAddress;
import java.net.NetworkInterface;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.URL;
import java.net.URLDecoder;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

/**
 * SRK Share engine (Android). Same protocol as the Windows engine:
 *   UDP 47322 broadcast  {app:"srk-share", t:"hello"|"reply", id, name, platform, port}
 *   GET  /srk/info, POST /srk/offer (waits for the receiver), POST /srk/upload?s=&f= (raw bytes), POST /srk/cancel?s=
 * Platform specifics (saving files, reading picked files, settings, events to the page) go through {@link Host}.
 */
public final class ShareEngine {
    public interface Sink { OutputStream out(); String ref(); String name(); void commit() throws IOException; void abort(); }
    public interface Host {
        void emit(String json);
        String pref(String key);
        void setPref(String key, String value);
        Sink openSink(String name, String mime, long size) throws IOException;
        InputStream openSource(String ref) throws IOException;
        String deviceName();
        String platform();
    }

    static final int UDP = 47322;
    static final int[] PORTS = {47321, 47331, 47341, 47351, 47361};
    private static final SecureRandom RNG = new SecureRandom();
    static String rid() { byte[] b = new byte[8]; RNG.nextBytes(b); StringBuilder s = new StringBuilder(); for (byte x : b) s.append(String.format("%02x", x)); return s.toString(); }

    private final Host host;
    public final String id;
    private String name;
    private final Set<String> trusted = Collections.newSetFromMap(new ConcurrentHashMap<>());
    private final Map<String, Map<String, Object>> peers = new ConcurrentHashMap<>();
    private final Map<String, Map<String, Object>> files = new ConcurrentHashMap<>();
    private final Map<String, Offer> offers = new ConcurrentHashMap<>();
    private final Map<String, Session> sessions = new ConcurrentHashMap<>();
    private final Map<String, Map<String, Object>> transfers = new ConcurrentHashMap<>();
    private final Map<String, Runnable> aborts = new ConcurrentHashMap<>();
    private final ExecutorService pool = Executors.newCachedThreadPool();
    private ServerSocket server; private DatagramSocket udp; private volatile boolean running;
    public int port; int udpPort = UDP; int[] ports = PORTS; public final List<String> extraTargets = new ArrayList<>();

    private static final class Offer { final CountDownLatch latch = new CountDownLatch(1); volatile boolean accept, always; }
    private static final class Session { final Map<String, Object> from; final Map<String, Map<String, Object>> files = new ConcurrentHashMap<>(); Session(Map<String, Object> f) { from = f; } }

    public ShareEngine(Host host) {
        this.host = host;
        String i = host.pref("id"); if (i == null || i.isEmpty()) { i = rid(); host.setPref("id", i); } this.id = i;
        String n = host.pref("name"); this.name = n == null || n.isEmpty() ? host.deviceName() : n;
        String t = host.pref("trusted"); if (t != null) { Object o = Json.parse(t); if (o instanceof List) for (Object x : (List<?>) o) trusted.add(String.valueOf(x)); }
    }
    /** for tests on one machine */
    public ShareEngine ports(int[] p, int udpPort) { this.ports = p; this.udpPort = udpPort; return this; }

    void emit(Map<String, Object> ev) { try { host.emit(Json.str(ev)); } catch (Exception ignored) { } }
    Map<String, Object> me() { return Json.map("id", id, "name", name, "platform", host.platform(), "port", (long) port); }
    public static List<String> addrs() { List<String> out = new ArrayList<>(); try { for (NetworkInterface ni : Collections.list(NetworkInterface.getNetworkInterfaces())) { if (!ni.isUp() || ni.isLoopback()) continue; for (InetAddress a : Collections.list(ni.getInetAddresses())) if (a instanceof Inet4Address) out.add(a.getHostAddress()); } } catch (Exception ignored) { } return out; }
    Map<String, Object> names() { String s = host.pref("names"); return s == null ? new LinkedHashMap<>() : Json.obj(s); }
    public void emitSelf() {
        List<Object> tr = new ArrayList<>(); Map<String, Object> nm = names(); for (String t : trusted) tr.add(Json.map("id", t, "name", nm.containsKey(t) ? nm.get(t) : "Device"));
        Map<String, Object> ev = Json.map("type", "self", "id", id, "name", name, "platform", host.platform(), "addrs", new ArrayList<Object>(addrs()), "port", (long) port, "trusted", tr); emit(ev);
    }

    /* ---------- start: server + discovery ---------- */
    public synchronized void start() {
        if (running) { emitSelf(); emitPeers(); return; }
        running = true;
        for (int p : ports) { try { ServerSocket ss = new ServerSocket(); ss.setReuseAddress(true); ss.bind(new InetSocketAddress(p)); server = ss; port = p; break; } catch (IOException ignored) { } }
        if (server == null) { try { server = new ServerSocket(0); port = server.getLocalPort(); } catch (IOException e) { emit(Json.map("type", "toast", "msg", "Couldn’t start receiving: " + e.getMessage())); } }
        if (server != null) pool.execute(this::acceptLoop);
        try { udp = new DatagramSocket(null); udp.setReuseAddress(true); udp.setBroadcast(true); udp.bind(new InetSocketAddress(udpPort)); pool.execute(this::udpLoop); } catch (IOException e) { udp = null; }
        pool.execute(() -> { while (running) { hello("hello", null); expire(); try { Thread.sleep(3000); } catch (InterruptedException e) { return; } } });
        emitSelf(); emitPeers();
    }
    public synchronized void stop() { running = false; try { if (server != null) server.close(); } catch (IOException ignored) { } if (udp != null) udp.close(); pool.shutdownNow(); }
    public boolean busy() { for (Map<String, Object> t : transfers.values()) { String s = (String) t.get("state"); if ("sending".equals(s) || "receiving".equals(s) || "waiting".equals(s)) return true; } return false; }

    List<InetAddress> targets() {
        Set<InetAddress> t = new LinkedHashSet<>();
        try { t.add(InetAddress.getByName("255.255.255.255")); } catch (Exception ignored) { }
        try { for (NetworkInterface ni : Collections.list(NetworkInterface.getNetworkInterfaces())) { if (!ni.isUp() || ni.isLoopback()) continue; for (InterfaceAddress ia : ni.getInterfaceAddresses()) if (ia.getBroadcast() != null) t.add(ia.getBroadcast()); } } catch (Exception ignored) { }
        for (String x : extraTargets) { try { t.add(InetAddress.getByName(x)); } catch (Exception ignored) { } }
        return new ArrayList<>(t);
    }
    void hello(String type, InetAddress to) {
        if (udp == null) return;
        Map<String, Object> m = me(); m.put("app", "srk-share"); m.put("t", type); byte[] b = Json.str(m).getBytes(StandardCharsets.UTF_8);
        for (InetAddress a : to != null ? Collections.singletonList(to) : targets()) { try { udp.send(new DatagramPacket(b, b.length, a, udpPort)); } catch (IOException ignored) { } }
    }
    void udpLoop() {
        byte[] buf = new byte[4096];
        while (running && udp != null && !udp.isClosed()) {
            try { DatagramPacket p = new DatagramPacket(buf, buf.length); udp.receive(p);
                Map<String, Object> m = Json.obj(new String(p.getData(), 0, p.getLength(), StandardCharsets.UTF_8));
                if (!"srk-share".equals(m.get("app"))) continue; String pid = Json.s(m, "id"); if (pid == null || pid.equals(id)) continue;
                seen(pid, Json.s(m, "name"), Json.s(m, "platform"), (int) Json.l(m, "port"), p.getAddress().getHostAddress(), false);
                if ("hello".equals(m.get("t"))) hello("reply", p.getAddress());
            } catch (Exception e) { if (!running) return; }
        }
    }
    void seen(String pid, String pname, String platform, int pport, String ip, boolean manual) {
        Map<String, Object> old = peers.get(pid); Map<String, Object> p = old == null ? new HashMap<>() : old;
        boolean changed = old == null || !String.valueOf(pname).equals(old.get("name")) || !ip.equals(old.get("ip")) || pport != ((Number) old.get("port")).intValue();
        p.put("id", pid); if (pname != null) p.put("name", pname); p.put("platform", platform == null ? "android" : platform); p.put("port", (long) pport); p.put("ip", ip); p.put("seen", System.currentTimeMillis()); if (manual) p.put("manual", true);
        peers.put(pid, p); if (changed) emitPeers();
        if (pname != null) { Map<String, Object> nm = names(); if (!pname.equals(nm.get(pid))) { nm.put(pid, pname); host.setPref("names", Json.str(nm)); } }
    }
    void expire() { boolean ch = false; for (Map.Entry<String, Map<String, Object>> e : peers.entrySet()) { Map<String, Object> p = e.getValue(); if (p.get("manual") == null && System.currentTimeMillis() - (Long) p.get("seen") > 12000) { peers.remove(e.getKey()); ch = true; } } if (ch) emitPeers(); }
    public void emitPeers() { List<Object> l = new ArrayList<>(); for (Map<String, Object> p : peers.values()) l.add(Json.map("id", p.get("id"), "name", p.get("name"), "platform", p.get("platform"), "ip", p.get("ip"), "port", p.get("port"), "trusted", trusted.contains((String) p.get("id")))); emit(Json.map("type", "peers", "peers", l)); }
    public void connect(String address) {
        pool.execute(() -> {
            String a = address == null ? "" : address.trim(); String h = a; int[] ps = PORTS;
            int c = a.lastIndexOf(':'); if (c > 0) { h = a.substring(0, c); try { ps = new int[]{Integer.parseInt(a.substring(c + 1))}; } catch (NumberFormatException e) { ps = PORTS; } }
            for (int p : ps) { try { Map<String, Object> info = Json.obj(http("GET", h, p, "/srk/info", null, 3000));
                    if ("srk-share".equals(info.get("app"))) { seen(Json.s(info, "id"), Json.s(info, "name"), Json.s(info, "platform"), (int) (Json.l(info, "port") > 0 ? Json.l(info, "port") : p), h, true); try { hello("hello", InetAddress.getByName(h)); } catch (Exception ignored) { } emit(Json.map("type", "toast", "msg", "Connected to " + info.get("name"))); return; } } catch (Exception ignored) { } }
            emit(Json.map("type", "toast", "msg", "No SRK Share found at " + h));
        });
    }

    /* ---------- the server ---------- */
    void acceptLoop() { while (running) { try { Socket s = server.accept(); pool.execute(() -> handle(s)); } catch (IOException e) { if (!running) return; } } }
    static String line(InputStream in) throws IOException { ByteArrayOutputStream b = new ByteArrayOutputStream(); int c; while ((c = in.read()) != -1) { if (c == '\n') break; if (c != '\r') b.write(c); if (b.size() > 16384) throw new IOException("header too long"); } if (c == -1 && b.size() == 0) return null; return b.toString("UTF-8"); }
    static void reply(Socket s, int code, Map<String, Object> obj) { try { byte[] b = Json.str(obj).getBytes(StandardCharsets.UTF_8); OutputStream o = s.getOutputStream(); o.write(("HTTP/1.1 " + code + " OK\r\nContent-Type: application/json\r\nContent-Length: " + b.length + "\r\nConnection: close\r\n\r\n").getBytes(StandardCharsets.UTF_8)); o.write(b); o.flush(); } catch (IOException ignored) { } }
    void handle(Socket s) {
        try {
            s.setSoTimeout(150000); s.setTcpNoDelay(true);
            InputStream in = new BufferedInputStream(s.getInputStream(), 256 * 1024);
            String first = line(in); if (first == null) { s.close(); return; }
            String[] parts = first.split(" "); if (parts.length < 2) { s.close(); return; }
            String method = parts[0], target = parts[1]; Map<String, String> hdr = new HashMap<>(); String l;
            while ((l = line(in)) != null && !l.isEmpty()) { int c = l.indexOf(':'); if (c > 0) hdr.put(l.substring(0, c).trim().toLowerCase(), l.substring(c + 1).trim()); }
            String path = target, query = ""; int q = target.indexOf('?'); if (q >= 0) { path = target.substring(0, q); query = target.substring(q + 1); }
            Map<String, String> qs = new HashMap<>(); for (String kv : query.split("&")) { int e = kv.indexOf('='); if (e > 0) qs.put(URLDecoder.decode(kv.substring(0, e), "UTF-8"), URLDecoder.decode(kv.substring(e + 1), "UTF-8")); }
            long len = hdr.containsKey("content-length") ? Long.parseLong(hdr.get("content-length")) : 0;
            String ip = s.getInetAddress().getHostAddress();
            if ("GET".equals(method) && "/srk/info".equals(path)) { Map<String, Object> m = me(); m.put("app", "srk-share"); m.put("v", 1L); reply(s, 200, m); }
            else if ("POST".equals(method) && "/srk/offer".equals(path)) offer(s, in, len, ip);
            else if ("POST".equals(method) && "/srk/upload".equals(path)) receive(s, in, len, qs.get("s"), qs.get("f"));
            else if ("GET".equals(method) && "/srk/status".equals(path)) { Session se = sessions.get(qs.get("s")); Map<String, Object> f = se == null ? null : se.files.get(qs.get("f")); Map<String, Object> t = f == null ? null : transfers.get((String) f.get("tid")); reply(s, 200, Json.map("state", t == null ? "unknown" : t.get("state"))); }
            else if ("POST".equals(method) && "/srk/cancel".equals(path)) { Session se = sessions.get(qs.get("s")); if (se != null) for (Map<String, Object> f : se.files.values()) { String tid = (String) f.get("tid"); Map<String, Object> t = transfers.get(tid); if (t != null && !isOver(t)) transfer(Json.map("id", tid, "state", "cancelled", "error", "Cancelled by the sender")); } reply(s, 200, Json.map("ok", true)); }
            else reply(s, 404, Json.map("error", "not found"));
        } catch (Exception e) { reply(s, 400, Json.map("error", String.valueOf(e.getMessage()))); }
        finally { try { s.close(); } catch (IOException ignored) { } }
    }
    static boolean isOver(Map<String, Object> t) { String st = (String) t.get("state"); return "done".equals(st) || "failed".equals(st) || "cancelled".equals(st) || "declined".equals(st); }
    static String readBody(InputStream in, long len) throws IOException { if (len > (1 << 20)) throw new IOException("too big"); byte[] b = new byte[(int) len]; int n = 0; while (n < len) { int r = in.read(b, n, (int) len - n); if (r < 0) break; n += r; } return new String(b, 0, n, StandardCharsets.UTF_8); }
    static String clean(String n) { String c = (n == null ? "file" : n).replaceAll("[\\\\/:*?\"<>|]+", "-").trim(); if (c.length() > 200) c = c.substring(0, 200); return c.isEmpty() ? "file" : c; }

    @SuppressWarnings("unchecked")
    void offer(Socket s, InputStream in, long len, String ip) throws Exception {
        Map<String, Object> o = Json.obj(readBody(in, len)); Map<String, Object> from = o.get("from") instanceof Map ? (Map<String, Object>) o.get("from") : new HashMap<>();
        String fid = Json.s(from, "id"); if (fid != null) seen(fid, Json.s(from, "name"), Json.s(from, "platform"), (int) Json.l(from, "port"), ip, false);
        List<Object> raw = o.get("items") instanceof List ? (List<Object>) o.get("items") : new ArrayList<>();
        Map<String, Object> who = Json.map("id", fid, "name", Json.s(from, "name"));
        if (o.get("text") != null && raw.isEmpty()) { String text = String.valueOf(o.get("text")); if (text.length() > 100000) text = text.substring(0, 100000); emit(Json.map("type", "text", "from", who, "text", text, "t", System.currentTimeMillis())); reply(s, 200, Json.map("accepted", new ArrayList<>())); return; }
        List<Object> items = new ArrayList<>(); long total = 0;
        for (Object x : raw) { if (!(x instanceof Map) || items.size() >= 1000) continue; Map<String, Object> it = (Map<String, Object>) x; long sz = Math.max(0, Json.l(it, "size")); total += sz; items.add(Json.map("id", Json.s(it, "id"), "name", clean(Json.s(it, "name")), "size", sz, "mime", it.get("mime") == null ? "" : String.valueOf(it.get("mime")))); }
        String offerId = rid(); Offer of = new Offer(); offers.put(offerId, of);
        if (fid != null && trusted.contains(fid)) { of.accept = true; of.latch.countDown(); }
        else { Map<String, Object> w = Json.map("id", fid, "name", Json.s(from, "name"), "platform", Json.s(from, "platform")); emit(Json.map("type", "offer", "offerId", offerId, "from", w, "items", items, "total", total)); }
        boolean answered = of.latch.await(120, TimeUnit.SECONDS); offers.remove(offerId);
        if (!answered) emit(Json.map("type", "offerClosed", "offerId", offerId));
        if (!answered || !of.accept) { reply(s, 200, Json.map("declined", true)); return; }
        if (of.always && fid != null) { trusted.add(fid); saveTrusted(); emitPeers(); emitSelf(); }
        String session = rid(); Session se = new Session(from); sessions.put(session, se); List<Object> acc = new ArrayList<>();
        for (Object x : items) { Map<String, Object> it = (Map<String, Object>) x; String tid = "i-" + rid(); Map<String, Object> f = new HashMap<>(it); f.put("tid", tid); se.files.put(Json.s(it, "id"), f); acc.add(it.get("id"));
            transfer(Json.map("id", tid, "dir", "in", "peer", who, "name", it.get("name"), "size", it.get("size"), "done", 0L, "state", "waiting")); }
        reply(s, 200, Json.map("session", session, "accepted", acc));
    }
    void receive(Socket s, InputStream in, long len, String session, String fid) {
        Session se = session == null ? null : sessions.get(session); Map<String, Object> f = se == null || fid == null ? null : se.files.get(fid);
        if (f == null) { reply(s, 403, Json.map("error", "not accepted")); return; }
        final String tid = (String) f.get("tid"); Map<String, Object> t0 = transfers.get(tid);
        if (t0 != null && "cancelled".equals(t0.get("state"))) { reply(s, 410, Json.map("error", "cancelled")); return; }
        long size = Json.l(f, "size"); Sink sink;
        try { sink = host.openSink((String) f.get("name"), (String) f.get("mime"), size); } catch (IOException e) { transfer(Json.map("id", tid, "state", "failed", "error", "Couldn’t save: " + e.getMessage())); reply(s, 500, Json.map("error", "save")); return; }
        final boolean[] cancelled = {false}; aborts.put(tid, () -> { cancelled[0] = true; try { s.close(); } catch (IOException ignored) { } });
        transfer(Json.map("id", tid, "state", "receiving"));
        long done = 0, last = 0, lastDone = 0, lastT = System.currentTimeMillis(); double speed = 0; byte[] buf = new byte[256 * 1024];
        try {
            OutputStream out = sink.out();
            while (done < len) { int r = in.read(buf, 0, (int) Math.min(buf.length, len - done)); if (r < 0) break; out.write(buf, 0, r); done += r;
                long now = System.currentTimeMillis(); if (now - last > 250) { double dt = (now - lastT) / 1000.0; if (dt > .4) { speed = (done - lastDone) / dt; lastDone = done; lastT = now; } last = now; progress(tid, done, size, speed); } }
            if (done != len || (size > 0 && done != size)) throw new IOException("incomplete");
            sink.commit(); aborts.remove(tid);
            transfer(Json.map("id", tid, "state", "done", "done", done, "ref", sink.ref(), "name", sink.name()));
            reply(s, 200, Json.map("ok", true));
        } catch (IOException e) {
            sink.abort(); aborts.remove(tid); Map<String, Object> t = transfers.get(tid); boolean was = t != null && "cancelled".equals(t.get("state"));
            transfer(Json.map("id", tid, "state", cancelled[0] || was ? "cancelled" : "failed", "error", was ? t.get("error") : cancelled[0] ? "You cancelled it" : "The connection dropped"));
        }
    }
    void transfer(Map<String, Object> t) { String tid = (String) t.get("id"); Map<String, Object> n = transfers.get(tid); if (n == null) n = new ConcurrentHashMap<>(); for (Map.Entry<String, Object> e : t.entrySet()) if (e.getValue() != null) n.put(e.getKey(), e.getValue()); transfers.put(tid, n);
        Map<String, Object> pub = new LinkedHashMap<>(); pub.put("type", "transfer"); for (Map.Entry<String, Object> e : n.entrySet()) if (!e.getKey().equals("src")) pub.put(e.getKey(), e.getValue()); emit(pub); }
    void progress(String tid, long done, long size, double speed) { Map<String, Object> t = transfers.get(tid); if (t != null) { t.put("done", done); t.put("speed", speed); } emit(Json.map("type", "progress", "id", tid, "done", done, "size", size, "speed", speed)); }

    /* ---------- picking and sending ---------- */
    /** register a picked file (ref is a content:// URI on Android or a path elsewhere); returns its id */
    public String addFile(String fname, long size, String mime, String ref) { String fid = rid(); files.put(fid, Json.map("id", fid, "name", clean(fname), "size", size, "mime", mime == null ? "" : mime, "ref", ref)); return fid; }
    public Map<String, Object> fileInfo(String fid) { Map<String, Object> f = files.get(fid); return f == null ? null : Json.map("id", f.get("id"), "name", f.get("name"), "size", f.get("size"), "mime", f.get("mime")); }
    public void forget(String fid) { files.remove(fid); }

    String http(String method, String h, int p, String path, String body, int timeout) throws IOException {
        HttpURLConnection c = (HttpURLConnection) new URL("http://" + h + ":" + p + path).openConnection();
        c.setRequestMethod(method); c.setConnectTimeout(Math.min(timeout, 8000)); c.setReadTimeout(timeout); c.setUseCaches(false); c.setRequestProperty("Connection", "close");
        if (body != null) { byte[] b = body.getBytes(StandardCharsets.UTF_8); c.setDoOutput(true); c.setFixedLengthStreamingMode(b.length); c.setRequestProperty("Content-Type", "application/json"); try (OutputStream o = c.getOutputStream()) { o.write(b); } }
        int code = c.getResponseCode(); InputStream in = code >= 400 ? c.getErrorStream() : c.getInputStream(); ByteArrayOutputStream bo = new ByteArrayOutputStream(); if (in != null) { byte[] buf = new byte[8192]; int n; while ((n = in.read(buf)) > 0) bo.write(buf, 0, n); in.close(); } c.disconnect();
        if (code >= 400) throw new IOException("HTTP " + code); return bo.toString("UTF-8");
    }
    public void send(List<String> peerIds, List<String> fileIds, String text) {
        List<Map<String, Object>> fs = new ArrayList<>(); for (String f : fileIds) { Map<String, Object> m = files.get(f); if (m != null) fs.add(m); }
        for (String pid : peerIds) { Map<String, Object> peer = peers.get(pid); if (peer == null) { emit(Json.map("type", "toast", "msg", "That device is no longer nearby")); continue; } pool.execute(() -> sendToPeer(peer, fs, text)); }
    }
    @SuppressWarnings("unchecked")
    void sendToPeer(Map<String, Object> peer, List<Map<String, Object>> fs, String text) {
        String ip = (String) peer.get("ip"); int p = ((Number) peer.get("port")).intValue(); Map<String, Object> who = Json.map("id", peer.get("id"), "name", peer.get("name"));
        if (text != null && !text.isEmpty() && fs.isEmpty()) { try { http("POST", ip, p, "/srk/offer", Json.str(Json.map("from", me(), "items", new ArrayList<>(), "text", text)), 20000); emit(Json.map("type", "textSent", "to", who, "text", text, "t", System.currentTimeMillis())); } catch (IOException e) { emit(Json.map("type", "toast", "msg", "Couldn’t reach " + peer.get("name"))); } return; }
        List<String> ts = new ArrayList<>();
        for (Map<String, Object> f : fs) { String tid = "o-" + rid(); ts.add(tid); transfer(Json.map("id", tid, "dir", "out", "peer", who, "name", f.get("name"), "size", f.get("size"), "done", 0L, "state", "waiting")); }
        List<Object> items = new ArrayList<>(); for (Map<String, Object> f : fs) items.add(Json.map("id", f.get("id"), "name", f.get("name"), "size", f.get("size"), "mime", f.get("mime")));
        Map<String, Object> ans;
        try { ans = Json.obj(http("POST", ip, p, "/srk/offer", Json.str(Json.map("from", me(), "items", items)), 130000)); }
        catch (IOException e) { for (String tid : ts) transfer(Json.map("id", tid, "state", "failed", "error", "Couldn’t reach " + peer.get("name"))); return; }
        if (ans.get("declined") != null) { for (String tid : ts) transfer(Json.map("id", tid, "state", "declined", "error", peer.get("name") + " said no")); return; }
        Set<String> acc = new java.util.HashSet<>(); if (ans.get("accepted") instanceof List) for (Object x : (List<Object>) ans.get("accepted")) acc.add(String.valueOf(x));
        String session = Json.s(ans, "session");
        for (int i = 0; i < fs.size(); i++) { String tid = ts.get(i); Map<String, Object> t = transfers.get(tid); if (t != null && "cancelled".equals(t.get("state"))) continue;
            if (!acc.contains(String.valueOf(fs.get(i).get("id")))) { transfer(Json.map("id", tid, "state", "declined")); continue; }
            upload(tid, ip, p, session, fs.get(i), (String) peer.get("name")); }
    }
    void upload(String tid, String ip, int p, String session, Map<String, Object> f, String peerName) {
        long size = Json.l(f, "size"); long done = 0, last = 0, lastDone = 0, lastT = System.currentTimeMillis(); double speed = 0;
        final boolean[] cancelled = {false}; final HttpURLConnection[] conn = {null};
        aborts.put(tid, () -> { cancelled[0] = true; transfer(Json.map("id", tid, "state", "cancelled", "error", "You cancelled it")); if (conn[0] != null) conn[0].disconnect(); pool.execute(() -> { try { http("POST", ip, p, "/srk/cancel?s=" + session, "{}", 5000); } catch (IOException ignored) { } }); });
        transfer(Json.map("id", tid, "state", "sending"));
        try (InputStream in = host.openSource((String) f.get("ref"))) {
            HttpURLConnection c = (HttpURLConnection) new URL("http://" + ip + ":" + p + "/srk/upload?s=" + session + "&f=" + URLEncoder.encode(String.valueOf(f.get("id")), "UTF-8")).openConnection(); conn[0] = c;
            c.setRequestMethod("POST"); c.setDoOutput(true); c.setConnectTimeout(8000); c.setReadTimeout(60000); c.setFixedLengthStreamingMode(size); c.setRequestProperty("Content-Type", "application/octet-stream"); c.setRequestProperty("Connection", "close");
            byte[] buf = new byte[256 * 1024];
            try (OutputStream out = c.getOutputStream()) { int r; while ((r = in.read(buf)) > 0) { if (cancelled[0]) throw new IOException("cancelled"); out.write(buf, 0, r); done += r;
                    long now = System.currentTimeMillis(); if (now - last > 250) { double dt = (now - lastT) / 1000.0; if (dt > .4) { speed = (done - lastDone) / dt; lastDone = done; lastT = now; } last = now; progress(tid, done, size, speed); } } }
            int code = c.getResponseCode(); c.disconnect(); aborts.remove(tid);
            if (code == 200) transfer(Json.map("id", tid, "state", "done", "done", done)); else transfer(Json.map("id", tid, "state", code == 410 ? "cancelled" : "failed", "error", code == 410 ? "Cancelled by " + peerName : "Not accepted"));
        } catch (IOException e) { aborts.remove(tid); if (!cancelled[0]) { String st = null; try { st = Json.s(Json.obj(http("GET", ip, p, "/srk/status?s=" + session + "&f=" + URLEncoder.encode(String.valueOf(f.get("id")), "UTF-8"), null, 4000)), "state"); } catch (IOException ignored) { }
            if ("cancelled".equals(st)) transfer(Json.map("id", tid, "state", "cancelled", "error", "Cancelled by " + peerName)); else transfer(Json.map("id", tid, "state", "failed", "error", "The connection dropped")); } }
    }
    public void respond(String offerId, boolean accept, boolean always) { Offer o = offers.get(offerId); if (o == null) return; o.accept = accept; o.always = always; o.latch.countDown(); }
    public void cancel(String tid) { Runnable a = aborts.remove(tid); if (a != null) a.run(); else { Map<String, Object> t = transfers.get(tid); if (t != null && !isOver(t)) transfer(Json.map("id", tid, "state", "cancelled", "error", "You cancelled it")); } }
    public void setName(String n) { String v = n == null ? "" : n.trim(); if (v.length() > 40) v = v.substring(0, 40); name = v.isEmpty() ? host.deviceName() : v; host.setPref("name", name); pool.execute(() -> hello("hello", null)); emitSelf(); }
    public void untrust(String pid) { trusted.remove(pid); saveTrusted(); emitPeers(); emitSelf(); }
    void saveTrusted() { host.setPref("trusted", Json.str(new ArrayList<Object>(trusted))); }
    public String ref(String tid) { Map<String, Object> t = transfers.get(tid); return t == null ? null : (String) t.get("ref"); }
}
