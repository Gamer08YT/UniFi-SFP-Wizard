# UniFi-SFP-Wizard

This Repository provides a WebGUI for the UniFi SFP-Wizard.

You can read, save or write the configuration of an SFP EEPROM.

Feel free to contribute to this project.

![Dashboard](/assets/img/dashboard.png)

## Live Demo

#### Glass Design

https://gamer08yt.github.io/UniFi-SFP-Wizard/

#### Classic BS5

https://gamer08yt.github.io/UniFi-SFP-Wizard/?classic

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
    - Write EEPROM [X]
        - Via File Upload
        - Via Repo
    - Save EEPROM

Currently, I implemented only the Dump Functions, DDM would be nice too, but you manually have to activate it on the
Wizard, so I think it's not interesting at the moment.

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

## Credits

This project is oriented at the https://github.com/vitaminmoo/sfpw-tool Repository, thank you for your work.

## Disclaimer

#### I accept no liability for damage, data loss or other problems.

#### Participation is at your own risk!

### As with all of my repositories, I would like to point out that I am in no way affiliated with Ubiquiti or UniFi.

### The EEPROM dumps published here are for testing purposes only. If a legal claim arises, please contact me, and I will gladly take it offline.

### For legal claims about used product images, please contact me in the Ubiquiti Community ([JaXnPriVate](https://community.ui.com/user/JaXnPublic/a521c964-0aba-4ad4-89aa-b42b5066e8a5)).