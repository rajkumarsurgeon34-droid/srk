package in.shazverse.srktorrent;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;

import androidx.core.app.NotificationCompat;

import java.io.File;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/** Android side of the torrent engine: settings, storage folders, events to the page, and "download finished" notifications. */
public final class TorrentHost implements TorrentEngine.Host {
    public interface Page { void deliver(String json); boolean visible(); }

    private static TorrentHost instance; private static TorrentEngine engine;
    public static synchronized TorrentHost get(Context c) { if (instance == null) instance = new TorrentHost(c.getApplicationContext()); return instance; }
    public static synchronized TorrentEngine engine(Context c) { if (engine == null) engine = new TorrentEngine(get(c)); return engine; }
    public static synchronized boolean running() { return engine != null; }
    /** stop and forget the engine (Quit) */
    public static void shutdown() { TorrentEngine e; synchronized (TorrentHost.class) { e = engine; engine = null; } if (e != null) e.stop(); }

    private final Context ctx; private final SharedPreferences prefs; private final Handler main = new Handler(Looper.getMainLooper());
    private volatile Page page; private volatile boolean ready; private final List<String> queue = new ArrayList<>();
    private TorrentHost(Context c) { ctx = c; prefs = c.getSharedPreferences("srk-torrent", Context.MODE_PRIVATE); }

    public synchronized void attach(Page p) { page = p; ready = false; }
    public synchronized void detach(Page p) { if (page == p) { page = null; ready = false; } }
    public synchronized void pageReady() { ready = true; List<String> q = new ArrayList<>(queue); queue.clear(); Page p = page; if (p != null) main.post(() -> { for (String j : q) p.deliver(j); }); }

    @Override public void emit(String json) {
        String type = typeOf(json);
        Page p; synchronized (this) { p = page; if (p == null || !ready) { if (!"list".equals(type) && !"details".equals(type) && !"creating".equals(type) && queue.size() < 300) queue.add(json); } }
        if (p != null && ready) main.post(() -> p.deliver(json));
        if ("finished".equals(type)) notifyFinished(Json.obj(json));
    }
    private static String typeOf(String json) { int i = json.indexOf("\"type\":\""); if (i < 0) return ""; int s = i + 8, e = json.indexOf('"', s); return e > s ? json.substring(s, e) : ""; }
    @Override public String pref(String k) { return prefs.getString(k, null); }
    @Override public void setPref(String k, String v) { if (v == null) prefs.edit().remove(k).apply(); else prefs.edit().putString(k, v).apply(); }
    @Override public File dataDir() { File d = new File(ctx.getFilesDir(), "torrent"); d.mkdirs(); return d; }
    @Override public String platform() { return "android"; }
    @Override public String defaultSaveDir() {
        File d = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), "SRK Torrent");
        if (!d.exists()) d.mkdirs();
        if (d.isDirectory() && d.canWrite()) return d.getAbsolutePath();
        File app = new File(ctx.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), "SRK Torrent"); app.mkdirs(); return app.getAbsolutePath(); // no storage access: app's own folder
    }
    public boolean wifiOnly() { return "true".equals(prefs.getString("wifiOnly", "false")); }

    /* ---------- notifications ---------- */
    static final String CH_DONE = "finished", CH_SERVICE = "service";
    static void channels(Context c) {
        if (Build.VERSION.SDK_INT < 26) return; NotificationManager nm = c.getSystemService(NotificationManager.class);
        nm.createNotificationChannel(new NotificationChannel(CH_DONE, "Finished downloads", NotificationManager.IMPORTANCE_DEFAULT));
        NotificationChannel s = new NotificationChannel(CH_SERVICE, "Downloading and seeding", NotificationManager.IMPORTANCE_LOW); s.setShowBadge(false); nm.createNotificationChannel(s);
    }
    PendingIntent openApp() { Intent i = new Intent(ctx, MainActivity.class); i.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP); return PendingIntent.getActivity(ctx, 0, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT); }
    private void notifyFinished(Map<String, Object> ev) {
        Page p = page; if (p != null && p.visible()) return;
        try { channels(ctx);
            NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, CH_DONE).setSmallIcon(android.R.drawable.stat_sys_download_done).setContentTitle("Download finished").setContentText(String.valueOf(ev.get("name"))).setAutoCancel(true).setContentIntent(openApp());
            ((NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE)).notify(3000 + (int) (System.currentTimeMillis() % 1000), b.build());
        } catch (Exception ignored) { }
    }
}
