package in.shazverse.srktorrent;

import org.libtorrent4j.AddTorrentParams;
import org.libtorrent4j.AlertListener;
import org.libtorrent4j.AnnounceEndpoint;
import org.libtorrent4j.AnnounceEntry;
import org.libtorrent4j.Entry;
import org.libtorrent4j.ErrorCode;
import org.libtorrent4j.FileStorage;
import org.libtorrent4j.PeerInfo;
import org.libtorrent4j.Priority;
import org.libtorrent4j.SessionHandle;
import org.libtorrent4j.SessionManager;
import org.libtorrent4j.SessionParams;
import org.libtorrent4j.SettingsPack;
import org.libtorrent4j.Sha1Hash;
import org.libtorrent4j.TorrentBuilder;
import org.libtorrent4j.TorrentFlags;
import org.libtorrent4j.TorrentHandle;
import org.libtorrent4j.TorrentInfo;
import org.libtorrent4j.TorrentStatus;
import org.libtorrent4j.Vectors;
import org.libtorrent4j.alerts.AddTorrentAlert;
import org.libtorrent4j.alerts.Alert;
import org.libtorrent4j.alerts.AlertType;
import org.libtorrent4j.alerts.FileErrorAlert;
import org.libtorrent4j.alerts.ListenFailedAlert;
import org.libtorrent4j.alerts.MetadataReceivedAlert;
import org.libtorrent4j.alerts.SaveResumeDataAlert;
import org.libtorrent4j.alerts.TorrentAlert;
import org.libtorrent4j.alerts.TorrentErrorAlert;
import org.libtorrent4j.swig.add_torrent_params;
import org.libtorrent4j.swig.error_code;
import org.libtorrent4j.swig.libtorrent;
import org.libtorrent4j.swig.settings_pack;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * SRK Torrent engine: libtorrent (via libtorrent4j) wrapped in a small JSON API.
 * The same class runs inside the Android app and, as a child process, inside the Windows app.
 * UI → engine: method calls. Engine → UI: JSON events through Host.emit.
 */
public final class TorrentEngine {
    public interface Host {
        void emit(String json);
        String pref(String key);
        void setPref(String key, String value);
        File dataDir();             // private folder for resume data
        String defaultSaveDir();
        String platform();          // "android" | "windows" | "linux"
    }

    public static final String VERSION = "1.0";
    private final Host host;
    private final SessionManager sm = new SessionManager(false);
    private final ScheduledExecutorService loop = Executors.newSingleThreadScheduledExecutor(r -> { Thread t = new Thread(r, "srk-torrent"); t.setDaemon(true); return t; });
    private final Map<String, byte[]> staged = new ConcurrentHashMap<>();       // .torrent files waiting in the "add" dialog
    private final Map<String, Map<String, Object>> stagedInfo = new ConcurrentHashMap<>();
    private final Set<String> finishedSeen = Collections.newSetFromMap(new ConcurrentHashMap<>());
    private final Set<String> removing = Collections.newSetFromMap(new ConcurrentHashMap<>());
    private final Map<String, Map<String, Object>> addOpts = new ConcurrentHashMap<>();  // options to apply when a magnet's metadata arrives
    private volatile CountDownLatch resumeLatch; private final AtomicInteger resumePending = new AtomicInteger();
    private volatile boolean started, networkPaused; private volatile String detailsFor; private volatile int listenPort;
    private long ticks;

    public TorrentEngine(Host host) { this.host = host; }

    /* ======================= lifecycle ======================= */
    public synchronized void start() {
        if (started) { emitSettings(); return; }
        started = true;
        File data = host.dataDir(); new File(data, "resume").mkdirs();
        SettingsPack sp = new SettingsPack(); applyPrefs(sp);
        SessionParams params;
        File state = new File(data, "session.dat");
        try { params = state.exists() ? new SessionParams(readAll(state)) : new SessionParams(); } catch (Throwable e) { params = new SessionParams(); }
        params.setSettings(sp);
        if ("android".equals(host.platform())) { try { params.setPosixDiskIO(); } catch (Throwable ignored) { } } // plain read/write works best with Android storage
        sm.addListener(new AlertListener() {
            @Override public int[] types() { return null; }
            @Override public void alert(Alert<?> a) { try { onAlert(a); } catch (Throwable e) { log("alert " + e); } }
        });
        sm.start(params);
        // bring back everything from last time
        File[] rs = new File(data, "resume").listFiles();
        if (rs != null) for (File f : rs) {
            if (!f.getName().endsWith(".resume")) continue;
            try { error_code ec = new error_code(); add_torrent_params p = libtorrent.read_resume_data_ex(Vectors.bytes2byte_vector(readAll(f)), ec);
                if (ec.value() != 0) { log("bad resume " + f.getName() + " " + ec.message()); continue; }
                sm.swig().async_add_torrent(p);
            } catch (Throwable e) { log("resume " + e); }
        }
        loop.scheduleWithFixedDelay(this::tick, 500, 1000, TimeUnit.MILLISECONDS);
        emitSettings();
    }

