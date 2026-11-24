package com.nayqtr.righttime;

import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;

import java.text.Collator;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Finds the apps that can actually be launched on a TV. */
public final class AppRepository {

    private final Context ctx;

    public AppRepository(Context ctx) { this.ctx = ctx.getApplicationContext(); }

    /**
     * All launchable apps, alphabetically.
     *
     * Android TV apps declare LEANBACK_LAUNCHER. Plenty of useful sideloaded
     * apps only declare the plain LAUNCHER category, and the stock TCL
     * launcher hides those entirely -- which is one reason sideloaded apps
     * seem to "disappear" on these TVs. We query both and merge.
     */
    public List<AppEntry> allApps() {
        PackageManager pm = ctx.getPackageManager();
        Map<String, AppEntry> byPkg = new LinkedHashMap<>();

        collect(pm, Intent.CATEGORY_LEANBACK_LAUNCHER, byPkg);
        collect(pm, Intent.CATEGORY_LAUNCHER, byPkg);

        // Never list ourselves.
        byPkg.remove(ctx.getPackageName());

        List<AppEntry> out = new ArrayList<>(byPkg.values());
        final Collator coll = Collator.getInstance();
        coll.setStrength(Collator.PRIMARY);
        Collections.sort(out, new Comparator<AppEntry>() {
            @Override public int compare(AppEntry a, AppEntry b) {
                return coll.compare(a.label, b.label);
            }
        });
        return out;
    }

    private void collect(PackageManager pm, String category, Map<String, AppEntry> into) {
        Intent probe = new Intent(Intent.ACTION_MAIN).addCategory(category);
        List<ResolveInfo> found;
        try {
            found = pm.queryIntentActivities(probe, 0);
        } catch (Exception e) {
            return;
        }
        for (ResolveInfo ri : found) {
            if (ri.activityInfo == null) continue;
            String pkg = ri.activityInfo.packageName;
            if (into.containsKey(pkg)) continue;   // LEANBACK entry wins

            Intent launch = pm.getLaunchIntentForPackage(pkg);
            if (launch == null) {
                launch = new Intent(Intent.ACTION_MAIN)
                        .addCategory(category)
                        .setClassName(pkg, ri.activityInfo.name);
            }
            launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK
                    | Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED);

            CharSequence lbl = ri.loadLabel(pm);
            String label = lbl == null ? pkg : lbl.toString();

            android.graphics.drawable.Drawable icon = null;
            try {
                icon = ri.activityInfo.loadBanner(pm);     // TV banner, 320x180
                if (icon == null) icon = ri.loadIcon(pm);
            } catch (Exception ignored) { }

            into.put(pkg, new AppEntry(pkg, label, icon, launch, AppEntry.Kind.APP));
        }
    }
}
