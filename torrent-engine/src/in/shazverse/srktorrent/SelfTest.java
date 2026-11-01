package in.shazverse.srktorrent;

import java.io.File;
import java.io.FileOutputStream;
import java.io.PrintStream;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.function.Predicate;

/** End-to-end test with real libtorrent: seed, download from .torrent, download from magnet, skip a file, pause/resume, restart, remove. */
public final class SelfTest {
    static PrintStream log = System.out; static int pass, fail;
    static void check(String what, boolean ok) { log.println((ok ? "PASS " : "FAIL ") + what); if (ok) pass++; else fail++; }

    static final class Node implements TorrentEngine.Host {
        final String name; final File data, save; final Map<String, String> prefs = new ConcurrentHashMap<>(); final List<Map<String, Object>> ev = new CopyOnWriteArrayList<>(); volatile Map<String, Object> lastList;
        TorrentEngine e;
        Node(String name, File root, int port) { this.name = name; data = new File(root, name + "-data"); save = new File(root, name + "-dl"); prefs.put("port", "" + port); prefs.put("multiIp", "true"); prefs.put("dht", "false"); prefs.put("upnp", "false"); prefs.put("lsd", "false"); e = new TorrentEngine(this); }
        public void emit(String json) { Map<String, Object> m = Json.obj(json); if ("list".equals(m.get("type"))) lastList = m; else { ev.add(m); if (!"creating".equals(m.get("type"))) log.println("   [" + name + "] " + (json.length() > 300 ? json.substring(0, 300) + "…" : json)); } }
        public String pref(String k) { return prefs.get(k); }
        public void setPref(String k, String v) { if (v == null) prefs.remove(k); else prefs.put(k, v); }
        public File dataDir() { return data; }
        public String defaultSaveDir() { return save.getAbsolutePath(); }
        public String platform() { return System.getProperty("os.name", "").toLowerCase().contains("win") ? "windows" : "linux"; }
        Map<String, Object> waitEvent(String type, long ms) { return waitFor(m -> type.equals(m.get("type")), ms); }
        Map<String, Object> waitFor(Predicate<Map<String, Object>> p, long ms) { long end = System.currentTimeMillis() + ms; int seen = 0; while (System.currentTimeMillis() < end) { for (int i = seen; i < ev.size(); i++) if (p.test(ev.get(i))) { Map<String, Object> m = ev.remove(i); return m; } sleep(100); } return null; }
        @SuppressWarnings("unchecked") Map<String, Object> row(String id) { Map<String, Object> l = lastList; if (l == null) return null; for (Object o : (List<Object>) l.get("torrents")) if (id.equals(((Map<String, Object>) o).get("id"))) return (Map<String, Object>) o; return null; }
        Map<String, Object> waitRow(String id, Predicate<Map<String, Object>> p, long ms) { long end = System.currentTimeMillis() + ms; while (System.currentTimeMillis() < end) { Map<String, Object> r = row(id); if (r != null && p.test(r)) return r; sleep(200); } return row(id); }
        int port() { return Integer.parseInt(prefs.get("port")); }
    }

