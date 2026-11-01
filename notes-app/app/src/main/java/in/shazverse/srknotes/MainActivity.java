package in.shazverse.srknotes;

import android.Manifest;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.provider.MediaStore;
import android.provider.OpenableColumns;
import android.util.Base64;
import android.speech.RecognizerIntent;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.MimeTypeMap;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.activity.OnBackPressedCallback;
import androidx.annotation.NonNull;
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
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

public class MainActivity extends AppCompatActivity {
    private static final String HOST = "appassets.androidplatform.net";
    private static final String START = "https://" + HOST + "/assets/www/index.html";
    private static final int REQ_FILE = 11;
    private static final int REQ_PERM = 12;
    private static final int REQ_MEDIA = 13;
    private static final int REQ_DICT = 14;
    private PermissionRequest pendingPerm;
    private View fullView;
    private WebChromeClient.CustomViewCallback fullCb;
    private String incomingText = null, incomingSubject = null;

    private WebView web;
    private ValueCallback<Uri[]> fileCallback;
    private Uri cameraUri;
    private Uri incomingUri;      // a PDF another app asked us to open
    private String incomingName = "document.pdf";
    private boolean pageReady = false;
    private WebView printView;     // kept alive while Android prints it
    private TextToSpeech tts;
    private boolean ttsReady = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        web = new WebView(this);
        setContentView(web);

        // keep the page clear of the status bar, navigation bar and keyboard
        ViewCompat.setOnApplyWindowInsetsListener(web, (v, insets) -> {
            Insets b = insets.getInsets(WindowInsetsCompat.Type.systemBars()
                    | WindowInsetsCompat.Type.displayCutout() | WindowInsetsCompat.Type.ime());
            v.setPadding(b.left, b.top, b.right, b.bottom);
            return WindowInsetsCompat.CONSUMED;
        });

        final WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .setDomain(HOST)
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .addPathHandler("/incoming/", path -> openIncoming())
                .build();

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(true);
        s.setTextZoom(100);
        s.setMediaPlaybackRequiresUserGesture(true);

