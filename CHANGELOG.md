# Changelog

All notable changes to this fork (`posi211/UniFi-SFP-Wizard`) are documented here.

This version number tracks the **web app**, not the physical Wizard device's own firmware
version — they're separate and only coincidentally similar-looking right now.

## [1.2.0] - 2026-07-29

### Added

- **Local Backup Library ("My Backups")** — a third EEPROM source alongside Local File and
  Repository, backed by IndexedDB. Every module Save now also stores a searchable local copy
  (by serial number, part number, or vendor), in addition to the usual file download. Works
  identically on desktop and mobile browsers.
- **Mandatory backup-before-write safeguard** — clicking Write now forces a fresh read of the
  currently-connected module and blocks the write entirely if no local backup exists for that
  module's serial number, with a clear on-screen message telling the user to Save first.
- **Local File / Repository / My Backups source toggle** — only one EEPROM source is active at
  a time now, instead of two overlapping controls.
- **New EEPROM profile**: IBM/Blade Network `BN-CKM-SP-SR` (10GBase-SR, 850nm, 300m), sourced
  from the `krusic22/SFP-Transceiver-Flashing` community dump collection, converted from a
  256-byte page-A0-only dump to the 512-byte `.uieeprom` format (A2 diagnostic page
  zero-padded — vendor ID data is intact, live DDM readings on a written module may not be
  accurate).

### Fixed

- **EEPROM Repository dropdown appearing empty** — previously called the GitHub REST API
  (`api.github.com/.../contents/repository`), which is rate-limited to 60 unauthenticated
  requests/hour per IP and failed completely silently with no error surfaced. Now reads
  `dumps.json` directly from `raw.githubusercontent.com`, which isn't subject to that limit,
  and shows a visible error if the fetch ever does fail.
- **Repository selection not actually loading any data** — selecting an entry in the EEPROM
  Repository dropdown previously did nothing; `checkEEPROMSelection()` and the write path only
  ever checked the local file input. Repository selections now correctly fetch and load the
  chosen `.uieeprom` file's bytes.
- **Washed-out, low-contrast text** on `<select>`/`<input>` elements in the non-classic
  ("Liquid Glass") theme — `style.css` had duplicate legacy rules referencing undefined CSS
  variables (`--primary-text`, `--secondary-color`, etc.) with `!important`, silently
  overriding the correct theme colors. Classic mode (`?classic`) was unaffected, since it never
  loads `style.css`.
- Stale placeholder option ("Todo") no longer lingers in the Repository dropdown once real
  entries load.

### Documentation

- Added a "Module Backups (Required Before Writing)" section explaining why backups are
  mandatory, how the Read → Save → Write flow works, and the Backup Library's one real
  limitation (it's per-browser/per-device, so a backup saved on your phone won't satisfy the
  write gate on your laptop and vice versa).
- Added a section explaining `vitaminmoo/sfpw-tool`'s firmware password database, what it
  actually covers (Ubiquiti-branded modules only), and why it isn't used for compatibility
  warnings in this project (the typical use case here is flashing generic, usually-unlocked
  donor modules with OEM identities — the opposite direction from what that database protects
  against).

## [1.1.0] and earlier

Inherited from [Gamer08YT/UniFi-SFP-Wizard](https://github.com/Gamer08YT/UniFi-SFP-Wizard), plus
this fork's earlier changes: dropdown labels reading from `dumps.json`'s `name` field, three
additional EEPROM profiles (two Cisco modules, one FS.com module), and `Repository.ts`'s
`baseUrl` pointed at this fork so the live GitHub Pages demo pulls from here instead of upstream.
