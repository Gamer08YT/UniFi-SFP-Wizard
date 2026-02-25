import $ from "jquery";
import i18next from "i18next";
import * as enCommon from "./language/en-US.json";
import * as deCommon from "./language/de-DE.json";
import {GATTUUID} from "./GATTUUID";
import {APIRequest} from "./APIRequest";
import {Confirm, Loading, Notify} from "notiflix";
import {deflate, inflate} from "pako";
import {ProtocolType} from "./ProtocolType";
import {FormatType} from "./FormatType";
import {Repository} from "./Repository";
import untar from "js-untar";

class Wizard {
    // Normaly it's UACC-SFP-Wizard don't know why Edge display it as Sfp Wizard.
    private static wizardSSID = "Sfp Wizard";

    private static apiRx = {expectedLen: 0, buffer: new Uint8Array(0)};

    // Store DOM Element Intances.
    private static connectButton: JQuery<HTMLElement>;
    private static poweroffButton: JQuery<HTMLElement>;
    private static rebootButton: JQuery<HTMLElement>;
    private static readButton: JQuery<HTMLElement>;
    private static saveButton: JQuery<HTMLElement>;
    private static writeButton: JQuery<HTMLElement>;
    private static chargeControlButton: JQuery<HTMLElement>;
    private static eepromUpload: JQuery<HTMLElement>;
    private static autoscrollSwitch: JQuery<HTMLElement>;
    private static nameButton: JQuery<HTMLElement>;
    private static repoSelect: JQuery<HTMLElement>;
    private static logButton: JQuery<HTMLElement>;

    // Store GATT Characteristic Instances.
    private static infoChar: BluetoothRemoteGATTCharacteristic;
    private static apiNotifyChar: BluetoothRemoteGATTCharacteristic;
    private static writeChar: BluetoothRemoteGATTCharacteristic;
    private static notifyChar: BluetoothRemoteGATTCharacteristic;
    // Store BLE Device Instance.

    private static device: BluetoothDevice;

    private static pendingResolver: ((data: Uint8Array) => void) | null = null;
    private static apiResolvers: Map<string, (data: any) => void> = new Map();
    private static service: BluetoothRemoteGATTService;
    private static requestCounter = 0;
    // Store Wizard Mac to Query via Service V2 (Hybrid HTTP API).
    private static deviceId: any;

    // Store State of Electron Device Selector.
    private static deviceSelectorOpen = false;


    constructor() {
        // Prepare Locale.
        this.prepareLocale();

        // Retrieve Elements.
        this.prepareDOM();

        // Replace Text Elements.
        this.replaceLocale();

        // Register Electron Bridge.
        this.registerElectronBridge();

        // Prepare Listeners.
        this.registerListeners();

        // Fetch Repository.
        Repository.fetchTemplates();
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

        if (!state) {
            // @ts-ignore
            Wizard.device = undefined;

            // Clear Fields.
            Wizard.clearFields();
        }

        console.log(`Set connected state to ${state}`)
    }

    /**
     * Initiates a system power-off sequence by sending a shutdown command*/
    public static async poweroff(): Promise<void> {
        return await Wizard.sendCommandNoResponse("powerOff");
    }

    /**
     * Sends an API request to reboot the device associated with the provided MAC address.
     *
     * @return {Promise<Object>} A promise that resolves with the response of the reboot request.
     */
    public static async reboot() {
        return await Wizard.sendApiRequest("POST", `/api/1.0/${this.handleMAC(Wizard.deviceId)}/reboot`);
    }

    /**
     * Sends a command to control the charging mechanism and awaits a response within a specified timeout.
     * The command is sent using the "chargeCtrl" identifier with a timeout value of 5000 milliseconds.
     *
     * @return {Promise<any>} A promise that resolves with the response from the "chargeCtrl" command.
     */
    public static async chargeControl(): Promise<any> {
        return await Wizard.sendCommand("chargeCtrl", 5000).then(response => {
            this.handleResponse(response);
        });
    }