    /** Saves everything and shuts libtorrent down (blocks up to ~6 s). */
    public void stop() {
        if (!started) return;
        try {
            List<TorrentHandle> all = handles(); resumePending.set(0); resumeLatch = new CountDownLatch(1);
            for (TorrentHandle th : all) if (th.isValid()) { resumePending.incrementAndGet(); th.saveResumeData(TorrentHandle.SAVE_INFO_DICT); }
            if (resumePending.get() > 0) resumeLatch.await(5, TimeUnit.SECONDS);
            try { byte[] st = sm.saveState(); if (st != null) writeAll(new File(host.dataDir(), "session.dat"), st); } catch (Throwable e) { log("state " + e); }
        } catch (Throwable e) { log("stop " + e); }
        loop.shutdownNow(); sm.stop(); started = false;
    }

    /* ======================= adding torrents ======================= */
    /** Reads a .torrent file and emits {type:"inspect"} so the UI can show the add dialog. Returns the token. */
    public String stage(byte[] data, String sourceName) {
        try {
            TorrentInfo ti = new TorrentInfo(data);
            String token = "t" + Long.toString(System.nanoTime(), 36);
            staged.put(token, data);
            Map<String, Object> info = describe(ti); info.put("type", "inspect"); info.put("comment", metaString(data, "comment")); info.put("createdBy", metaString(data, "created by")); info.put("token", token);
            String hash = ti.infoHash().toHex(); info.put("exists", find(hash) != null); info.put("savePath", savePath());
            stagedInfo.put(token, info); emit(info); return token;
        } catch (Throwable e) { toast("This isn’t a valid .torrent file" + (sourceName == null ? "" : " (" + sourceName + ")")); return null; }
    }
    public String stageFile(String path) { try { return stage(readAll(new File(path)), new File(path).getName()); } catch (IOException e) { toast("Couldn’t open " + new File(path).getName()); return null; } }
    public void unstage(String token) { staged.remove(token); stagedInfo.remove(token); }

    /** opts: {savePath, skip:[file indexes], sequential, start} */
    public void addStaged(String token, String optsJson) {
        byte[] data = staged.remove(token); stagedInfo.remove(token); if (data == null) return;
        Map<String, Object> o = Json.obj(optsJson);
        try {
            TorrentInfo ti = new TorrentInfo(data);
            TorrentHandle ex = find(ti.infoHash().toHex()); if (ex != null) { toast("“" + ti.name() + "” is already in your list"); return; }
            AddTorrentParams p = new AddTorrentParams(); p.setTorrentInfo(ti); p.setSavePath(dir(o));
            Priority[] pr = Priority.array(Priority.DEFAULT, ti.numFiles());
            Object skip = o.get("skip"); if (skip instanceof List) for (Object x : (List<?>) skip) { int i = ((Number) x).intValue(); if (i >= 0 && i < pr.length) pr[i] = Priority.IGNORE; }
            p.filePriorities(pr);
            p.setFlags(flags(p, o));
            sm.swig().async_add_torrent(p.swig());
        } catch (Throwable e) { toast("Couldn’t add this torrent: " + e.getMessage()); }
    }

    /** Adds a magnet link (or a bare 40/32-character info-hash). */
    public void addMagnet(String uri, String optsJson) {
        String u = uri == null ? "" : uri.trim();
        if (u.matches("(?i)[0-9a-f]{40}|[a-z2-7]{32}")) u = "magnet:?xt=urn:btih:" + u;
        if (!u.toLowerCase(Locale.ROOT).startsWith("magnet:")) { toast("That doesn’t look like a magnet link"); return; }
        Map<String, Object> o = Json.obj(optsJson);
        try {
            AddTorrentParams p = AddTorrentParams.parseMagnetUri(u);
            String hash = p.getInfoHashes().getBest().toHex();
            if (find(hash) != null) { toast("This torrent is already in your list"); return; }
            if (p.getName() == null || p.getName().isEmpty()) p.setName(hash);
            p.setSavePath(dir(o)); p.setFlags(flags(p, o));
            addOpts.put(hash, o);
            sm.swig().async_add_torrent(p.swig());
        } catch (Throwable e) { toast("That magnet link isn’t valid"); }
    }

    private String dir(Map<String, Object> o) { String d = Json.s(o, "savePath"); if (d == null || d.isEmpty()) d = savePath(); new File(d).mkdirs(); return d; }
    private org.libtorrent4j.swig.torrent_flags_t flags(AddTorrentParams p, Map<String, Object> o) {
        org.libtorrent4j.swig.torrent_flags_t f = p.getFlags();
        if (Boolean.TRUE.equals(o.get("sequential"))) f = f.or_(TorrentFlags.SEQUENTIAL_DOWNLOAD);
        if (Boolean.FALSE.equals(o.get("start"))) f = f.or_(TorrentFlags.PAUSED).and_(TorrentFlags.AUTO_MANAGED.inv());
        else f = f.or_(TorrentFlags.AUTO_MANAGED);
        return f;
    }

