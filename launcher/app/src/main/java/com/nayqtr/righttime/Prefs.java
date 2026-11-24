package com.nayqtr.righttime;

import android.content.Context;
import android.content.SharedPreferences;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;

/** Local settings. SharedPreferences only -- nothing leaves the device. */
public final class Prefs {
    private static final String FILE = "righttime";
    private static final String K_24H = "clock24";
    private static final String K_WALL = "wallpaper";
    private static final String K_FAVS = "favourites";
    private static final String K_SHOW_INPUTS = "show_inputs";

    private final SharedPreferences sp;

    public Prefs(Context c) {
        sp = c.getApplicationContext().getSharedPreferences(FILE, Context.MODE_PRIVATE);
    }

    public boolean is24Hour() { return sp.getBoolean(K_24H, false); }
    public void set24Hour(boolean v) { sp.edit().putBoolean(K_24H, v).apply(); }

    public int wallpaper() { return sp.getInt(K_WALL, 0); }
    public void setWallpaper(int i) { sp.edit().putInt(K_WALL, i).apply(); }

    public boolean showInputs() { return sp.getBoolean(K_SHOW_INPUTS, true); }
    public void setShowInputs(boolean v) { sp.edit().putBoolean(K_SHOW_INPUTS, v).apply(); }

    /** Ordered list of favourite package names. Order is the display order. */
    public List<String> favourites() {
        String raw = sp.getString(K_FAVS, "");
        List<String> out = new ArrayList<>();
        if (raw == null || raw.isEmpty()) return out;
        for (String s : raw.split("\n")) {
            if (!s.trim().isEmpty()) out.add(s.trim());
        }
        return out;
    }

    public void setFavourites(List<String> pkgs) {
        // LinkedHashSet keeps insertion order while dropping duplicates.
        LinkedHashSet<String> uniq = new LinkedHashSet<>(pkgs);
        // String.join is API 26; minSdk here is 21.
        StringBuilder sb = new StringBuilder();
        for (String s : uniq) {
            if (sb.length() > 0) sb.append('\n');
            sb.append(s);
        }
        sp.edit().putString(K_FAVS, sb.toString()).apply();
    }

    public boolean isFavourite(String pkg) { return favourites().contains(pkg); }

    public void toggleFavourite(String pkg) {
        List<String> f = favourites();
        if (!f.remove(pkg)) f.add(pkg);
        setFavourites(f);
    }

    /** Move a favourite one slot left or right. No-op at the ends. */
    public void moveFavourite(String pkg, int delta) {
        List<String> f = favourites();
        int i = f.indexOf(pkg);
        if (i < 0) return;
        int j = i + delta;
        if (j < 0 || j >= f.size()) return;
        f.remove(i);
        f.add(j, pkg);
        setFavourites(f);
    }
}
