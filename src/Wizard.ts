import $ from "jquery";
import i18next from "i18next";
import * as enCommon from "./language/en-US.json";
import {GATTUUID} from "./GATTUUID";
import {Confirm} from "notiflix";


class Wizard {
    // Normaly it's UACC-SFP-Wizard don't know why Edge display it as Sfp Wizard.
    private static wizardSSID = "Sfp Wizard";

    // Store DOM Element Intances.
    private static connectButton: JQuery<HTMLElement>;
    private static poweroffButton: JQuery<HTMLElement>;
    private static chargeControlButton: JQuery<HTMLElement>;

    // Store BLE Device Instance.
    private static device: BluetoothDevice;
    private static infoChar: BluetoothRemoteGATTCharacteristic;
    private static pendingResolver: ((data: Uint8Array) => void) | null = null;

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

        // Enable or Disable Controls.
        Wizard.setControls(state);
    }

    /**
     * Initiates a system power-off sequence by sending a shutdown command*/
    public static async poweroff(): Promise<void> {
        return await Wizard.sendCommandNoResponse("powerOff");
    }

    /**
     * Sends a command to control the charging mechanism and awaits a response within a specified timeout.
     * The command is sent using the "chargeCtrl" identifier with a timeout value of 5000 milliseconds.
     *
     * @return {Promise<any>} A promise that resolves with the response from the "chargeCtrl" command.
     */
    public static async chargeControl(): Promise<any> {
        return await Wizard.sendCommand("chargeCtrl", 5000);
    }

    /**
     * Updates the control state of the poweroff button based on the provided boolean value.
     *
     * @param {boolean} state - A flag indicating whether to enable or disable the poweroff button.
     *                          If true, the button is enabled; if false, the button is disabled.
     * @return {void} Does not return any value.
     */
    private static setControls(state: boolean): void {

        $("#wizard-controls").children("button").each((index, element) => {
            if (state) {
                $(element).removeAttr("disabled");
            } else {
                $(element).attr("disabled", "disabled");
            }
        });

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
                        acceptAllDevices: true,
                        optionalServices: [this.normalizeUuid(GATTUUID.WriteChar), this.normalizeUuid(GATTUUID.NotifyChar), this.normalizeUuid(GATTUUID.SecondaryNotify), this.normalizeUuid(GATTUUID.Service2)],
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
        // Register Connect Button Click Listener.
        Wizard.connectButton.on("click", () => {
            if (Wizard.device == null) {
                Wizard.scanDevices();
            } else {
                Wizard.disconnect();
            }
        });

        // Register Shutdown Button. Click Listener.
        Wizard.poweroffButton.on("click", () => {
            Confirm.show(i18next.t("common:shutdown-title"), i18next.t("common:shutdown-message"), i18next.t("common:yes"), i18next.t("common:no"), () => {
                Wizard.poweroff().then(r => console.debug(r));
            });
        });

        // Register Charge Control Button.
        Wizard.chargeControlButton.on("click", () => {
            Confirm.show(i18next.t("common:charge-title"), i18next.t("common:charge-message"), i18next.t("common:yes"), i18next.t("common:no"), () => {
                Wizard.chargeControl().then(response => {
                    console.debug(response);
                });
            });

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
        Wizard.poweroffButton = $("#poweroff-wizard");
        Wizard.chargeControlButton = $("#charge-wizard");
    }

    /**
     * Sets the connected Bluetooth device by establishing a connection and preparing for notifications.
     *
     * @param {BluetoothDevice} device - The Bluetooth device to connect to and set as the active device.
     * @return {Promise<void>} A promise that resolves once the device is connected and notifications are prepared.
     */
    private static async setConnectedDevice(device: BluetoothDevice) {
        if (!device.gatt) return;

        // Try to connect to a device.
        const server = await device.gatt?.connect();

        // Prepare GATT Notify.
        await this.prepareNotify(server).then(() => {
            console.log("Notify Prepared");
        });

        // Set GATT Event Listener.
        device.addEventListener('gattserverdisconnected', () => {
            this.setConnected(false);
        })

        // Set Device Instance.
        Wizard.device = device;
    }

    /**
     * Normalizes a UUID string to ensure it is lowercased and trimmed of any extraneous whitespace.
     *
     * @param {string} uuid - The UUID string to be normalized.
     * @return {string} The normalized UUID string in lowercase, with any extra whitespace removed.
     */
    private static normalizeUuid(uuid: string): string {
        // Web Bluetooth uses lowercase-UUIDs
        return uuid.trim().toLowerCase();
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
     * Prepares a Bluetooth GATT characteristic for notifications and sets up an event listener
     * to handle incoming characteristic value changes.
     *
     * @param {BluetoothRemoteGATTServer} server - The GATT server connected to the Bluetooth device.
     * @return {Promise<void>} A promise that resolves once the notifications and event listener are prepared.
     */
    private static async prepareNotify(server: BluetoothRemoteGATTServer | undefined): Promise<void> {
        if (server == null) return;

        // Print Debug Message.
        console.log("Preparing Notify");

        // Get Service.
        const service = await server.getPrimaryService(this.normalizeUuid(GATTUUID.Service));

        // Prepare Pending Resolver.
        Wizard.infoChar = await service.getCharacteristic(this.normalizeUuid(GATTUUID.NotifyChar));

        // Start Notify.
        await Wizard.infoChar.startNotifications();

        // Print Debug Message.
        console.log("Notify Started");

        // Prepare Pending Resolver.
        Wizard.infoChar.addEventListener("characteristicvaluechanged", (event) => {
            const buf = new Uint8Array((event.target as BluetoothRemoteGATTCharacteristic).value!.buffer);

            console.log(`New Data: ${this.decodeJSON(buf)}`);

            // Resolve Pending Resolver.
            if (Wizard.pendingResolver) {
                Wizard.pendingResolver(buf);
                Wizard.pendingResolver = null;
            }
        });
    }


    /**
     * Sends a command to the connected device and waits for a response within a specified timeout.
     * Throws an error if the connection is not established.
     *
     * @param {string} command The string command to be sent to the connected device.
     * @param {number} [timeout=3000] The timeout duration in milliseconds to wait for a response. Defaults to 3000ms.
     * @return {Promise<Uint8Array>} A promise that resolves with a Uint8Array containing the response from the device.
     *                               Rejects with an error if a timeout occurs or if no response is received.
     */
    public static async sendCommand(command: string, timeout: number = 3000): Promise<Uint8Array> {
        // Check if InfoChar is set.
        if (!Wizard.infoChar) throw new Error("InfoChar not set / not connected");

        // Print Debug Message.
        console.log(`Sending GATT command (response expected): ${command}`);

        // Prepare Encoder.
        const encoder = new TextEncoder();

        // Prepare Data.
        const data = encoder.encode(command);

        // Prepare Pending Resolver.
        Wizard.pendingResolver = null;

        // Print Debug Message.
        console.log(`Wrote ${data.length} bytes to InfoChar`);

        // Send Command.
        return new Promise<Uint8Array>((resolve, reject) => {
            Wizard.pendingResolver = resolve;

            // Write command to the Info characteristic.
            Wizard.infoChar!.writeValueWithoutResponse(data);

            // Timeout Resolver.
            setTimeout(() => {
                if (Wizard.pendingResolver) {
                    Wizard.pendingResolver = null;
                    reject(new Error("Timeout waiting for response"));
                }
            }, timeout);
        });
    }

    /**
     * Sends a command to a connected Bluetooth device without expecting a response.
     *
     * @param {string} command - The command string to send to the device.
     * @return {Promise<void>} Resolves when the command is successfully sent.
     * @throws {Error} If the InfoChar property is not set or the device is not connected.
     */
    public static async sendCommandNoResponse(command: string): Promise<void> {
        // Check if InfoChar is set.
        if (!Wizard.infoChar) throw new Error("InfoChar not set / not connected");

        // Print Debug Message.
        console.log(`Sending GATT command (no response expected): ${command}`);

        const encoder = new TextEncoder();
        const data = encoder.encode(command);

        // Write command to the Info characteristic
        await Wizard.infoChar.writeValueWithoutResponse(data);

        // Print Debug Message.
        console.log(`Wrote ${data.length} bytes to InfoChar`);

        // Optional delay to give the device time to process
        await new Promise((resolve) => setTimeout(resolve, 100));
    }

    /**
     * Decodes a JSON object from a given buffer.
     *
     * @param {Uint8Array<ArrayBuffer>} buf - The buffer containing encoded JSON data.
     * @return {string} The decoded JSON string.
     */
    private static decodeJSON(buf: Uint8Array<ArrayBufferLike>): string {
        return new TextDecoder().decode(new Uint8Array(buf));
    }
}

new Wizard();