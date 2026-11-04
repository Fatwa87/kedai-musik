package com.kedaimusik.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

/**
 * Kedai Musik - Android WebView wrapper.
 *
 * The whole app is the PWA served by the backend (Vercel/Render/local). This
 * Activity gives it a native, installable, fullscreen home so it behaves like
 * a stand-alone app. The backend URL is read from res/values/strings.xml
 * (string `app_url`) so it can be changed in exactly one place.
 */
public class MainActivity extends Activity {

    private static final String[] INTERNAL_HOST_SUFFIXES = {
            ".vercel.app", ".onrender.com", ".hf.space", ".trycloudflare.com"
    };

    private WebView webView;
    private FrameLayout rootLayout;
    private View customView;
    private WebChromeClient.CustomViewCallback customViewCallback;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        rootLayout = new FrameLayout(this);
        webView = new WebView(this);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setSupportZoom(false);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                Uri uri = Uri.parse(url);
                String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase();
                if (isInternalHost(host)) {
                    return false; // keep navigating inside the WebView
                }
                // Anything else (downloads to the Google CDN, external links)
                // should open in the system browser / handler instead of
                // hijacking the app.
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri));
                } catch (Exception ignored) {
                }
                return true;
            }
        });

        webView.setDownloadListener((url, userAgent, contentDisposition, mimetype, contentLength) -> {
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
            } catch (Exception ignored) {
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onShowCustomView(View view, CustomViewCallback callback) {
                if (customView != null) {
                    callback.onCustomViewHidden();
                    return;
                }
                customView = view;
                customViewCallback = callback;
                rootLayout.addView(view, new FrameLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT));
                rootLayout.setVisibility(View.VISIBLE);
            }

            @Override
            public void onHideCustomView() {
                if (customView == null) return;
                rootLayout.removeView(customView);
                customView = null;
                if (customViewCallback != null) {
                    customViewCallback.onCustomViewHidden();
                    customViewCallback = null;
                }
            }
        });

        rootLayout.addView(webView, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(rootLayout);

        webView.loadUrl(getString(R.string.app_url));
    }

    private boolean isInternalHost(String host) {
        if (host.isEmpty()) return true;
        String appHost = Uri.parse(getString(R.string.app_url)).getHost();
        if (appHost != null && appHost.toLowerCase().equals(host)) return true;
        if (host.equals("localhost") || host.equals("127.0.0.1") || host.equals("10.0.2.2")) return true;
        for (String suffix : INTERNAL_HOST_SUFFIXES) {
            if (host.endsWith(suffix)) return true;
        }
        return false;
    }

    @Override
    public void onBackPressed() {
        if (customView != null) {
            webView.getWebChromeClient().onHideCustomView();
            return;
        }
        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.stopLoading();
            webView.loadUrl("about:blank");
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}