    /** Builds a .torrent from a file or folder, saves it next to the content and starts seeding. */
    public void create(String path, String trackersText, String comment, boolean isPrivate) {
        loop.execute(() -> {
            File src = new File(path);
            if (!src.exists()) { toast("Can’t find " + path); return; }
            try {
                emit(Json.map("type", "creating", "name", src.getName(), "progress", 0));
                TorrentBuilder b = new TorrentBuilder().path(src).creator("SRK Torrent " + VERSION).flags(TorrentBuilder.V1_ONLY);
                if (comment != null && !comment.trim().isEmpty()) b.comment(comment.trim());
                if (trackersText != null) { int tier = 0; for (String t : trackersText.split("\\r?\\n")) { t = t.trim(); if (t.isEmpty()) { tier++; continue; } b.addTracker(t, tier); } }
                b.setPrivate(isPrivate);
                final long total = size(src);
                b.listener(new TorrentBuilder.Listener() {
                    @Override public boolean accept(String filename) { return !new File(filename).getName().startsWith("."); }
                    @Override public void progress(int piece, int num) { if (num > 0 && (piece % 20 == 0 || piece == num - 1)) emit(Json.map("type", "creating", "name", src.getName(), "progress", (double) (piece + 1) / num, "size", total)); }
                });
                TorrentBuilder.Result r = b.generate();
                byte[] bytes = r.entry().bencode();
                File out = new File(src.getParentFile(), src.getName() + ".torrent"); int n = 1;
                while (out.exists()) out = new File(src.getParentFile(), src.getName() + " (" + (n++) + ").torrent");
                try { writeAll(out, bytes); } catch (IOException e) { out = new File(savePath(), out.getName()); writeAll(out, bytes); }
                TorrentInfo ti = new TorrentInfo(bytes);
                AddTorrentParams p = new AddTorrentParams(); p.setTorrentInfo(ti); p.setSavePath(src.getParentFile().getAbsolutePath());
                p.setFlags(p.getFlags().or_(TorrentFlags.AUTO_MANAGED));
                sm.swig().async_add_torrent(p.swig());
                emit(Json.map("type", "created", "name", ti.name(), "file", out.getAbsolutePath(), "magnet", magnetOf(ti), "id", ti.infoHash().toHex()));
            } catch (Throwable e) { emit(Json.map("type", "created", "error", String.valueOf(e.getMessage()))); toast("Couldn’t create the torrent: " + e.getMessage()); }
        });
    }
    private static long size(File f) { if (f.isFile()) return f.length(); long s = 0; File[] k = f.listFiles(); if (k != null) for (File c : k) s += size(c); return s; }
    private static String magnetOf(TorrentInfo ti) { try { AddTorrentParams p = new AddTorrentParams(); p.setTorrentInfo(ti); return libtorrent.make_magnet_uri(p.swig()); } catch (Throwable e) { return "magnet:?xt=urn:btih:" + ti.infoHash().toHex(); } }

