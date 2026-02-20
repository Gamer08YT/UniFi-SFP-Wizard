/**
 * Interface representing a set of GATT (Generic Attribute Profile) UUIDs used in Bluetooth communication.
 *
 * This interface provides predefined constant UUIDs for various GATT operations such as service, write, and notify,
 * allowing application developers to consistently reference these UUIDs when interacting with a GATT server.
 */
export class GATTUUID {
    // Primary GATT Service UUID.
    public static Service = "8E60F02E-F699-4865-B83F-F40501752184";

    // Write GATT UUID.
    public static WriteChar = "9280F26C-A56F-43EA-B769-D5D732E1AC67";

    // Notify GATT UUID (Read).
    public static NotifyChar = "DC272A22-43F2-416B-8FA5-63A071542FAC";

    // Notify GATT UUID (Notify).
    public static SecondaryNotify = "D587C47F-AC6E-4388-A31C-E6CD380BA043";

    // Secondary Service GATT UUID.
    // Since Version 1.1.1
    public static Service2 = "0B9676EE-8352-440A-BF80-61541D578FCF";
}