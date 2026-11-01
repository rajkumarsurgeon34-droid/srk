package in.shazverse.srkvpn;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;

import androidx.core.app.NotificationCompat;

import com.wireguard.android.backend.BackendException;
import com.wireguard.android.backend.GoBackend;
import com.wireguard.android.backend.Statistics;
import com.wireguard.android.backend.Tunnel;
import com.wireguard.config.Config;
import com.wireguard.config.Peer;
import com.wireguard.crypto.Key;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Keeps the saved tunnels (WireGuard configs) and switches the VPN on and off through WireGuard's GoBackend. */
public final class VpnManager {
    public interface Listener { void onEvent(String json); }
    private static VpnManager instance;
    public static synchronized VpnManager get(Context c) { if (instance == null) instance = new VpnManager(c.getApplicationContext()); return instance; }

    private final Context ctx; private final File dir; private final SharedPreferences prefs;
    private final ExecutorService exec = Executors.newSingleThreadExecutor(r -> { Thread t = new Thread(r, "srk-vpn"); t.setDaemon(true); return t; });
    private final Handler main = new Handler(Looper.getMainLooper());
    private volatile GoBackend backend; private volatile Listener listener;
    private final Map<String, T> tunnels = new HashMap<>();
    private volatile String activeId; private volatile long since; private volatile String state = "down"; private volatile String lastError;

    private VpnManager(Context c) { ctx = c; dir = new File(c.getFilesDir(), "tunnels"); dir.mkdirs(); prefs = c.getSharedPreferences("srk-vpn", Context.MODE_PRIVATE); }
    public void setListener(Listener l) { listener = l; }
    private GoBackend backend() { if (backend == null) synchronized (this) { if (backend == null) backend = new GoBackend(ctx); } return backend; }
    void emit(Object... kv) { Listener l = listener; if (l != null) { String j = Json.str(Json.map(kv)); main.post(() -> l.onEvent(j)); } }

    /** WireGuard calls this when a tunnel goes up or down (also when Android stops the VPN, e.g. another VPN app took over) */
    private final class T implements Tunnel {
        final String id, name; T(String id) { this.id = id; this.name = Tunnels.ifaceName(id); }
        @Override public String getName() { return name; }
        @Override public void onStateChange(State s) {
            if (s == State.DOWN && id.equals(activeId)) { activeId = null; state = "down"; since = 0; notifyConnected(null); emitStatus(); emitList(); }
        }
    }
    private synchronized T tunnel(String id) { T t = tunnels.get(id); if (t == null) { t = new T(id); tunnels.put(id, t); } return t; }

    /* ---------------- saved tunnels ---------------- */
    public List<Map<String, Object>> list() {
        List<Map<String, Object>> out = new ArrayList<>(); File[] fs = dir.listFiles((d, n) -> n.endsWith(".conf")); if (fs == null) return out;
        Arrays.sort(fs, (a, b) -> Long.compare(meta(id(a)).optCreated(), meta(id(b)).optCreated()));
        for (File f : fs) {
            String id = id(f); Meta m = meta(id); Map<String, Object> r = new HashMap<>();
            r.put("id", id); r.put("name", m.name); r.put("mode", m.mode); r.put("apps", m.apps); r.put("active", id.equals(activeId)); r.put("created", m.created);
            try { r.putAll(Tunnels.summary(Tunnels.parse(read(f)))); } catch (Exception e) { r.put("error", e.getMessage()); }
            out.add(r);
        }
        return out;
    }
    public void emitList() { exec.execute(() -> emit("type", "tunnels", "tunnels", list(), "active", activeId, "last", prefs.getString("last", null))); }
    private static String id(File f) { return f.getName().replaceAll("\\.conf$", ""); }