    /* ======================= actions on a torrent ======================= */
    public void pause(String id) { TorrentHandle th = find(id); if (th == null) return; th.unsetFlags(TorrentFlags.AUTO_MANAGED); th.pause(); th.saveResumeData(TorrentHandle.SAVE_INFO_DICT); }
    public void resume(String id) { TorrentHandle th = find(id); if (th == null) return; th.setFlags(TorrentFlags.AUTO_MANAGED); th.resume(); th.saveResumeData(TorrentHandle.SAVE_INFO_DICT); }
    /** start right now, ignoring the "max active downloads" queue */
    public void forceStart(String id) { TorrentHandle th = find(id); if (th == null) return; th.unsetFlags(TorrentFlags.AUTO_MANAGED); th.resume(); }
    public void pauseAll() { for (TorrentHandle th : handles()) { th.unsetFlags(TorrentFlags.AUTO_MANAGED); th.pause(); } }
    public void resumeAll() { for (TorrentHandle th : handles()) { th.setFlags(TorrentFlags.AUTO_MANAGED); th.resume(); } }
    public void remove(String id, boolean deleteFiles) {
        TorrentHandle th = find(id); if (th == null) return; removing.add(id);
        if (deleteFiles) sm.swig().remove_torrent(th.swig(), SessionHandle.DELETE_FILES); else sm.swig().remove_torrent(th.swig());
        new File(new File(host.dataDir(), "resume"), id + ".resume").delete(); finishedSeen.remove(id); addOpts.remove(id);
        emit(Json.map("type", "removed", "id", id, "deleted", deleteFiles));
    }
    /** "Add peer": connect to ip:port (IPv6 as [addr]:port) */
    public void connectPeer(String id, String addr) {
        TorrentHandle th = find(id); if (th == null || addr == null) return;
        try { String a = addr.trim(); int c = a.lastIndexOf(':'); if (c <= 0) throw new IllegalArgumentException(); String ip = a.substring(0, c).replace("[", "").replace("]", ""); int port = Integer.parseInt(a.substring(c + 1));
            th.swig().connect_peer(new org.libtorrent4j.TcpEndpoint(ip, port).swig()); toast("Connecting to " + a);
        } catch (Throwable e) { toast("Use the form 192.168.1.5:6881"); }
    }
    public void recheck(String id) { TorrentHandle th = find(id); if (th != null) th.forceRecheck(); }
    public void reannounce(String id) { TorrentHandle th = find(id); if (th != null) { th.forceReannounce(); th.forceDHTAnnounce(); toast("Asking trackers and DHT for more peers"); } }
    public void setSequential(String id, boolean on) { TorrentHandle th = find(id); if (th == null) return; if (on) th.setFlags(TorrentFlags.SEQUENTIAL_DOWNLOAD); else th.unsetFlags(TorrentFlags.SEQUENTIAL_DOWNLOAD); th.saveResumeData(TorrentHandle.SAVE_INFO_DICT); }
    /** prio: 0 skip, 1 low, 4 normal, 7 high */
    public void setFilePriority(String id, int index, int prio) { TorrentHandle th = find(id); if (th == null) return; th.filePriority(index, Priority.fromSwig(Math.max(0, Math.min(7, prio)))); th.saveResumeData(TorrentHandle.SAVE_INFO_DICT); if (id.equals(detailsFor)) loop.schedule(() -> details(id), 300, TimeUnit.MILLISECONDS); }
    public void setAllFiles(String id, int prio) { TorrentHandle th = find(id); if (th == null || !th.status().hasMetadata()) return; TorrentInfo ti = th.torrentFile(); if (ti == null) return; th.prioritizeFiles(Priority.array(Priority.fromSwig(prio), ti.numFiles())); th.saveResumeData(TorrentHandle.SAVE_INFO_DICT); if (id.equals(detailsFor)) loop.schedule(() -> details(id), 300, TimeUnit.MILLISECONDS); }
    public void addTrackers(String id, String text) { TorrentHandle th = find(id); if (th == null || text == null) return; int n = 0; for (String t : text.split("\\s+")) if (t.matches("(?i)(udp|https?|wss?)://.+")) { th.addTracker(new AnnounceEntry(t)); n++; } if (n > 0) { th.forceReannounce(); th.saveResumeData(TorrentHandle.SAVE_INFO_DICT); toast(n == 1 ? "Tracker added" : n + " trackers added"); details(id); } }
    public void setLimits(String id, int dlKB, int ulKB) { TorrentHandle th = find(id); if (th == null) return; th.setDownloadLimit(dlKB <= 0 ? -1 : dlKB * 1024); th.setUploadLimit(ulKB <= 0 ? -1 : ulKB * 1024); th.saveResumeData(TorrentHandle.SAVE_INFO_DICT); }
    public void move(String id, String newDir) { TorrentHandle th = find(id); if (th == null || newDir == null || newDir.isEmpty()) return; new File(newDir).mkdirs(); th.moveStorage(newDir); toast("Moving files…"); }
    public void queue(String id, String where) { TorrentHandle th = find(id); if (th == null) return; switch (where) { case "up": th.queuePositionUp(); break; case "down": th.queuePositionDown(); break; case "top": th.queuePositionTop(); break; default: th.queuePositionBottom(); } }
    public String magnet(String id) { TorrentHandle th = find(id); if (th == null) return ""; try { return libtorrent.make_magnet_uri_from_torrent_handle(th.swig()); } catch (Throwable e) { return th.makeMagnetUri(); } }
    /** Writes the .torrent of a torrent (after its metadata is known) to a folder. Returns the path or null. */
    public String exportTorrent(String id, String folder) {
        TorrentHandle th = find(id); if (th == null) return null; TorrentInfo ti = th.torrentFile(); if (ti == null) { toast("Wait until the torrent’s details are downloaded"); return null; }
        try { AddTorrentParams p = new AddTorrentParams(); p.setTorrentInfo(ti); List<String> trs = new ArrayList<>(); for (AnnounceEntry a : th.trackers()) trs.add(a.url()); p.setTrackers(trs); byte[] b = new Entry(libtorrent.write_torrent_file(p.swig())).bencode(); File out = new File(folder, safe(ti.name()) + ".torrent"); writeAll(out, b); return out.getAbsolutePath(); }
        catch (Throwable e) { toast("Couldn’t save the .torrent file"); return null; }
    }
    /** Absolute path of the downloaded content (the file for single-file torrents, else the folder), or of one file by index. */
    public String contentPath(String id, int fileIndex) {
        TorrentHandle th = find(id); if (th == null) return null; String base = th.savePath(); TorrentInfo ti = th.torrentFile();
        if (ti == null) return base;
        FileStorage fs = ti.files();
        if (fileIndex >= 0 && fileIndex < fs.numFiles()) return new File(base, fs.filePath(fileIndex)).getAbsolutePath();
        return new File(base, ti.numFiles() == 1 ? fs.filePath(0) : fs.name()).getAbsolutePath();
    }

