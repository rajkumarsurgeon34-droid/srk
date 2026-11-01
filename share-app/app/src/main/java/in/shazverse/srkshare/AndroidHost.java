package in.shazverse.srkshare;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.provider.MediaStore;
import android.provider.Settings;

import androidx.core.app.NotificationCompat;

import java.io.BufferedOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/** Android side of the share engine: saving into Downloads/SRK Share, reading picked files, settings, and events to the page. */
public final class AndroidHost implements ShareEngine.Host {
    public interface Page { void deliver(String json); boolean visible(); }

    private static AndroidHost instance;
    public static synchronized AndroidHost get(Context c) { if (instance == null) instance = new AndroidHost(c.getApplicationContext()); return instance; }
    private static ShareEngine engine;
    public static synchronized ShareEngine engine(Context c) { if (engine == null) engine = new ShareEngine(get(c)); return engine; }

    private final Context ctx; private final SharedPreferences prefs; private final Handler main = new Handler(Looper.getMainLooper());
    private volatile Page page; private volatile boolean ready; private final List<String> queue = new ArrayList<>();
    private AndroidHost(Context c) { ctx = c; prefs = c.getSharedPreferences("srk-share", Context.MODE_PRIVATE); }

    public synchronized void attach(Page p) { page = p; ready = false; }
    public synchronized void detach(Page p) { if (page == p) { page = null; ready = false; } }
    /** the page has started: send it what happened while it wasn't listening */
    public synchronized void pageReady() { ready = true; List<String> q = new ArrayList<>(queue); queue.clear(); Page p = page; if (p != null) main.post(() -> { for (String j : q) p.deliver(j); }); }

    @Override public void emit(String json) {
        Map<String, Object> ev = Json.obj(json); String type = (String) ev.get("type");
        Page p; synchronized (this) { p = page; if (p == null || !ready) { if (!"progress".equals(type) && queue.size() < 500) queue.add(json); } }
        if (p != null && ready) main.post(() -> p.deliver(json));
        if ("offer".equals(type) && (p == null || !p.visible())) notifyOffer(ev);
        if ("text".equals(type) && (p == null || !p.visible())) notifyText(ev);
    }
    @Override public String pref(String k) { return prefs.getString(k, null); }
    @Override public void setPref(String k, String v) { prefs.edit().putString(k, v).apply(); }
    @Override public String platform() { return "android"; }
    @Override public String deviceName() {
        String n = null;
        try { if (Build.VERSION.SDK_INT >= 25) n = Settings.Global.getString(ctx.getContentResolver(), Settings.Global.DEVICE_NAME); } catch (Exception ignored) { }
        if (n == null || n.trim().isEmpty()) { String m = Build.MODEL == null ? "Android phone" : Build.MODEL; String b = Build.MANUFACTURER == null ? "" : Build.MANUFACTURER; n = m.toLowerCase().startsWith(b.toLowerCase()) ? m : (b.isEmpty() ? m : cap(b) + " " + m); }
        return n.trim();
    }
    private static String cap(String s) { return s.isEmpty() ? s : Character.toUpperCase(s.charAt(0)) + s.substring(1); }
    @Override public InputStream openSource(String ref) throws IOException { InputStream in = ctx.getContentResolver().openInputStream(Uri.parse(ref)); if (in == null) throw new IOException("can't read file"); return in; }

