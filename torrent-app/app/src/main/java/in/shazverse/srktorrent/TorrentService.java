package in.shazverse.srktorrent;

import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;

import androidx.core.app.NotificationCompat;

import java.util.Locale;

/** Keeps torrents downloading and seeding while the screen is off or another app is open. Shows live progress in the notification. */
public class TorrentService extends Service {
    static final String ACTION_QUIT = "in.shazverse.srktorrent.QUIT", ACTION_PAUSE_ALL = "in.shazverse.srktorrent.PAUSE_ALL", ACTION_RESUME_ALL = "in.shazverse.srktorrent.RESUME_ALL", ACTION_NET = "in.shazverse.srktorrent.NET";
    private WifiManager.WifiLock wifi; private WifiManager.MulticastLock multicast; private PowerManager.WakeLock wake;
    private final Handler h = new Handler(Looper.getMainLooper()); private boolean foreground; private ConnectivityManager.NetworkCallback netCb; private int idleTicks;

    public static void start(Context c) { Intent i = new Intent(c, TorrentService.class); try { if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(i); else c.startService(i); } catch (Exception ignored) { } }
    static void send(Context c, String action) { Intent i = new Intent(c, TorrentService.class).setAction(action); try { if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(i); else c.startService(i); } catch (Exception ignored) { } }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        TorrentHost.channels(this);
        goForeground(build("SRK Torrent is running", "Starting…", 0, false));
        String a = intent == null ? null : intent.getAction();
        if (ACTION_QUIT.equals(a)) { quit(); return START_NOT_STICKY; }
        TorrentEngine e = TorrentHost.engine(this);
        e.start();
        if (ACTION_PAUSE_ALL.equals(a)) e.pauseAll();
        if (ACTION_RESUME_ALL.equals(a)) e.resumeAll();
        locks(true); watchNetwork(); checkNetwork();
        h.removeCallbacks(tick); h.postDelayed(tick, 1500);
        return START_STICKY;
    }
    private void goForeground(Notification n) {
        if (foreground) { ((NotificationManager) getSystemService(NOTIFICATION_SERVICE)).notify(7, n); return; }
        try { if (Build.VERSION.SDK_INT >= 34) startForeground(7, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE); else if (Build.VERSION.SDK_INT >= 29) startForeground(7, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC); else startForeground(7, n); foreground = true; }
        catch (Exception ex) { try { if (Build.VERSION.SDK_INT >= 29) startForeground(7, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC); else startForeground(7, n); foreground = true; } catch (Exception ignored) { } }
    }
    private Notification build(String title, String text, int pct, boolean progress) {
        PendingIntent quit = PendingIntent.getService(this, 2, new Intent(this, TorrentService.class).setAction(ACTION_QUIT), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        PendingIntent pause = PendingIntent.getService(this, 3, new Intent(this, TorrentService.class).setAction(ACTION_PAUSE_ALL), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        NotificationCompat.Builder b = new NotificationCompat.Builder(this, TorrentHost.CH_SERVICE).setSmallIcon(android.R.drawable.stat_sys_download).setContentTitle(title).setContentText(text)
            .setOngoing(true).setOnlyAlertOnce(true).setPriority(NotificationCompat.PRIORITY_LOW).setContentIntent(TorrentHost.get(this).openApp())
            .addAction(0, "Pause all", pause).addAction(0, "Quit", quit);
        if (progress) b.setProgress(100, pct, false);
        return b.build();
    }
    private final Runnable tick = new Runnable() { @Override public void run() {
        if (!TorrentHost.running()) return;
        TorrentEngine e = TorrentHost.engine(TorrentService.this);
        long[] s; try { s = e.summary(); } catch (Throwable t) { h.postDelayed(this, 3000); return; }
        String rates = "↓ " + speed(s[1]) + "  ↑ " + speed(s[2]);
        if (e.networkPaused()) goForeground(build("Waiting for Wi-Fi", "Downloads continue when you’re back on Wi-Fi", 0, false));
        else if (s[0] > 0) goForeground(build(s[0] == 1 ? "Downloading 1 torrent" : "Downloading " + s[0] + " torrents", s[3] + "% · " + rates, (int) s[3], true));
        else goForeground(build("SRK Torrent is running", s[2] > 0 ? "Seeding · " + rates : "Nothing downloading · tap Quit to stop", 0, false));
        idleTicks = (s[0] == 0 && s[1] == 0 && s[2] == 0) ? idleTicks + 1 : 0;
        locks(idleTicks < 30); // let the phone sleep when nothing is moving
        h.postDelayed(this, 2000);
    } };
    private static String speed(long b) { if (b < 1024) return b + " B/s"; if (b < 1048576) return (b / 1024) + " KB/s"; return String.format(Locale.US, "%.1f MB/s", b / 1048576.0); }

    private void locks(boolean on) {
        try {
            if (on) {
                WifiManager wm = (WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
                if (wifi == null) { wifi = wm.createWifiLock(Build.VERSION.SDK_INT >= 29 ? WifiManager.WIFI_MODE_FULL_HIGH_PERF : WifiManager.WIFI_MODE_FULL_HIGH_PERF, "srk-torrent"); wifi.setReferenceCounted(false); }
                if (multicast == null) { multicast = wm.createMulticastLock("srk-torrent"); multicast.setReferenceCounted(false); }
                if (wake == null) { wake = ((PowerManager) getSystemService(POWER_SERVICE)).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "srk-torrent:transfer"); wake.setReferenceCounted(false); }
                if (!wifi.isHeld()) wifi.acquire(); if (!multicast.isHeld()) multicast.acquire(); if (!wake.isHeld()) wake.acquire(60 * 60 * 1000L);
            } else {
                if (wifi != null && wifi.isHeld()) wifi.release(); if (multicast != null && multicast.isHeld()) multicast.release(); if (wake != null && wake.isHeld()) wake.release();
            }
        } catch (Exception ignored) { }
    }

    /* Wi-Fi only */
    private void watchNetwork() {
        if (netCb != null) return; ConnectivityManager cm = (ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
        netCb = new ConnectivityManager.NetworkCallback() {
            @Override public void onCapabilitiesChanged(Network n, NetworkCapabilities c) { h.post(TorrentService.this::checkNetwork); }
            @Override public void onLost(Network n) { h.postDelayed(TorrentService.this::checkNetwork, 500); }
            @Override public void onAvailable(Network n) { h.post(TorrentService.this::checkNetwork); }
        };
        try { cm.registerDefaultNetworkCallback(netCb); } catch (Exception ignored) { }
    }
    void checkNetwork() {
        if (!TorrentHost.running()) return;
        ConnectivityManager cm = (ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
        boolean metered; try { NetworkCapabilities c = cm.getNetworkCapabilities(cm.getActiveNetwork()); metered = c == null || !c.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED); } catch (Exception e) { metered = false; }
        TorrentHost.engine(this).setNetworkPaused(TorrentHost.get(this).wifiOnly() && metered);
    }

    private void quit() {
        h.removeCallbacks(tick); locks(false);
        new Thread(() -> { TorrentHost.shutdown(); h.post(() -> { stopForeground(true); stopSelf(); }); }).start();
    }
    @Override public void onDestroy() { h.removeCallbacks(tick); locks(false); try { if (netCb != null) ((ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE)).unregisterNetworkCallback(netCb); } catch (Exception ignored) { } super.onDestroy(); }
    @Override public IBinder onBind(Intent intent) { return null; }
    @Override public void onTimeout(int startId, int fgsType) { quit(); } // Android 15 data-sync time limit
}
