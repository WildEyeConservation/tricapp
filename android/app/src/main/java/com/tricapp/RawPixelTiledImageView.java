package com.example.rawtiledimageview;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.PointF;
import com.davemorrissey.labs.subscaleview.SubsamplingScaleImageView;

/**
 * Adds a lightweight source-pixel grid overlay at high zoom to make pixel blocks obvious.
 */
public class RawPixelTiledImageView extends SubsamplingScaleImageView {
    private final Paint gridPaint = new Paint();

    public RawPixelTiledImageView(Context context) {
        super(context);
        gridPaint.setColor(Color.argb(140, 255, 255, 255));
        gridPaint.setStrokeWidth(1f);
        gridPaint.setAntiAlias(false);
    }

    @Override
    protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);
        if (!isReady()) return;

        final float scale = getScale();
        // Draw pixel grid only when one source pixel is large enough on screen.
        if (scale < 8f) return;

        PointF srcTopLeft = viewToSourceCoord(0f, 0f);
        PointF srcBottomRight = viewToSourceCoord(getWidth(), getHeight());
        if (srcTopLeft == null || srcBottomRight == null) return;

        int sx0 = Math.max(0, (int) Math.floor(Math.min(srcTopLeft.x, srcBottomRight.x)));
        int sx1 = Math.min(getSWidth(), (int) Math.ceil(Math.max(srcTopLeft.x, srcBottomRight.x)));
        int sy0 = Math.max(0, (int) Math.floor(Math.min(srcTopLeft.y, srcBottomRight.y)));
        int sy1 = Math.min(getSHeight(), (int) Math.ceil(Math.max(srcTopLeft.y, srcBottomRight.y)));
        if (sx1 <= sx0 || sy1 <= sy0) return;

        for (int sx = sx0; sx <= sx1; sx++) {
            PointF p0 = sourceToViewCoord((float) sx, (float) sy0);
            PointF p1 = sourceToViewCoord((float) sx, (float) sy1);
            if (p0 != null && p1 != null) {
                canvas.drawLine(p0.x, p0.y, p1.x, p1.y, gridPaint);
            }
        }

        for (int sy = sy0; sy <= sy1; sy++) {
            PointF p0 = sourceToViewCoord((float) sx0, (float) sy);
            PointF p1 = sourceToViewCoord((float) sx1, (float) sy);
            if (p0 != null && p1 != null) {
                canvas.drawLine(p0.x, p0.y, p1.x, p1.y, gridPaint);
            }
        }
    }
}
