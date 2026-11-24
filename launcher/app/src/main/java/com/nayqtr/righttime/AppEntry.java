package com.nayqtr.righttime;

import android.content.Intent;
import android.graphics.drawable.Drawable;

/** One launchable thing on the home screen: an app, or a TV input. */
public final class AppEntry {
    public enum Kind { APP, INPUT }

    public final String id;        // package name, or TV input id
    public final String label;
    public final Drawable icon;    // may be null for inputs
    public final Intent launch;
    public final Kind kind;

    public AppEntry(String id, String label, Drawable icon, Intent launch, Kind kind) {
        this.id = id;
        this.label = label;
        this.icon = icon;
        this.launch = launch;
        this.kind = kind;
    }
}