    /* ======================= settings ======================= */
    public void setSettings(String json) {
        Map<String, Object> m = Json.obj(json);
        for (Map.Entry<String, Object> e : m.entrySet()) host.setPref(e.getKey(), e.getValue() == null ? null : String.valueOf(e.getValue()));
        SettingsPack sp = new SettingsPack(); applyPrefs(sp); sm.applySettings(sp);
        emitSettings();
    }
    /** global network pause, e.g. Android "Wi-Fi only" when on mobile data */
    public void setNetworkPaused(boolean paused) { if (paused == networkPaused) return; networkPaused = paused; if (paused) sm.pause(); else sm.resume(); }
    public boolean networkPaused() { return networkPaused; }
    private int prefInt(String k, int def) { try { String v = host.pref(k); return v == null || v.isEmpty() ? def : (int) Math.round(Double.parseDouble(v)); } catch (Exception e) { return def; } }
    private double prefDouble(String k, double def) { try { String v = host.pref(k); return v == null || v.isEmpty() ? def : Double.parseDouble(v); } catch (Exception e) { return def; } }
    private boolean prefBool(String k, boolean def) { String v = host.pref(k); return v == null ? def : "true".equals(v); }
    public String savePath() { String d = host.pref("savePath"); return d == null || d.isEmpty() ? host.defaultSaveDir() : d; }
    private void applyPrefs(SettingsPack sp) {
        int port = prefInt("port", 0);
        if (port <= 0) { port = 20000 + new java.util.Random().nextInt(30000); host.setPref("port", String.valueOf(port)); }
        sp.listenInterfaces("0.0.0.0:" + port + ",[::]:" + port);
        sp.setString(settings_pack.string_types.user_agent.swigValue(), "SRK Torrent/" + VERSION + " libtorrent");
        sp.setString(settings_pack.string_types.peer_fingerprint.swigValue(), "-SR1000-");
        sp.downloadRateLimit(Math.max(0, prefInt("dlLimit", 0)) * 1024);
        sp.uploadRateLimit(Math.max(0, prefInt("ulLimit", 0)) * 1024);
        int maxDl = prefInt("maxDownloads", 3), maxSeeds = prefInt("maxSeeds", 5);
        sp.activeDownloads(maxDl <= 0 ? -1 : maxDl); sp.activeSeeds(maxSeeds <= 0 ? -1 : maxSeeds); sp.activeLimit(maxDl <= 0 || maxSeeds <= 0 ? 500 : Math.max(8, maxDl + maxSeeds + 2));
        sp.connectionsLimit(Math.max(20, prefInt("maxConnections", "android".equals(host.platform()) ? 200 : 500)));
        sp.setEnableDht(prefBool("dht", true)); sp.setEnableLsd(prefBool("lsd", true));
        boolean upnp = prefBool("upnp", true);
        sp.setBoolean(settings_pack.bool_types.enable_upnp.swigValue(), upnp); sp.setBoolean(settings_pack.bool_types.enable_natpmp.swigValue(), upnp);
        sp.setBoolean(settings_pack.bool_types.dont_count_slow_torrents.swigValue(), true);
        sp.setBoolean(settings_pack.bool_types.announce_to_all_tiers.swigValue(), true);
        String enc = host.pref("encryption"); int pol = "require".equals(enc) ? 0 : "off".equals(enc) ? 2 : 1; // pe_forced, pe_enabled, pe_disabled
        sp.setInteger(settings_pack.int_types.out_enc_policy.swigValue(), pol); sp.setInteger(settings_pack.int_types.in_enc_policy.swigValue(), pol);
        sp.setInteger(settings_pack.int_types.allowed_enc_level.swigValue(), 3);
        sp.alertQueueSize(5000);
        if (prefBool("multiIp", false)) sp.setBoolean(settings_pack.bool_types.allow_multiple_connections_per_ip.swigValue(), true);
    }
    private void emitSettings() {
        emit(Json.map("type", "settings", "savePath", savePath(), "dlLimit", prefInt("dlLimit", 0), "ulLimit", prefInt("ulLimit", 0), "maxDownloads", prefInt("maxDownloads", 3), "maxSeeds", prefInt("maxSeeds", 5),
            "maxConnections", prefInt("maxConnections", "android".equals(host.platform()) ? 200 : 500), "port", prefInt("port", 0), "dht", prefBool("dht", true), "lsd", prefBool("lsd", true), "upnp", prefBool("upnp", true),
            "encryption", host.pref("encryption") == null ? "prefer" : host.pref("encryption"), "ratio", prefDouble("ratio", 0), "seedWhenDone", prefBool("seedWhenDone", true),
            "wifiOnly", prefBool("wifiOnly", false), "platform", host.platform(), "version", VERSION));
    }

