import $ from "jquery";
import i18next from "i18next";
import * as enCommon from "./language/en-US.json";
import {GATTUUID} from "./GATTUUID";


class Wizard {
    // Normaly it's UACC-SFP-Wizard don't know why Edge display it as Sfp Wizard.
    private static wizardSSID = "Sfp Wizard";

    // Store DOM Element Intances.
    private static connectButton: JQuery<HTMLElement>;

    // Store BLE Device Instance.
    private static device: BluetoothDevice;

    private static infoChar!: BluetoothRemoteGATTCharacteristic;
    private static notifyEnabled = false;

    private static responseBuffer: Uint8Array | null = null;
    private static pendingResolver?: (data: Uint8Array) => void;

    constructor() {
        // Prepare Locale.
        this.prepareLocale();

        // Retrieve Elements.
        this.prepareDOM();

        // Prepare Listeners.
        this.registerListeners();
    }

    /**
     * Updates the connection button text and style based on the connection state.
     *
     * @param {boolean} state - The connection state. If true, sets the button text to "Disconnect"
     * and applies a danger styling. If false, sets the button text to "Connect" and removes the danger styling.
     * @return {void} This method does not return any value.
     */
    private static setConnected(state: boolean) {
        Wizard.connectButton.text(state ? i18next.t("common:disconnect") : i18next.t("common:connect"));

        if (state) {
            Wizard.connectButton.addClass("btn-danger");
            Wizard.connectButton.removeClass("btn-primary");
        } else {
            Wizard.connectButton.removeClass("btn-danger");
            Wizard.connectButton.addClass("btn-primary");
        }
    }

    /**
     * Scans for Bluetooth devices if Bluetooth is supported and available on the device.
     *
     * @return {void} This method does not return a value.
     */
    public static scanDevices(): void {


        if (this.hasBluetoothChannel()) {
            this.isAvailable().then(available => {
                if (available) {
                    console.log("Bluetooth is available on this device.");

                    // Connect to device.
                    // @ts-ignore
                    navigator.bluetooth.requestDevice({
                        filters: [{namePrefix: Wizard.wizardSSID}],
                    }).then(device => {
                        console.log(device);

                        // Store Device.
                        Wizard.setConnectedDevice(device);

                        // Set Connection State.
                        Wizard.setConnected(true);
                    });
                } else {
                    console.error("Bluetooth is not available on this device.");
                }
            });
        } else {
            console.error("Bluetooth is not supported on this device.");
        }
    }

    /**
     * Checks the availability of the Bluetooth functionality on the device.
     *
     * @return {Promise<boolean>} A promise that resolves to a boolean indicating if Bluetooth is available on the device.
     */
    public static async isAvailable(): Promise<boolean> {
        return navigator.bluetooth.getAvailability();
    }

    /**
     * Checks if the Bluetooth API is available in the user's browser.
     *
     * @return {boolean} Returns true if the browser supports the Bluetooth API, otherwise false.
     */
    public static hasBluetoothChannel(): boolean {
        return navigator.bluetooth !== undefined;
    }

    /**
     * Registers event listeners for the application.
     * The method adds a click event listener to the element with the ID 'connect-wizard'
     * which logs the Bluetooth capabilities of the navigator object to the console.
     *
     * @return {void} This method does not return a value.
     */
    private registerListeners(): void {
        Wizard.connectButton.on("click", () => {
            if (Wizard.device == null) {
                Wizard.scanDevices();
            } else {
                Wizard.disconnect();
            }
        });
    }

    /**
     * Configures and initializes the i18n library with the appropriate locale settings.
     * It sets the language based on the browser's detected locale and uses a fallback language if needed.
     * Debugging is enabled for logging purposes. Localization resources are also loaded during this process.
     *
     * @return {void} Does not return a value.
     */
    private prepareLocale(): void {
        console.info("Preparing Locale");

        i18next.init({
            lng: this.getBrowserLocale(),
            fallbackLng: 'en-US',
            debug: true,
            resources: {
                "en-US": {
                    common: enCommon,
                }
            }
        });
    }

    /**
     * Retrieves the preferred locale of the user's browser.
     *
     * The method fetches the user's language preference from the browser's navigator object.
     * It first checks for `navigator.languages` (an array of preferred languages), and if unavailable,
     * falls back to the single value `navigator.language`. If neither is available, it defaults to 'en-US.json'.
     *
     * @return {string} The locale string representing the user's preferred browser language.
     */
    private getBrowserLocale(): string {
        // Check if navigator.languages is available (modern browsers)
        if (navigator.languages && navigator.languages.length > 0) {
            return navigator.languages[0]; // Returns the first preferred language
        }

        // Fallback to navigator.language for older browsers
        return navigator.language || 'en-US.json'; // Default to 'en-US.json' if unavailable
    }