    /**
     * Updates the control state of the poweroff button based on the provided boolean value.
     *
     * @param {boolean} state - A flag indicating whether to enable or disable the poweroff button.
     *                          If true, the button is enabled; if false, the button is disabled.
     * @return {void} Does not return any value.
     */
    private static setControls(state: boolean): void {

        $(".needConnected").children("button").each((index, element) => {
            if (!$(element).hasClass("ignoreConnect")) {
                if (state) {
                    $(element).removeAttr("disabled");
                } else {
                    $(element).attr("disabled", "disabled");
                }
            }
        });

        if (state) {
            // Toggle Eeprom Upload State.
            Wizard.eepromUpload.removeAttr("disabled");
            Wizard.repoSelect.removeAttr("disabled");
        } else {
            // Toggle Eeprom Upload State.
            Wizard.eepromUpload.attr("disabled", "disabled");
            Wizard.repoSelect.attr("disabled", "disabled");
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

                    // Set Page Loader active.
                    this.setLoader(true);

                    // Connect to device.
                    // @ts-ignore
                    navigator.bluetooth.requestDevice({
                        acceptAllDevices: true,
                        optionalServices: [this.normalizeUuid(GATTUUID.WriteChar), this.normalizeUuid(GATTUUID.NotifyChar), this.normalizeUuid(GATTUUID.SecondaryNotify), this.normalizeUuid(GATTUUID.Service2), this.normalizeUuid(GATTUUID.Service)],
                    }).then(device => {
                        console.log(device);

                        // Store Device.
                        Wizard.setConnectedDevice(device).then(r => {
                            // Set Connection State.
                            Wizard.setConnected(true);

                            // Disable Loader.
                            this.setLoader(false);
                        });
                    }).catch(error => {
                        this.setLoader(false);

                        console.error(error);
                    });
                } else {
                    console.error("Bluetooth is not available on this device.");

                    // Notify for wrong Browser.
                    this.wrongBrowserBLESupport();
                }
            });
        } else {
            console.error("Bluetooth is not supported on this device.");

            // Notify for wrong Browser.
            this.wrongBrowserBLESupport();
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

        // Register Reboot Control Button.
        Wizard.rebootButton.on("click", () => {
            Confirm.show(i18next.t("common:reboot-title"), i18next.t("common:reboot-message"), i18next.t("common:yes"), i18next.t("common:no"), () => {
                Wizard.reboot().then(r => {
                    const data = (r as any).header;

                    if (data.statusCode == 200) {
                        Notify.success(i18next.t("common:reboot-success"));
                    } else {
                        Notify.failure(i18next.t("common:reboot-failed"));
                    }
                });
            });
        });

        // Register Read Control Button.
        Wizard.readButton.on("click", () => {
            this.readXSFP();
        });

        // Register Save Control Button.
        Wizard.saveButton.on("click", () => {
            this.saveXSFP();
        });

        // Register Write Control Button.
        Wizard.writeButton.on("click", () => {
            if (this.checkEEPROMSelection()) {
                this.writeXSFP().then(r => {
                    if (r !== undefined) {
                        const header = (r as any).header;

                        if (header.statusCode == 200) {
                            Notify.success(i18next.t("common:eeprom-dump-send"));
                        } else {
                            Notify.failure(i18next.t("common:eeprom-sync-error"));
                        }
                    } else {
                        Notify.failure(i18next.t("common:eeprom-sync-nomodule"));
                    }
                });
            } else {
                // Notify for wrong EEPROM Selection.
                Notify.failure(i18next.t("common:no-eeprom-selected"));
            }
        });

        // Register Name Control Button.
        Wizard.nameButton.on("click", () => {
            Confirm.prompt(i18next.t("common:name-title"), i18next.t("common:name-message"), i18next.t("common:default-name"), i18next.t("common:yes"), i18next.t("common:no"), (data: string) => {
                if (data.length > 28) {
                    Notify.failure(i18next.t("common:name-too-long"));

                    return;
                }

                // Change Name.
                this.changeName(data).then(r => {
                    const data = (r as any).header;

                    if (data.statusCode == 200) {
                        Notify.success(i18next.t("common:name-success"));
                    } else if (data.statusCode == 304) {
                        Notify.warning(i18next.t("common:name-unchanged"));
                    } else {
                        Notify.failure(i18next.t("common:name-failed"));
                    }
                });
            });
        });

        // Register Log Button.
        Wizard.logButton.on("click", () => {
            this.retrieveLogs();
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
                },
                "de": {
                    common: deCommon
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
        Wizard.rebootButton = $("#reboot-wizard");
        Wizard.readButton = $("#read-sfp");
        Wizard.writeButton = $("#write-sfp");
        Wizard.saveButton = $("#save-sfp");
        Wizard.autoscrollSwitch = $("#autoscroll");
        Wizard.eepromUpload = $("#sfp-file");
        Wizard.repoSelect = $("#sfp-repo");
        Wizard.nameButton = $("#name-wizard");
        Wizard.logButton = $("#log-wizard");
    }

    /**
     * Sets the connected Bluetooth device by establishing a connection and preparing for notifications.
     *
     * @param {BluetoothDevice} device - The Bluetooth device to connect to and set as the active device.
     * @return {Promise<void>} A promise that resolves once the device is connected and notifications are prepared.
     */
    private static async setConnectedDevice(device: BluetoothDevice): Promise<void> {
        if (!device.gatt) return;

        // Try to connect to a device.
        const server = await device.gatt?.connect();

        // Prepare GATT Notify.
        await this.prepareNotify(server).then(() => {
            console.log("Notify Prepared");

            this.readDeviceInfoFromNotify();
        });

        // Set GATT Event Listener.
        device.addEventListener('gattserverdisconnected', () => {
            // Send Disconnected Notification.
            Notify.warning(i18next.t("common:disconnected"));

            this.setConnected(false);
        })

        // Just a dirty hack to get the device mac.
        await Wizard.sendCommand("getVer", 5000).then(response => {
            const data = JSON.parse(Wizard.decodeJSON(response))

            // Check if API Response contains Mac ID.
            if (data.id != undefined) {
                Wizard.deviceId = data.id;

                // Set Battery Level.
                this.setText("battery", data.level + "%");
            } else {
                Notify.failure(i18next.t("common:mac-failed"));
            }

        });

        // Send Connected Notification.
        Notify.success(i18next.t("common:connected"));

        // Query Device Meta.
        await this.queryDeviceInfo();
        await this.queryFirmwareInfo();

        // Set Device Instance.
        Wizard.device = device;
    }

    /**
     * Retrieves the settings by sending an API request to the specified endpoint.
     *
     * @return {Promise<Object>} A promise that resolves to the response data containing the settings.
     */
    private static async getSettings() {
        return await Wizard.sendApiRequest("GET", `/api/1.0/${this.handleMAC(Wizard.deviceId)}/settings`);
    }

    /**
     * Sends an API request to retrieve Bluetooth information for the specified MAC address.
     *
     * @return {Promise<Object>} A promise that resolves with the Bluetooth data in the response.
     */
    private static async getBluetooth() {
        return await Wizard.sendApiRequest("GET", `/api/1.0/${this.handleMAC(Wizard.deviceId)}/bt`);
    }

    /**
     * Queries the device information by making an API request and processes the received data.
     * Updates the device name and serial fields with the retrieved information.
     *
     * @return {void} This method does not return any value.
     */
    private static async queryDeviceInfo(): Promise<void> {
        // Query Device Info.
        await Wizard.sendApiRequest("GET", `/api/1.0/${this.handleMAC(Wizard.deviceId)}`).then(r => {
            const data = (r as any).body;

            this.setText("name", data.name);
            this.setText("serial", data.id);
        });
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
        Wizard.service = await server.getPrimaryService(this.normalizeUuid(GATTUUID.Service));

        // Prepare Pending Resolver.
        Wizard.writeChar = await Wizard.service.getCharacteristic(this.normalizeUuid(GATTUUID.WriteChar));
        Wizard.infoChar = await Wizard.service.getCharacteristic(this.normalizeUuid(GATTUUID.NotifyChar));
        Wizard.notifyChar = await Wizard.service.getCharacteristic(this.normalizeUuid(GATTUUID.SecondaryNotify));
        //Wizard.apiNotifyChar = await Wizard.service.getCharacteristic(this.normalizeUuid(GATTUUID.Service2));

        // Print Debug Message.
        console.log("Notify Service and Characteristics Retrieved");

        // Prepare Pending Resolver.
        this.addInfoCharListener();
        this.addNotifyCharListener();
        this.addWriteCharListener();

        // Start Info Notify.
        await Wizard.infoChar.startNotifications();

        // Print Debug Message.
        console.log("Info Notify Started");

        // Start Notify.
        await Wizard.notifyChar.startNotifications();

        // Print Debug Message.
        console.log("Notify Started");
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
        this.debugSend(command);

        // Print Debug Message.
        console.log(`Sending GATT command (response expected): ${command}`);

        // Prepare Encoder.
        const encoder = new TextEncoder();

        // Prepare Data.
        const data = encoder.encode(command);

        // Prepare Pending Resolver.
        Wizard.pendingResolver = null;

        // Print Data Length.
        this.printDataLength(data);

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
        this.debugSend(command);

        const encoder = new TextEncoder();
        const data = encoder.encode(command);

        // Write command to the Info characteristic
        await Wizard.infoChar.writeValueWithoutResponse(data);

        // Print Data Length.
        this.printDataLength(data);

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

    /**
     * Processes and handles the given response data by decoding and parsing it.
     * Depending on the parsed result, it triggers success or failure notifications.
     *
     * @param {Uint8Array} response - The response data to be handled, in the form of a Uint8Array.
     * @return {void} This method does not return a value.
     */
    private static handleResponse(response: Uint8Array): void {
        const data = JSON.parse(Wizard.decodeJSON(response))

        if (data.ret != undefined && data.ret == "ok") {
            Notify.success(i18next.t("common:command-success"));
        } else {
            Notify.success(i18next.t("common:command-failed"));
        }
    }

    /**
     * Adds a listener to handle changes in the characteristic value of `Wizard.infoChar`.
     * This method is responsible for responding to updates communicated through the characteristic,
     * decoding the received data, and resolving any pending resolver functionality.
     *
     * @return {void} Nothing is returned from this method.
     */
    private static addInfoCharListener(): void {
        console.log("Adding InfoChar Listener");

        Wizard.infoChar.addEventListener("characteristicvaluechanged", (event) => {
            const buf = new Uint8Array((event.target as BluetoothRemoteGATTCharacteristic).value!.buffer);

            console.log(`Info Data: ${this.decodeJSON(buf)}`);

            try {
                // Set Log Message.
                this.setLog(this.decodeJSON(buf), true);
            } catch (e) {
                // Do nothing.
            }

            // Resolve Pending Resolver.
            if (Wizard.pendingResolver) {
                Wizard.pendingResolver(buf);
                Wizard.pendingResolver = null;
            }
        });
    }

    /**
     * Adds a listener for the "characteristicvaluechanged" event on the NotifyChar characteristic.
     * When the event is triggered, it decodes the received data and logs it to the console.
     *
     * @return {void} This method does not return a value.
     */
    private static addNotifyCharListener(): void {
        console.log("Adding NotifyChar Listener");

        Wizard.notifyChar.addEventListener("characteristicvaluechanged", (event) => {
            const buf = new Uint8Array((event.target as BluetoothRemoteGATTCharacteristic).value!.buffer);

            // Parse multiple packet chunks into one.
            const full = Wizard.reassembleApiPacket(buf);

            // Skip if no full packet.
            if (!full) return;

            // Decode Byte Array to Object.
            const decoded = Wizard.binmeDecode(full);

            // Print Debug Message.
            console.log("API Response:", decoded);

            // @ts-ignore
            const id = decoded.header.id;

            if (Wizard.apiResolvers.has(id)) {
                const resolver = Wizard.apiResolvers.get(id)!;
                Wizard.apiResolvers.delete(id);

                try {
                    this.setLog(JSON.stringify(decoded), false);
                } catch {
                }

                resolver(decoded);
            }
        });
    }


    /**
     * Adds an event listener to handle characteristic value changes for the "writeChar" property.
     * The listener processes the updated characteristic value, decodes it, and logs the resulting data.
     *
     * @return {void} This method does not return a value.
     */
    private static addWriteCharListener(): void {
        console.log("Adding WriteChar Listener");

        Wizard.writeChar.addEventListener("characteristicvaluechanged", (event) => {
            const buf = new Uint8Array((event.target as BluetoothRemoteGATTCharacteristic).value!.buffer);

            console.log(`Write Data: ${this.decodeJSON(buf)}`);
        });
    }

    /**
     * Sends a GATT command for debugging purposes without expecting a response.
     *
     * @param {string} command - The GATT command string to be sent.
     * @return {void} This method does not return any value.
     */
    private static debugSend(command: string) {
        // Check if InfoChar is set.
        if (!Wizard.infoChar) throw new Error("InfoChar not set / not connected");

        // Print Debug Message.
        console.log(`Sending GATT command (no response expected): ${command}`);
    }

    /**
     * Logs the length of the provided data in bytes.
     *
     * @param {Uint8Array<ArrayBuffer>} data - The data whose byte length will be printed.
     * @return {void} This method does not return a value.
     */
    private static printDataLength(data: Uint8Array<ArrayBuffer>): void {
        // Print Debug Message.
        console.log(`Wrote ${data.length} bytes to InfoChar`);
    }


    /**
     * Generates the next unique request identifier.
     *
     * @return {Array} A tuple where the first element is a string representing the generated request ID,
     * and the second element is a number that represents the lower 16 bits of the request counter.
     */
    private static nextRequestId(): [string, number] {
        Wizard.requestCounter++;

        const id = Wizard.requestCounter.toString().padStart(12, "0");
        return [
            `00000000-0000-0000-0000-${id}`,
            Wizard.requestCounter & 0xffff
        ];
    }

    /**
     * Reads device information sent via the "characteristicvaluechanged" event from a Bluetooth GATT characteristic.
     * The method listens for the specified event, processes the received data as JSON, and resolves the promise
     * with the device's MAC address (if available).
     *
     * @return {Promise<string>} A promise that resolves with the MAC address of the device if it is successfully parsed from the received data.
     */
    private static async readDeviceInfoFromNotify() {
        console.log("Reading Device Info from Notify");

        return new Promise<string>((resolve) => {
            Wizard.infoChar.addEventListener("characteristicvaluechanged", (event) => {
                const buf = new Uint8Array((event.target as BluetoothRemoteGATTCharacteristic).value!.buffer);

                try {
                    const json = JSON.parse(new TextDecoder().decode(buf));

                    console.log("Received Device Info:", json);

                    if (json.id) {
                        const mac = json.id.toLowerCase();
                        console.log("Device MAC:", mac);
                        resolve(mac);
                    }
                } catch (e) {
                    console.warn("Invalid JSON from infoChar:", e);
                }
            }, {once: true});
        });
    }


    /**
     * Encodes the provided header and body data into a binary format with a specified sequence number.
     * The method compresses the input data, constructs header and body sections, and combines them into
     * a final binary message.
     *
     * @param {Uint8Array} headerJson The binary representation of the header data to be encoded.
     * @param {Uint8Array} body The binary representation of the body data to be encoded.
     * @param {number} seq The sequence number to be included in the transport header of the encoded message.
     * @return {Uint8Array} A Uint8Array containing the fully encoded binary message.
     */
    private static binmeEncode(headerJson: Uint8Array, body: Uint8Array, seq: number): Uint8Array {
        const compressedHeader = deflate(headerJson);
        const compressedBody = deflate(body);

        // Header section (9 bytes + compressed header)
        const headerSection = new Uint8Array(9 + compressedHeader.length);

        headerSection[0] = FormatType.json;
        headerSection[1] = ProtocolType.TypeHeader;
        headerSection[2] = 0x01;
        headerSection[3] = 0x01;
        headerSection[4] = 0x00;
        headerSection[5] = 0x00;
        headerSection[6] = 0x00;
        headerSection[7] = 0x00;
        headerSection[8] = compressedHeader.length;
        headerSection.set(compressedHeader, 9);

        // Body section (8 bytes + compressed body)
        const bodySection = new Uint8Array(8 + compressedBody.length);

        bodySection[0] = ProtocolType.TypeBody;
        bodySection[1] = FormatType.json;
        bodySection[2] = 0x01;
        bodySection[3] = 0x00;
        bodySection[4] = (compressedBody.length >>> 24) & 0xff;
        bodySection[5] = (compressedBody.length >>> 16) & 0xff;
        bodySection[6] = (compressedBody.length >>> 8) & 0xff;
        bodySection[7] = compressedBody.length & 0xff;
        bodySection.set(compressedBody, 8);
        const totalLen = headerSection.length + bodySection.length + 4;
        const out = new Uint8Array(totalLen);

        // Transport header
        out[0] = (totalLen >>> 8) & 0xff;
        out[1] = totalLen & 0xff;
        out[2] = (seq >>> 8) & 0xff;
        out[3] = seq & 0xff;
        out.set(headerSection, 4);
        out.set(bodySection, 4 + headerSection.length);

        return out;
    }


    /**
     * Encodes the given JSON data and binary body data into a transportable Uint8Array format.
     *
     * @param {Uint8Array} jsonData The JSON data to be compressed and included in the header section.
     * @param {Uint8Array} bodyData The binary data to be included in the body section.
     * @param {number} seqNum The sequence number to include in the transport header.
     * @return {Uint8Array} The encoded data, which includes the transport header, header section, and body section.
     */
    private static binmeEncodeRawBody(
        jsonData: Uint8Array,
        bodyData: Uint8Array,
        seqNum: number
    ): Uint8Array {

        // Deflate JSON Data from Header.
        const compressedHeader = deflate(jsonData);

        // Build Header section (9 + compressedHeader.length)
        const headerSection = new Uint8Array(9 + compressedHeader.length);
        headerSection[0] = ProtocolType.TypeHeader; // 0x03
        headerSection[1] = FormatType.json;       // 0x01
        headerSection[2] = 0x01;             // compressed = true
        headerSection[3] = 0x01;             // flags
        headerSection[4] = 0x00;             // reserved
        headerSection[5] = 0x00;
        headerSection[6] = 0x00;
        headerSection[7] = 0x00;
        headerSection[8] = compressedHeader.length & 0xff; // 1‑Byte length
        headerSection.set(compressedHeader, 9);

        // Build Body section (8 + bodyData.length)
        const bodySection = new Uint8Array(8 + bodyData.length);
        bodySection[0] = ProtocolType.TypeBody; // 0x02
        bodySection[1] = FormatType.binary;   // 0x03
        bodySection[2] = 0x00;           // not compressed
        bodySection[3] = 0x00;           // reserved

        // 32‑bit Big‑Endian length
        const dv = new DataView(bodySection.buffer);
        dv.setUint32(4, bodyData.length, false); // false = BigEndian

        bodySection.set(bodyData, 8);

        // Calculate total length
        const totalLen = headerSection.length + bodySection.length;

        // Define Transport Header
        const transportHeader = new Uint8Array(4);
        const dv2 = new DataView(transportHeader.buffer);
        dv2.setUint16(0, totalLen + 4, false); // BigEndian
        dv2.setUint16(2, seqNum, false);

        // Combine header, body, and transport header into one Uint8Array
        const out = new Uint8Array(transportHeader.length + totalLen);
        out.set(transportHeader, 0);
        out.set(headerSection, 4);
        out.set(bodySection, 4 + headerSection.length);

        return out;
    }

    /**
     * Reassembles a fragmented API packet by accumulating incoming chunks and extracting a complete packet when all parts are received.
     *
     * @param {Uint8Array} chunk A fragment or chunk of the API packet received for assembly.
     * @return {Uint8Array | null} The complete assembled API packet if all parts are received, or null if not enough data is available yet.
     */
    private static reassembleApiPacket(chunk: Uint8Array): Uint8Array | null {
        const ctx = Wizard.apiRx;

        // First chunk read header.
        if (ctx.buffer.length === 0 && chunk.length >= 4) {
            ctx.expectedLen = (chunk[0] << 8) | chunk[1];
            console.log("Expected total length:", ctx.expectedLen);
        }

        // Combine a chunk with the existing buffer
        const combined = new Uint8Array(ctx.buffer.length + chunk.length);
        combined.set(ctx.buffer, 0);
        combined.set(chunk, ctx.buffer.length);
        ctx.buffer = combined;

        // Check if chunk is complete.
        if (ctx.expectedLen > 0 && ctx.buffer.length >= ctx.expectedLen) {
            const full = ctx.buffer.slice(0, ctx.expectedLen);

            // Reset für nächsten Frame
            ctx.buffer = new Uint8Array(0);
            ctx.expectedLen = 0;

            return full;
        }

        return null;
    }


    /**
     * Encodes the input JSON and body data into a binary format with a transport header,
     * compressed content, and structured sections for header and body information.
     *
     * @param {Uint8Array} jsonData - The JSON data to encode, provided as a Uint8Array.
     * @param {Uint8Array} bodyData - The body data to encode, provided as a Uint8Array.
     * @param {number} seqNum - A sequence number to include in the transport header.
     * @return {Uint8Array} The encoded binary data as a Uint8Array containing the transport header,
     *                      compressed JSON header section, and compressed body section.
     */
    private static binmeEncodeStringBody(
        jsonData: Uint8Array,
        bodyData: Uint8Array,
        seqNum: number
    ): Uint8Array {

        // Deflate JSON Data from Header.
        const compressedHeader = deflate(jsonData);

        // Deflate Body Data.
        const compressedBody = deflate(bodyData);

        // Build Header section (9 + compressedHeader.length)
        const headerSection = new Uint8Array(9 + compressedHeader.length);

        headerSection[0] = ProtocolType.TypeHeader; // 0x03
        headerSection[1] = FormatType.json;       // 0x01
        headerSection[2] = 0x01;             // compressed = true
        headerSection[3] = 0x01;             // flags
        headerSection[4] = 0x00;             // reserved
        headerSection[5] = 0x00;
        headerSection[6] = 0x00;
        headerSection[7] = 0x00;
        headerSection[8] = compressedHeader.length & 0xff; // 1‑Byte length
        headerSection.set(compressedHeader, 9);

        // Build Body section (8 + bodyData.length)
        const bodySection = new Uint8Array(8 + compressedBody.length);
        bodySection[0] = ProtocolType.TypeBody; // 0x02
        bodySection[1] = FormatType.text;   // 0x02
        bodySection[2] = 0x01;           // compressed = true
        bodySection[3] = 0x00;           // reserved

        const dv = new DataView(bodySection.buffer);
        dv.setUint32(4, compressedBody.length, false); // BigEndian

        bodySection.set(compressedBody, 8);

        // Calculate total length
        const totalLen = headerSection.length + bodySection.length;

        // Define Transport Header
        const transportHeader = new Uint8Array(4);
        const dv2 = new DataView(transportHeader.buffer);
        dv2.setUint16(0, totalLen + 4, false); // BigEndian
        dv2.setUint16(2, seqNum, false);

        // Combine header, body, and transport header into one Uint8Array
        const out = new Uint8Array(transportHeader.length + totalLen);
        out.set(transportHeader, 0);
        out.set(headerSection, 4);
        out.set(bodySection, 4 + headerSection.length);

        return out;
    }


    /**
     * Decodes a binary-encoded data structure with a specific format containing headers and body sections.
     *
     * The method extracts and decodes both the header and body sections, supporting optional compression on both.
     * Returns the parsed header and body as JavaScript objects.
     *
     * @param {Uint8Array} data The binary data to decode, structured with defined header and body sections.
     * @return {{header: object, body: object}} An object containing the decoded header and body as parsed JSON objects.
     * @throws {Error} If the header or body type is invalid.
     */
    private static binmeDecode(data: Uint8Array): { header: object; body: object; type: FormatType } {
        let type = FormatType.json;
        let pos = 4; // skip transport header

        console.error(data);

        // HEADER
        const headerType = data[pos];

        // Throw error if header type is not 0x03
        //if (headerType !== ProtocolType.TypeHeader) throw new Error(`Expected header type ${ProtocolType.TypeHeader}, got ${headerType} instead`);

        const headerCompressed = data[pos + 2] === 1;
        const headerLen = data[pos + 8];
        pos += 9;

        const headerData = data.slice(pos, pos + headerLen);
        pos += headerLen;

        let headerJsonRaw = headerData;
        if (headerCompressed) {
            try {
                headerJsonRaw = inflate(headerData);
            } catch (e) {
                console.warn("Header not compressed despite flag:", e);
                headerJsonRaw = headerData;
            }
        }

        let header;

        try {
            header = JSON.parse(new TextDecoder().decode(headerJsonRaw));
        } catch (e) {
            // Do nothing.
        }

        // BODY
        const bodyType = data[pos];

        // Throw error if body type is not 0x02
        if (bodyType !== ProtocolType.TypeBody) throw new Error(`Expected body type ${ProtocolType.TypeBody}, got ${bodyType} instead`);

        const bodyCompressed = data[pos + 2] === 1;
        const bodyLen =
            (data[pos + 4] << 24) |
            (data[pos + 5] << 16) |
            (data[pos + 6] << 8) |
            data[pos + 7];

        pos += 8;

        const bodyData = data.slice(pos, pos + bodyLen);

        let bodyJsonRaw = bodyData;
        if (bodyCompressed) {
            try {
                bodyJsonRaw = inflate(bodyData);
            } catch (e) {
                console.warn("Body not compressed despite flag:", e);
                bodyJsonRaw = bodyData;
            }
        }

        let body;

        try {
            body = JSON.parse(new TextDecoder().decode(bodyJsonRaw));
        } catch (e) {
            body = bodyJsonRaw;
            type = FormatType.binary;
        }

        return {header, body, type};
    }


    /**
     * Sends an API request using the specified HTTP method, path, and request body.
     *
     * @param {"GET" | "POST"} method - The HTTP method to use for the request.
     * @param bodyObj
     * @param {string} path*/
    private static async sendApiRequest(method: "GET" | "POST", path: string, bodyObj: any = {}) {
        console.log(`Sending API Request: ${method} ${path}`);

        const [id, seq] = Wizard.nextRequestId();

        const req: APIRequest = {
            type: "httpRequest",
            id,
            timestamp: Date.now(),
            method,
            path,
            headers: {}
        };

        const headerJson = new TextEncoder().encode(JSON.stringify(req));
        const bodyJson = new TextEncoder().encode(JSON.stringify(bodyObj));

        // Encode Packet.
        const packet = Wizard.binmeEncode(headerJson, bodyJson, seq);

        // Return Promise for Callback.
        return new Promise((resolve) => {
            // Resolver registration.
            Wizard.apiResolvers.set(id, resolve);

            // Send Packet.
            // @ts-ignore
            Wizard.writeChar.writeValue(packet);
        });
    }

    /**
     * Processes a MAC address by removing all colons and converting it to lowercase.
     *
     * @param {string} mac - The MAC address to be processed, typically in the format with colons (e.g., "00:1A:2B:3C:4D:5E").
     * @return {string} The processed MAC address as a string without colons, converted to lowercase.
     */
    private static handleMAC(mac: string): string {
        return mac.replace(/:/g, "").toLowerCase();
    }

    /**
     * Updates the value of the specified input field corresponding to the given name.
     *
     * @param {string} name - The name identifier used to locate the input field.
     * @param {string} value - The value to be set for the input field.
     * @return {void} This method does not return a value.
     */
    private static setValue(name: string, value: string): void {
        $("#device-" + name).val(value);
    }

    /**
     * Sets the text content of an HTML element with a specific ID based on the provided name and value.
     *
     * @param {string} name - The identifier used to construct the HTML element's ID.
     * @param {string} value - The text content to be set for the identified HTML element.
     * @return {void} This method does not return a value.
     */
    private static setText(name: string, value: string): void {
        $("#device-" + name).text(value);
    }

    /**
     * Queries the firmware information of a device and updates the pertinent UI field.
     *
     * This method uses an API request to retrieve the firmware information for the specified device.
     * It extracts the firmware name from the response data and updates the UI accordingly.
     *
     * @return {Promise<void>} A promise that resolves when the firmware information has been retrieved and processed.
     */
    private static async queryFirmwareInfo(): Promise<void> {
        await Wizard.sendApiRequest("GET", `/api/1.0/${this.handleMAC(Wizard.deviceId)}/fw`).then(r => {
            const data = (r as any).body;

            this.setText("firmware", data.fwv);
        });
    }

    /**
     * Toggles the loading state by enabling or disabling the loader.
     *
     * @param {boolean} b - A boolean value where `true` activates the loader and `false` deactivates it.
     * @return {void} This method does not return a value.
     */
    private static setLoader(b: boolean): void {
        if (b) {
            Loading.dots();
        } else {
            Loading.remove();
        }

        console.debug(`Loader ${b ? "on" : "off"}`)
    }

    /**
     * Clears specific fields by setting their text values to a default placeholder ("-").
     * The fields affected are "firmware", "name", and "serial".
     *
     * @return {void} Does not return a value.
     */
    private static clearFields() {
        // Clear Device Info Fields.
        this.setText("firmware", "-");
        this.setText("name", "-");
        this.setText("serial", "-");
        this.setText("battery", "-");

        // Clear Module Info.
        Wizard.setModule("part", "-");
        Wizard.setModule("rev", "-");
        Wizard.setModule("vendor", "-");
        Wizard.setModule("sn", "-");
        Wizard.setModule("type", "-");
        Wizard.setModule("compliance", "-");
    }

    /**
     * Updates the text content of the page element with the specified key.
     *
     * @param {string} key - The identifier for the page element to update.
     * @param {any} value - The value to set as the text content of the page element.
     * @return {void} This method does not return a value.
     */
    private setPage(key: string, value: any): void {
        $("#page-" + key
        ).text(value);
    }

    /**
     * Updates the text content of a specified module element.
     *
     * @param {string} key - The identifier for the module element.
     * @param {any} value - The value to set as the text content of the element.
     * @return {void}
     */
    private static setModule(key: string, value: any): void {
        $("#sfp-" + key
        ).text(value);
    }

    /**
     * Fetches and processes XSFP module details from the API and updates the module data.
     * Makes an asynchronous API request to retrieve module details and updates the corresponding fields in the Wizard.
     * Displays a success notification if the request is successful or a warning if it fails.
     *
     * @return {Promise<void>} A promise that resolves when the XSFP details are successfully retrieved and processed.
     */
    private async readXSFP() {
        await Wizard.sendApiRequest("GET", `/api/1.0/${Wizard.handleMAC(Wizard.deviceId)}/xsfp/module/details`).then((r) => {
            const data = (r as any).body;
            const header = (r as any).header;

            // Check if API Response contains Status Code.
            if (header.statusCode !== undefined && header.statusCode == 200) {
                /**
                 * {
                 *   "partNumber": "SFP-10GLR-31",
                 *   "rev": "A",
                 *   "vendor": "S2301169979",
                 *   "sn": "S2301169979",
                 *   "type": "sfp",
                 *   "compliance": "10G BASE-LR"
                 * }
                 */

                Wizard.setModule("part", data.partNumber);
                Wizard.setModule("rev", data.rev);
                Wizard.setModule("vendor", data.vendor);
                Wizard.setModule("sn", data.sn);
                Wizard.setModule("type", data.type);
                Wizard.setModule("compliance", data.compliance);

                // Print Success Toast.
                Notify.success(i18next.t("common:module-message"));
            } else {
                // Print Warning Toast.
                Notify.warning(i18next.t("common:module-error"));
            }
        });
    }

    /**
     * Initiates and handles the XSFP snapshot synchronization process.
     * This method cancels any ongoing synchronization, requests a new snapshot transmission,
     * and sends the snapshot data if the transmission is ready.
     *
     * @return {Promise<any>} A promise resolving to the result of the API request for synchronization data.
     */
    private async writeXSFP() {
        return await this.cancelSync().then(async (r) => {
            return await this.readFile().then(async (eeprom) => {
                const size = eeprom?.length;

                // Check for the correct File Type.
                if (eeprom !== null && (size == 512 || size == 640)) {
                    // Request new Snapshot Transmission.
                    return await Wizard.sendApiRequest("POST", `/api/1.0/${Wizard.handleMAC(Wizard.deviceId)}/xsfp/sync/start`, {size: size}).then(async (r) => {
                        const data = (r as any).header;

                        // Check if Snapshot is Ready to be sent.
                        if (data.statusCode == 200) {
                            // Send Snapshot.
                            return await Wizard.sendApiRequestRaw("POST", `/api/1.0/${Wizard.handleMAC(Wizard.deviceId)}/xsfp/sync/data`, eeprom);
                        } else {
                            // Notify Error.
                            Notify.failure(i18next.t("common:eeprom-sync-error"));
                        }
                    });
                } else {
                    // Notify Error.
                    Notify.failure(i18next.t("common:eeprom-file-error"));

                    // Throw Error.
                    throw new Error("Invalid File Type");
                }
            });
        });
    }

    /**
     * Initiates the process of reading data from a module and saving it.
     *
     * The method handles notifications for successful read and save operations.
     * It ensures the presence of necessary data properties before starting the data stream process.
     *
     * @return {Promise<void*/
    private async saveXSFP() {
        return await this.cancelSync().then(async (r) => {
            // Start Reading of Module.
            return await this.startReadingProcess().then(async (r) => {
                const data = (r as any).body;

                if (data.size == undefined || data.chunk == undefined) {
                    Notify.warning(i18next.t("common:module-error"));
                    //throw new Error("size or chunk required");
                } else {
                    // Show Read Notification.
                    Notify.info(i18next.t("common:module-read"));

                    // Print Debug Message.
                    console.log(`Received size: ${data.size} and chunk: ${data.chunk}.`);

                    // Get Data from Device.
                    await this.startStreamProcess(0, (data.size = 0 ? 512 : data.size)).then((r) => {
                        // Download SFP File to Device.
                        this.downloadStream(r);

                        // Show Saved Notification.
                        Notify.success(i18next.t("common:module-saved"));
                    });
                }
            });
        });
    }

    /**
     * Initiates the reading process by sending a GET request to the specified API endpoint
     * with the formatted MAC address.
     *
     * @return {Promise<Object>} A promise that resolves to the response of the API request.
     */
    private async startReadingProcess() {
        return await Wizard.sendApiRequest("GET", `/api/1.0/${Wizard.handleMAC(Wizard.deviceId)}/xsfp/module/start`);
    }

    /**
     * Initiates a stream process by sending an API request to retrieve data.
     *
     * @param {number} offset - The starting point or position for the data retrieval.
     * @param {*} size - The size or amount of data to be retrieved.
     * @return {Promise<any>} A promise that resolves with the response from the API request.
     */
    private async startStreamProcess(offset: number, size: any): Promise<any> {
        return await Wizard.sendApiRequest("GET", `/api/1.0/${Wizard.handleMAC(Wizard.deviceId)}/xsfp/module/data`, {
            offset: offset,
            chunk: size
        });
    }

    /**
     * Displays a notification indicating that the browser does not support BLE (Bluetooth Low Energy).
     *
     * Uses the Notify.failure method to show a failure message with a localized string from i18next.
     *
     * @return {void} This method does not return any value.
     */
    private static wrongBrowserBLESupport(): void {
        Notify.failure(i18next.t("common:browser-ble-support"));
    }

    /**
     * Appends the provided string as a formatted code block to the log container.
     *
     * @param {string} s - The string to be logged in the log container.
     * @return {void} This method does not return a value.
     */
    private static setLog(s: string, legacy: boolean) {
        $("#log-container").append(`<div title="${legacy ? i18next.t("common:api-legacy") : i18next.t("common:api-new")}" class="log"><a>${this.formatTimeHHMMSS()} - </a><code>${s}</code></div>`);

        if (this.hasAutoscroll()) {
            Wizard.scrollLogToBottom();
        }
    }

    /**
     * Formats a given Date object into a time string in the format HH:mm:ss.
     * If no date is provided, the current date and time are used.
     */
    private static formatTimeHHMMSS(date = new Date()) {
        const pad2 = (n: any) => String(n).padStart(2, "0");
        const HH = pad2(date.getHours());
        const mm = pad2(date.getMinutes());
        const ss = pad2(date.getSeconds());
        return `${HH}:${mm}:${ss}`;
    }

    /**
     * Updates the application locale by setting page texts and button labels to the translations
     * of the currently selected language. It also clears the input fields on the interface.
     *
     * @return {void} Does not return any value.
     */
    private replaceLocale(): void {
        console.log(`Locale set to ${i18next.language}`);

        // Set Page Texts.
        this.setPage("info", i18next.t("common:info"));
        this.setPage("affiliate", i18next.t("common:affiliate"));
        this.setPage("firmware", i18next.t("common:firmware"));
        this.setPage("name", i18next.t("common:name"));
        this.setPage("serial", i18next.t("common:serial"));
        this.setPage("battery", i18next.t("common:battery"));

        // Replace the default button text with localized versions.
        Wizard.connectButton.text(i18next.t("common:connect"));
        Wizard.poweroffButton.text(i18next.t("common:shutdown"));
        Wizard.chargeControlButton.text(i18next.t("common:charge"));
        Wizard.rebootButton.text(i18next.t("common:reboot"));
        Wizard.readButton.text(i18next.t("common:read"));
        Wizard.saveButton.text(i18next.t("common:save"));
        Wizard.writeButton.text(i18next.t("common:write"));
        Wizard.nameButton.text(i18next.t("common:name-title"));

        $("#autoscroll-label"
        ).text(i18next.t("common:autoscroll"));

        // Clear Fields.
        Wizard.clearFields();
    }


    /**
     * Scrolls the log container to the bottom of its content, ensuring the latest log entries are visible.
     *
     * @return {void} This method does not return a value.
     */
    private static scrollLogToBottom(): void {
        $("#log-container").scrollTop($("#log-container")[0].scrollHeight);
    }

    /**
     * Checks whether the autoscroll option is enabled by verifying the state of the autoscroll switch.
     *
     * @return {boolean} Returns true if the autoscroll switch is checked, otherwise false.
     */
    private static hasAutoscroll(): boolean {
        return Wizard.autoscrollSwitch.is(":checked");
    }

    /**
     * Determines whether the given data is predominantly text-based.
     * It analyzes the byte content and calculates the ratio of textual characters.
     * If more than 90% of the data consists of text-compatible characters, it returns true.
     *
     * @param {Uint8Array} data - The byte array to analyze for text content.
     * @return {boolean} Returns true if the data is predominantly text-based; otherwise, false.
     */
    private static isTextData(data: Uint8Array):
        boolean {
        if (data.length === 0) return false;

        let textChars = 0;

        for (const b of data) {
            if (
                (b >= 0x20 && b <= 0x7e) || // printable ASCII
                b === 0x0a || b === 0x0d || b === 0x09 || // \n \r \t
                b >= 0x80 // UTF-8 continuation or multibyte
            ) {
                textChars++;
            }
        }

        return textChars / data.length > 0.9;
    }

    /**
     * Cancels the ongoing synchronization process by sending a POST request to the specified API endpoint.
     *
     * @return {Promise<any>} A promise that resolves with the response of the API request.
     */
    private async cancelSync(): Promise<any> {
        return await Wizard.sendApiRequest("POST", `/api/1.0/${Wizard.handleMAC(Wizard.deviceId)}/xsfp/sync/cancel`);
    }

    /**
     * Downloads a binary data stream as a file.
     *
     * @param {Object} r - The response object containing the binary stream data.
     * @param type
     * @param filename
     * @param {any} r.body - The binary data to be downloaded.
     * @return {void} This method does not return a value, it triggers a file download.
     */
    private downloadStream(r: any, type: string = "octet/stream", filename: string | null = null) {
        // Create a Blob from the binary data.
        const blob = new Blob([r.body], {type: "octet/stream"});

        // Create a link pointing to the ObjectURL containing the blob.
        const triggerDownload = document.createElement('a');

        // Create Temp URL for Blob.
        const tmpUrl = window.URL.createObjectURL(blob);

        // Set the download attribute of the link from Blob.
        triggerDownload.href = tmpUrl;

        if (filename === null) {
            // Parse Meta from Binary.
            const meta = Wizard.fetchEEPROM(r.body)

            // Set the file name of the download link.
            triggerDownload.download = meta.vendor + "-" + meta.part + ".uieeprom";
        } else {
            triggerDownload.download = filename;
        }

        // Append to Body.
        document.body.appendChild(triggerDownload);

        // Exccute Download.
        triggerDownload.click();

        // Remove from Body.
        triggerDownload.remove();

        // Revoke Object URL.
        window.URL.revokeObjectURL(tmpUrl);

        // Print Debug Message.
        console.log(`Download completed for ${tmpUrl}`)
    }

    /**
     * Decodes and extracts vendor, serial number, and part information from the given EEPROM data.
     *
     * @param {Uint8Array} data - The raw EEPROM data to be parsed.
     * @return {Object} An object containing the extracted information with the following keys:
     *                  - vendor: The vendor name as a string.
     *                  - sn: The serial number as a string.
     *                  - part: The part identifier as a string.
     *                  If the data length is less than 96 bytes, returns default values with "-" for all keys.
     */
    private static fetchEEPROM(data: Uint8Array): { vendor: string; sn: string; part: string } {
        if (data.length < 96) {
            return {vendor: "-", sn: "-", part: "-"};
        }

        const vendor = new TextDecoder().decode(data.slice(20, 36)).trim();
        const pn = new TextDecoder().decode(data.slice(40, 56)).trim();
        const sn = new TextDecoder().decode(data.slice(68, 84)).trim();

        return {vendor: vendor, sn: sn, part: pn};
    }

    /**
     * Asynchronously changes the name for the device associated with the current instance.
     * Sends a POST request to the corresponding API endpoint with the new name.
     *
     * @param {string} data - The new name to be set for the device.
     * @return {Promise<any>} A promise resolving with the response of the API request.
     */
    private async changeName(data: string): Promise<any> {
        return await Wizard.sendApiRequest("POST", `/api/1.0/${Wizard.handleMAC(Wizard.deviceId)}/name`, {name: data});
    }


    /**
     * Checks whether an EEPROM file has been selected for upload in the wizard.
     *
     * @return {boolean} Returns true if an EEPROM file is selected; otherwise, false.
     */
    private checkEEPROMSelection() {
        // @ts-ignore
        return Wizard.isFileSelected(Wizard.eepromUpload);
    }

    /**
     * Checks if a file is selected in the provided input element.
     *
     * @return A boolean value, true if a file is selected, false otherwise.
     * @param input
     */
    private static isFileSelected(input: JQuery<HTMLInputElement>): boolean {
        const el: HTMLInputElement = input[0];

        return !!(el && el.files && el.files.length > 0);
    }

    /**
     * Sends a raw API request via BLE (Bluetooth Low Energy), encoded as a binary packet.
     *
     * @param {"GET" | "POST"} method - The HTTP method to use for the request.
     * @param {string} path - The endpoint path for the request.
     * @param {Uint8Array} rawBody - The raw binary content of the request body.
     * @param {number} [timeoutMs=60] - The timeout in milliseconds to await a response, defaults to 60ms.
     * @return {Promise<any>} A promise that resolves when a response to the request is received or rejects if an error occurs or the timeout is reached.
     */
    private static async sendApiRequestRaw(
        method: "GET" | "POST",
        path: string,
        rawBody: Uint8Array,
        timeoutMs: number = 6000
    ): Promise<any> {
        // Print Debug Message.
        console.log(`Sending RAW API Request: ${method} ${path}`);

        // Get new ID.
        const [id, seq] = Wizard.nextRequestId();

        // Prepare Request Frame.
        const req: APIRequest = {
            type: "httpRequest",
            id,
            timestamp: Date.now(),
            method,
            path,
            headers: {}
        };

        // Prepare Request Header.
        const headerJson = new TextEncoder().encode(JSON.stringify(req));

        // Print Debug Message.
        console.log(`JSON header:`, JSON.stringify(req));
        console.log(`Binary body: ${rawBody.length} bytes`);

        // Encode binme RAW packet
        const packet = Wizard.binmeEncodeRawBody(headerJson, rawBody, seq);
        console.log(`Total encoded packet size: ${packet.length} bytes`);

        // Register resolver BEFORE sending
        const promise = new Promise((resolve, reject) => {
            Wizard.apiResolvers.set(id, resolve);

            // Timeout handling
            setTimeout(() => {
                if (Wizard.apiResolvers.has(id)) {
                    Wizard.apiResolvers.delete(id);
                    reject(new Error(`Timeout waiting for response to request ${id}`));
                }
            }, timeoutMs);
        });

        // BLE fragmentation
        const bleMTU = 244;

        // Send Chunks.
        for (let offset = 0; offset < packet.length; offset += bleMTU) {
            const end = Math.min(offset + bleMTU, packet.length);
            const chunk = packet.slice(offset, end);

            console.log(`Writing BLE fragment ${offset}-${end} (${chunk.length} bytes)`);

            const maxRetries = 5;
            let lastErr: any = null;

            for (let attempt = 0; attempt <= maxRetries; attempt++) {
                try {
                    // Web Bluetooth writeWithoutResponse
                    // @ts-ignore
                    await Wizard.writeChar.writeValueWithoutResponse(chunk);
                    lastErr = null;
                    break;
                } catch (err) {
                    lastErr = err;
                    if (attempt < maxRetries) {
                        const backoff = 20 * (1 << attempt); // 20, 40, 80, 160, 320ms
                        console.warn(
                            `BLE write failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${backoff}ms`,
                            err
                        );
                        await new Promise(res => setTimeout(res, backoff));
                    }
                }
            }

            // Check for errors
            if (lastErr) {
                throw new Error(
                    `Failed to write BLE fragment at offset ${offset} after ${maxRetries + 1} attempts: ${lastErr}`
                );
            }
        }

        // Return promise that resolves when notification arrives
        return promise;
    }


    /**
     * Reads and processes a file selected through an input element with the ID "sfp-file".
     *
     * @return {Promise<Uint8Array | null>} A promise that resolves to a Uint8Array containing the file's data,
     * or null if no file is selected or the input element is not found.
     */
    private async readFile() {
        const input = document.getElementById("sfp-file") as HTMLInputElement | null;
        const file = input?.files?.[0];
        if (!file) return null;

        return new Uint8Array(await file.arrayBuffer());
    }

    /**
     * Retrieves logs from a remote API endpoint. The method initiates the log retrieval process, processes the response
     * headers and body, and streams log data in chunks for further processing or downloading. In case of a failure, it
     * handles the error response appropriately and provides debugging messages.
     *
     * @return {void} This method does not return a value. It performs asynchronous operations to retrieve and handle logs.
     */
    private retrieveLogs(): void {
        Wizard.sendApiRequest("GET", `/api/1.0/${Wizard.handleMAC(Wizard.deviceId)}/sif/start`).then(async (r) => {
            const header = (r as any).header;

            if (header != undefined && header.statusCode == 200) {
                // Notify Info.
                Notify.info(i18next.t("common:sif-start"));

                const body = (r as any).body;
                /**
                 * {
                 *     "status": "start",
                 *     "offset": 0,
                 *     "chunk": 4096,
                 *     "size": 16384
                 * }
                 */
                // Print Debug Message.
                console.log(`Received size: ${header.size} and chunk: ${header.chunk}.`);

                // Store offset.
                let offset = 0;

                // Store Tar Chunks.
                let tarChunks: any[] = [];

                // Loop until all data is retrieved.
                while (offset < body.size) {
                    let remaining = body.size - offset

                    // Return the smallest number as chunk.
                    let chunk = Math.min(remaining, body.chunk);

                    // Start Data Chunk Stream.
                    await Wizard.sendApiRequest("GET", `/api/1.0/${Wizard.handleMAC(Wizard.deviceId)}/sif/data`, {
                        status: "continue",
                        offset: offset,
                        chunk: chunk
                    }).then((data) => {
                        // @ts-ignore
                        if (data.type == FormatType.binary && data.body != undefined) {
                            console.log(`Received Data ${offset} of ${body.size}.`);

                            // Push Chunk into Buffer.
                            // @ts-ignore
                            tarChunks.push(data.body);

                            // Increment Offset.
                            // @ts-ignore
                            offset += data.body.byteLength;
                        } else {
                            // @ts-ignore
                            console.error(`Invalid response from wizard. ${data.type} ${data.body}`);
                        }
                    });
                }

                // Combine Chunks.
                const binary = this.combineChunks(tarChunks);

                // Unarchive Text.
                // @ts-ignore
                Wizard.extractSyslog(binary).then(s => {
                    // Download Log File.
                    this.downloadStream({body: s}, "text/plain", "sif.log");

                    // Notify Success.
                    Notify.success(i18next.t("common:sif-finish"));
                });

            } else {
                // Notify Error.
                Notify.failure(i18next.t("common:sif-error-start"));
            }
        });
    }


    /**
     * Extracts the content of the "syslog" file from a given tar archive.
     *
     * @param {Uint8Array} archive - The tar archive as a Uint8Array.
     * @return {Promise<string|null>} A promise that resolves to the contents of the "syslog" file as a string if found, or null if not found.
     */
    private static async extractSyslog(archive: Uint8Array): Promise<string | null> {
        // @ts-ignore
        const files = await untar(archive.buffer);

        for (const file of files) {
            if (file.name === "syslog") {
                return new TextDecoder().decode(file.buffer);
            }
        }

        return null;
    }


    /**
     * Combines an array of chunks into a single Uint8Array.
     * @param chunks
     **/
    private combineChunks(chunks: any) {
        const total = chunks.reduce((s: any, c: any) => s + c.length, 0);
        const out = new Uint8Array(total);

        let offset = 0;
        for (const c of chunks) {
            out.set(c, offset);
            offset += c.length;
        }

        return out;
    }

    /**
     * Registers the Electron bridge to establish communication between the frontend and backend via the Electron API.
     * Specifically, this method sets up an IPC handler for Bluetooth device-related events if the `electronAPI` object is present.
     *
     * @return {void} This method does not return a value.
     */
    private registerElectronBridge(): void {
        console.log("Registering Electron Bridge if exists.");

        // @ts-ignore
        console.log(window.electronAPI);

        // @ts-ignore
        if (window.electronAPI !== undefined) {
            console.log("Registering Electron IPC handler...");

            // Show Scan Popup.
            // @ts-ignore
            window.electronAPI?.startScan(() => {
                // Show Device Selector.
                this.showDeviceSelector();
            });

            // @ts-ignore
            window.electronAPI?.handleBluetoothDevices((_evt: IpcRendererEvent, value: ElectronBluetoothDevice[]) => {
                // Update Device List.
                this.updateDevice(value);
            });
        } else {
            console.log("Electron API not found.");
        }
    }


    /**
     * Updates the device list with the provided array of ElectronBluetoothDevice objects.
     *
     * @param {ElectronBluetoothDevice[]} value - An array of ElectronBluetoothDevice objects to update the device list.
     * @return {void} This method does not return a value.
     */
    private updateDevice(value: any[]): void {
        /**
         * [
         *     {
         *         "deviceName": "Unbekanntes oder nicht unterstütztes Gerät (21:9C:CD:52:35:02)",
         *         "deviceId": "21:9C:CD:52:35:02"
         *     },
         *     {
         *         "deviceName": "Super Drive",
         *         "deviceId": "B4:37:D1:09:2B:C8"
         *     }
         * ]
         */
        // Remove old devices if not in the list.
        $("#electron-device-selector").children("option").each((id, element) => {
            if ($(element).attr("id") !== "select-dummy") {
                // Remove Device if not in List.
                value.find(v => v.deviceId === $(element).attr("value")) || $(element).remove() && console.log("Removing Device: ", $(element).attr("value"));
            }
        });

        // Add new Devices.
        value.forEach(v => {
            console.log(`New Device found: ${v.deviceName} (${v.deviceId})`);

            if ($("#electron-device-selector").children(`option[value="${v.deviceId}"]`).length === 0) {
                $("#electron-device-selector").append(`<option value="${v.deviceId}">${v.deviceName}</option>`);
            }
        });
    }

    /**
     * Displays the device selector popup if it is not already open.
     * The popup allows the user to select a device from an*/
    private showDeviceSelector() {
        if (!Wizard.deviceSelectorOpen) {
            console.log("Scan Popup Opened!");

            // Toggle Device Selector State.
            Wizard.deviceSelectorOpen = true;

            // Prepare Selector.
            const data = `<select id="electron-device-selector" class="form-select"><option id="select-dummy" value="0">Select Device</option></select>`;

            // Show Confirm Dialog.
            Confirm.show(i18next.t("common:device-select"), data, i18next.t("common:yes"), i18next.t("common:no"), () => {
                // Print Debug Message.
                console.log("Device selected!");
            }, () => {
                // Print Debug Message.
                console.log("Cancel Device Selection.");
            }, {
                plainText: false
            });
        }
    }
}

new Wizard();