    /** Saves a new tunnel. Returns its id, or throws IllegalArgumentException with a readable reason. */
    public String add(String name, String text) {
        Tunnels.parse(text);
        String n = name == null || name.trim().isEmpty() ? "My VPN" : name.trim(); n = unique(n, null);
        String id = Long.toString(System.currentTimeMillis(), 36) + Integer.toString((int) (Math.random() * 1296), 36);
        write(new File(dir, id + ".conf"), text.trim() + "\n");
        Meta m = new Meta(); m.name = n; m.created = System.currentTimeMillis(); saveMeta(id, m);
        if (prefs.getString("last", null) == null) prefs.edit().putString("last", id).apply();
        return id;
    }
    public void update(String id, String name, String text) {
        Tunnels.parse(text); File f = new File(dir, id + ".conf"); if (!f.exists()) throw new IllegalArgumentException("That tunnel was deleted");
        write(f, text.trim() + "\n"); Meta m = meta(id); if (name != null && !name.trim().isEmpty()) m.name = unique(name.trim(), id); saveMeta(id, m);
        if (id.equals(activeId)) { connect(id); }
    }
    public void rename(String id, String name) { Meta m = meta(id); if (name != null && !name.trim().isEmpty()) { m.name = unique(name.trim(), id); saveMeta(id, m); } }
    public void remove(String id) {
        if (id.equals(activeId)) disconnectNow();
        new File(dir, id + ".conf").delete(); new File(dir, id + ".json").delete();
        if (id.equals(prefs.getString("last", null))) prefs.edit().remove("last").apply();
    }
    public String config(String id) { File f = new File(dir, id + ".conf"); return f.exists() ? read(f) : null; }
    public String name(String id) { return meta(id).name; }
    public void setSplit(String id, String mode, List<String> apps) { Meta m = meta(id); m.mode = mode == null ? "all" : mode; m.apps = apps == null ? new ArrayList<>() : apps; m.apps.remove(ctx.getPackageName()); saveMeta(id, m); if (id.equals(activeId)) connect(id); }
    private String unique(String name, String self) {
        File[] fs = dir.listFiles((d, n) -> n.endsWith(".json")); List<String> names = new ArrayList<>();
        if (fs != null) for (File f : fs) { String id = f.getName().replaceAll("\\.json$", ""); if (!id.equals(self)) names.add(meta(id).name.toLowerCase(Locale.ROOT)); }
        String n = name; int k = 2; while (names.contains(n.toLowerCase(Locale.ROOT))) n = name + " " + (k++); return n;
    }

    /* ---------------- on / off ---------------- */
    public String activeId() { return activeId; }
    public String lastId() { String l = prefs.getString("last", null); if (l != null && new File(dir, l + ".conf").exists()) return l; List<Map<String, Object>> all = list(); return all.isEmpty() ? null : (String) all.get(0).get("id"); }
    /** Switches to this tunnel (the previous one is turned off). Needs VPN permission already given. */
    public void connect(String id) {
        exec.execute(() -> {
            String text = config(id); if (text == null) { emit("type", "error", "msg", "That tunnel doesn’t exist any more"); return; }
            state = "connecting"; lastError = null; emitStatus();
            try {
                Meta m = meta(id); Config c = Tunnels.withApps(Tunnels.parse(text), m.mode, m.apps);
                // WireGuard's own switch (down + up in one call) stops Android's VPN service and reuses it while it is still
                // shutting down, which can then take the new connection down too. So: fully off, let the service stop, then on.
                String cur = activeId;
                if (cur != null) { activeId = null; try { backend().setState(tunnel(cur), Tunnel.State.DOWN, null); } catch (Exception ignored) { } Thread.sleep(1500); }
                backend().setState(tunnel(id), Tunnel.State.UP, c);
                activeId = id; since = System.currentTimeMillis(); state = "up"; prefs.edit().putString("last", id).apply();
                Thread.sleep(1200);
                if (backend().getState(tunnel(id)) != Tunnel.State.UP) { activeId = null; Thread.sleep(800); backend().setState(tunnel(id), Tunnel.State.UP, c); activeId = id; since = System.currentTimeMillis(); state = "up"; }
                notifyConnected(m.name);
            } catch (BackendException e) { fail(why(e)); }
            catch (IllegalArgumentException e) { fail(e.getMessage()); }
            catch (Exception e) { fail("Couldn’t connect: " + (e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage())); }
            emitStatus(); emitList();
        });
    }
    private void fail(String msg) { state = activeId != null ? "up" : "down"; lastError = msg; emit("type", "error", "msg", msg); }
    private static String why(BackendException e) {
        switch (e.getReason()) {
            case VPN_NOT_AUTHORIZED: return "Android didn’t allow SRK VPN to start a VPN. Tap Connect again and choose OK.";
            case DNS_RESOLUTION_FAILURE: return "Couldn’t find the server “" + (e.getFormat().length > 0 ? e.getFormat()[0] : "") + "”. Check your internet connection and the Endpoint in the config.";
            case UNABLE_TO_START_VPN: return "Android couldn’t start the VPN. If another VPN app is set to “Always-on”, turn that off first.";
            case TUN_CREATION_ERROR: return "Android couldn’t create the VPN connection. Another VPN may be using it — turn that off and try again.";
            case GO_ACTIVATION_ERROR_CODE: return "WireGuard couldn’t start with this config. Check the keys and addresses.";
            case TUNNEL_MISSING_CONFIG: return "The tunnel has no config";
            default: return "Couldn’t connect (" + e.getReason() + ")";
        }
    }
    public void disconnect() { exec.execute(this::disconnectNow); }
    private void disconnectNow() {
        String id = activeId; if (id == null) { state = "down"; emitStatus(); return; }
        try { backend().setState(tunnel(id), Tunnel.State.DOWN, null); } catch (Exception e) { emit("type", "error", "msg", "Couldn’t disconnect: " + e.getMessage()); }
        activeId = null; state = "down"; since = 0; notifyConnected(null); emitStatus(); emitList();
    }
    public void toggle() { if (activeId != null) disconnect(); else { String id = lastId(); if (id != null) connect(id); } }

