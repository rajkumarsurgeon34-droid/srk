package in.shazverse.srksheets;

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
import android.webkit.JavascriptInterface;
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
        web.addJavascriptInterface(bridge, "SRKSheets");
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
        });

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (web.canGoBack()) web.goBack(); else finish();
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
        if (u == null) return;
        incomingUri = u;
        String type = intent.getType() != null ? intent.getType() : getContentResolver().getType(u);
        String fallback = type != null && type.contains("ms-excel") ? "workbook.xls" : type != null && (type.startsWith("text/") || type.contains("csv")) ? "workbook.csv" : "workbook.xlsx";
        incomingName = displayName(u, fallback);
    }

    private void deliverIncoming() {
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
        return last != null && last.matches("(?i).+\\.(xlsx|xlsm|xls|csv|tsv|txt)$") ? last : fallback;
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
        if (mimes.contains("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")) { mimes.add("application/vnd.ms-excel"); mimes.add("text/csv"); mimes.add("text/comma-separated-values"); mimes.add("application/octet-stream"); mimes.add("application/zip"); }
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
            case "tsv": return "text/tab-separated-values";
            case "md": return "text/markdown";
            case "docx": return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
            case "xlsx": return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
            case "pptx": return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
            case "html": case "htm": return "text/html";
            default: return MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext);
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
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
        @JavascriptInterface
        public String saveFile(String name, String mime, String base64) {
            try {
                byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
                String safe = name.replaceAll("[\\\\/:*?\"<>|]", "-");
                if (Build.VERSION.SDK_INT >= 29) {
                    ContentValues v = new ContentValues();
                    v.put(MediaStore.MediaColumns.DISPLAY_NAME, safe);
                    v.put(MediaStore.MediaColumns.MIME_TYPE, mime);
                    v.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/SRK Sheets");
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
                    File dir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), "SRK Sheets");
                    if (!dir.exists()) dir.mkdirs();
                    File f = new File(dir, safe);
                    int n = 2;
                    String base = safe.contains(".") ? safe.substring(0, safe.lastIndexOf('.')) : safe;
                    String ext = safe.contains(".") ? safe.substring(safe.lastIndexOf('.')) : "";
                    while (f.exists()) f = new File(dir, base + " (" + (n++) + ")" + ext);
                    try (FileOutputStream os = new FileOutputStream(f)) { os.write(bytes); }
                    MediaScannerConnection.scanFile(MainActivity.this, new String[]{f.getAbsolutePath()}, new String[]{mime}, null);
                }
                runOnUiThread(() -> Toast.makeText(MainActivity.this, "Saved to Downloads/SRK Sheets", Toast.LENGTH_SHORT).show());
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
