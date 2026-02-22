# UniFi-SFP-Wizard

This Repository provides an WebGUI for the UniFi SFP-Wizard.

You can read, save or write the configuration of an SFP EEPROM.

Feel free to contribute to this project.

![Dashboard](/assets/img/dashboard.png)

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

## Known Issues

Due to limitations of the Web Bluetooth API, i can't read the MAC from the Device on first connect.

Normally the Service 1 Channel should contain the MAC on first connecting but it dont.

I use a dirty workaround to get the MAC, because in the API V1 the MAC is available in any Basic Response.

So I use the <code>getVer</code> Command to get the MAC after a successful connection.

## Credits

This project is oriented at the https://github.com/vitaminmoo/sfpw-tool Repository, thank you for your work.

## Disclaimer

#### I accept no liability for damage, data loss or other problems.

#### Participation is at your own risk!

### As with all of my repositories, I would like to point out that I am in no way affiliated with Ubiquiti or UniFi.

### The EEPROM dumps published here are for testing purposes only. If a legal claim arises, please contact me and I will gladly take it offline.