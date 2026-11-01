package in.shazverse.srkvpn;

import android.app.Application;

import com.wireguard.android.backend.GoBackend;

/** When Android starts the VPN by itself ("Always-on VPN" in Settings), connect the last tunnel. */
public class VpnApp extends Application {
    @Override public void onCreate() {
        super.onCreate();
        GoBackend.setAlwaysOnCallback(() -> { VpnManager m = VpnManager.get(this); String id = m.lastId(); if (id != null && m.activeId() == null) m.connect(id); });
    }
}
