package com.example.rawtiledimageview;

import android.net.Uri;
import com.davemorrissey.labs.subscaleview.ImageSource;
import com.facebook.react.uimanager.SimpleViewManager;
import com.facebook.react.uimanager.ThemedReactContext;
import com.facebook.react.uimanager.annotations.ReactProp;

public class RawTiledImageViewManager extends SimpleViewManager<RawPixelTiledImageView> {
    public static final String REACT_CLASS = "RawTiledImageView";

    @Override
    public String getName() {
        return REACT_CLASS;
    }

    @Override
    protected RawPixelTiledImageView createViewInstance(ThemedReactContext reactContext) {
        RawPixelTiledImageView view = new RawPixelTiledImageView(reactContext);
        view.setMinimumScaleType(RawPixelTiledImageView.SCALE_TYPE_CENTER_INSIDE);
        view.setQuickScaleEnabled(true);
        view.setDoubleTapZoomStyle(RawPixelTiledImageView.ZOOM_FOCUS_CENTER_IMMEDIATE);
        view.setMaxScale(200.0f);
        view.setDoubleTapZoomScale(4.0f);
        return view;
    }

    @ReactProp(name = "uri")
    public void setUri(RawPixelTiledImageView view, String uri) {
        if (uri == null || uri.isEmpty()) return;
        Uri parsed = Uri.parse(uri);
        String scheme = parsed.getScheme();
        if (scheme == null || scheme.isEmpty()) {
            view.setImage(ImageSource.uri(Uri.fromFile(new java.io.File(uri))).tilingDisabled());
            return;
        }
        view.setImage(ImageSource.uri(parsed).tilingDisabled());
    }
}