    @Override public ShareEngine.Sink openSink(String name, String mime, long size) throws IOException {
        if (mime == null || mime.isEmpty()) { String ext = name.contains(".") ? name.substring(name.lastIndexOf('.') + 1).toLowerCase() : ""; mime = android.webkit.MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext); if (mime == null) mime = "application/octet-stream"; }
        if (Build.VERSION.SDK_INT >= 29) {
            ContentResolver cr = ctx.getContentResolver(); ContentValues v = new ContentValues();
            v.put(MediaStore.MediaColumns.DISPLAY_NAME, name); v.put(MediaStore.MediaColumns.MIME_TYPE, mime); v.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/SRK Share"); v.put(MediaStore.MediaColumns.IS_PENDING, 1);
            final Uri uri = cr.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v); if (uri == null) throw new IOException("storage unavailable");
            final OutputStream os = cr.openOutputStream(uri); if (os == null) { cr.delete(uri, null, null); throw new IOException("storage unavailable"); }
            final OutputStream bos = new BufferedOutputStream(os, 512 * 1024); final String[] fin = {name};
            return new ShareEngine.Sink() {
                public OutputStream out() { return bos; }
                public String ref() { return uri.toString(); }
                public String name() { return fin[0]; }
                public void commit() throws IOException { bos.close(); ContentValues d = new ContentValues(); d.put(MediaStore.MediaColumns.IS_PENDING, 0); cr.update(uri, d, null, null);
                    try (Cursor c = cr.query(uri, new String[]{MediaStore.MediaColumns.DISPLAY_NAME}, null, null, null)) { if (c != null && c.moveToFirst() && c.getString(0) != null) fin[0] = c.getString(0); } catch (Exception ignored) { } }
                public void abort() { try { bos.close(); } catch (IOException ignored) { } try { cr.delete(uri, null, null); } catch (Exception ignored) { } }
            };
        }
        File dir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), "SRK Share"); if (!dir.exists() && !dir.mkdirs()) throw new IOException("can't create Download/SRK Share");
        File f; synchronized (AndroidHost.class) { f = new File(dir, name); int n = 1; String base = name.contains(".") ? name.substring(0, name.lastIndexOf('.')) : name, ext = name.contains(".") ? name.substring(name.lastIndexOf('.')) : "";
            while (f.exists() || new File(f.getPath() + ".part").exists()) f = new File(dir, base + " (" + (n++) + ")" + ext); if (!new File(f.getPath() + ".part").createNewFile()) throw new IOException("can't save"); }
        final File target = f, part = new File(f.getPath() + ".part"); final OutputStream bos = new BufferedOutputStream(new FileOutputStream(part), 512 * 1024); final String m = mime;
        return new ShareEngine.Sink() {
            public OutputStream out() { return bos; }
            public String ref() { return Uri.fromFile(target).toString(); }
            public String name() { return target.getName(); }
            public void commit() throws IOException { bos.close(); if (!part.renameTo(target)) throw new IOException("can't save"); android.media.MediaScannerConnection.scanFile(ctx, new String[]{target.getPath()}, new String[]{m}, null); }
            public void abort() { try { bos.close(); } catch (IOException ignored) { } part.delete(); }
        };
    }

    /* ---------- notifications when the app isn't on screen ---------- */
    static final String CH_INCOMING = "incoming", CH_SERVICE = "service";
    static void channels(Context c) {
        if (Build.VERSION.SDK_INT < 26) return; NotificationManager nm = c.getSystemService(NotificationManager.class);
        nm.createNotificationChannel(new NotificationChannel(CH_INCOMING, "Incoming files", NotificationManager.IMPORTANCE_HIGH));
        NotificationChannel s = new NotificationChannel(CH_SERVICE, "Ready to receive", NotificationManager.IMPORTANCE_LOW); s.setShowBadge(false); nm.createNotificationChannel(s);
    }
    private PendingIntent openApp() { Intent i = new Intent(ctx, MainActivity.class); i.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP); return PendingIntent.getActivity(ctx, 0, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT); }
    @SuppressWarnings("unchecked") private void notifyOffer(Map<String, Object> ev) {
        try { channels(ctx); Map<String, Object> from = (Map<String, Object>) ev.get("from"); List<Object> items = (List<Object>) ev.get("items"); String who = from == null ? "A device" : String.valueOf(from.get("name"));
            NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, CH_INCOMING).setSmallIcon(android.R.drawable.stat_sys_download).setContentTitle(who + " wants to send you " + items.size() + (items.size() == 1 ? " file" : " files")).setContentText("Tap to accept or decline").setPriority(NotificationCompat.PRIORITY_HIGH).setAutoCancel(true).setContentIntent(openApp()).setCategory(NotificationCompat.CATEGORY_MESSAGE);
            ((NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE)).notify(1000 + (int) (System.currentTimeMillis() % 1000), b.build()); } catch (Exception ignored) { }
    }
    @SuppressWarnings("unchecked") private void notifyText(Map<String, Object> ev) {
        try { channels(ctx); Map<String, Object> from = (Map<String, Object>) ev.get("from"); String who = from == null ? "A device" : String.valueOf(from.get("name"));
            NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, CH_INCOMING).setSmallIcon(android.R.drawable.stat_notify_chat).setContentTitle("Text from " + who).setContentText(String.valueOf(ev.get("text"))).setStyle(new NotificationCompat.BigTextStyle().bigText(String.valueOf(ev.get("text")))).setAutoCancel(true).setContentIntent(openApp());
            ((NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE)).notify(2000 + (int) (System.currentTimeMillis() % 1000), b.build()); } catch (Exception ignored) { }
    }
}
