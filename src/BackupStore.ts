/**
 * BackupStore
 *
 * A local, offline-first library of EEPROM backups, keyed by module serial number.
 * Backed by IndexedDB, which (unlike the File System Access API) works identically
 * on desktop and mobile browsers, since there is no reliable cross-platform way for
 * a web app to write into a real OS folder on a phone.
 *
 * This exists to support two things:
 *  1. A searchable "My Backups" source in the write flow (an alternative to Local File
 *     / Repository), backed entirely by modules this browser has actually read before.
 *  2. A write-time safety gate: Wizard.ts checks hasBackupForSerial() before allowing
 *     a write, so a module can't be overwritten without a backup existing first.
 */

export interface BackupRecord {
    id?: number;
    sn: string;
    partNumber: string;
    vendor: string;
    type: string;
    size: number;
    savedAt: number;
    data: Uint8Array;
}

export class BackupStore {
    private static readonly DB_NAME = "sfp-wizard-backups";
    private static readonly DB_VERSION = 1;
    private static readonly STORE_NAME = "eeproms";

    private static dbPromise: Promise<IDBDatabase> | null = null;

    private static open(): Promise<IDBDatabase> {
        if (!BackupStore.dbPromise) {
            BackupStore.dbPromise = new Promise((resolve, reject) => {
                const request = indexedDB.open(BackupStore.DB_NAME, BackupStore.DB_VERSION);

                request.onupgradeneeded = () => {
                    const db = request.result;

                    if (!db.objectStoreNames.contains(BackupStore.STORE_NAME)) {
                        const store = db.createObjectStore(BackupStore.STORE_NAME, {
                            keyPath: "id",
                            autoIncrement: true
                        });

                        store.createIndex("sn", "sn", {unique: false});
                        store.createIndex("savedAt", "savedAt", {unique: false});
                    }
                };

                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        }

        return BackupStore.dbPromise;
    }

    /**
     * Persists a module EEPROM backup. Always adds a new entry (never overwrites) so
     * multiple backups of the same serial over time are all kept, newest first.
     */
    public static async save(record: Omit<BackupRecord, "id" | "savedAt">): Promise<number> {
        const db = await BackupStore.open();

        return new Promise((resolve, reject) => {
            const tx = db.transaction(BackupStore.STORE_NAME, "readwrite");
            const store = tx.objectStore(BackupStore.STORE_NAME);

            const request = store.add({...record, savedAt: Date.now()});

            request.onsuccess = () => resolve(request.result as number);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Lists all stored backups, newest first. These are small (512/640-byte) records,
     * so returning everything and filtering client-side is cheap even with a large library.
     */
    public static async list(): Promise<BackupRecord[]> {
        const db = await BackupStore.open();

        return new Promise((resolve, reject) => {
            const tx = db.transaction(BackupStore.STORE_NAME, "readonly");
            const store = tx.objectStore(BackupStore.STORE_NAME);
            const request = store.getAll();

            request.onsuccess = () => {
                const results = (request.result as BackupRecord[]).sort((a, b) => b.savedAt - a.savedAt);
                resolve(results);
            };
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Case-insensitive search across serial number, part number, and vendor.
     */
    public static async search(term: string): Promise<BackupRecord[]> {
        const all = await BackupStore.list();

        if (!term.trim()) return all;

        const needle = term.trim().toLowerCase();

        return all.filter(r =>
            r.sn.toLowerCase().includes(needle) ||
            r.partNumber.toLowerCase().includes(needle) ||
            r.vendor.toLowerCase().includes(needle)
        );
    }

    /**
     * Returns true if at least one backup exists for the given serial number.
     * Used as the write-time safety gate.
     */
    public static async hasBackupForSerial(sn: string): Promise<boolean> {
        if (!sn || sn === "-") return false;

        const all = await BackupStore.list();
        return all.some(r => r.sn === sn);
    }

    public static async get(id: number): Promise<BackupRecord | undefined> {
        const db = await BackupStore.open();

        return new Promise((resolve, reject) => {
            const tx = db.transaction(BackupStore.STORE_NAME, "readonly");
            const store = tx.objectStore(BackupStore.STORE_NAME);
            const request = store.get(id);

            request.onsuccess = () => resolve(request.result as BackupRecord | undefined);
            request.onerror = () => reject(request.error);
        });
    }

    public static async delete(id: number): Promise<void> {
        const db = await BackupStore.open();

        return new Promise((resolve, reject) => {
            const tx = db.transaction(BackupStore.STORE_NAME, "readwrite");
            const store = tx.objectStore(BackupStore.STORE_NAME);
            const request = store.delete(id);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }
}