    public static void main(String[] args) throws Exception {
        File root = new File(args.length > 0 ? args[0] : "selftest-root"); deleteTree(root); root.mkdirs();
        if (args.length > 1) log = new PrintStream(new FileOutputStream(args[1]), true, "UTF-8");
        log.println("libtorrent " + org.libtorrent4j.LibTorrent.version());
        // content: one big file and a folder with several files
        File content = new File(root, "seed-content"); File big = new File(content, "Surgery video.mp4"); write(big, 24 * 1024 * 1024 + 12345, 1);
        File folder = new File(content, "Lecture notes"); write(new File(folder, "Notes.pdf"), 3 * 1024 * 1024, 2); write(new File(folder, "Slides.pptx"), 5 * 1024 * 1024 + 7, 3); write(new File(folder, "sub/Readme.txt"), 1500, 4); write(new File(folder, "Big skip me.bin"), 9 * 1024 * 1024, 5);

        Node A = new Node("seeder", root, 41001), B = new Node("phone", root, 41002), C = new Node("laptop", root, 41003);
        A.e.start(); B.e.start(); C.e.start(); sleep(1500);
        check("engines start and report a list", A.lastList != null && B.lastList != null);

        // 1. create torrents (single file + folder) on A — it seeds them
        A.e.create(big.getAbsolutePath(), "udp://tracker.opentrackr.org:1337/announce", "test", false);
        Map<String, Object> c1 = A.waitEvent("created", 60000); check("create .torrent from a file", c1 != null && c1.get("file") != null && new File(String.valueOf(c1.get("file"))).exists());
        A.e.create(folder.getAbsolutePath(), "", "", false);
        Map<String, Object> c2 = A.waitEvent("created", 60000); check("create .torrent from a folder", c2 != null && c2.get("file") != null);
        String id1 = String.valueOf(c1.get("id")), id2 = String.valueOf(c2.get("id"));
        Map<String, Object> r1 = A.waitRow(id1, r -> "seeding".equals(r.get("state")), 30000); check("seeder is seeding the file (" + (r1 == null ? null : r1.get("state")) + ")", r1 != null && "seeding".equals(r1.get("state")));
        Map<String, Object> r2 = A.waitRow(id2, r -> "seeding".equals(r.get("state")), 30000); check("seeder is seeding the folder", r2 != null && "seeding".equals(r2.get("state")));

        // 2. B adds the folder .torrent, skipping one file
        B.e.stageFile(String.valueOf(c2.get("file")));
        Map<String, Object> insp = B.waitEvent("inspect", 10000);
        @SuppressWarnings("unchecked") List<Map<String, Object>> files = insp == null ? new ArrayList<>() : (List<Map<String, Object>>) insp.get("files");
        check("inspect shows the 4 files", files.size() == 4);
        int skip = -1; for (Map<String, Object> f : files) if (String.valueOf(f.get("path")).contains("skip me")) skip = ((Number) f.get("i")).intValue();
        B.e.addStaged(String.valueOf(insp.get("token")), "{\"skip\":[" + skip + "]}");
        sleep(800); B.e.connectPeer(id2, "127.0.0.1:" + A.port());
        Map<String, Object> rb = B.waitRow(id2, r -> "seeding".equals(r.get("state")), 120000);
        check("download from .torrent completes (" + (rb == null ? null : rb.get("state") + " " + rb.get("progress")) + ")", rb != null && "seeding".equals(rb.get("state")));
        check("finished event", B.waitEvent("finished", 5000) != null);
        File bf = new File(B.save, "Lecture notes");
        check("Notes.pdf identical", same(new File(folder, "Notes.pdf"), new File(bf, "Notes.pdf")));
        check("Slides.pptx identical", same(new File(folder, "Slides.pptx"), new File(bf, "Slides.pptx")));
        check("sub/Readme.txt identical", same(new File(folder, "sub/Readme.txt"), new File(bf, "sub/Readme.txt")));
        File skipped = new File(bf, "Big skip me.bin"); check("skipped file not downloaded (" + (skipped.exists() ? skipped.length() : -1) + " bytes)", !skipped.exists() || !same(new File(folder, "Big skip me.bin"), skipped));

        // 3. C adds by magnet link only
        String magnet = String.valueOf(c1.get("magnet")); log.println("   magnet " + magnet);
        C.e.addMagnet(magnet, "{\"sequential\":true}");
        sleep(800); C.e.connectPeer(id1, "127.0.0.1:" + A.port());
        Map<String, Object> md = C.waitEvent("metadata", 60000); check("magnet: metadata received from peer", md != null);
        Map<String, Object> rc = C.waitRow(id1, r -> "seeding".equals(r.get("state")), 120000);
        check("magnet download completes", rc != null && "seeding".equals(rc.get("state")));
        check("video identical after magnet download", same(big, new File(C.save, big.getName())));
        check("sequential flag kept", rc != null && Boolean.TRUE.equals(rc.get("sequential")));

        // 4. details
        C.e.details(id1); Map<String, Object> det = C.waitEvent("details", 5000);
        check("details: files/trackers/peers present", det != null && det.get("files") instanceof List && det.get("trackers") instanceof List && det.get("peers") instanceof List);
        C.e.closeDetails();
        check("magnet link from torrent", C.e.magnet(id1).startsWith("magnet:?"));
        check("content path", new File(C.e.contentPath(id1, -1)).getName().equals(big.getName()));

        // 5. pause / resume
        C.e.pause(id1); Map<String, Object> pr = C.waitRow(id1, r -> "done".equals(r.get("state")), 5000); check("pause a finished torrent → done", pr != null && "done".equals(pr.get("state")));
        C.e.resume(id1); pr = C.waitRow(id1, r -> "seeding".equals(r.get("state")), 5000); check("resume → seeding", pr != null && "seeding".equals(pr.get("state")));

        // 6. restart B: torrent comes back finished without re-downloading
        B.e.stop(); sleep(500);
        Node B2 = new Node("phone", root, 41004); B2.prefs.putAll(B.prefs); B2.prefs.put("port", "41004"); B2.e.start();
        Map<String, Object> rb2 = B2.waitRow(id2, r -> "seeding".equals(r.get("state")), 30000);
        check("after restart the torrent is back and complete", rb2 != null && "seeding".equals(rb2.get("state")) && ((Number) rb2.get("progress")).doubleValue() >= 0.999);

        // 7. remove with files
        C.e.remove(id1, true); sleep(2500);
        check("remove + delete files", C.row(id1) == null && !new File(C.save, big.getName()).exists());

        // 8. settings round trip
        A.e.setSettings("{\"dlLimit\":500,\"ratio\":2}"); Map<String, Object> st = A.waitFor(m -> "settings".equals(m.get("type")) && ((Number) m.get("dlLimit")).intValue() == 500, 3000);
        check("settings saved", st != null && ((Number) st.get("dlLimit")).intValue() == 500);

        // 9. bad input
        B2.e.addMagnet("hello", "{}"); check("bad magnet → friendly message", B2.waitEvent("toast", 3000) != null);
        B2.e.stage(new byte[]{1, 2, 3}, "x.torrent"); check("bad .torrent → friendly message", B2.waitEvent("toast", 3000) != null);

        A.e.stop(); B2.e.stop(); C.e.stop();
        log.println("RESULT " + pass + " passed, " + fail + " failed");
        System.exit(fail == 0 ? 0 : 1);
    }

    static void write(File f, int size, long seed) throws Exception { f.getParentFile().mkdirs(); Random r = new Random(seed); byte[] b = new byte[size]; r.nextBytes(b); try (FileOutputStream o = new FileOutputStream(f)) { o.write(b); } }
    static boolean same(File a, File b) { try { if (!b.exists() || a.length() != b.length()) return false; return MessageDigest.isEqual(sha(a), sha(b)); } catch (Exception e) { return false; } }
    static byte[] sha(File f) throws Exception { MessageDigest d = MessageDigest.getInstance("SHA-1"); d.update(TorrentEngine.readAll(new java.io.FileInputStream(f)) ); return d.digest(); }
    static void sleep(long ms) { try { Thread.sleep(ms); } catch (InterruptedException ignored) { } }
    static void deleteTree(File f) { File[] k = f.listFiles(); if (k != null) for (File c : k) deleteTree(c); f.delete(); }
}
