package in.shazverse.srkshare;

import android.app.Notification;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;

import androidx.core.app.NotificationCompat;

/** Keeps SRK Share able to receive (and finish transfers) while the screen is off or another app is open. */
public class ShareService extends Service {
    private WifiManager.MulticastLock multicast; private WifiManager.WifiLock wifi; private PowerManager.WakeLock wake;

    public static void start(Context c) { Intent i = new Intent(c, ShareService.class); try { if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(i); else c.startService(i); } catch (Exception ignored) { } }
    public static void stop(Context c) { c.stopService(new Intent(c, ShareService.class)); }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        AndroidHost.channels(this);
        Intent open = new Intent(this, MainActivity.class); open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        Notification n = new NotificationCompat.Builder(this, AndroidHost.CH_SERVICE).setSmallIcon(android.R.drawable.stat_sys_upload).setContentTitle("SRK Share is ready")
            .setContentText("Nearby devices can send you files").setOngoing(true).setPriority(NotificationCompat.PRIORITY_LOW)
            .setContentIntent(PendingIntent.getActivity(this, 1, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT)).build();
        try { if (Build.VERSION.SDK_INT >= 29) startForeground(7, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC); else startForeground(7, n); } catch (Exception e) { stopSelf(); return START_NOT_STICKY; }
        try {
            WifiManager wm = (WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            if (multicast == null) { multicast = wm.createMulticastLock("srk-share"); multicast.setReferenceCounted(false); multicast.acquire(); }
            if (wifi == null) { wifi = wm.createWifiLock(Build.VERSION.SDK_INT >= 29 ? WifiManager.WIFI_MODE_FULL_LOW_LATENCY : WifiManager.WIFI_MODE_FULL_HIGH_PERF, "srk-share"); wifi.setReferenceCounted(false); wifi.acquire(); }
            if (wake == null) { wake = ((PowerManager) getSystemService(POWER_SERVICE)).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "srk-share:transfer"); wake.setReferenceCounted(false); wake.acquire(6 * 60 * 60 * 1000L); }
        } catch (Exception ignored) { }
        AndroidHost.engine(this).start();
        return START_STICKY;
    }
    @Override public void onTaskRemoved(Intent rootIntent) { if (!AndroidHost.engine(this).busy()) stopSelf(); }
    @Override public void onDestroy() { try { if (multicast != null) multicast.release(); if (wifi != null) wifi.release(); if (wake != null && wake.isHeld()) wake.release(); } catch (Exception ignored) { } super.onDestroy(); }
    @Override public IBinder onBind(Intent intent) { return null; }
}
