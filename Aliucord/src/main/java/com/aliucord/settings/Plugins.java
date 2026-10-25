/*
 * This file is part of Endcord, an Android Discord client mod based on Aliucord.
 * Copyright (c) 2021 Juby210 & Vendicated
 * Licensed under the Open Software License version 3.0
 */

package com.aliucord.settings;

import android.content.*;
import android.graphics.Color;
import android.graphics.drawable.ShapeDrawable;
import android.graphics.drawable.shapes.RectShape;
import android.text.*;
import android.text.style.ClickableSpan;
import android.text.style.ForegroundColorSpan;
import android.view.*;
import android.widget.*;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.core.content.res.ResourcesCompat;
import androidx.fragment.app.Fragment;
import androidx.recyclerview.widget.*;

import com.aliucord.*;
import com.aliucord.entities.CorePlugin;
import com.aliucord.entities.EndcordPlugin;
import com.aliucord.entities.Plugin;
import com.aliucord.fragments.ConfirmDialog;
import com.aliucord.fragments.SettingsPage;
import com.aliucord.i18n.I18n;
import com.aliucord.updater.CoreUpdater;
import com.aliucord.utils.*;
import com.aliucord.views.*;
import com.aliucord.views.Button;
import com.aliucord.widgets.PluginCard;
import com.discord.app.AppBottomSheet;
import com.discord.app.AppFragment;
import com.discord.utilities.color.ColorCompat;
import com.discord.widgets.user.usersheet.WidgetUserSheet;
import com.endcord.plugins.NewPlugins;
import com.endcord.plugins.PluginConflicts;
import com.lytefast.flexinput.R;

import java.io.File;
import java.util.*;

import kotlin.comparisons.ComparisonsKt;

public class Plugins extends SettingsPage {
    /** Which plugins the list shows, mirroring Endcord PC's filters. */
    public enum Mode {
        ALL("Show All"),
        ENABLED("Show Enabled"),
        DISABLED("Show Disabled"),
        NEW("Show New"),
        BUILT_IN("Show Built-in"),
        INSTALLED("Show Installed");

        public final String label;

        Mode(String label) {
            this.label = label;
        }
    }

    public static class Adapter extends RecyclerView.Adapter<Adapter.ViewHolder> implements Filterable {
        @SuppressWarnings({ "deprecation", "RedundantSuppression" })
        public static final class ViewHolder extends RecyclerView.ViewHolder {
            private final Adapter adapter;
            public final PluginCard card;

            public ViewHolder(Adapter adapter, PluginCard card) {
                super(card);
                this.adapter = adapter;
                this.card = card;

                card.repoButton.setOnClickListener(this::onGithubClick);
                card.changeLogButton.setOnClickListener(this::onChangeLogClick);
                card.uninstallButton.setOnClickListener(this::onUninstallClick);
                card.switchHeader.setOnCheckedListener(this::onToggleClick);
                card.settingsButton.setOnClickListener(this::onSettingsClick);
            }

            public void onGithubClick(View view) {
                int position = getAdapterPosition();
                if (position != RecyclerView.NO_POSITION) adapter.onGithubClick(position);
            }

            public void onChangeLogClick(View view) {
                int position = getAdapterPosition();
                if (position != RecyclerView.NO_POSITION) adapter.onChangeLogClick(position);
            }

            public void onSettingsClick(View view) {
                int position = getAdapterPosition();
                if (position == RecyclerView.NO_POSITION) return;
                try {
                    adapter.onSettingsClick(position);
                } catch (Throwable th) {
                    PluginManager.logger.errorToast(I18n.t("Failed to launch plugin settings"), th);
                }
            }

            public void onToggleClick(boolean checked) {
                int position = getAdapterPosition();
                if (position != RecyclerView.NO_POSITION) adapter.onToggleClick(this, checked, position);
            }

            public void onUninstallClick(View view) {
                int position = getAdapterPosition();
                if (position != RecyclerView.NO_POSITION) adapter.onUninstallClick(position);
            }
        }

        private final AppFragment fragment;
        private final Context ctx;
        private final List<Plugin> originalData;
        private List<Plugin> data;
        public Mode mode = Mode.ALL;
        private CharSequence query = "";
        /** Called whenever the enabled state of a plugin changes, so the counters can update. */
        @Nullable
        public Runnable onPluginsChanged;

