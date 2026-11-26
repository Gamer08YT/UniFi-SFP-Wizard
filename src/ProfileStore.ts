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

    // Raw sender injected by Wizard.ts (for binary upload bodies).
    private static senderRaw: ((method: "GET" | "POST", path: string, rawBody: Uint8Array) => Promise<any>) | null = null;

    // Last fetched profile list and the device's preferred chunk size.
    private static profiles: StoredProfile[] = [];
    private static chunkSize: number = 512;

    /**
     * Wires the store to the Wizard's BLE API layer.
     *
     * @param sender - Callback issuing an API request and resolving to the decoded response.
     * @param macProvider - Callback returning the MAC address of the connected device.
     */
    public static bind(sender: (method: "GET" | "POST", path: string, bodyObj?: any) => Promise<any>, macProvider: () => string, senderRaw?: (method: "GET" | "POST", path: string, rawBody: Uint8Array) => Promise<any>): void {
        ProfileStore.sender = sender;
        ProfileStore.macProvider = macProvider;
        ProfileStore.senderRaw = senderRaw ?? null;
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

    /**
     * Uploads an EEPROM snapshot into the Wizard's internal Profile Store.
     *
     * The upload flow mirrors the module write flow (start with the snapshot
     * size, then send the bytes as a raw request body). Unlike the list/read
     * endpoints, the favorites upload handlers have only been inferred from
     * the 1.1.8 firmware image, not confirmed on a device yet - callers should
     * be prepared for this to fail on some firmware versions.
     *
     * @param {Uint8Array} data - The EEPROM snapshot to store (SFP 512 or QSFP 640 bytes).
     * @return {Promise<void>} A promise that resolves once the snapshot has been sent.
     */
    public static async upload(data: Uint8Array): Promise<void> {
        const sender = ProfileStore.sender;
        const senderRaw = ProfileStore.senderRaw;

        if (sender === null || ProfileStore.macProvider === null || senderRaw === null) {
            throw new Error("ProfileStore is not bound to a Wizard.");
        }

        // Abort any stale upload session (best effort: a firmware without the
        // favorites handlers fails here and the error is ignored).
        try {
            await sender("POST", ProfileStore.path("/xsfp/favorites/cancel"));
        } catch (e) {
            console.debug("favorites/cancel before upload failed (ignorable).", e);
        }

        // Start the upload session with the snapshot size.
        const startResp = await sender("POST", ProfileStore.path("/xsfp/favorites/start"), {size: data.length});
        const startBody = (startResp as any).body;

        if (startBody && startBody.statusCode !== undefined && startBody.statusCode !== 200) {
            throw new Error(`favorites/start failed with status ${startBody.statusCode}.`);
        }

        // Send the snapshot bytes as a raw request body (same pattern as /xsfp/sync/data).
        const dataResp = await senderRaw("POST", ProfileStore.path("/xsfp/favorites/data"), data);
        const header = (dataResp as any).header;

        if (header && header.statusCode !== undefined && header.statusCode !== 200) {
            throw new Error(`favorites/data failed with status ${header.statusCode}.`);
        }
    }

    /**
     * Builds the full API path for a favorites endpoint.
     */
    private static path(suffix: string): string {
        const macProvider = ProfileStore.macProvider;

        return `/api/1.0/${macProvider}${suffix}`;
    }
}
