module.exports = {
    packagerConfig: {
        icon: "./build/icon",
        linux: {
            target: 'deb'
        }
    },
    makers: [
        {
            name: '@electron-forge/maker-msix',
            sign: true,
            windowsKitPath: "C:\\Program Files (x86)\\Windows Kits\\10\\bin\\10.0.26100.0\x64",
            config: {
                packageAssets: 'D:\\Programmieren\\UniFi-SFP-Wizard\\build\\appx',
                manifestVariables: {
                    publisherDisplayName: 'BYTESTORE',
                    appDisplayName: "SFP Wizard",
                    packageBackgroundColor: '#131517',
                    publisher: 'CN=555309DB-480B-42F6-B556-988555579009',
                    packageMinOSVersion: "10.0.26100.0",
                    packageName: "37017jaxnprivate.UnofficialUniFiSFPWizard",
                    packageIdentity: "37017jaxnprivate.UnofficialUniFiSFPWizard"
                }
            }
        },
        {
            name: '@electron-forge/maker-deb',
            config: {
                options: {
                    productName: "Unofficial UniFi Talk Softphone",
                    genericName: "Softphone",
                    section: "sound",
                    maintainer: 'Jan Heil',
                    homepage: 'https://github.com/Gamer08YT/UniFi-Softphone'
                }
            }
        },
        {
            name: '@electron-forge/maker-dmg',
            config: {
                background: './build/appx/SplashScreen.scale-400.png',
                format: 'ULFO'
            }
        }
    ]
};