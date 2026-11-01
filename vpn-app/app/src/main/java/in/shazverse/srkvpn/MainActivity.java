package in.shazverse.srkvpn;

import android.Manifest;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.drawable.Drawable;
import android.net.Uri;
import android.net.VpnService;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.OpenableColumns;
import android.provider.Settings;
import android.util.Base64;
import android.util.Log;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.activity.OnBackPressedCallback;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.FileProvider;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.webkit.WebViewAssetLoader;

import com.google.mlkit.vision.barcode.common.Barcode;
import com.google.mlkit.vision.codescanner.GmsBarcodeScanner;
import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions;
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning;
import com.google.zxing.BarcodeFormat;
import com.google.zxing.EncodeHintType;
import com.google.zxing.common.BitMatrix;
import com.google.zxing.qrcode.QRCodeWriter;
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel;
import com.wireguard.crypto.KeyPair;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

public class MainActivity extends AppCompatActivity implements VpnManager.Listener {
    private static final String HOST = "appassets.androidplatform.net";
    private static final int REQ_VPN = 41, REQ_FILE = 42, REQ_PERM = 43;
    private WebView web; private VpnManager vpn; private boolean resumed, pageReady; private String pendingConnect;
    private final Handler h = new Handler(Looper.getMainLooper()); private final List<Intent> pending = new ArrayList<>();