        Bridge bridge = new Bridge();
        web.addJavascriptInterface(bridge, "SRKAndroid");
        web.addJavascriptInterface(bridge, "SRKNotes");
        tts = new TextToSpeech(this, status -> ttsReady = status == TextToSpeech.SUCCESS);
        tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
            @Override public void onStart(String id) { }
            @Override public void onDone(String id) { if ("last".equals(id)) speechDone(); }
            @Override public void onError(String id) { speechDone(); }
            @Override public void onStop(String id, boolean interrupted) { if ("last".equals(id)) speechDone(); }
        });
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return loader.shouldInterceptRequest(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri u = request.getUrl();
                if (HOST.equals(u.getHost())) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception ignored) { }
                return true;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                pageReady = true;
                deliverIncoming();
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                return showChooser(callback, params);
            }

            /* microphone and camera for recording audio and video into notes */
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                runOnUiThread(() -> {
                    List<String> grant = new ArrayList<>(); List<String> need = new ArrayList<>();
                    for (String r : request.getResources()) {
                        if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(r)) { grant.add(r); if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) need.add(Manifest.permission.RECORD_AUDIO); }
                        if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(r)) { grant.add(r); if (checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) need.add(Manifest.permission.CAMERA); }
                    }
                    if (grant.isEmpty()) { request.deny(); return; }
                    if (need.isEmpty()) { request.grant(grant.toArray(new String[0])); return; }
                    if (pendingPerm != null) pendingPerm.deny();
                    pendingPerm = request;
                    requestPermissions(need.toArray(new String[0]), REQ_MEDIA);
                });
            }

            /* full-screen video */
            @Override
            public void onShowCustomView(View view, CustomViewCallback callback) {
                if (fullView != null) { callback.onCustomViewHidden(); return; }
                fullView = view; fullCb = callback;
                ((ViewGroup) getWindow().getDecorView()).addView(view, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
            }

            @Override
            public void onHideCustomView() { hideFull(); }
        });

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (fullView != null) { hideFull(); return; }
                web.evaluateJavascript("window.srkBack ? window.srkBack() : false", v -> { if (!"true".equals(v)) { if (web.canGoBack()) web.goBack(); else finish(); } });
            }
        });

        takeIncoming(getIntent());
        if (savedInstanceState != null) web.restoreState(savedInstanceState);
        if (web.getUrl() == null) web.loadUrl(START);
    }

    @Override
    protected void onSaveInstanceState(@NonNull Bundle outState) {
        super.onSaveInstanceState(outState);
        web.saveState(outState);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        takeIncoming(intent);
        deliverIncoming();
    }

    /* ---------- PDFs opened from other apps ---------- */
    private void takeIncoming(Intent intent) {
        if (intent == null) return;
        Uri u = null;
        if (Intent.ACTION_VIEW.equals(intent.getAction())) u = intent.getData();
        else if (Intent.ACTION_SEND.equals(intent.getAction())) u = intent.getParcelableExtra(Intent.EXTRA_STREAM);
        if (u == null && Intent.ACTION_SEND.equals(intent.getAction())) {
            CharSequence t = intent.getCharSequenceExtra(Intent.EXTRA_TEXT);
            if (t != null) { incomingText = t.toString(); incomingSubject = intent.getStringExtra(Intent.EXTRA_SUBJECT); }
            return;
        }
        if (u == null) return;
        incomingUri = u;
        String type = intent.getType() != null ? intent.getType() : getContentResolver().getType(u);
        String fallback = type == null ? "file" : type.startsWith("image/") ? "picture." + (type.contains("png") ? "png" : "jpg") : type.contains("pdf") ? "document.pdf" : type.contains("wordprocessing") ? "document.docx" : type.contains("markdown") ? "note.md" : type.startsWith("text/") ? "note.txt" : "notes.srknotes";
        incomingName = displayName(u, fallback);
    }

    private void deliverIncoming() {
        if (pageReady && incomingText != null) {
            String js = "window.srkSharedText && window.srkSharedText(" + jsString(incomingText) + "," + (incomingSubject == null ? "null" : jsString(incomingSubject)) + ")";
            incomingText = null; incomingSubject = null;
            web.evaluateJavascript(js, null);
        }
        if (!pageReady || incomingUri == null) return;
        String js = "window.srkOpenIncoming && window.srkOpenIncoming(" + jsString(incomingName) + ")";
        web.evaluateJavascript(js, null);
    }

    private WebResourceResponse openIncoming() {
        if (incomingUri == null) return null;
        try {
            InputStream in = getContentResolver().openInputStream(incomingUri);
            return new WebResourceResponse("application/octet-stream", null, in);
        } catch (Exception e) {
            return null;
        }
    }

    private String displayName(Uri u, String fallback) {
        try (Cursor c = getContentResolver().query(u, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            if (c != null && c.moveToFirst()) {
                String n = c.getString(0);
                if (n != null && !n.isEmpty()) return n;
            }
        } catch (Exception ignored) { }
        String last = u.getLastPathSegment();
        return last != null && last.matches("(?i).+\\.(srknotes|md|markdown|txt|html|htm|docx|pdf|jpg|jpeg|png|webp|gif)$") ? last : fallback;
    }

    private static String jsString(String s) {
        StringBuilder b = new StringBuilder("\"");
        for (char ch : s.toCharArray()) {
            if (ch == '"' || ch == '\\') b.append('\\').append(ch);
            else if (ch < 0x20 || ch == 0x2028 || ch == 0x2029) b.append(String.format("\\u%04x", (int) ch));
            else b.append(ch);
        }
        return b.append('"').toString();
    }

    /* ---------- file picker + camera ---------- */
    private boolean showChooser(ValueCallback<Uri[]> callback, WebChromeClient.FileChooserParams params) {
        if (fileCallback != null) fileCallback.onReceiveValue(null);
        fileCallback = callback;
        cameraUri = null;

        Set<String> mimes = new LinkedHashSet<>();
        boolean images = false;
        String[] accept = params.getAcceptTypes();
        if (accept != null) {
            for (String group : accept) {
                if (group == null) continue;
                for (String raw : group.split(",")) {
                    String t = raw.trim().toLowerCase();
                    if (t.isEmpty()) continue;
                    if (t.startsWith(".")) {
                        String m = mimeForExt(t.substring(1));
                        if (m != null) mimes.add(m);
                    } else {
                        mimes.add(t);
                    }
                    if (t.startsWith("image/")) images = true;
                }
            }
        }
        if (mimes.contains("application/zip") || mimes.contains("application/octet-stream") || mimes.contains("text/markdown")) { mimes.clear(); }
        boolean any = mimes.isEmpty() || mimes.contains("*/*");

        Intent camera = null;
        if (images) {
            try {
                File dir = new File(getCacheDir(), "camera");
                if (!dir.exists()) dir.mkdirs();
                File photo = new File(dir, "photo_" + System.currentTimeMillis() + ".jpg");
                cameraUri = FileProvider.getUriForFile(this, getPackageName() + ".files", photo);
                camera = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
                camera.putExtra(MediaStore.EXTRA_OUTPUT, cameraUri);
                camera.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
                camera.setClipData(ClipData.newRawUri("photo", cameraUri));
            } catch (Exception e) {
                camera = null;
                cameraUri = null;
            }
        }

        try {
            if (params.isCaptureEnabled() && camera != null) {
                startActivityForResult(camera, REQ_FILE);
                return true;
            }
            Intent pick = new Intent(Intent.ACTION_GET_CONTENT);
            pick.addCategory(Intent.CATEGORY_OPENABLE);
            if (any) {
                pick.setType("*/*");
            } else if (mimes.size() == 1) {
                pick.setType(mimes.iterator().next());
            } else {
                pick.setType("*/*");
                pick.putExtra(Intent.EXTRA_MIME_TYPES, mimes.toArray(new String[0]));
            }
            pick.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, params.getMode() == WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE);
            Intent chooser = Intent.createChooser(pick, images ? "Take a photo or choose" : "Choose a file");
            if (camera != null) chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS, new Intent[]{camera});
            startActivityForResult(chooser, REQ_FILE);
            return true;
        } catch (ActivityNotFoundException e) {
            fileCallback = null;
            Toast.makeText(this, "No app found to pick files", Toast.LENGTH_SHORT).show();
            return false;
        }
    }

    private static String mimeForExt(String ext) {
        switch (ext) {
            case "pdf": return "application/pdf";
            case "doc": return "application/msword";
            case "xls": return "application/vnd.ms-excel";
            case "xlsm": return "application/vnd.ms-excel.sheet.macroEnabled.12";
            case "csv": return "text/csv";
            case "ods": return "application/vnd.oasis.opendocument.spreadsheet";
            case "xlsb": return "application/vnd.ms-excel.sheet.binary.macroEnabled.12";
            case "tsv": return "text/tab-separated-values";
            case "md": case "markdown": return "text/markdown";
            case "srknotes": return "application/zip";
            case "txt": return "text/plain";
            case "docx": return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
            case "xlsx": return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
            case "pptx": return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
            case "html": case "htm": return "text/html";
            default: return MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext);
        }
    }

    private void hideFull() {
        if (fullView == null) return;
        ((ViewGroup) getWindow().getDecorView()).removeView(fullView);
        fullView = null;
        WebChromeClient.CustomViewCallback cb = fullCb; fullCb = null;
        if (cb != null) cb.onCustomViewHidden();
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions, @NonNull int[] results) {
        super.onRequestPermissionsResult(requestCode, permissions, results);
        if (requestCode == REQ_MEDIA && pendingPerm != null) {
            boolean ok = results.length > 0;
            for (int r : results) if (r != PackageManager.PERMISSION_GRANTED) ok = false;
            if (ok) {
                List<String> g = new ArrayList<>();
                for (String r : pendingPerm.getResources()) if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(r) || PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(r)) g.add(r);
                pendingPerm.grant(g.toArray(new String[0]));
            } else pendingPerm.deny();
            pendingPerm = null;
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQ_DICT) {
            String text = "";
            if (resultCode == RESULT_OK && data != null) {
                ArrayList<String> r = data.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS);
                if (r != null && !r.isEmpty()) text = r.get(0);
            }
            web.evaluateJavascript("window.srkDictated && window.srkDictated(" + jsString(text) + ")", null);
            return;
        }
        if (requestCode != REQ_FILE || fileCallback == null) return;
        Uri[] result = null;
        if (resultCode == RESULT_OK) {
            if (data != null && data.getClipData() != null && data.getData() == null && !isCameraClip(data.getClipData())) {
                ClipData clip = data.getClipData();
                List<Uri> list = new ArrayList<>();
                for (int i = 0; i < clip.getItemCount(); i++) list.add(clip.getItemAt(i).getUri());
                result = list.toArray(new Uri[0]);
            } else if (data != null && data.getData() != null) {
                result = new Uri[]{data.getData()};
            } else if (cameraUri != null) {
                result = new Uri[]{cameraUri};
            }
        }
        fileCallback.onReceiveValue(result);
        fileCallback = null;
    }

    private boolean isCameraClip(ClipData clip) {
        return cameraUri != null && clip.getItemCount() == 1 && cameraUri.equals(clip.getItemAt(0).getUri());
    }

    /* ---------- saving and sharing, called from the page ---------- */
    private class Bridge {
        /** Internet request on a background thread; the answer comes back through window.__srkHttp(id, status, base64Body). */
        @JavascriptInterface
        public void httpAsync(final String id, final String method, final String url, final String headersJson, final String body) {
            new Thread(() -> {
                int status = 0; byte[] out = new byte[0];
                try {
                    java.net.HttpURLConnection c = (java.net.HttpURLConnection) new java.net.URL(url).openConnection();
                    c.setRequestMethod(method == null || method.isEmpty() ? "GET" : method);
                    c.setConnectTimeout(20000); c.setReadTimeout(120000);
                    c.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android 14) SRKNotes/1.0");
                    if (headersJson != null && !headersJson.isEmpty()) {
                        org.json.JSONObject h = new org.json.JSONObject(headersJson);
                        java.util.Iterator<String> it = h.keys();
                        while (it.hasNext()) { String k = it.next(); c.setRequestProperty(k, h.getString(k)); }
                    }
                    if (body != null && !body.isEmpty()) {
                        c.setDoOutput(true);
                        try (java.io.OutputStream os = c.getOutputStream()) { os.write(body.getBytes("UTF-8")); }
                    }
                    status = c.getResponseCode();
                    java.io.InputStream in = status >= 400 ? c.getErrorStream() : c.getInputStream();
                    if (in != null) {
                        java.io.ByteArrayOutputStream bo = new java.io.ByteArrayOutputStream(); byte[] buf = new byte[16384]; int n;
                        while ((n = in.read(buf)) > 0) bo.write(buf, 0, n);
                        in.close(); out = bo.toByteArray();
                    }
                    c.disconnect();
                } catch (Exception e) {
                    status = 0; try { out = String.valueOf(e.getMessage()).getBytes("UTF-8"); } catch (Exception ignored) { }
                }
                final String js = "window.__srkHttp && window.__srkHttp(" + jsString(id) + "," + status + ",\"" + Base64.encodeToString(out, Base64.NO_WRAP) + "\")";
                runOnUiThread(() -> web.evaluateJavascript(js, null));
            }).start();
        }

        @JavascriptInterface
        public String saveFile(String name, String mime, String base64) {
            try {
                byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
                String safe = name.replaceAll("[\\\\/:*?\"<>|]", "-");
                if (Build.VERSION.SDK_INT >= 29) {
                    ContentValues v = new ContentValues();
                    v.put(MediaStore.MediaColumns.DISPLAY_NAME, safe);
                    v.put(MediaStore.MediaColumns.MIME_TYPE, mime);
                    v.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/SRK Notes");
                    Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
                    if (uri == null) return "error";
                    try (OutputStream os = getContentResolver().openOutputStream(uri)) {
                        if (os == null) return "error";
                        os.write(bytes);
                    }
                } else {
                    if (checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
                        runOnUiThread(() -> requestPermissions(new String[]{Manifest.permission.WRITE_EXTERNAL_STORAGE}, REQ_PERM));
                        return "perm";
                    }
                    File dir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), "SRK Notes");
                    if (!dir.exists()) dir.mkdirs();
                    File f = new File(dir, safe);
                    int n = 2;
                    String base = safe.contains(".") ? safe.substring(0, safe.lastIndexOf('.')) : safe;
                    String ext = safe.contains(".") ? safe.substring(safe.lastIndexOf('.')) : "";
                    while (f.exists()) f = new File(dir, base + " (" + (n++) + ")" + ext);
                    try (FileOutputStream os = new FileOutputStream(f)) { os.write(bytes); }
                    MediaScannerConnection.scanFile(MainActivity.this, new String[]{f.getAbsolutePath()}, new String[]{mime}, null);
                }
                runOnUiThread(() -> Toast.makeText(MainActivity.this, "Saved to Downloads/SRK Notes", Toast.LENGTH_SHORT).show());
                return "ok";
            } catch (Exception e) {
                return "error";
            }
        }

        @JavascriptInterface
        public String shareFile(String name, String mime, String base64) {
            try {
                byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
                File dir = new File(getCacheDir(), "shared");
                if (!dir.exists()) dir.mkdirs();
                File f = new File(dir, name.replaceAll("[\\\\/:*?\"<>|]", "-"));
                try (FileOutputStream os = new FileOutputStream(f)) { os.write(bytes); }
                Uri uri = FileProvider.getUriForFile(MainActivity.this, getPackageName() + ".files", f);
                Intent send = new Intent(Intent.ACTION_SEND);
                send.setType(mime);
                send.putExtra(Intent.EXTRA_STREAM, uri);
                send.setClipData(ClipData.newRawUri(f.getName(), uri));
                send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                runOnUiThread(() -> startActivity(Intent.createChooser(send, "Share " + f.getName())));
                return "ok";
            } catch (Exception e) {
                return "error";
            }
        }

        /* Speech typing with the phone's voice recogniser; the text comes back through window.srkDictated(text) */
        @JavascriptInterface
        public String dictate(String lang) {
            try {
                Intent i = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
                i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
                i.putExtra(RecognizerIntent.EXTRA_LANGUAGE, lang == null || lang.isEmpty() ? "en-IN" : lang);
                i.putExtra(RecognizerIntent.EXTRA_PROMPT, "Speak to type into your note");
                runOnUiThread(() -> {
                    try { startActivityForResult(i, REQ_DICT); }
                    catch (ActivityNotFoundException e) { Toast.makeText(MainActivity.this, "Install Google voice typing to dictate", Toast.LENGTH_LONG).show(); }
                });
                return "ok";
            } catch (Exception e) {
                return "error";
            }
        }

        /* Open an attachment in another app (PDF reader, Word, gallery…) */
        @JavascriptInterface
        public String openFile(String name, String mime, String base64) {
            try {
                byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
                File dir = new File(getCacheDir(), "shared");
                if (!dir.exists()) dir.mkdirs();
                File f = new File(dir, name.replaceAll("[\\\\/:*?\"<>|]", "-"));
                try (FileOutputStream os = new FileOutputStream(f)) { os.write(bytes); }
                Uri uri = FileProvider.getUriForFile(MainActivity.this, getPackageName() + ".files", f);
                Intent v = new Intent(Intent.ACTION_VIEW);
                v.setDataAndType(uri, mime == null || mime.isEmpty() ? "application/octet-stream" : mime);
                v.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                if (v.resolveActivity(getPackageManager()) == null) return "none";
                runOnUiThread(() -> { try { startActivity(Intent.createChooser(v, "Open " + f.getName())); } catch (Exception ignored) { } });
                return "ok";
            } catch (Exception e) {
                return "error";
            }
        }

        @JavascriptInterface
        public void ready() { runOnUiThread(MainActivity.this::deliverIncoming); }

        /* Android printing: "Save as PDF" here keeps real, searchable text */
        @JavascriptInterface
        public void print(String html, String name, String size, String orient) {
            runOnUiThread(() -> {
                WebView pv = new WebView(MainActivity.this);
                printView = pv;
                pv.getSettings().setJavaScriptEnabled(false);
                pv.setWebViewClient(new WebViewClient() {
                    @Override
                    public void onPageFinished(WebView v, String url) {
                        PrintManager pm = (PrintManager) getSystemService(PRINT_SERVICE);
                        String job = (name == null || name.isEmpty() ? "Document" : name);
                        PrintAttributes.MediaSize media = "letter".equals(size) ? PrintAttributes.MediaSize.NA_LETTER
                                : "legal".equals(size) ? PrintAttributes.MediaSize.NA_LEGAL : PrintAttributes.MediaSize.ISO_A4;
                        if ("landscape".equals(orient)) media = media.asLandscape();
                        PrintDocumentAdapter adapter = v.createPrintDocumentAdapter(job);
                        pm.print(job, adapter, new PrintAttributes.Builder().setMediaSize(media).build());
                    }
                });
                pv.loadDataWithBaseURL("https://" + HOST + "/", html, "text/html", "UTF-8", null);
            });
        }

        /* Read aloud with the phone's text-to-speech voices */
        @JavascriptInterface
        public String speak(String text, String lang) {
            if (tts == null || !ttsReady) return "notready";
            Locale loc = lang != null && lang.startsWith("ta") ? new Locale("ta", "IN") : new Locale("en", "IN");
            int r = tts.setLanguage(loc);
            if (r < 0) {
                if (loc.getLanguage().equals("ta")) return "nolang";
                tts.setLanguage(Locale.ENGLISH);
            }
            int max = Math.min(3500, TextToSpeech.getMaxSpeechInputLength() - 50);
            List<String> parts = new ArrayList<>();
            String rest = text;
            while (rest.length() > max) {
                int cut = Math.max(rest.lastIndexOf(". ", max), rest.lastIndexOf("\n", max));
                if (cut < max / 2) cut = rest.lastIndexOf(' ', max);
                if (cut < 1) cut = max;
                parts.add(rest.substring(0, cut + 1));
                rest = rest.substring(cut + 1);
            }
            if (!rest.trim().isEmpty()) parts.add(rest);
            for (int i = 0; i < parts.size(); i++) {
                tts.speak(parts.get(i), i == 0 ? TextToSpeech.QUEUE_FLUSH : TextToSpeech.QUEUE_ADD, null, i == parts.size() - 1 ? "last" : "p" + i);
            }
            return "ok";
        }

        @JavascriptInterface
        public void stopSpeaking() {
            if (tts != null) tts.stop();
            speechDone();
        }
    }

    private void speechDone() {
        runOnUiThread(() -> web.evaluateJavascript("window.srkSpeechDone && window.srkSpeechDone()", null));
    }

    @Override
    protected void onDestroy() {
        if (tts != null) tts.shutdown();
        super.onDestroy();
    }
}