    /** Live numbers: data in/out, last handshake with the server, how long connected. */
    public Map<String, Object> status() {
        Map<String, Object> m = new HashMap<>(); m.put("type", "status"); m.put("state", state); m.put("id", activeId); m.put("since", since); m.put("error", lastError);
        String id = activeId;
        if (id != null) {
            m.put("name", meta(id).name);
            try {
                Statistics st = backend().getStatistics(tunnel(id)); long hs = 0;
                for (Key k : st.peers()) { Statistics.PeerStats p = st.peer(k); if (p != null) hs = Math.max(hs, p.latestHandshakeEpochMillis()); }
                m.put("rx", st.totalRx()); m.put("tx", st.totalTx()); m.put("handshake", hs);
            } catch (Exception ignored) { }
        }
        return m;
    }
    public void emitStatus() { Map<String, Object> s = status(); Listener l = listener; if (l != null) { String j = Json.str(s); main.post(() -> l.onEvent(j)); } }
    public void statusAsync() { exec.execute(this::emitStatus); }

    /* ---------------- "Connected" notification with a Disconnect button ---------------- */
    static final String CH = "vpn";
    private void notifyConnected(String name) {
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (name == null) { nm.cancel(11); return; }
        try {
            if (Build.VERSION.SDK_INT >= 26) { NotificationChannel ch = new NotificationChannel(CH, "VPN connection", NotificationManager.IMPORTANCE_LOW); ch.setShowBadge(false); nm.createNotificationChannel(ch); }
            Intent open = new Intent(ctx, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            PendingIntent off = PendingIntent.getBroadcast(ctx, 5, new Intent(ctx, VpnReceiver.class).setAction(VpnReceiver.DISCONNECT), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
            nm.notify(11, new NotificationCompat.Builder(ctx, CH).setSmallIcon(android.R.drawable.ic_lock_lock).setContentTitle("Connected to " + name).setContentText("Your internet traffic goes through the VPN")
                .setOngoing(true).setOnlyAlertOnce(true).setPriority(NotificationCompat.PRIORITY_LOW).setContentIntent(PendingIntent.getActivity(ctx, 4, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT))
                .addAction(0, "Disconnect", off).build());
        } catch (Exception ignored) { }
    }

    /* ---------------- per-tunnel settings (name, split tunnelling) ---------------- */
    static final class Meta { String name = "My VPN"; String mode = "all"; List<String> apps = new ArrayList<>(); long created; long optCreated() { return created; } }
    @SuppressWarnings("unchecked") private Meta meta(String id) {
        Meta m = new Meta(); File f = new File(dir, id + ".json"); if (!f.exists()) return m;
        try { Map<String, Object> j = Json.obj(read(f)); if (j.get("name") != null) m.name = String.valueOf(j.get("name")); if (j.get("mode") != null) m.mode = String.valueOf(j.get("mode")); if (j.get("apps") instanceof List) for (Object o : (List<Object>) j.get("apps")) m.apps.add(String.valueOf(o)); m.created = Json.l(j, "created"); } catch (Exception ignored) { }
        return m;
    }
    private void saveMeta(String id, Meta m) { write(new File(dir, id + ".json"), Json.str(Json.map("name", m.name, "mode", m.mode, "apps", m.apps, "created", m.created))); }
    static String read(File f) { try (FileInputStream in = new FileInputStream(f)) { byte[] b = new byte[(int) f.length()]; int o = 0, n; while (o < b.length && (n = in.read(b, o, b.length - o)) > 0) o += n; return new String(b, 0, o, StandardCharsets.UTF_8); } catch (IOException e) { return ""; } }
    static void write(File f, String s) { File tmp = new File(f.getPath() + ".tmp"); try (FileOutputStream o = new FileOutputStream(tmp)) { o.write(s.getBytes(StandardCharsets.UTF_8)); } catch (IOException e) { throw new IllegalArgumentException("Couldn’t save: " + e.getMessage()); } if (!tmp.renameTo(f)) { f.delete(); tmp.renameTo(f); } }
}
