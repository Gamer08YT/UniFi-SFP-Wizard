export interface Frame {
    cmd: number;
    flags: number;
    payloadType: number;
    payload: Uint8Array;
    decompressed?: Uint8Array;
}