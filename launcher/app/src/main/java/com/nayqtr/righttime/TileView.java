package com.nayqtr.righttime;

import android.content.Context;
import android.graphics.Color;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.GradientDrawable;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

/**
 * One focusable tile. Built in code rather than XML so the focus animation and
 * the fallback-for-missing-banner logic live in one place.
 */
public final class TileView extends LinearLayout {

    public static final int W_DP = 190;
    public static final int H_DP = 110;

    private final View card;
    private final TextView caption;
    public final AppEntry entry;

    public TileView(Context c, AppEntry e, boolean favourite) {
        super(c);
        this.entry = e;

        setOrientation(VERTICAL);
        setFocusable(true);
        setFocusableInTouchMode(true);
        setDescendantFocusability(FOCUS_BLOCK_DESCENDANTS);
        int pad = dp(6);
        setPadding(pad, pad, pad, pad);

        FrameLayout holder = new FrameLayout(c);
        holder.setLayoutParams(new LayoutParams(dp(W_DP), dp(H_DP)));

        GradientDrawable bg = new GradientDrawable();
        bg.setCornerRadius(dp(8));
        bg.setColor(e.kind == AppEntry.Kind.INPUT ? 0xFF1B2A38 : 0xFF232323);
        holder.setBackground(bg);

        Drawable icon = e.icon;
        if (icon != null) {
            ImageView iv = new ImageView(c);
            iv.setImageDrawable(icon);
            iv.setScaleType(ImageView.ScaleType.CENTER_CROP);
            iv.setLayoutParams(new FrameLayout.LayoutParams(
                    FrameLayout.LayoutParams.MATCH_PARENT,
                    FrameLayout.LayoutParams.MATCH_PARENT));
            iv.setClipToOutline(true);
            holder.addView(iv);
        } else {
            // No banner: show the first letter, or a source glyph for inputs.
            TextView t = new TextView(c);
            t.setText(e.kind == AppEntry.Kind.INPUT ? "▶" : initial(e.label));
            t.setTextColor(0xFFDDDDDD);
            t.setTextSize(TypedValue.COMPLEX_UNIT_SP, 34);
            t.setGravity(Gravity.CENTER);
            t.setLayoutParams(new FrameLayout.LayoutParams(
                    FrameLayout.LayoutParams.MATCH_PARENT,
                    FrameLayout.LayoutParams.MATCH_PARENT));
            holder.addView(t);
        }
        card = holder;
        addView(holder);

        caption = new TextView(c);
        caption.setText(favourite ? "★ " + e.label : e.label);
        caption.setTextColor(0xB3FFFFFF);
        caption.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        caption.setMaxLines(1);
        caption.setEllipsize(android.text.TextUtils.TruncateAt.END);
        caption.setPadding(dp(2), dp(6), dp(2), 0);
        caption.setWidth(dp(W_DP));
        addView(caption);

        setOnFocusChangeListener(new OnFocusChangeListener() {
            @Override public void onFocusChange(View v, boolean has) { render(has); }
        });
        render(false);
    }

    private void render(boolean focused) {
        float s = focused ? 1.10f : 1.0f;
        card.animate().scaleX(s).scaleY(s).setDuration(130).start();
        card.setElevation(focused ? dp(10) : 0);
        caption.setTextColor(focused ? Color.WHITE : 0xB3FFFFFF);
        GradientDrawable bg = (GradientDrawable) card.getBackground();
        bg.setStroke(focused ? dp(3) : 0, focused ? Color.WHITE : Color.TRANSPARENT);
    }

    private static String initial(String s) {
        return (s == null || s.isEmpty()) ? "?" : s.substring(0, 1).toUpperCase();
    }

    private int dp(int v) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP,
                v, getResources().getDisplayMetrics()));
    }
}