    /* ======================= status ======================= */
    private void tick() {
        if (!started) return;
        try {
            ticks++;
            List<Object> rows = new ArrayList<>(); double ratioLimit = prefDouble("ratio", 0); boolean seedWhenDone = prefBool("seedWhenDone", true);
            for (TorrentHandle th : handles()) {
                if (!th.isValid()) continue;
                TorrentStatus s = th.status(TorrentHandle.QUERY_NAME.or_(TorrentHandle.QUERY_SAVE_PATH));
                String id = th.infoHash().toHex(); if (removing.contains(id)) continue;
                Map<String, Object> r = row(th, s, id); rows.add(r);
                boolean complete = s.isFinished() || s.isSeeding();
                boolean paused = s.flags().and_(TorrentFlags.PAUSED).non_zero();
                if (complete && s.hasMetadata() && s.totalWanted() > 0 && !finishedSeen.contains(id)) {
                    finishedSeen.add(id);
                    if (s.completedTime() > 0 && System.currentTimeMillis() / 1000 - s.completedTime() < 30) { // finished just now (not at startup)
                        emit(Json.map("type", "finished", "id", id, "name", s.name(), "path", contentPath(id, -1)));
                        th.saveResumeData(TorrentHandle.SAVE_INFO_DICT);
                        if (!seedWhenDone) pause(id);
                    }
                }
                if (complete && !paused && ratioLimit > 0 && ratio(s) >= ratioLimit) { pause(id); emit(Json.map("type", "toast", "msg", "Stopped seeding “" + s.name() + "” — share ratio " + String.format(Locale.US, "%.1f", ratioLimit) + " reached")); }
                if (ticks % 60 == 0 && s.needSaveResumeData().non_zero()) th.saveResumeData(TorrentHandle.SAVE_INFO_DICT.or_(TorrentHandle.ONLY_IF_MODIFIED));
            }
            emit(Json.map("type", "list", "torrents", rows, "dl", sm.downloadRate(), "ul", sm.uploadRate(), "dht", sm.dhtNodes(), "port", listenPort, "paused", networkPaused));
            String d = detailsFor; if (d != null && ticks % 2 == 0) details(d);
        } catch (Throwable e) { log("tick " + e); }
    }
    private static double ratio(TorrentStatus s) { long down = Math.max(s.allTimeDownload(), s.totalWantedDone()); return down <= 0 ? 0 : (double) s.allTimeUpload() / down; }
    private Map<String, Object> row(TorrentHandle th, TorrentStatus s, String id) {
        boolean paused = s.flags().and_(TorrentFlags.PAUSED).non_zero(), auto = s.flags().and_(TorrentFlags.AUTO_MANAGED).non_zero();
        String state; ErrorCode ec = s.errorCode();
        switch (s.state()) {
            case CHECKING_FILES: case CHECKING_RESUME_DATA: state = "checking"; break;
            case DOWNLOADING_METADATA: state = "metadata"; break;
            case FINISHED: case SEEDING: state = "seeding"; break;
            default: state = "downloading";
        }
        if (s.isMovingStorage()) state = "moving";
        else if (ec != null && ec.isError()) state = "error";
        else if (paused) state = ("seeding".equals(state) || s.isFinished()) ? "done" : (auto ? "queued" : "paused");
        if (networkPaused && !"done".equals(state) && !"paused".equals(state) && !"error".equals(state)) state = "waiting";
        long wanted = s.totalWanted(), done = s.totalWantedDone(); int dl = s.downloadPayloadRate(), ul = s.uploadPayloadRate();
        long eta = dl > 0 && wanted > done ? (wanted - done) / dl : -1;
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("id", id); r.put("name", s.name()); r.put("state", state); r.put("progress", "checking".equals(state) ? s.progress() : (wanted > 0 ? (double) done / wanted : s.progress()));
        r.put("size", wanted); r.put("done", done); r.put("dl", dl); r.put("ul", ul); r.put("eta", eta);
        r.put("seeds", s.numSeeds()); r.put("peers", Math.max(0, s.numPeers() - s.numSeeds()));
        r.put("seedsTotal", Math.max(s.listSeeds(), Math.max(0, s.numComplete()))); r.put("peersTotal", Math.max(s.listPeers() - s.listSeeds(), Math.max(0, s.numIncomplete())));
        r.put("uploaded", s.allTimeUpload()); r.put("downloaded", s.allTimeDownload()); r.put("ratio", ratio(s));
        r.put("added", s.addedTime()); r.put("completed", s.completedTime()); r.put("savePath", th.savePath()); r.put("queue", s.queuePosition());
        r.put("sequential", s.flags().and_(TorrentFlags.SEQUENTIAL_DOWNLOAD).non_zero()); r.put("metadata", s.hasMetadata()); r.put("forced", !paused && !auto);
        if ("error".equals(state)) r.put("error", ec.getMessage());
        return r;
    }