    @Override protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        web = new WebView(this); setContentView(web);
        ViewCompat.setOnApplyWindowInsetsListener(web, (v, insets) -> { Insets b = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout() | WindowInsetsCompat.Type.ime()); v.setPadding(b.left, b.top, b.right, b.bottom); return WindowInsetsCompat.CONSUMED; });
        final WebViewAssetLoader loader = new WebViewAssetLoader.Builder().setDomain(HOST).addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this)).build();
        WebSettings s = web.getSettings(); s.setJavaScriptEnabled(true); s.setDomStorageEnabled(true); s.setAllowFileAccess(false); s.setTextZoom(100);
        vpn = VpnManager.get(this); vpn.setListener(this);
        web.addJavascriptInterface(new Bridge(), "SRKVpn");
        web.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) { return loader.shouldInterceptRequest(r.getUrl()); }
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) { Uri u = r.getUrl(); if (HOST.equals(u.getHost())) return false; try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception ignored) { } return true; }
        });
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) { @Override public void handleOnBackPressed() { web.evaluateJavascript("window.srkBack ? window.srkBack() : 0", r -> { if (!"true".equals(r)) moveTaskToBack(true); }); } });
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQ_PERM);
        if (getIntent() != null) pending.add(getIntent());
        web.loadUrl("https://" + HOST + "/assets/www/index.html");
        if (BuildConfig.DEBUG && getIntent() != null && "in.shazverse.srkvpn.TEST".equals(getIntent().getAction())) selfTest(getIntent());
    }
    @Override protected void onNewIntent(Intent i) { super.onNewIntent(i); if (pageReady) handleIntent(i); else pending.add(i); }
    @Override protected void onResume() { super.onResume(); resumed = true; vpn.setListener(this); h.removeCallbacks(poll); h.post(poll); }
    @Override protected void onPause() { resumed = false; h.removeCallbacks(poll); super.onPause(); }
    private final Runnable poll = new Runnable() { @Override public void run() { if (pageReady) vpn.statusAsync(); if (resumed) h.postDelayed(this, 1000); } };

    @Override public void onEvent(String json) { if (web != null) web.evaluateJavascript("window.__vpnEvent && window.__vpnEvent(" + jsString(json) + ")", null); }
    private void emit(Object... kv) { onEvent(Json.str(Json.map(kv))); }
    private void emitBg(Object... kv) { String j = Json.str(Json.map(kv)); h.post(() -> onEvent(j)); }
    static String jsString(String s) { StringBuilder b = new StringBuilder("\""); for (char ch : s.toCharArray()) { if (ch == '"' || ch == '\\') b.append('\\').append(ch); else if (ch < 0x20 || ch == 0x2028 || ch == 0x2029) b.append(String.format("\\u%04x", (int) ch)); else b.append(ch); } return b.append('"').toString(); }

    /* ---------- configs shared into the app ---------- */
    private void handleIntent(Intent i) {
        if (i == null) return; String a = i.getAction();
        if (Intent.ACTION_SEND.equals(a)) {
            Uri st = i.getParcelableExtra(Intent.EXTRA_STREAM); CharSequence t = i.getCharSequenceExtra(Intent.EXTRA_TEXT);
            if (st != null) readUri(st); else if (t != null) offerText(null, t.toString());
        } else if (Intent.ACTION_VIEW.equals(a) && i.getData() != null) readUri(i.getData());
    }
    private void offerText(String name, String text) {
        if (text == null || !text.contains("[Interface]")) { emitBg("type", "error", "msg", "That isn’t a WireGuard config"); return; }
        emitBg("type", "incoming", "name", name == null ? "" : Tunnels.nameFromFile(name), "text", text);
    }
    private void readUri(Uri u) {
        new Thread(() -> {
            String name = nameOf(u);
            try (InputStream in = getContentResolver().openInputStream(u)) {
                byte[] b = readAll(in, 4 * 1024 * 1024);
                if (b.length > 2 && b[0] == 'P' && b[1] == 'K') { importZip(b); return; } // a provider's zip of many .conf files
                offerText(name, new String(b, StandardCharsets.UTF_8));
            } catch (Exception e) { emitBg("type", "error", "msg", "Couldn’t read that file"); }
        }).start();
    }
    private void importZip(byte[] b) throws Exception {
        int ok = 0, bad = 0;
        try (ZipInputStream z = new ZipInputStream(new java.io.ByteArrayInputStream(b))) {
            ZipEntry e; while ((e = z.getNextEntry()) != null) {
                if (e.isDirectory() || !e.getName().toLowerCase().endsWith(".conf")) continue;
                String text = new String(readAll(z, 256 * 1024), StandardCharsets.UTF_8);
                try { vpn.add(Tunnels.nameFromFile(new File(e.getName()).getName()), text); ok++; } catch (IllegalArgumentException x) { bad++; }
            }
        }
        vpn.emitList();
        emitBg("type", "toast", "msg", ok == 0 ? "No WireGuard configs found in that zip" : "Added " + ok + (ok == 1 ? " tunnel" : " tunnels") + (bad > 0 ? " · " + bad + " skipped" : ""));
    }
    private String nameOf(Uri u) { try (Cursor c = getContentResolver().query(u, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) { if (c != null && c.moveToFirst() && !c.isNull(0)) return c.getString(0); } catch (Exception ignored) { } String p = u.getLastPathSegment(); return p == null ? "" : p; }
    static byte[] readAll(InputStream in, int max) throws java.io.IOException { ByteArrayOutputStream o = new ByteArrayOutputStream(); byte[] b = new byte[16384]; int n; while ((n = in.read(b)) > 0) { o.write(b, 0, n); if (o.size() > max) throw new java.io.IOException("too big"); } return o.toByteArray(); }

    @Override protected void onActivityResult(int req, int res, Intent data) {
        super.onActivityResult(req, res, data);
        if (req == REQ_VPN) { String id = pendingConnect; pendingConnect = null; if (res == RESULT_OK && id != null) vpn.connect(id); else emit("type", "error", "msg", "SRK VPN needs your OK to create a VPN connection"); }
        else if (req == REQ_FILE && res == RESULT_OK && data != null) {
            if (data.getClipData() != null) for (int k = 0; k < data.getClipData().getItemCount(); k++) readUri(data.getClipData().getItemAt(k).getUri());
            else if (data.getData() != null) readUri(data.getData());
        }
    }
    private void connectWithPermission(String id) {
        Intent p; try { p = VpnService.prepare(this); } catch (Exception e) { emit("type", "error", "msg", "This phone doesn’t allow VPN apps"); return; }
        if (p == null) { vpn.connect(id); return; }
        pendingConnect = id; try { startActivityForResult(p, REQ_VPN); } catch (ActivityNotFoundException e) { emit("type", "error", "msg", "This phone doesn’t allow VPN apps"); }
    }

    private String qrPng(String text) throws Exception {
        Map<EncodeHintType, Object> hints = new EnumMap<>(EncodeHintType.class); hints.put(EncodeHintType.ERROR_CORRECTION, ErrorCorrectionLevel.M); hints.put(EncodeHintType.MARGIN, 2); hints.put(EncodeHintType.CHARACTER_SET, "UTF-8");
        BitMatrix m = new QRCodeWriter().encode(text, BarcodeFormat.QR_CODE, 0, 0, hints); int w = m.getWidth(), ht = m.getHeight(), scale = Math.max(1, 720 / w);
        Bitmap bmp = Bitmap.createBitmap(w * scale, ht * scale, Bitmap.Config.RGB_565);
        for (int y = 0; y < ht; y++) for (int x = 0; x < w; x++) { int c = m.get(x, y) ? Color.BLACK : Color.WHITE; for (int dy = 0; dy < scale; dy++) for (int dx = 0; dx < scale; dx++) bmp.setPixel(x * scale + dx, y * scale + dy, c); }
        ByteArrayOutputStream o = new ByteArrayOutputStream(); bmp.compress(Bitmap.CompressFormat.PNG, 100, o); return "data:image/png;base64," + Base64.encodeToString(o.toByteArray(), Base64.NO_WRAP);
    }
    private static String iconData(Drawable d) {
        try { int s = 72; Bitmap b = Bitmap.createBitmap(s, s, Bitmap.Config.ARGB_8888); Canvas c = new Canvas(b); d.setBounds(0, 0, s, s); d.draw(c); ByteArrayOutputStream o = new ByteArrayOutputStream(); b.compress(Bitmap.CompressFormat.PNG, 90, o); return "data:image/png;base64," + Base64.encodeToString(o.toByteArray(), Base64.NO_WRAP); } catch (Exception e) { return ""; }
    }

    /* ---------- the bridge the page calls ---------- */
    private class Bridge {
        @JavascriptInterface public void start() { h.post(() -> { pageReady = true; vpn.setListener(MainActivity.this); vpn.emitList(); vpn.statusAsync(); for (Intent i : pending) handleIntent(i); pending.clear(); }); }
        @JavascriptInterface public void importFile() { h.post(() -> { Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT); i.addCategory(Intent.CATEGORY_OPENABLE); i.setType("*/*"); i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true); try { startActivityForResult(i, REQ_FILE); } catch (ActivityNotFoundException e) { emit("type", "error", "msg", "No app found to pick files"); } }); }
        @JavascriptInterface public void scanQr() { h.post(() -> {
            try { GmsBarcodeScanner sc = GmsBarcodeScanning.getClient(MainActivity.this, new GmsBarcodeScannerOptions.Builder().setBarcodeFormats(Barcode.FORMAT_QR_CODE).build());
                sc.startScan().addOnSuccessListener(bc -> offerText(null, bc.getRawValue())).addOnCanceledListener(() -> { }).addOnFailureListener(e -> emit("type", "error", "msg", "The QR scanner isn’t available on this phone — use Import file or Paste instead"));
            } catch (Throwable e) { emit("type", "error", "msg", "The QR scanner isn’t available on this phone — use Import file or Paste instead"); } }); }
        @JavascriptInterface public void template() { String t = Tunnels.template(new KeyPair()); emitBg("type", "template", "text", t); }
        @JavascriptInterface public void save(String id, String name, String text) {
            new Thread(() -> { try { String nid = id; if (id == null || id.isEmpty()) nid = vpn.add(name, text); else vpn.update(id, name, text); vpn.emitList(); emitBg("type", "saved", "id", nid, "name", vpn.name(nid)); }
                catch (IllegalArgumentException e) { emitBg("type", "invalid", "msg", e.getMessage()); } }).start(); }
        @JavascriptInterface public void rename(String id, String name) { vpn.rename(id, name); vpn.emitList(); }
        @JavascriptInterface public void remove(String id) { new Thread(() -> { vpn.remove(id); vpn.emitList(); }).start(); }
        @JavascriptInterface public void connect(String id) { h.post(() -> connectWithPermission(id)); }
        @JavascriptInterface public void disconnect() { vpn.disconnect(); }
        @JavascriptInterface public void getConfig(String id) { emitBg("type", "config", "id", id, "name", vpn.name(id), "text", vpn.config(id)); }
        @JavascriptInterface public void showQr(String id) { new Thread(() -> { try { emitBg("type", "qr", "id", id, "name", vpn.name(id), "png", qrPng(vpn.config(id))); } catch (Exception e) { emitBg("type", "error", "msg", "Couldn’t make the QR code"); } }).start(); }
        @JavascriptInterface public void shareFile(String id) { h.post(() -> { try { File d = new File(getCacheDir(), "share"); d.mkdirs(); String n = vpn.name(id).replaceAll("[^A-Za-z0-9 _.-]", "").trim(); File f = new File(d, (n.isEmpty() ? "tunnel" : n) + ".conf"); VpnManager.write(f, vpn.config(id));
            Uri u = FileProvider.getUriForFile(MainActivity.this, getPackageName() + ".files", f); Intent s = new Intent(Intent.ACTION_SEND); s.setType("text/plain"); s.putExtra(Intent.EXTRA_STREAM, u); s.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION); startActivity(Intent.createChooser(s, "Share tunnel"));
            } catch (Exception e) { emit("type", "error", "msg", "Couldn’t share the file"); } }); }
        @JavascriptInterface public void apps(String id) { new Thread(() -> {
            PackageManager pm = getPackageManager(); List<Object> out = new ArrayList<>(); Set<String> seen = new HashSet<>();
            List<ResolveInfo> l = pm.queryIntentActivities(new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER), 0);
            for (ResolveInfo r : l) { String p = r.activityInfo.packageName; if (p.equals(getPackageName()) || !seen.add(p)) continue; out.add(Json.map("pkg", p, "name", String.valueOf(r.loadLabel(pm)), "icon", iconData(r.loadIcon(pm)))); }
            out.sort((a, b) -> String.valueOf(((Map<?, ?>) a).get("name")).compareToIgnoreCase(String.valueOf(((Map<?, ?>) b).get("name"))));
            emitBg("type", "apps", "id", id, "apps", out); }).start(); }
        @JavascriptInterface public void setSplit(String id, String mode, String appsJson) { List<String> apps = new ArrayList<>(); Object o = Json.parse(appsJson); if (o instanceof List) for (Object x : (List<?>) o) apps.add(String.valueOf(x)); vpn.setSplit(id, mode, apps); vpn.emitList(); }
        @JavascriptInterface public void checkIp() { new Thread(() -> {
            String[] urls = {"https://ipinfo.io/json", "https://api.ipify.org?format=json"};
            for (String u : urls) { try { HttpURLConnection c = (HttpURLConnection) new URL(u).openConnection(); c.setConnectTimeout(6000); c.setReadTimeout(6000); c.setRequestProperty("Accept", "application/json"); c.setUseCaches(false);
                    if (c.getResponseCode() == 200) { Map<String, Object> m = Json.obj(new String(readAll(c.getInputStream(), 65536), StandardCharsets.UTF_8)); m.put("type", "ip"); onEventBg(Json.str(m)); return; } } catch (Exception ignored) { } }
            emitBg("type", "ip", "error", "Couldn’t reach the internet"); }).start(); }
        @JavascriptInterface public void vpnSettings() { h.post(() -> { try { startActivity(new Intent(Settings.ACTION_VPN_SETTINGS)); } catch (Exception e) { emit("type", "error", "msg", "Open Settings › Network › VPN"); } }); }
        @JavascriptInterface public void copy(String t) { h.post(() -> { try { ((ClipboardManager) getSystemService(CLIPBOARD_SERVICE)).setPrimaryClip(ClipData.newPlainText("SRK VPN", t)); } catch (Exception ignored) { } }); }
        @JavascriptInterface public void paste() { h.post(() -> { String t = ""; try { ClipData c = ((ClipboardManager) getSystemService(CLIPBOARD_SERVICE)).getPrimaryClip(); if (c != null && c.getItemCount() > 0) t = String.valueOf(c.getItemAt(0).coerceToText(MainActivity.this)); } catch (Exception ignored) { } emit("type", "clipboard", "text", t); }); }
    }
    private void onEventBg(String j) { h.post(() -> onEvent(j)); }

    /* ---------- debug builds only: automated end-to-end test driven by the build machine ---------- */
    private void selfTest(Intent i) {
        new Thread(() -> {
            String tag = "SRKVPN_TEST";
            try {
                String conf = new String(Base64.decode(i.getStringExtra("conf"), Base64.DEFAULT), StandardCharsets.UTF_8); String url = i.getStringExtra("url");
                if (VpnService.prepare(this) != null) { Log.i(tag, "FAIL no VPN permission"); return; }
                String id = vpn.add("Test server", conf); Log.i(tag, "imported " + id);
                vpn.connect(id);
                long hs = 0; for (int k = 0; k < 40 && hs == 0; k++) { Thread.sleep(500); Object v = vpn.status().get("handshake"); hs = v instanceof Number ? ((Number) v).longValue() : 0; }
                Log.i(tag, "state " + vpn.status().get("state") + " handshake " + hs);
                String body = "";
                for (int k = 0; k < 5 && body.isEmpty(); k++) { try { URL u = new URL(url); try (java.net.Socket so = new java.net.Socket()) { so.connect(new java.net.InetSocketAddress(u.getHost(), u.getPort()), 4000); so.setSoTimeout(4000); so.getOutputStream().write(("GET " + u.getPath() + " HTTP/1.0\r\nHost: " + u.getHost() + "\r\n\r\n").getBytes(StandardCharsets.US_ASCII)); String r = new String(readAll(so.getInputStream(), 8192), StandardCharsets.UTF_8); int k2 = r.indexOf("\r\n\r\n"); body = (k2 >= 0 ? r.substring(k2 + 4) : r).trim(); } } catch (Exception e) { Log.i(tag, "http try " + k + " " + e); Thread.sleep(1000); } }
                Map<String, Object> st = vpn.status(); Log.i(tag, "http '" + body + "' rx " + st.get("rx") + " tx " + st.get("tx"));
                vpn.setSplit(id, "exclude", java.util.Collections.singletonList("com.android.chrome")); Thread.sleep(3000); Log.i(tag, "after split state " + vpn.status().get("state"));
                vpn.disconnect(); Thread.sleep(1500); Log.i(tag, "after disconnect state " + vpn.status().get("state"));
                Log.i(tag, (hs > 0 && body.contains("hello-through-srk-vpn") ? "DONE ok" : "DONE fail"));
            } catch (Throwable e) { Log.i(tag, "FAIL " + e); Log.i(tag, "DONE fail"); }
        }).start();
    }
}
