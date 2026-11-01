package in.shazverse.srkshare;

import android.Manifest;
import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.OpenableColumns;
import android.webkit.JavascriptInterface;
import android.webkit.MimeTypeMap;
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

import java.io.File;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

public class MainActivity extends AppCompatActivity implements AndroidHost.Page {
    private static final String HOST = "appassets.androidplatform.net";
    private static final int REQ_PICK = 21, REQ_PERM = 22;
    private WebView web; private ShareEngine engine; private AndroidHost host; private volatile boolean resumed;
    private final List<Uri> incoming = new ArrayList<>(); private boolean pageStarted;

    @Override protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        web = new WebView(this); setContentView(web);
        ViewCompat.setOnApplyWindowInsetsListener(web, (v, insets) -> { Insets b = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout() | WindowInsetsCompat.Type.ime()); v.setPadding(b.left, b.top, b.right, b.bottom); return WindowInsetsCompat.CONSUMED; });
        final WebViewAssetLoader loader = new WebViewAssetLoader.Builder().setDomain(HOST).addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this)).build();
        WebSettings s = web.getSettings(); s.setJavaScriptEnabled(true); s.setDomStorageEnabled(true); s.setAllowFileAccess(false); s.setTextZoom(100);
        host = AndroidHost.get(this); engine = AndroidHost.engine(this); host.attach(this);
        web.addJavascriptInterface(new Bridge(), "SRKShare");
        web.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) { return loader.shouldInterceptRequest(r.getUrl()); }
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) { Uri u = r.getUrl(); if (HOST.equals(u.getHost())) return false; try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception ignored) { } return true; }
        });
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) { @Override public void handleOnBackPressed() { moveTaskToBack(true); } });
        takeShared(getIntent());
        askPermissions();
        ShareService.start(this);
        web.loadUrl("https://" + HOST + "/assets/www/index.html");
    }
    private void askPermissions() {
        List<String> need = new ArrayList<>();
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) need.add(Manifest.permission.POST_NOTIFICATIONS);
        if (Build.VERSION.SDK_INT <= 28 && checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) need.add(Manifest.permission.WRITE_EXTERNAL_STORAGE);
        if (!need.isEmpty()) requestPermissions(need.toArray(new String[0]), REQ_PERM);
    }
    @Override protected void onNewIntent(Intent intent) { super.onNewIntent(intent); takeShared(intent); if (pageStarted) addIncoming(); }
    @Override protected void onResume() { super.onResume(); resumed = true; }
    @Override protected void onPause() { resumed = false; super.onPause(); }
    @Override protected void onDestroy() { host.detach(this); if (!engine.busy() && isFinishing()) ShareService.stop(this); super.onDestroy(); }

    /* ---------- files shared into the app ---------- */
    private void takeShared(Intent i) {
        if (i == null) return;
        if (Intent.ACTION_SEND.equals(i.getAction())) { Uri u = i.getParcelableExtra(Intent.EXTRA_STREAM); if (u != null) incoming.add(u); else { CharSequence t = i.getCharSequenceExtra(Intent.EXTRA_TEXT); if (t != null) pendingText = t.toString(); } }
        else if (Intent.ACTION_SEND_MULTIPLE.equals(i.getAction())) { ArrayList<Uri> l = i.getParcelableArrayListExtra(Intent.EXTRA_STREAM); if (l != null) incoming.addAll(l); }
    }
    private String pendingText;
    private void addIncoming() {
        if (!incoming.isEmpty()) { List<Object> files = new ArrayList<>(); for (Uri u : incoming) { Map<String, Object> f = register(u); if (f != null) files.add(f); } incoming.clear(); if (!files.isEmpty()) host.emit(Json.str(Json.map("type", "picked", "files", files))); }
        if (pendingText != null) { host.emit(Json.str(Json.map("type", "toast", "msg", "Pick who to send the text to, then tap Text"))); copyToClipboard(pendingText); pendingText = null; }
    }
    private Map<String, Object> register(Uri u) {
        String name = "file"; long size = -1;
        try (Cursor c = getContentResolver().query(u, new String[]{OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE}, null, null, null)) { if (c != null && c.moveToFirst()) { if (!c.isNull(0)) name = c.getString(0); if (!c.isNull(1)) size = c.getLong(1); } } catch (Exception ignored) { }
        if (size < 0) { try (android.content.res.AssetFileDescriptor fd = getContentResolver().openAssetFileDescriptor(u, "r")) { if (fd != null) size = fd.getLength(); } catch (Exception ignored) { } }
        if (size < 0) return null;
        String mime = getContentResolver().getType(u);
        String id = engine.addFile(name, size, mime, u.toString()); return engine.fileInfo(id);
    }

    /* ---------- events to the page ---------- */
    @Override public void deliver(String json) { if (web != null) web.evaluateJavascript("window.__shareEvent && window.__shareEvent(" + jsString(json) + ")", null); }
    @Override public boolean visible() { return resumed; }
    static String jsString(String s) { StringBuilder b = new StringBuilder("\""); for (char ch : s.toCharArray()) { if (ch == '"' || ch == '\\') b.append('\\').append(ch); else if (ch < 0x20 || ch == 0x2028 || ch == 0x2029) b.append(String.format("\\u%04x", (int) ch)); else b.append(ch); } return b.append('"').toString(); }
    private void copyToClipboard(String t) { try { ((ClipboardManager) getSystemService(CLIPBOARD_SERVICE)).setPrimaryClip(ClipData.newPlainText("SRK Share", t)); } catch (Exception ignored) { } }

    @Override protected void onActivityResult(int req, int res, Intent data) {
        super.onActivityResult(req, res, data);
        if (req != REQ_PICK || res != RESULT_OK || data == null) return;
        List<Uri> uris = new ArrayList<>();
        if (data.getClipData() != null) { ClipData c = data.getClipData(); for (int k = 0; k < c.getItemCount(); k++) uris.add(c.getItemAt(k).getUri()); }
        else if (data.getData() != null) uris.add(data.getData());
        new Thread(() -> { List<Object> files = new ArrayList<>(); for (Uri u : uris) { Map<String, Object> f = register(u); if (f != null) files.add(f); } if (!files.isEmpty()) host.emit(Json.str(Json.map("type", "picked", "files", files))); else host.emit(Json.str(Json.map("type", "toast", "msg", "Couldn’t read those files"))); }).start();
    }

    /* ---------- the bridge the page calls (same names as on Windows) ---------- */
    private class Bridge {
        @JavascriptInterface public void start() { runOnUiThread(() -> { engine.start(); host.pageReady(); pageStarted = true; addIncoming(); }); }
        @JavascriptInterface public void setName(String n) { engine.setName(n); }
        @JavascriptInterface public void pickFiles() { runOnUiThread(() -> { Intent i = new Intent(Intent.ACTION_GET_CONTENT); i.setType("*/*"); i.addCategory(Intent.CATEGORY_OPENABLE); i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
            try { startActivityForResult(Intent.createChooser(i, "Choose files to send"), REQ_PICK); } catch (ActivityNotFoundException e) { Toast.makeText(MainActivity.this, "No app found to pick files", Toast.LENGTH_SHORT).show(); } }); }
        @JavascriptInterface public void forget(String id) { engine.forget(id); }
        @JavascriptInterface public void send(String peersJson, String filesJson, String text) { List<String> p = new ArrayList<>(), f = new ArrayList<>(); Object a = Json.parse(peersJson), b = Json.parse(filesJson); if (a instanceof List) for (Object x : (List<?>) a) p.add(String.valueOf(x)); if (b instanceof List) for (Object x : (List<?>) b) f.add(String.valueOf(x)); engine.send(p, f, text); }
        @JavascriptInterface public void respond(String offerId, boolean accept, boolean always) { engine.respond(offerId, accept, always); }
        @JavascriptInterface public void cancel(String id) { engine.cancel(id); }
        @JavascriptInterface public void connect(String address) { engine.connect(address); }
        @JavascriptInterface public void untrust(String id) { engine.untrust(id); }
        @JavascriptInterface public void copy(String t) { runOnUiThread(() -> copyToClipboard(t)); }
        @JavascriptInterface public void openFolder() { runOnUiThread(() -> { try { startActivity(new Intent(DownloadManager.ACTION_VIEW_DOWNLOADS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); } catch (Exception e) { Toast.makeText(MainActivity.this, "Open Files › Downloads › SRK Share", Toast.LENGTH_LONG).show(); } }); }
        @JavascriptInterface public void open(String id, String refHint) {
            String ref = engine.ref(id); if (ref == null || ref.isEmpty()) ref = refHint; if (ref == null || ref.isEmpty()) return; final String r = ref;
            runOnUiThread(() -> { try { Uri u = Uri.parse(r); if ("file".equals(u.getScheme())) u = FileProvider.getUriForFile(MainActivity.this, getPackageName() + ".files", new File(u.getPath()));
                    String type = getContentResolver().getType(u); if (type == null) { String p = r.toLowerCase(); String ext = p.contains(".") ? p.substring(p.lastIndexOf('.') + 1) : ""; type = MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext); }
                    Intent v = new Intent(Intent.ACTION_VIEW); v.setDataAndType(u, type == null ? "*/*" : type); v.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK); startActivity(Intent.createChooser(v, "Open with"));
                } catch (Exception e) { Toast.makeText(MainActivity.this, "No app on this phone opens this file", Toast.LENGTH_SHORT).show(); } });
        }
    }
}
