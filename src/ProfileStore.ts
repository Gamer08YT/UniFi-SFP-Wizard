/**
 * ProfileStore
 *
 * Access to the Wizard's on-device profile storage (shown on the device as
 * "SFP Profile Store", internally called "favorites"). This storage was added
 * in firmware 1.1.8: the Wizard can keep full module EEPROM snapshots on its
 * internal storage, and this app can list and download them again.
 *
 * API (confirmed on a device running v1.1.8):
 *   GET /api/1.0/{mac}/xsfp/favorites/start
 *        -> {"chunk": 640, "props": [{"type": "sfp", "partNumber": "SFP-GE-TA-C", "sn": "TA1711100020", "size": 512}]}
 *   GET /api/1.0/{mac}/xsfp/favorites/data  {index, offset, chunk}
 *        -> raw EEPROM bytes as a binary response body, same layout as a .uieeprom file
 *
 * Uploading or deleting stored profiles from the app is not implemented yet:
 * the corresponding firmware endpoints have not been confirmed. Use the
 * Wizard's own "Copy & Save Profile" to add profiles for now.
 */

export interface StoredProfile {
    type: string;        // "sfp" or "qsfp"
    partNumber: string;
    sn: string;
    size: number;
}

export class ProfileStore {
    // Sender injected by Wizard.ts, so the BLE internals stay in one place.
    private static sender: ((method: "GET" | "POST", path: string, bodyObj?: any) => Promise<any>) | null = null;

    // MAC address provider injected by Wizard.ts.
    private static macProvider: (() => string) | null = null;

    // Last fetched profile list and the device's preferred chunk size.
    private static profiles: StoredProfile[] = [];
    private static chunkSize: number = 512;

    /**
     * Wires the store to the Wizard's BLE API layer.
     *
     * @param sender - Callback issuing an API request and resolving to the decoded response.
     * @param macProvider - Callback returning the MAC address of the connected device.
     */
    public static bind(sender: (method: "GET" | "POST", path: string, bodyObj?: any) => Promise<any>, macProvider: () => string): void {
        ProfileStore.sender = sender;
        ProfileStore.macProvider = macProvider;
    }

    /**
     * Clears the cached profile list (used when the device disconnects).
     */
    public static reset(): void {
        ProfileStore.profiles = [];
    }

    /**
     * Fetches the list of profiles stored on the Wizard.
     *
     * @return {Promise<StoredProfile[]>} The profiles stored on the device.
     */
    public static async list(): Promise<StoredProfile[]> {
        const sender = ProfileStore.sender;

        if (sender === null || ProfileStore.macProvider === null) {
            throw new Error("ProfileStore is not bound to a Wizard.");
        }

        const r = await sender("GET", `/api/1.0/${ProfileStore.macProvider()}/xsfp/favorites/start`);
        const data = (r as any).body ?? {};

        ProfileStore.chunkSize = typeof data.chunk === "number" && data.chunk > 0 ? data.chunk : 512;
        ProfileStore.profiles = Array.isArray(data.props) ? data.props : [];

        return ProfileStore.profiles;
    }

    /**
     * Reads the full EEPROM snapshot of the stored profile at the given index.
     * The firmware serves the snapshot in chunks of binary response bodies.
     *
     * @param {number} index - Index of the stored profile, as returned by list().
     * @return {Promise<Uint8Array>} The raw EEPROM bytes of the stored profile.
     */
    public static async read(index: number): Promise<Uint8Array> {
        const sender = ProfileStore.sender;

        if (sender === null || ProfileStore.macProvider === null) {
            throw new Error("ProfileStore is not bound to a Wizard.");
        }

        const profile = ProfileStore.profiles[index];

        if (!profile || typeof profile.size !== "number") {
            throw new Error(`Stored profile index ${index} is out of range.`);
        }

        const parts: Uint8Array[] = [];
        let offset = 0;

        while (offset < profile.size) {
            const chunk = Math.min(ProfileStore.chunkSize, profile.size - offset);

            const r = await sender("GET", `/api/1.0/${ProfileStore.macProvider()}/xsfp/favorites/data`, {
                index: index,
                offset: offset,
                chunk: chunk
            });

            const body = (r as any).body;

            if (!(body instanceof Uint8Array) || body.length === 0) {
                throw new Error(`Unexpected response while reading stored profile ${index} at offset ${offset}.`);
            }

            parts.push(body);
            offset += body.length;
        }

        // Concatenate the chunks into a single EEPROM image.
        const total = parts.reduce((n, p) => n + p.length, 0);
        const data = new Uint8Array(total);

        let position = 0;
        for (const part of parts) {
            data.set(part, position);
            position += part.length;
        }

        return data;
    }
}
