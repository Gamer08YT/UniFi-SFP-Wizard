# UniFi-SFP-Wizard (posi211 fork)

> This is a fork of [Gamer08YT/UniFi-SFP-Wizard](https://github.com/Gamer08YT/UniFi-SFP-Wizard) with the following changes:

## Changes in this fork

- **Fixed dropdown labels**: `Repository.ts` now reads the `name` field from `dumps.json` to label
  entries in the "EEPROM Repository" dropdown, instead of showing the raw `.uieeprom` filename.
  The actual filename is still used under the hood to load the correct file.
- **Added EEPROM profiles** for two Cisco modules and one FS.com module (see `repository/dumps.json`
  for details — `CISCO-ACCELINK-RTXM228-551-C98`, `CISCO-FTLF1318P3BTL-C1`, and `FS-SFP1G-LX-31`).
- **`baseUrl` in `Repository.ts`** points at this fork (`posi211/UniFi-SFP-Wizard`) so the live demo
  below pulls dumps/config from here instead of upstream.
- Live demo is deployed via GitHub Actions to GitHub Pages: use the `?classic` URL parameter for the
  clean dark theme (the default "Liquid Glass" theme has a mobile layout bug — text overlap — that's
  present upstream too).
- **Added a Local File / Repository / My Backups toggle** above the EEPROM source controls, so only
  one input is active at a time instead of two overlapping controls.
- **Fixed the EEPROM Repository dropdown being empty**: it previously called the GitHub REST API
  (`api.github.com/.../contents/repository`), which is rate-limited to 60 unauthenticated
  requests/hour per IP and failed silently with no error shown. It now reads `dumps.json` directly
  from `raw.githubusercontent.com`, which isn't subject to that limit, and surfaces a visible error
  if the fetch ever does fail.
- **Fixed washed-out text on `<select>`/`<input>` elements** in the non-classic ("Liquid Glass")
  theme — `style.css` had duplicate legacy rules referencing undefined CSS variables
  (`--primary-text`, `--secondary-color`, etc.) with `!important`, silently overriding the correct
  theme colors. Classic mode was unaffected (it never loads `style.css`).
- **Added a local backup library ("My Backups")** and made Save-before-Write mandatory — see
  [Module Backups (Required Before Writing)](#module-backups-required-before-writing) below.

---
# UniFi-SFP-Wizard

This Repository provides a WebGUI for the UniFi SFP-Wizard.

You can read, save or write the configuration of an SFP EEPROM.

Feel free to contribute to this project.

![Dashboard](/assets/img/dashboard.png)

#### Microsoft Store

https://apps.microsoft.com/detail/9nb23j84168c?hl=de-DE&gl=DE

### MacOS, Windows, Debian

Have a look at the Release Page: 
https://github.com/Gamer08YT/UniFi-SFP-Wizard/releases/

## Live Demo

#### Glass Design

https://posi211.github.io/UniFi-SFP-Wizard/

#### Classic BS5

https://posi211.github.io/UniFi-SFP-Wizard/?classic

#### Forum Demo

https://ubiquiti-networks-forum.de/sfp-wizard/

## Features

- Device Functions
    - Reboot
    - Shutdown
    - Rename
    - Battery Control
    - Device Info
    - Download Syslog
- SFP Functions
    - Read EEPROM
    - Write EEPROM [X] — **requires an existing local backup of the module, see below**
        - Via File Upload
        - Via Repo
        - Via local Backup Library
    - Save EEPROM (downloads a `.uieeprom` file **and** stores a copy in the local Backup Library)

Currently, I implemented only the Dump Functions, DDM would be nice too, but you manually have to activate it on the
Wizard, so I think it's not interesting at the moment.

## Module Backups (Required Before Writing)

**This fork will not let you Write a new EEPROM to a module until a local backup of that module's
current identity already exists.**

### Why

Writing overwrites the module's vendor name, serial number, and part number with whatever is in the
EEPROM you're flashing. If you don't already have a copy of what was on the module *beforehand*, and
the original identity isn't printed anywhere on the module's case, that information is gone
permanently — there is no way to recover it afterwards, through this tool or through the Wizard
device itself.

### How it works

1. Click **Read** to fetch the module's current identity (vendor / serial / part number).
2. Click **Save**. This downloads a `.uieeprom` file like before, and also stores a copy in this
   app's local Backup Library (see below).
3. **Write** is only enabled once a backup exists for that exact serial number. Clicking Write
   automatically re-reads whatever module is currently connected and checks for a match — if none
   exists, the write is blocked with an on-screen error telling you to Save first.

### The Backup Library ("My Backups")

Next to the Local File and Repository options, there's a third source: a searchable list of every
module this browser has ever Saved. It's stored using IndexedDB (the browser's own local database),
which works the same way on desktop and mobile — no OS folder permissions needed. Search by serial
number, part number, or vendor to find and restore a module back to its original dump.

**Limitation:** the Backup Library is local to the specific browser/device you're using. Saving a
module from your phone won't make that backup visible (or satisfy the write requirement) on your
laptop, and vice versa — each browser keeps its own separate library.

## Contributing

Feel free to contribute, every help is appreciated!

### Profiles

If you want to contribute an EEPROM profile, please create a pull request.

Please upload your EEPROM Dump into the <code>repository</code> Folder and add an entry to the <code>dumps.json</code>
File.

## Known Issues

### Modules are not flashed via WebGUI

That's correct, the current API does not allow flashing of Modules via WebGUI directly.

It only allows transmitting the EEPROM Dump into the Wizards Snapshot Buffer.

So if you press the "Write" Button, you need to confirm the flash process on the Wizard.

I created
a [Thread Message](https://community.ui.com/releases/4e7ed4c2-3060-4ea8-8416-f6d502ac2dcc?replyId=3b9a0d99-b0fd-4aaf-b007-838a572a0b38)
in the Ubiquiti Community, but I think they won't add a function for that so fast.

### Module can't be read

If you power on the Wizard with a Module in its SFP Slot, the Module can't be read.

Please remove the Module from the Slot and plug it in again.

Now you can read the Module.

### Random Reboots

I don't know why, but sometimes the Wizard reboots.

The Problem is not my WebGUI, because the Wizard sometimes reboots also with the IOS App.

Currently, I am unable to access the JTAG Console, so I can't debug the Problem (And yes, the ESP32 uses Secure Boot).

### Bluetooth Limitations

Due to limitations of the Web Bluetooth API, I can't read the MAC from the Device on first connecting.

Normally the Service 1 Channel should contain the MAC on first connecting, but it doesn't.

I use a dirty workaround to get the MAC, because in the API V1 the MAC is available in any Basic Response.

So I use the <code>getVer</code> Command to get the MAC after a successful connection.

### Can't flash some Modules

In the newer Versions of the SFP-Wizard Firmware, the Wizard checks if the Module is in its Database.

If the Part Number is not in the Database, the Wizard can't flash the Module.

Version 1.0.5 allowed flashing of Modules without a Database, but it has no check if the Module Password was correct, so
you could destroy your Module.

Please have a look at https://github.com/vitaminmoo/sfpw-tool/blob/main/doc/HOW_TO_DOWNGRADE_AND_WHY_NOT_TO.md which 
explains why some modules are not working.

#### About the firmware's password database (and why we didn't build around it)

The "Database" mentioned above is a password table baked directly into the Wizard's own ESP32
firmware, used to unlock write-protected EEPROM pages on certain modules before flashing them. It
can be extracted from an official firmware image using
[`sfpw-tool`](https://github.com/vitaminmoo/sfpw-tool)'s `fw passdb` command (official firmware
images are downloadable straight from Ubiquiti's update API, filtered to
`product=SFP-Wizard&platform=ESP32&channel=release`).

We pulled and parsed this table from a real v1.1.1 firmware image. Every single entry in it is a
**Ubiquiti-branded** module or cable (`AOC-SFP10-*`, `AOC-QSFP28-*`, `UACC-*`, `DAC-SFP*`,
`OM-SFP*`, `Uplink-SFP28-*`, `UC-D-QSFP28-*`, etc.) — none of the third-party parts this project
actually deals with (Cisco, FS.com, Finisar, Ruckus, IBM/Blade Network) appear in it anywhere.

That tells us what the database is actually for: it's Ubiquiti's own unlock codes for their own
write-protected modules, not something tied to whatever identity you're writing. This project's
typical use case is the opposite direction — taking a cheap generic module (which, by virtue of
being a viable donor, essentially never has write-protection enabled in the first place) and
flashing it with an OEM part number's `.uieeprom` profile so a switch stops rejecting it as an
unrecognized transceiver. Since the *target identity* being written was never how this database is
checked, and generic donor modules almost never hit its lock check anyway, there's nothing here for
this fork to build a compatibility warning around. If you're specifically trying to reflash a
locked, non-generic module (a genuine Cisco/FS/etc. part with write-protection actually enabled),
this database won't help you and the module needs the real vendor's own unlock code, which isn't
published anywhere in Ubiquiti's firmware.

## Credits

This project is oriented at the https://github.com/vitaminmoo/sfpw-tool Repository, thank you for your work.

### Libraries and Software

For detailed information about the used libraries, please have a look at the <code>package.json</code> File.

- TypeScript
- Bootstrap 5
- Web Bluetooth API
- JQuery
- Electron
- Electron Forge
- Webpack
- i18next
- Pako
- Notiflix
- js-untar

## Disclaimer

#### I accept no liability for damage, data loss or other problems.

#### Participation is at your own risk!

### As with all of my repositories, I would like to point out that I am in no way affiliated with Ubiquiti or UniFi.

### The EEPROM dumps published here are for testing purposes only. If a legal claim arises, please contact me, and I will gladly take it offline.

### For legal claims about used product images, please contact me in the Ubiquiti Community ([JaXnPriVate](https://community.ui.com/user/JaXnPublic/a521c964-0aba-4ad4-89aa-b42b5066e8a5)).
