package com.nayqtr.righttime;

import android.content.Context;
import android.content.Intent;
import android.media.tv.TvContract;
import android.media.tv.TvInputInfo;
import android.media.tv.TvInputManager;
import android.os.Build;

import java.util.ArrayList;
import java.util.List;

/**
 * HDMI / physical input switching.
 *
 * Passthrough inputs (HDMI 1..n, AV, tuner) are exposed through the TV Input
 * Framework. Switching is an ACTION_VIEW on the input's passthrough channel
 * URI.
 *
 * OEMs vary in how much of this they expose to a non-system app, and TCL is
 * not documented here. Everything is defensive: if the platform refuses, the
 * input row is simply empty and the rest of the launcher is unaffected.
 */
public final class TvInputs {

    private final Context ctx;

    public TvInputs(Context ctx) { this.ctx = ctx.getApplicationContext(); }

    public List<AppEntry> inputs() {
        List<AppEntry> out = new ArrayList<>();
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.LOLLIPOP) return out;

        TvInputManager tim;
        try {
            tim = (TvInputManager) ctx.getSystemService(Context.TV_INPUT_SERVICE);
        } catch (Exception e) {
            return out;
        }
        if (tim == null) return out;

        List<TvInputInfo> list;
        try {
            list = tim.getTvInputList();
        } catch (Exception | NoSuchMethodError e) {
            return out;
        }
        if (list == null) return out;

        for (TvInputInfo info : list) {
            try {
                if (!info.isPassthroughInput()) continue;   // skip app-based inputs

                String id = info.getId();
                CharSequence lbl = info.loadLabel(ctx);
                String label = (lbl == null || lbl.length() == 0) ? shortName(id) : lbl.toString();

                Intent view = new Intent(Intent.ACTION_VIEW,
                        TvContract.buildChannelUriForPassthroughInput(id));
                view.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

                out.add(new AppEntry(id, label, null, view, AppEntry.Kind.INPUT));
            } catch (Exception ignored) {
                // A single bad input must not take out the whole row.
            }
        }
        return out;
    }

    /** "com.tcl.tv/.HdmiInputService/HW2" -> "HW2". Last resort label only. */
    private static String shortName(String id) {
        int i = id.lastIndexOf('/');
        return i >= 0 && i < id.length() - 1 ? id.substring(i + 1) : id;
    }
}