    /** Emits {type:"details"} for one torrent: files, trackers, peers and general info. Keeps refreshing while open. */
    public void details(String id) {
        detailsFor = id;
        TorrentHandle th = find(id); if (th == null) { emit(Json.map("type", "details", "id", id, "gone", true)); return; }
        try {
            TorrentStatus s = th.status(TorrentHandle.QUERY_NAME.or_(TorrentHandle.QUERY_SAVE_PATH));
            Map<String, Object> d = Json.map("type", "details", "id", id, "name", s.name(), "savePath", th.savePath(), "hash", id, "magnet", magnet(id));
            TorrentInfo ti = th.torrentFile();
            List<Object> files = new ArrayList<>();
            if (ti != null) {
                                d.put("pieces", ti.numPieces()); d.put("pieceSize", ti.pieceLength()); d.put("private", ti.isPrivate()); d.put("totalSize", ti.totalSize());
                FileStorage fs = ti.files(); long[] prog = th.fileProgress(TorrentHandle.PIECE_GRANULARITY); Priority[] pr = th.filePriorities();
                for (int i = 0; i < fs.numFiles(); i++) { if (fs.padFileAt(i)) continue;
                    files.add(Json.map("i", i, "path", fs.filePath(i), "size", fs.fileSize(i), "done", prog != null && i < prog.length ? prog[i] : 0, "prio", pr != null && i < pr.length ? (int) pr[i].swig() : 4)); }
            }
            d.put("files", files);
            List<Object> tr = new ArrayList<>();
            for (AnnounceEntry a : th.trackers()) {
                String status = "Not contacted yet", msg = ""; int seeds = -1, peers = -1; boolean working = false;
                for (AnnounceEndpoint ep : a.endpoints()) {
                    try { org.libtorrent4j.AnnounceInfohash ih = ep.infohashV1();
                        if (ih.isWorking()) { working = true; status = "Working"; }
                                                if (ih.updating()) status = "Updating…";
                        String m = ih.message(); if (m != null && !m.isEmpty()) msg = m;
                        if (!working && ih.fails() > 0) status = "Not working";
                    } catch (Throwable ignored) { }
                }
                tr.add(Json.map("url", a.url(), "tier", a.tier(), "status", status, "msg", msg, "seeds", seeds, "peers", peers));
            }
            tr.add(0, Json.map("url", "DHT", "status", sm.isDhtRunning() ? "Working" : "Off", "msg", sm.dhtNodes() + " nodes", "seeds", -1, "peers", -1, "special", true));
            d.put("trackers", tr);
            List<Object> peers = new ArrayList<>();
            try { for (PeerInfo p : th.peerInfo()) peers.add(Json.map("ip", p.ip(), "client", p.client(), "dl", p.downSpeed(), "ul", p.upSpeed(), "progress", p.progress(), "src", (int) p.source(), "seed", p.progress() >= 1f)); } catch (Throwable ignored) { }
            peers.sort((a, b) -> Long.compare(((Number) ((Map<?, ?>) b).get("dl")).longValue() + ((Number) ((Map<?, ?>) b).get("ul")).longValue(), ((Number) ((Map<?, ?>) a).get("dl")).longValue() + ((Number) ((Map<?, ?>) a).get("ul")).longValue()));
            d.put("peers", peers.size() > 200 ? peers.subList(0, 200) : peers);
            d.put("dlLimit", Math.max(0, th.getDownloadLimit()) / 1024); d.put("ulLimit", Math.max(0, th.getUploadLimit()) / 1024);
            emit(d);
        } catch (Throwable e) { log("details " + e); }
    }
    public void closeDetails() { detailsFor = null; }

    /* ======================= alerts ======================= */
    private void onAlert(Alert<?> a) {
        AlertType t = a.type();
        switch (t) {
            case ADD_TORRENT: {
                AddTorrentAlert x = (AddTorrentAlert) a;
                if (x.error().isError()) { if (!x.error().getMessage().toLowerCase(Locale.ROOT).contains("duplicate")) toast("Couldn’t add the torrent: " + x.error().getMessage()); break; }
                TorrentHandle th = x.handle(); String id = th.infoHash().toHex();
                TorrentStatus s = th.status(); if (s.isFinished() || s.isSeeding()) finishedSeen.add(id);
                th.saveResumeData(TorrentHandle.SAVE_INFO_DICT);
                if (ticks > 2) emit(Json.map("type", "added", "id", id, "name", th.getName()));
                break; }
            case METADATA_RECEIVED: {
                TorrentHandle th = ((MetadataReceivedAlert) a).handle(); String id = th.infoHash().toHex();
                th.saveResumeData(TorrentHandle.SAVE_INFO_DICT);
                emit(Json.map("type", "metadata", "id", id, "name", th.getName()));
                if (id.equals(detailsFor)) details(id);
                break; }
            case SAVE_RESUME_DATA: {
                SaveResumeDataAlert x = (SaveResumeDataAlert) a; String id = x.handle().infoHash().toHex();
                if (!removing.contains(id)) { try { byte[] b = AddTorrentParams.writeResumeDataBuf(x.params()); File f = new File(new File(host.dataDir(), "resume"), id + ".resume"); File tmp = new File(f.getPath() + ".tmp"); writeAll(tmp, b); if (!tmp.renameTo(f)) { f.delete(); tmp.renameTo(f); } } catch (Throwable e) { log("save resume " + e); } }
                doneResume(); break; }
            case SAVE_RESUME_DATA_FAILED: doneResume(); break;
            case TORRENT_REMOVED: { String id = ((TorrentAlert<?>) a).handle().infoHash().toHex(); removing.remove(id); break; }
            case TORRENT_ERROR: { TorrentErrorAlert x = (TorrentErrorAlert) a; emit(Json.map("type", "error", "id", x.handle().infoHash().toHex(), "msg", x.error().getMessage())); break; }
            case FILE_ERROR: { FileErrorAlert x = (FileErrorAlert) a; emit(Json.map("type", "error", "id", x.handle().infoHash().toHex(), "msg", "File problem: " + x.error().getMessage() + " — " + x.filename())); break; }
            case STORAGE_MOVED: { String id = ((TorrentAlert<?>) a).handle().infoHash().toHex(); toast("Files moved"); ((TorrentAlert<?>) a).handle().saveResumeData(TorrentHandle.SAVE_INFO_DICT); if (id.equals(detailsFor)) details(id); break; }
            case STORAGE_MOVED_FAILED: toast("Couldn’t move the files"); break;
            case LISTEN_SUCCEEDED: { try { listenPort = sm.swig().listen_port(); } catch (Throwable ignored) { } break; }
            case LISTEN_FAILED: { ListenFailedAlert x = (ListenFailedAlert) a; log("listen failed " + x.error().getMessage()); break; }
            default:
        }
    }
    private void doneResume() { CountDownLatch l = resumeLatch; if (l != null && resumePending.decrementAndGet() <= 0) l.countDown(); }

