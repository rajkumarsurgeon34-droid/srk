package in.shazverse.srktorrent;

import android.Manifest;
import android.app.AlertDialog;
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
import android.os.Environment;
import android.provider.DocumentsContract;
import android.provider.OpenableColumns;
import android.provider.Settings;
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
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

public class MainActivity extends AppCompatActivity implements TorrentHost.Page {
    private static final String HOST = "appassets.androidplatform.net";
    private static final int REQ_TORRENT = 31, REQ_CREATE_FILE = 32, REQ_CREATE_DIR = 33, REQ_PERM = 34;
    private WebView web; private TorrentHost host; private volatile boolean resumed, pageStarted;
    private final List<Intent> pending = new ArrayList<>();

    private TorrentEngine engine() { return TorrentHost.engine(this); }

    @Override protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        web = new WebView(this); setContentView(web);
        ViewCompat.setOnApplyWindowInsetsListener(web, (v, insets) -> { Insets b = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout() | WindowInsetsCompat.Type.ime()); v.setPadding(b.left, b.top, b.right, b.bottom); return WindowInsetsCompat.CONSUMED; });
        final WebViewAssetLoader loader = new WebViewAssetLoader.Builder().setDomain(HOST).addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this)).build();
        WebSettings s = web.getSettings(); s.setJavaScriptEnabled(true); s.setDomStorageEnabled(true); s.setAllowFileAccess(false); s.setTextZoom(100);
        host = TorrentHost.get(this); host.attach(this);
        web.addJavascriptInterface(new Bridge(), "SRKTorrent");
        web.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) { return loader.shouldInterceptRequest(r.getUrl()); }
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) { Uri u = r.getUrl(); if (HOST.equals(u.getHost())) return false; try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception ignored) { } return true; }
        });
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) { @Override public void handleOnBackPressed() { web.evaluateJavascript("(function(){var d=document.getElementById('details');var s=document.querySelector('.scrim');if(s){s.dispatchEvent(new PointerEvent('pointerdown'));return 1}if(d&&!d.hidden){d.querySelector('.dhead .ib').click();return 1}return 0})()", r -> { if (!"1".equals(r)) moveTaskToBack(true); }); } });
        if (getIntent() != null) pending.add(getIntent());
        askPermissions();
        TorrentService.start(this);
        web.loadUrl("https://" + HOST + "/assets/www/index.html");
    }
    private void askPermissions() {
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQ_PERM);
        if (Build.VERSION.SDK_INT <= 29 && checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) requestPermissions(new String[]{Manifest.permission.WRITE_EXTERNAL_STORAGE}, REQ_PERM + 1);
        if (Build.VERSION.SDK_INT >= 30 && !Environment.isExternalStorageManager() && !"asked".equals(host.pref("filesAsked"))) {
            host.setPref("filesAsked", "asked");
            new AlertDialog.Builder(this).setTitle("Save downloads to your Downloads folder")
                .setMessage("SRK Torrent saves files in Downloads › SRK Torrent, so you can open them from any app. Android needs you to allow “All files access” for that.\n\nOn the next screen, turn on SRK Torrent.")
                .setPositiveButton("Continue", (d, w) -> openAllFilesSettings()).setNegativeButton("Not now", null).show();
        }
    }
    private void openAllFilesSettings() { try { startActivity(new Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION, Uri.parse("package:" + getPackageName()))); } catch (Exception e) { try { startActivity(new Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION)); } catch (Exception ignored) { } } }
    private boolean storageOk() { return Build.VERSION.SDK_INT < 30 || Environment.isExternalStorageManager(); }

    @Override protected void onNewIntent(Intent intent) { super.onNewIntent(intent); if (pageStarted) handleIntent(intent); else pending.add(intent); }
    @Override protected void onResume() { super.onResume(); resumed = true; if (!TorrentHost.running() && pageStarted) { TorrentService.start(this); } }
    @Override protected void onPause() { resumed = false; super.onPause(); }
    @Override protected void onDestroy() { host.detach(this); super.onDestroy(); }

    /* ---------- magnet links and .torrent files from other apps ---------- */
    private void handleIntent(Intent i) {
        if (i == null) return; String a = i.getAction(); Uri u = i.getData();
        if (Intent.ACTION_VIEW.equals(a) && u != null) {
            if ("magnet".equalsIgnoreCase(u.getScheme())) emitLocal("incomingMagnet", "uri", u.toString());
            else stageUri(u);
        } else if (Intent.ACTION_SEND.equals(a)) {
            Uri st = i.getParcelableExtra(Intent.EXTRA_STREAM); CharSequence t = i.getCharSequenceExtra(Intent.EXTRA_TEXT);
            if (st != null) stageUri(st);
            else if (t != null) { String txt = t.toString(); int m = txt.toLowerCase(Locale.ROOT).indexOf("magnet:?"); if (m >= 0) emitLocal("incomingMagnet", "uri", txt.substring(m).split("\\s")[0]); else toast("That text has no magnet link"); }
        }
    }
    private void stageUri(Uri u) { new Thread(() -> { try (InputStream in = getContentResolver().openInputStream(u)) { if (in == null) throw new Exception(); byte[] b = TorrentEngine.readAll(in); engine().stage(b, nameOf(u)); } catch (Exception e) { emitLocal("toast", "msg", "Couldn’t open that .torrent file"); } }).start(); }
    private String nameOf(Uri u) { try (Cursor c = getContentResolver().query(u, new String[]{OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE}, null, null, null)) { if (c != null && c.moveToFirst() && !c.isNull(0)) return c.getString(0); } catch (Exception ignored) { } String p = u.getLastPathSegment(); return p == null ? "file" : p; }
    private long sizeOf(Uri u) { try (Cursor c = getContentResolver().query(u, new String[]{OpenableColumns.SIZE}, null, null, null)) { if (c != null && c.moveToFirst() && !c.isNull(0)) return c.getLong(0); } catch (Exception ignored) { } return -1; }

    /* ---------- events to the page ---------- */
    @Override public void deliver(String json) { if (web != null) web.evaluateJavascript("window.__torrentEvent && window.__torrentEvent(" + jsString(json) + ")", null); }
    @Override public boolean visible() { return resumed; }
    private void emitLocal(Object... kv) { host.emit(Json.str(Json.map(prepend("type", kv)))); }
    private static Object[] prepend(String k, Object[] kv) { Object[] r = new Object[kv.length + 1]; r[0] = k; System.arraycopy(kv, 0, r, 1, kv.length); return r; }
    static String jsString(String s) { StringBuilder b = new StringBuilder("\""); for (char ch : s.toCharArray()) { if (ch == '"' || ch == '\\') b.append('\\').append(ch); else if (ch < 0x20 || ch == 0x2028 || ch == 0x2029) b.append(String.format("\\u%04x", (int) ch)); else b.append(ch); } return b.append('"').toString(); }
    private void toast(String m) { runOnUiThread(() -> Toast.makeText(this, m, Toast.LENGTH_SHORT).show()); }
    private void copyToClipboard(String t) { try { ((ClipboardManager) getSystemService(CLIPBOARD_SERVICE)).setPrimaryClip(ClipData.newPlainText("SRK Torrent", t)); } catch (Exception ignored) { } }

    @Override protected void onActivityResult(int req, int res, Intent data) {
        super.onActivityResult(req, res, data);
        if (res != RESULT_OK || data == null || data.getData() == null) return; final Uri u = data.getData();
        if (req == REQ_TORRENT) stageUri(u);
        else if (req == REQ_CREATE_FILE) new Thread(() -> createSourceFromFile(u)).start();
        else if (req == REQ_CREATE_DIR) createSourceFromTree(u);
    }
    /** libtorrent needs a real file path: use the file where it is when we can, otherwise copy it into Downloads/SRK Torrent/Shared */
    private void createSourceFromFile(Uri u) {
        String path = pathOf(u);
        if (path != null && new File(path).canRead()) { emitLocal("createSource", "path", path, "name", new File(path).getName(), "size", new File(path).length(), "copied", false); return; }
        try { String name = TorrentEngine.safe(nameOf(u)); File dir = new File(engine().savePath(), "Shared"); dir.mkdirs(); File out = new File(dir, name);
            emitLocal("toast", "msg", "Copying " + name + "…");
            try (InputStream in = getContentResolver().openInputStream(u); OutputStream o = new FileOutputStream(out)) { byte[] b = new byte[1 << 18]; int n; while ((n = in.read(b)) > 0) o.write(b, 0, n); }
            emitLocal("createSource", "path", out.getAbsolutePath(), "name", name, "size", out.length(), "copied", true);
        } catch (Exception e) { emitLocal("toast", "msg", "Couldn’t read that file"); }
    }
    private void createSourceFromTree(Uri tree) {
        String docId = DocumentsContract.getTreeDocumentId(tree); String path = docPath(docId);
        if (path != null && new File(path).isDirectory() && new File(path).canRead()) { long sz = dirSize(new File(path)); emitLocal("createSource", "path", path, "name", new File(path).getName(), "size", sz, "copied", false); }
        else { emitLocal("toast", "msg", storageOk() ? "Choose a folder on the phone’s storage" : "To share a folder, allow “All files access” for SRK Torrent"); if (!storageOk()) openAllFilesSettings(); }
    }
    private static long dirSize(File f) { if (f.isFile()) return f.length(); long s = 0; File[] k = f.listFiles(); if (k != null) for (File c : k) s += dirSize(c); return s; }
    private String pathOf(Uri u) {
        try {
            if ("file".equals(u.getScheme())) return u.getPath();
            if (!storageOk()) return null;
            if (DocumentsContract.isDocumentUri(this, u)) {
                String auth = u.getAuthority(), id = DocumentsContract.getDocumentId(u);
                if ("com.android.externalstorage.documents".equals(auth)) return docPath(id);
                if ("com.android.providers.downloads.documents".equals(auth) && id.startsWith("raw:")) return id.substring(4);
            }
        } catch (Exception ignored) { }
        return null;
    }
    private static String docPath(String docId) { if (docId == null) return null; int c = docId.indexOf(':'); if (c < 0) return null; String vol = docId.substring(0, c), rest = docId.substring(c + 1); String base = "primary".equalsIgnoreCase(vol) ? Environment.getExternalStorageDirectory().getAbsolutePath() : "/storage/" + vol; return rest.isEmpty() ? base : base + "/" + rest; }

    private void openPath(String p) {
        if (p == null) return; File f = new File(p);
        if (!f.exists()) { toast("The file isn’t there yet"); return; }
        try {
            if (f.isDirectory()) {
                String root = Environment.getExternalStorageDirectory().getAbsolutePath();
                if (p.startsWith(root)) { Uri doc = DocumentsContract.buildDocumentUri("com.android.externalstorage.documents", "primary:" + p.substring(root.length()).replaceFirst("^/", ""));
                    Intent v = new Intent(Intent.ACTION_VIEW); v.setDataAndType(doc, DocumentsContract.Document.MIME_TYPE_DIR); v.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION); try { startActivity(v); return; } catch (Exception ignored) { } }
                try { startActivity(new Intent(DownloadManager.ACTION_VIEW_DOWNLOADS)); } catch (Exception e) { toast("Open Files › " + p.replace(root, "")); }
                return;
            }
            Uri u = FileProvider.getUriForFile(this, getPackageName() + ".files", f);
            String ext = p.contains(".") ? p.substring(p.lastIndexOf('.') + 1).toLowerCase(Locale.ROOT) : ""; String type = MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext);
            Intent v = new Intent(Intent.ACTION_VIEW); v.setDataAndType(u, type == null ? "*/*" : type); v.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(Intent.createChooser(v, "Open with"));
        } catch (Exception e) { toast("No app on this phone opens this file"); }
    }

    /* ---------- the bridge the page calls (same names as on Windows) ---------- */
    private class Bridge {
        @JavascriptInterface public void start() { runOnUiThread(() -> { TorrentService.start(MainActivity.this); new Thread(() -> { engine().start(); host.pageReady(); runOnUiThread(() -> { pageStarted = true; for (Intent i : pending) handleIntent(i); pending.clear(); }); }).start(); }); }
        @JavascriptInterface public void addMagnet(String uri, String opts) { engine().addMagnet(uri, opts); }
        @JavascriptInterface public void pickTorrent() { runOnUiThread(() -> { Intent i = new Intent(Intent.ACTION_GET_CONTENT); i.setType("*/*"); i.addCategory(Intent.CATEGORY_OPENABLE); i.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"application/x-bittorrent", "application/octet-stream"});
            try { startActivityForResult(i, REQ_TORRENT); } catch (ActivityNotFoundException e) { toast("No app found to pick files"); } }); }
        @JavascriptInterface public void addStaged(String token, String opts) { engine().addStaged(token, opts); }
        @JavascriptInterface public void unstage(String token) { engine().unstage(token); }
        @JavascriptInterface public void pause(String id) { engine().pause(id); }
        @JavascriptInterface public void resume(String id) { engine().resume(id); }
        @JavascriptInterface public void forceStart(String id) { engine().forceStart(id); }
        @JavascriptInterface public void pauseAll() { engine().pauseAll(); }
        @JavascriptInterface public void resumeAll() { engine().resumeAll(); }
        @JavascriptInterface public void remove(String id, boolean deleteFiles) { engine().remove(id, deleteFiles); }
        @JavascriptInterface public void recheck(String id) { engine().recheck(id); }
        @JavascriptInterface public void reannounce(String id) { engine().reannounce(id); }
        @JavascriptInterface public void setSequential(String id, boolean on) { engine().setSequential(id, on); }
        @JavascriptInterface public void setFilePriority(String id, int index, int prio) { engine().setFilePriority(id, index, prio); }
        @JavascriptInterface public void setAllFiles(String id, int prio) { engine().setAllFiles(id, prio); }
        @JavascriptInterface public void addTrackers(String id, String text) { engine().addTrackers(id, text); }
        @JavascriptInterface public void setLimits(String id, int dl, int ul) { engine().setLimits(id, dl, ul); }
        @JavascriptInterface public void queue(String id, String where) { engine().queue(id, where); }
        @JavascriptInterface public void details(String id) { engine().details(id); }
        @JavascriptInterface public void closeDetails() { engine().closeDetails(); }
        @JavascriptInterface public void connectPeer(String id, String addr) { engine().connectPeer(id, addr); }
        @JavascriptInterface public void setSettings(String json) { engine().setSettings(json); TorrentService.send(MainActivity.this, TorrentService.ACTION_NET); }
        @JavascriptInterface public void copy(String t) { runOnUiThread(() -> copyToClipboard(t)); }
        @JavascriptInterface public void copyMagnet(String id) { String m = engine().magnet(id); runOnUiThread(() -> copyToClipboard(m)); }
        @JavascriptInterface public void paste() { runOnUiThread(() -> { String t = ""; try { ClipData c = ((ClipboardManager) getSystemService(CLIPBOARD_SERVICE)).getPrimaryClip(); if (c != null && c.getItemCount() > 0) t = String.valueOf(c.getItemAt(0).coerceToText(MainActivity.this)); } catch (Exception ignored) { } emitLocal("clipboard", "text", t); }); }
        @JavascriptInterface public void open(String id, int fileIndex) { String p = engine().contentPath(id, fileIndex); runOnUiThread(() -> openPath(p)); }
        @JavascriptInterface public void showInFolder(String id, int fileIndex) { String p = engine().contentPath(id, fileIndex); if (p != null) { File f = new File(p); runOnUiThread(() -> openPath(f.isDirectory() ? p : f.getParent())); } }
        @JavascriptInterface public void openDownloads() { String p = engine().savePath(); runOnUiThread(() -> openPath(p)); }
        @JavascriptInterface public void exportTorrent(String id) { String out = engine().exportTorrent(id, engine().savePath()); if (out != null) emitLocal("toast", "msg", "Saved " + new File(out).getName() + " in " + new File(out).getParentFile().getName()); }
        @JavascriptInterface public void chooseFolder(String purpose) { emitLocal("toast", "msg", "On Android, files go to Downloads › SRK Torrent"); }
        @JavascriptInterface public void move(String id, String path) { engine().move(id, path); }
        @JavascriptInterface public void createPick(String kind) { runOnUiThread(() -> {
            try { if ("folder".equals(kind)) { if (!storageOk()) { emitLocal("toast", "msg", "To share a folder, allow “All files access” for SRK Torrent"); openAllFilesSettings(); return; } startActivityForResult(new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE), REQ_CREATE_DIR); }
                else { Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT); i.setType("*/*"); i.addCategory(Intent.CATEGORY_OPENABLE); startActivityForResult(i, REQ_CREATE_FILE); } }
            catch (ActivityNotFoundException e) { toast("No app found to pick files"); } }); }
        @JavascriptInterface public void create(String path, String trackers, String comment, boolean isPrivate) { engine().create(path, trackers, comment, isPrivate); }
        @JavascriptInterface public void shareFile(String path) { runOnUiThread(() -> { try { Uri u = FileProvider.getUriForFile(MainActivity.this, getPackageName() + ".files", new File(path)); Intent s = new Intent(Intent.ACTION_SEND); s.setType("application/x-bittorrent"); s.putExtra(Intent.EXTRA_STREAM, u); s.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION); startActivity(Intent.createChooser(s, "Share .torrent file")); } catch (Exception e) { toast("Couldn’t share the file"); } }); }
        @JavascriptInterface public void allFilesAccess() { runOnUiThread(MainActivity.this::openAllFilesSettings); }
        @JavascriptInterface public boolean hasAllFilesAccess() { return storageOk(); }
        @JavascriptInterface public void quit() { runOnUiThread(() -> { TorrentService.send(MainActivity.this, TorrentService.ACTION_QUIT); finishAndRemoveTask(); }); }
    }
}
