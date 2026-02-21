import $ from "jquery";
import i18next from "i18next";
import * as enCommon from "./language/en-US.json";
import {GATTUUID} from "./GATTUUID";
import {APIRequest} from "./APIRequest";
import {Confirm, Notify} from "notiflix";
import {deflate, inflate} from "pako";
import {Secret} from "./Secret";


class Wizard {
    // Normaly it's UACC-SFP-Wizard don't know why Edge display it as Sfp Wizard.
    private static wizardSSID = "Sfp Wizard";

    // Store DOM Element Intances.
    private static connectButton: JQuery<HTMLElement>;
    private static poweroffButton: JQuery<HTMLElement>;
    private static chargeControlButton: JQuery<HTMLElement>;

    // Store GATT Characteristic Instances.
    private static infoChar: BluetoothRemoteGATTCharacteristic;
    private static apiNotifyChar: BluetoothRemoteGATTCharacteristic;
    private static writeChar: BluetoothRemoteGATTCharacteristic;
    private static notifyChar: BluetoothRemoteGATTCharacteristic;

    // Store BLE Device Instance.
    private static device: BluetoothDevice;
    private static pendingResolver: ((data: Uint8Array) => void) | null = null;
    private static service: BluetoothRemoteGATTService;

    private static requestCounter = 0;


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

        console.log(`Set connected state to ${state}`)
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
                        Wizard.setConnectedDevice(device).then(r => {
                            // Set Connection State.
                            Wizard.setConnected(true);
                        });
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

        // Send Connected Notification.
        Notify.success(i18next.t("common:connected"));

        //const mac = Wizard.device.id.replace(/:/g, "").toUpperCase();
        await Wizard.sendApiRequest("GET", `/api/1.0/${this.handleMAC(Secret.Mac)}`);

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

            // @ts-ignore
            this.device = undefined;

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

            console.log(`Notify Data: ${buf.toString()}`);


            const decoded = Wizard.binmeDecode(buf);

            console.log(`Notify Data:`);
            console.log(decoded);
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

        headerSection[0] = 0x03;
        headerSection[1] = 0x01;
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

        bodySection[0] = 0x02;
        bodySection[1] = 0x01;
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

        console.log(out);

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
    private static binmeDecode(data: Uint8Array) {
        let pos = 4; // skip transport header

        // HEADER
        const headerType = data[pos];
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

        const header = JSON.parse(new TextDecoder().decode(headerJsonRaw));

        // BODY
        const bodyType = data[pos];
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

        const body = JSON.parse(new TextDecoder().decode(bodyJsonRaw));

        return {header, body};
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

        const packet = Wizard.binmeEncode(headerJson, bodyJson, seq);

        // @ts-ignore
        await Wizard.writeChar.writeValue(packet);
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
}

new

Wizard();