    /* ======================= helpers ======================= */
    private Map<String, Object> describe(TorrentInfo ti) {
        List<Object> files = new ArrayList<>(); FileStorage fs = ti.files();
        for (int i = 0; i < fs.numFiles(); i++) if (!fs.padFileAt(i)) files.add(Json.map("i", i, "path", fs.filePath(i), "size", fs.fileSize(i)));
        return Json.map("name", ti.name(), "size", ti.totalSize(), "files", files, "hash", ti.infoHash().toHex(), "private", ti.isPrivate(), "pieces", ti.numPieces(), "pieceSize", ti.pieceLength());
    }
    private static String metaString(byte[] data, String key) { try { Entry e = Entry.bdecode(data).dictionary().get(key); return e == null ? "" : e.string(); } catch (Throwable t) { return ""; } }
    public List<TorrentHandle> handles() { try { return new SessionHandle(sm.swig()).torrents(); } catch (Throwable e) { return new ArrayList<>(); } }
    public TorrentHandle find(String id) {
        if (id == null || !sm.isRunning()) return null;
        try { if (id.length() == 40) { TorrentHandle th = sm.find(Sha1Hash.parseHex(id)); return th != null && th.isValid() ? th : null; } } catch (Throwable ignored) { }
        for (TorrentHandle th : handles()) if (th.isValid() && th.infoHash().toHex().equalsIgnoreCase(id)) return th;
        return null;
    }
    public boolean busy() { for (TorrentHandle th : handles()) { try { TorrentStatus s = th.status(); if (!s.flags().and_(TorrentFlags.PAUSED).non_zero() && (s.downloadPayloadRate() > 0 || s.uploadPayloadRate() > 0 || !s.isFinished())) return true; } catch (Throwable ignored) { } } return false; }
    /** quick numbers for an Android notification: [active downloads, dl B/s, ul B/s, % of all wanted] */
    public long[] summary() { long active = 0, wanted = 0, done = 0; for (TorrentHandle th : handles()) { try { TorrentStatus s = th.status(); if (s.flags().and_(TorrentFlags.PAUSED).non_zero()) continue; if (!s.isFinished()) { active++; wanted += s.totalWanted(); done += s.totalWantedDone(); } } catch (Throwable ignored) { } } return new long[]{active, sm.downloadRate(), sm.uploadRate(), wanted > 0 ? done * 100 / wanted : 100}; }
    private void emit(Map<String, Object> m) { host.emit(Json.str(m)); }
    private void toast(String msg) { emit(Json.map("type", "toast", "msg", msg)); }
    private static void log(String s) { System.err.println("[srk-torrent] " + s); }
    static String safe(String n) { String c = (n == null ? "torrent" : n).replaceAll("[\\\\/:*?\"<>|]+", "-").trim(); return c.isEmpty() ? "torrent" : c; }
    public static byte[] readAll(File f) throws IOException { try (InputStream in = new FileInputStream(f)) { return readAll(in); } }
    public static byte[] readAll(InputStream in) throws IOException { ByteArrayOutputStream o = new ByteArrayOutputStream(); byte[] b = new byte[65536]; int n; long total = 0; while ((n = in.read(b)) > 0) { o.write(b, 0, n); total += n; if (total > 64L * 1024 * 1024) throw new IOException("too big"); } return o.toByteArray(); }
    static void writeAll(File f, byte[] b) throws IOException { File p = f.getParentFile(); if (p != null) p.mkdirs(); try (FileOutputStream o = new FileOutputStream(f)) { o.write(b); } }
}