        public Adapter(AppFragment fragment, Collection<Plugin> plugins) {
            super();

            this.fragment = fragment;
            ctx = fragment.requireContext();

            this.originalData = new ArrayList<>(plugins);
            originalData.removeIf(p -> p instanceof CorePlugin && ((CorePlugin) p).isHidden());
            originalData.sort(ComparisonsKt.compareBy(
                p -> p instanceof CorePlugin && !(p instanceof EndcordPlugin), // fixed coreplugins last
                p -> p.getName().toLowerCase(Locale.ROOT) // Natural order by title
            ));

            data = new ArrayList<>(originalData);
        }

        @Override
        public int getItemCount() {
            return data.size();
        }

        @NonNull
        @Override
        public ViewHolder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
            return new ViewHolder(this, new PluginCard(ctx));
        }

        @Override
        public void onBindViewHolder(@NonNull ViewHolder holder, int position) {
            Plugin p = data.get(position);
            Plugin.Manifest manifest = p.getManifest();
            boolean isCorePlugin = p instanceof CorePlugin;
            boolean isBuiltIn = p instanceof EndcordPlugin;
            boolean isEnabled = PluginManager.isPluginEnabled(p.getName());
            boolean isToggleable = !isCorePlugin || !((CorePlugin) p).isRequired();
            String description = isBuiltIn ? ((EndcordPlugin) p).getLocalizedDescription() : manifest.description;

            holder.card.switchHeader.setChecked(isEnabled);
            holder.card.switchHeader.setButtonVisibility(isToggleable);
            holder.card.switchHeader.l.b().setClickable(isToggleable);
            holder.card.descriptionView.setText(MDUtils.render(description));
            setVisible(holder.card.descriptionView, isNotBlank(description));

            setVisible(holder.card.settingsButton, p.settingsTab != null);
            holder.card.settingsButton.setEnabled(isEnabled);
            setVisible(holder.card.uninstallButton, isNotBlank(p.__filename));
            setVisible(holder.card.repoButton, isNotBlank(manifest.updateUrl));
            setVisible(holder.card.changeLogButton, isNotBlank(manifest.changelog));
            setVisible(holder.card.buttonLayout,
                p.settingsTab != null ||
                    isNotBlank(p.__filename) ||
                    isNotBlank(manifest.updateUrl) ||
                    isNotBlank(manifest.changelog)
            );

            SpannableStringBuilder title = new SpannableStringBuilder(p.getName());
            int accent = ColorCompat.getThemedColor(ctx, R.b.colorTextMuted);
            if (isBuiltIn && NewPlugins.isNew(p.getName())) {
                appendTag(title, I18n.t("New"), ColorCompat.getThemedColor(ctx, R.b.color_brand));
            } else if (isCorePlugin) {
                appendTag(title, I18n.t("Built-in"), accent);
            }
            if (!"0.0.0".equals(manifest.version)) title.append(" v").append(manifest.version);

            for (int i = 0; i < manifest.authors.length; i++) {
                Plugin.Manifest.Author author = Objects.requireNonNull(manifest.authors[i]);
                title.append(i == 0 ? " " + I18n.t("by") + " " : ", ");
                int start = title.length();
                title.append(author.name);
                if (author.id < 1 || !author.hyperlink) continue;
                title.setSpan(new ClickableSpan() {
                    @Override
                    public void onClick(@NonNull View widget) {
                        WidgetUserSheet.Companion.show(author.id, fragment.getParentFragmentManager());
                    }
                }, start, title.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
            }

            holder.card.titleView.setText(title);
        }

        private static void appendTag(SpannableStringBuilder title, String tag, int color) {
            title.append("  ");
            int start = title.length();
            title.append(tag.toUpperCase(Locale.getDefault()));
            title.setSpan(new ForegroundColorSpan(color), start, title.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
            title.setSpan(new android.text.style.RelativeSizeSpan(0.75f), start, title.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        }

        private boolean matchesMode(Plugin p) {
            switch (mode) {
                case ENABLED:
                    return PluginManager.isPluginEnabled(p.getName());
                case DISABLED:
                    return !PluginManager.isPluginEnabled(p.getName());
                case NEW:
                    return NewPlugins.isNew(p.getName());
                case BUILT_IN:
                    return p instanceof CorePlugin;
                case INSTALLED:
                    return !(p instanceof CorePlugin);
                default:
                    return true;
            }
        }

        private boolean matchesQuery(Plugin p, String search) {
            if (search.isEmpty()) return true;
            if (p.getName().toLowerCase().contains(search)) return true;
            Plugin.Manifest manifest = p.getManifest();
            if (manifest.description.toLowerCase().contains(search)) return true;
            if (p instanceof EndcordPlugin) {
                var builtIn = (EndcordPlugin) p;
                if (builtIn.getLocalizedDescription().toLowerCase().contains(search)) return true;
                for (String tag : builtIn.getTags()) if (tag.contains(search)) return true;
            }
            for (Plugin.Manifest.Author author : manifest.authors)
                if (Objects.requireNonNull(author).name.toLowerCase().contains(search)) return true;
            return false;
        }

        /** Re-applies the current mode and search query. */
        public void refilter() {
            filter.filter(query);
        }

        private final android.widget.Filter filter = new android.widget.Filter() {
            @Override
            protected FilterResults performFiltering(CharSequence constraint) {
                String search = constraint == null ? "" : constraint.toString().toLowerCase().trim();
                List<Plugin> resultsList = CollectionUtils.filter(originalData, p -> matchesMode(p) && matchesQuery(p, search));
                FilterResults results = new FilterResults();
                results.values = resultsList;
                return results;
            }

            @Override
            protected void publishResults(CharSequence constraint, FilterResults results) {
                @SuppressWarnings("unchecked")
                List<Plugin> res = (List<Plugin>) results.values;
                var old = data;
                var diff = DiffUtil.calculateDiff(new DiffUtil.Callback() {
                    @Override
                    public int getOldListSize() {
                        return old.size();
                    }

                    @Override
                    public int getNewListSize() {
                        return res.size();
                    }

                    @Override
                    public boolean areItemsTheSame(int oldItemPosition, int newItemPosition) {
                        return old.get(oldItemPosition).getName().equals(res.get(newItemPosition).getName());
                    }

                    @Override
                    public boolean areContentsTheSame(int oldItemPosition, int newItemPosition) {
                        return true;
                    }
                }, false);
                data = res;
                diff.dispatchUpdatesTo(Adapter.this);
            }
        };

        @Override
        public android.widget.Filter getFilter() {
            return filter;
        }

        /** Updates the search query and filters the list with it. */
        public void search(CharSequence query) {
            this.query = query == null ? "" : query;
            filter.filter(this.query);
        }

        @Nullable
        private String getGithubUrl(Plugin plugin) {
            String url = plugin.getManifest().updateUrl;
            if (!isNotBlank(url)) return null;

            return url.replaceFirst(
                "https://(raw\\.githubusercontent\\.com|cdn\\.jsdelivr\\.net/gh)/([^/]+)/([^/@]+).*",
                "https://github.com/$2/$3"
            );
        }

        public void onGithubClick(int position) {
            String url = getGithubUrl(data.get(position));
            if (!isNotBlank(url)) return;

            Utils.launchUrl(url);
        }

        public void onChangeLogClick(int position) {
            Plugin p = data.get(position);
            Plugin.Manifest manifest = p.getManifest();
            if (!isNotBlank(manifest.changelog)) return;

            String url = getGithubUrl(p);
            ChangelogUtils.FooterAction[] footer = isNotBlank(url)
                ? new ChangelogUtils.FooterAction[] { new ChangelogUtils.FooterAction(R.e.ic_account_github_white_24dp, url) }
                : new ChangelogUtils.FooterAction[0];

            ChangelogUtils.show(ctx, p.getName() + " v" + manifest.version, manifest.changelogMedia, manifest.changelog, footer);
        }

        public void onSettingsClick(int position) throws Throwable {
            Plugin p = data.get(position);
            if (p.settingsTab == null) return;

            if (p.settingsTab.type == Plugin.SettingsTab.Type.PAGE && p.settingsTab.page != null) {
                Fragment page = ReflectUtils.invokeConstructorWithArgs(p.settingsTab.page, p.settingsTab.args);
                Utils.openPageWithProxy(ctx, page);
            } else if (p.settingsTab.type == Plugin.SettingsTab.Type.BOTTOM_SHEET && p.settingsTab.bottomSheet != null) {
                AppBottomSheet sheet = ReflectUtils.invokeConstructorWithArgs(p.settingsTab.bottomSheet, p.settingsTab.args);
                sheet.show(fragment.getParentFragmentManager(), p.getName() + "Settings");
            }
        }

        public void onToggleClick(ViewHolder holder, boolean state, int position) {
            Plugin p = data.get(position);
            String name = p.getName();
            if (state == PluginManager.isPluginEnabled(name)) return;

            PluginManager.togglePlugin(name);
            holder.card.settingsButton.setEnabled(state);
            if (onPluginsChanged != null) onPluginsChanged.run();

            if (state) {
                var conflicts = PluginConflicts.enabledConflictsOf(name);
                if (!conflicts.isEmpty()) {
                    offerToDisableConflicts(name, conflicts, p.requiresRestart());
                    return;
                }
            }
            if (p.requiresRestart()) Utils.promptRestart();
        }

        private void offerToDisableConflicts(String name, List<String> conflicts, boolean requiresRestart) {
            String others = String.join(", ", conflicts);
            var dialog = new ConfirmDialog()
                .setTitle(I18n.t("Plugin conflict"))
                .setDescription(I18n.format(
                    "{plugin} conflicts with {others}. With both turned on, one of them stops working. Turn off {others}?",
                    "plugin", name, "others", others
                ));
            dialog.setOnOkListener(v -> {
                boolean restart = requiresRestart;
                for (String other : conflicts) {
                    PluginManager.disablePlugin(other);
                    var otherPlugin = PluginManager.plugins.get(other);
                    if (otherPlugin != null && otherPlugin.requiresRestart()) restart = true;
                }
                dialog.dismiss();
                notifyDataSetChanged();
                if (onPluginsChanged != null) onPluginsChanged.run();
                if (restart) Utils.promptRestart();
            });
            dialog.setOnCancelListener(v -> {
                dialog.dismiss();
                if (requiresRestart) Utils.promptRestart();
            });
            dialog.show(fragment.getParentFragmentManager(), "Plugin conflict");
        }

        public void onUninstallClick(int position) {
            Plugin p = data.get(position);
            ConfirmDialog dialog = new ConfirmDialog()
                .setIsDangerous(true)
                .setTitle(I18n.format("Delete {plugin}", "plugin", p.getName()))
                .setDescription(I18n.t("Are you sure you want to delete this plugin? This action cannot be undone."));
            dialog.setOnOkListener(e -> {
                File pluginFile = new File(Constants.PLUGINS_PATH, p.__filename + ".zip");
                if (pluginFile.exists() && !pluginFile.delete()) {
                    PluginManager.logger.errorToast(I18n.format("Failed to delete plugin {plugin}", "plugin", p.getName()), null);
                    return;
                }

                PluginManager.stopPlugin(p.getName());
                PluginManager.plugins.remove(p.getName());
                PluginManager.logger.infoToast(I18n.format("Successfully deleted {plugin}", "plugin", p.getName()));

                dialog.dismiss();
                originalData.remove(p);
                int index = data.indexOf(p);
                if (index >= 0) {
                    data = new ArrayList<>(data);
                    data.remove(index);
                    notifyItemRemoved(index);
                }
                if (onPluginsChanged != null) onPluginsChanged.run();

                if (p.requiresRestart()) Utils.promptRestart();
            });

            dialog.show(fragment.getParentFragmentManager(), "Confirm Plugin Uninstall");
        }

        private static void setVisible(View v, boolean visible) {
            v.setVisibility(visible ? View.VISIBLE : View.GONE);
        }

        private static boolean isNotBlank(String s) {
            return s != null && !s.isBlank();
        }
    }

    private TextView countsView;

    @Override
    public void onViewBound(View view) {
        super.onViewBound(view);
        setActionBarTitle(I18n.t("Plugins"));
        setActionBarSubtitle("Endcord");
        removeScrollView();

        var context = view.getContext();
        int padding = DimenUtils.getDefaultPadding();

        addHeaderButton(I18n.t("Open Plugins Folder"), R.e.ic_open_in_new_white_24dp, item -> {
            File dir = new File(Constants.PLUGINS_PATH);
            if (!dir.exists() && !dir.mkdir()) {
                Utils.showToast(I18n.t("Failed to create plugins directory!"), true);
                return true;
            }
            Utils.launchFileExplorer(dir);
            return true;
        });

        if (PluginManager.isSafeModeEnabled()) {
            TextView safeModeNotice = new TextView(context, null, 0, R.i.UiKit_Settings_Item_Header);
            safeModeNotice.setAllCaps(false);
            safeModeNotice.setText(I18n.t("This page won't work while safe mode is on.") + "\n" + I18n.t("Turn off safe mode in the Endcord settings to manage plugins."));
            safeModeNotice.setTypeface(ResourcesCompat.getFont(context, Constants.Fonts.whitney_semibold));
            safeModeNotice.setGravity(Gravity.CENTER);

            Button openSettingsButton = new Button(context);
            openSettingsButton.setText(I18n.t("Endcord Settings"));
            openSettingsButton.setOnClickListener(v -> Utils.openPage(v.getContext(), AliucordPage.class));

            addView(safeModeNotice);
            addView(openSettingsButton);
            return;
        }
        if (!PluginManager.failedToLoad.isEmpty()) {
            var failedPluginsView = new Button(context);
            failedPluginsView.setText(I18n.t("Plugin Errors"));
            failedPluginsView.setOnClickListener(v -> Utils.openPage(context, FailedPluginsPage.class));
            addView(failedPluginsView);
            addView(new Divider(context));
        }

        countsView = new TextView(context, null, 0, R.i.UiKit_Settings_Item_Addition);
        countsView.setPadding(padding, padding / 2, padding, 0);
        updateCounts();

        TextInput input = new TextInput(context);
        input.setHint(I18n.t("Search for a plugin..."));

        RecyclerView recyclerView = new RecyclerView(context);
        recyclerView.setLayoutManager(new LinearLayoutManager(context, RecyclerView.VERTICAL, false));
        recyclerView.setHasFixedSize(true);
        Adapter adapter = new Adapter(this, PluginManager.plugins.values());
        adapter.onPluginsChanged = this::updateCounts;
        recyclerView.setAdapter(adapter);
        ShapeDrawable shape = new ShapeDrawable(new RectShape());
        shape.setTint(Color.TRANSPARENT);
        shape.setIntrinsicHeight(padding);
        DividerItemDecoration decoration = new DividerItemDecoration(context, DividerItemDecoration.VERTICAL);
        decoration.setDrawable(shape);
        recyclerView.addItemDecoration(decoration);
        recyclerView.setPadding(0, padding, 0, padding * 3);
        recyclerView.setClipToPadding(false);
        addView(input);
        addView(countsView);
        addView(recyclerView);
        EditText editText = input.getEditText();
        editText.setMaxLines(1);
        editText.addTextChangedListener(new TextWatcher() {
            public void afterTextChanged(Editable s) {
                adapter.search(s);
            }

            public void beforeTextChanged(CharSequence s, int start, int count, int after) {}

            public void onTextChanged(CharSequence s, int start, int before, int count) {}
        });

        var menu = getHeaderBar().getMenu();
        var group = 1;
        for (Mode f : Mode.values()) {
            if (f == Mode.NEW && NewPlugins.getCount() == 0) continue;
            var item = menu.add(group, f.ordinal() + 1, f.ordinal(), I18n.t(f.label))
                .setShowAsActionFlags(MenuItem.SHOW_AS_ACTION_NEVER)
                .setCheckable(true)
                .setChecked(f == adapter.mode);
            item.setOnMenuItemClickListener(clicked -> {
                adapter.mode = f;
                adapter.refilter();
                for (int i = 0; i < menu.size(); i++) {
                    var other = menu.getItem(i);
                    if (other.getGroupId() == group) other.setChecked(other == clicked);
                }
                return true;
            });
        }
        menu.setGroupCheckable(group, true, true);
    }

    private void updateCounts() {
        if (countsView == null) return;
        var counts = PluginManager.getPluginCounts();
        countsView.setText(I18n.t("Total Plugins:") + " " + counts.getTotal() + "   " + I18n.t("Enabled Plugins:") + " " + counts.getEnabled());
    }

    /** Opens Endcord Installer, which can repair this installation. */
    public void onOpenInstallerClick(View view) {
        Intent intent = new Intent(CoreUpdater.INSTALLER_PACKAGE + ".OPEN_PLUGINS");
        intent.setClassName(CoreUpdater.INSTALLER_PACKAGE, CoreUpdater.INSTALLER_PACKAGE + ".MainActivity");
        intent.putExtra("aliucord.packageName", requireContext().getPackageName());
        try {
            startActivity(intent);
        } catch (ActivityNotFoundException e) {
            new ConfirmDialog()
                .setTitle(I18n.t("Not Found"))
                .setDescription(I18n.t("Endcord Installer is not installed on this device.") + "\n\n" + I18n.t("Tap OK to download it."))
                .setOnOkListener(widget -> Utils.launchUrl(Constants.ENDCORD_INSTALLER_RELEASES))
                .show(getParentFragmentManager(), "No Installer");
        }
    }
}
