# Upstream

Endcord for Android (new) is built from the Revenge project. Each part lives in its own directory and was
imported from the upstream repository at the commit listed below. To bring in upstream fixes, fetch the
upstream repository and merge or cherry-pick into the matching directory (the directories keep upstream's
layout, so `git diff` against these commits shows exactly what Endcord changed).

| Directory | Upstream | Imported commit | License |
| --- | --- | --- | --- |
| `bundle/` | https://github.com/revenge-mod/revenge-bundle | `577c7f2` (1.11.7, 2026-10-23) | BSD-3-Clause |
| `loader/` | https://github.com/revenge-mod/revenge-xposed | `38a1e69` (1.9.4 / 1904, 2026-10-24) | GPL-3.0 |
| `installer/` | https://github.com/revenge-mod/revenge-manager | `af6377d` (1.3.2, 2026-10-24) | OSL-3.0 |

Discord itself is downloaded by the installer from the Vendetta tracker mirrors that Revenge Manager uses.
