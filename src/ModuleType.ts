/**
 * Derives a human-readable module type label from a raw EEPROM snapshot,
 * e.g. "SFP+ · SM 1310nm", "SFP28 · MM 850nm", "SFP · RJ45",
 * "QSFP28 (100G) · MM 850nm".
 *
 * Fields used (standard MSA layouts):
 *   - SFF-8472 A0h page (512-byte SFP-family dumps):
 *       byte 0      identifier (SFF-8024): 0x03 = SFP/SFP+/SFP28
 *       byte 2      connector (SFF-8024 Table 4-1): 0x22 = RJ45, 0x07 = LC, ...
 *       byte 11     BR, nominal bit rate in 100 Mbit/s units (many rebuilt
 *                   profiles leave it unset or wrong, so it is used only when
 *                   it falls inside a plausible range)
 *       bytes 13-18 link lengths: SM km / SM 100 m / MM 10 m / copper m / OM3
 *       bytes 60-61 wavelength in nm (big endian): 850 = multimode (SR),
 *                   1310/1550 = singlemode (LX/LR/ER/ZR)
 *   - SFF-8636 page 0 (640-byte QSFP-family dumps):
 *       byte 0      identifier: 0x0C = QSFP+, 0x0D = QSFP28, 0x11 = QSFP-DD
 *
 * Pieces the snapshot does not declare (or declares implausibly) are simply
 * omitted from the label, so the output never invents facts.
 */

function wavelengthNm(data: Uint8Array): number {
    return (data[60] << 8) | data[61];
}

function mediaLabel(data: Uint8Array): string {
    const connector = data[2];
    const wl = wavelengthNm(data);
    const smLength = data[13] > 0 || data[14] > 0;
    const mmLength = data[15] > 0 || data[16] > 0 || data[18] > 0;
    const copperLength = data[17] > 0;

    if (connector === 0x22 || connector === 0x21) {
        return "RJ45";
    }

    if (wl === 850) {
        return "MM 850nm (SR)";
    }

    if (wl === 1310) {
        return "SM 1310nm (LR/LX)";
    }

    if (wl === 1550) {
        return "SM 1550nm (ER/ZR)";
    }

    if (wl > 0) {
        return `${wl}nm`;
    }

    // No wavelength: copper cables / DAC-AOC from the cable bits and lengths.
    if (data[9] & 0x04) {
        return "DAC (passive)";
    }

    if (data[9] & 0x08) {
        return "AOC (active)";
    }

    if (copperLength) {
        return "copper";
    }

    if (smLength) {
        return "SM";
    }

    if (mmLength) {
        return "MM";
    }

    return "";
}

function sfpGenerationLabel(br: number): string {
    // BR is expressed in 100 Mbit/s units. Only trust it inside plausible
    // ranges (rebuilt profiles often leave it zero or wrong).
    if (br >= 240) {
        return "SFP28 (25G)";
    }

    if (br >= 90 && br <= 120) {
        return "SFP+ (10G)";
    }

    if (br >= 11 && br <= 16) {
        return "SFP (1G)";
    }

    return "SFP";
}

export function moduleTypeLabel(data: Uint8Array): string {
    // QSFP family (640-byte dumps, SFF-8636).
    if (data.length === 640) {
        const id = data[0];
        let generation = "QSFP";

        if (id === 0x0C) {
            generation = "QSFP+ (40G)";
        } else if (id === 0x0D) {
            generation = "QSFP28 (100G)";
        } else if (id === 0x11) {
            generation = "QSFP-DD";
        }

        const media = mediaLabel(data);

        return media ? `${generation} · ${media}` : generation;
    }

    // SFP family (512-byte dumps, SFF-8472).
    if (data.length === 512 && data[0] === 0x03) {
        const generation = sfpGenerationLabel(data[11]);
        const media = mediaLabel(data);

        return media ? `${generation} · ${media}` : generation;
    }

    return "unknown";
}