    /**
     * Prepares the DOM by initializing the required elements and connecting them for further interactions.
     *
     * @return {void} This method does not return any value.
     */
    private prepareDOM(): void {
        Wizard.connectButton = $("#connect-wizard");
    }

    private static setConnectedDevice(device: BluetoothDevice) {
        // Try to connect to a device.
        device.gatt?.connect().catch(error => console.error(error)).then(() => console.log("Connected to Device."));


        // Set GATT Event Listener.
        device.addEventListener('gattserverdisconnected', () => {
            this.setConnected(false);
        })

        // Set Device Instance.
        Wizard.device = device;
    }

    /**
     * Disconnects the current device if it is defined.
     * If a device is available, it triggers the forget action on the device
     * and updates the connection status to disconnected.
     *
     * @return {void} No return value.
     */
    private static disconnect(): void {
        console.log(this.device);

        if (this.device !== undefined && this.device?.gatt?.connected) {
            console.log("Disconnecting");

            // Disconnect Device via GATT.
            this.device?.gatt.disconnect();

            // Toggle Frontend State.
            this.setConnected(false);
        } else {
            console.error("No device connected.");
        }
    }

    /**
     * Establishes a connection to the GATT server of a Bluetooth device and retrieves relevant services and characteristics.
     *
     * @param {BluetoothDevice} device The Bluetooth device to connect to and initiate GATT communication.
     * @return {Promise<GATTContext>} A promise that resolves to a GATTContext object, which includes handles to essential characteristics (commandChar, notifyChar, and infoChar*/
    public static async setupGATT(device: BluetoothDevice): Promise<GATTContext> {
        if (!device.gatt) throw new Error("Device GATT not available");

        const server = await device.gatt.connect();
        console.log("Connected to GATT server");

        // Get Service 3
        const service = await server.getPrimaryService(GATTUUID.Service);
        console.log("Found Service 3:", service.uuid);

        // Get Characteristics
        const characteristics = await service.getCharacteristics();

        let commandChar: BluetoothRemoteGATTCharacteristic | undefined;
        let notifyChar: BluetoothRemoteGATTCharacteristic | undefined;
        let infoChar: BluetoothRemoteGATTCharacteristic | undefined;

        for (const char of characteristics) {
            console.log("Found characteristic:", char.uuid);

            if (char.uuid.toLowerCase() === GATTUUID.WriteChar.toLowerCase()) {
                commandChar = char;
            }
            if (char.uuid.toLowerCase() === GATTUUID.SecondaryNotify.toLowerCase()) {
                notifyChar = char;
            }
            if (char.uuid.toLowerCase() === GATTUUID.NotifyChar.toLowerCase()) {
                infoChar = char;
            }
        }

        if (!commandChar) throw new Error("Command characteristic not found");
        if (!infoChar) throw new Error("Info characteristic (dc272a22) not found");

        return {
            commandChar,
            notifyChar,
            infoChar
        };
    }


    // Enable notifications on InfoChar
    /**
     * Enables notifications for the Bluetooth GATT characteristic.
     * This method starts listening to characteristic value changes and processes notifications.
     * Checks if notifications are already enabled, and if not, initiates the process.
     * Throws an error if the required GATT characteristic is not set.
     *
     * @return {Promise<void> | undefined} A promise that resolves when notifications are successfully enabled,
     *                                     or undefined if notifications are already enabled.
     */
    public static enableNotifications(): Promise<void> | undefined {
        if (this.notifyEnabled) return;

        if (!this.infoChar) throw new Error("InfoChar not set");

        await this.infoChar.startNotifications();
        this.infoChar.addEventListener(
            "characteristicvaluechanged",
            (event: Event) => {
                const char = event.target as BluetoothRemoteGATTCharacteristic;
                const buf = new Uint8Array(char.value!.buffer);

                console.log(`GATT notification received: ${buf.length} bytes`);
                console.log(`Response: ${new TextDecoder().decode(buf)}`);

                // Store buffer
                this.responseBuffer = new Uint8Array(buf);

                // Resolve any pending promise
                if (this.pendingResolver) {
                    this.pendingResolver(this.responseBuffer);
                    this.pendingResolver = undefined;
                }
            }
        );

        this.notifyEnabled = true;

        // Optional small delay to mimic Go sleep
        await new Promise(r => setTimeout(r, 100));
    }

    // Wait for next response (replaces Go channel)
    waitForResponse(timeout = 3000): Promise<Uint8Array> {
        return new Promise((resolve, reject) => {
            this.pendingResolver = resolve;

            setTimeout(() => {
                if (this.pendingResolver) {
                    this.pendingResolver = undefined;
                    reject(new Error("Timeout waiting for response"));
                }
            }, timeout);
        });
    }
}
}

new Wizard();