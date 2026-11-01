package in.shazverse.srkvpn;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** The "Disconnect" button in the notification. */
public class VpnReceiver extends BroadcastReceiver {
    static final String DISCONNECT = "in.shazverse.srkvpn.DISCONNECT";
    @Override public void onReceive(Context c, Intent i) { if (DISCONNECT.equals(i.getAction())) VpnManager.get(c).disconnect(); }
}
