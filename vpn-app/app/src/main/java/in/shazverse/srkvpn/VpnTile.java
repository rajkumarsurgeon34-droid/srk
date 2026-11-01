package in.shazverse.srkvpn;

import android.app.PendingIntent;
import android.content.Intent;
import android.net.VpnService;
import android.os.Build;
import android.service.quicksettings.Tile;
import android.service.quicksettings.TileService;

/** Quick Settings tile: pull down the notification shade and tap to connect or disconnect. */
public class VpnTile extends TileService {
    @Override public void onStartListening() { update(); }
    @Override public void onClick() {
        VpnManager m = VpnManager.get(this);
        if (m.activeId() == null && (VpnService.prepare(this) != null || m.lastId() == null)) { openApp(); return; } // needs permission or a tunnel first
        m.toggle();
        Tile t = getQsTile(); if (t != null) { t.setState(m.activeId() == null ? Tile.STATE_ACTIVE : Tile.STATE_INACTIVE); t.updateTile(); }
        new android.os.Handler(getMainLooper()).postDelayed(this::update, 1500);
    }
    private void openApp() {
        Intent i = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        if (Build.VERSION.SDK_INT >= 34) startActivityAndCollapse(PendingIntent.getActivity(this, 9, i, PendingIntent.FLAG_IMMUTABLE));
        else startActivityAndCollapse(i);
    }
    private void update() {
        Tile t = getQsTile(); if (t == null) return; VpnManager m = VpnManager.get(this); String id = m.activeId();
        t.setState(id != null ? Tile.STATE_ACTIVE : Tile.STATE_INACTIVE);
        t.setLabel("SRK VPN");
        if (Build.VERSION.SDK_INT >= 29) { String last = id != null ? id : m.lastId(); t.setSubtitle(id != null ? m.name(id) : last != null ? "Off" : "Add a tunnel"); }
        t.updateTile();
    }
}
