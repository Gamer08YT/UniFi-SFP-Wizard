# UniFi-SFP-Wizard

This Repository provides an WebGUI for the UniFi SFP-Wizard.

You can read, save or write the configuration of an SFP EEPROM.

Feel free to contribute to this project.

![Dashboard](/assets/img/dashboard.png)

## Live Demo

https://gamer08yt.github.io/UniFi-SFP-Wizard/

## Features

- Device Functions
    - Reboot
    - Shutdown
    - Rename
    - Battery Control
    - Device Info
- SFP Functions
    - Read EEPROM
    - Write EEPROM [X]
        - Via File Upload
        - Via Repo
    - Save EEPROM

## Contributing

Feel free to contribute, every help is appreciated!

### Profiles

If you want to contribute a EEPROM profile, please create a pull request.

Please upload your EEPROM Dump into the <code>repository</code> Folder and add an entry to the <code>dumps.json</code>
File.

## Known Issues

### Module can't be read

If you power on the Wizard with an Module in it's SFP Slot, the Module can't be read.

Please remove the Module from the Slot and plug it in again.

Now you can read the Module.

### Random Reboots

I don't know why, but sometimes the Wizard reboots.

The Problem is not my WebGUI, because the Wizard sometimes reboots also with the IOS App.

Currently, I am unable to access the JTAG Console, so i can't debug the Problem (And yes the ESP32 uses Secure Boot).

### Bluetooth Limitations

Due to limitations of the Web Bluetooth API, i can't read the MAC from the Device on first connect.

Normally the Service 1 Channel should contain the MAC on first connecting but it dont.

I use a dirty workaround to get the MAC, because in the API V1 the MAC is available in any Basic Response.

So I use the <code>getVer</code> Command to get the MAC after a successful connection.

### Can't flash Module

In the newer Versions of the SFP-Wizard Firmware, the Wizard checks if the Module is in its Database.

If the Part Number is not in the Database, the Wizard can't flash the Module.

Version 1.0.5 allowed flashing of Modules without a Database, but it has no check if the Module Password was correct, so
you could destroy your Module.

Please have a look at https://github.com/vitaminmoo/sfpw-tool/blob/main/doc/HOW_TO_DOWNGRADE_AND_WHY_NOT_TO.md wich
explains why some modules are not working.

## Credits

This project is oriented at the https://github.com/vitaminmoo/sfpw-tool Repository, thank you for your work.

## Disclaimer

#### I accept no liability for damage, data loss or other problems.

#### Participation is at your own risk!

### As with all of my repositories, I would like to point out that I am in no way affiliated with Ubiquiti or UniFi.

### The EEPROM dumps published here are for testing purposes only. If a legal claim arises, please contact me and I will gladly take it offline.