/**
 * Derives a human-readable module type label from a raw EEPROM snapshot,
 * e.g. "SFP+ (10G) · SM 1310nm", "SFP+ · RJ45 (10GBASE-T)",
 * "SFP (1G) · MM 850nm", "SFP28 (25G)", "QSFP28 (100G)".
 *
 * Bit layout follows the SFF-8472 decoder in ethtool (sfpid.c):
 *   - byte 0      identifier (SFF-8024): 0x03 = SFP family; QSFP 640-byte
 *                 dumps: 0x0C = QSFP+, 0x0D = QSFP28, 0x11 = QSFP-DD
 *   - byte 2      connector (SFF-8024 Table 4-1): 0x22/0x21 = RJ45, 0x07 = LC
 *   - byte 3      10G Ethernet compliance: bit 4 = 10GBASE-SR, bit 5 =
 *                 10GBASE-LR (bits 6/7 = LRM)
 *   - byte 6      1G Ethernet compliance: bit 3 = 1000BASE-T, bit 2 =
 *                 1000BASE-CX, bit 1 = 1000BASE-LX, bit 0 = 1000BASE-SX
 *   - byte 8      bit 3 = Active cable (AOC), bit 2 = Passive cable (DAC)
 *   - byte 9      FC media: bit 0 = SM, bit 2 = MM 50um, bit 3 = MM 62.5um
 *   - byte 11     BR, nominal bit rate in 100 Mbit/s units (rebuilt profiles
 *                 often leave it unset or wrong: only trusted if plausible)
 *   - byte 36     extended compliance (SFF-8024): 0x16/0x1C = 10GBASE-T,
 *                 0x1D = 5GBASE-T, 0x1E = 2.5GBASE-T, 0x01-0x04/0x08/0x0B-0x0D/
 *                 0x18/0x19 = 25G (SFP28)
 *   - bytes 60-61 wavelength in nm (big endian): 850 = multimode (SR),
 *                 1310/1550 = singlemode (LX/LR/ER/ZR)
 *
 * Fields the snapshot does not declare (or declares implausibly) are simply
 * omitted from the label, so the output never invents facts.
 */

function wavelengthNm(data: Uint8Array): number {
    return (data[60] << 8) | data[61];
}

/**
 * The module generation (speed class) for 512-byte SFP-family dumps.
 */
function sfpGenerationLabel(data: Uint8Array): string {
    const ext = data[36];
    const br = data[11];

    // 25G codes from SFF-8024 (SFP28).
    if ([0x01, 0x02, 0x03, 0x04, 0x08, 0x0B, 0x0C, 0x0D, 0x18, 0x19].indexOf(ext) >= 0) {
        return "SFP28 (25G)";
    }

    // 10G Ethernet codes (SFF-8472 byte 3).
    if (data[3] & 0x70) {
        return "SFP+ (10G)";
    }

    // BR = 0xFF is a sentinel, not a speed: the nominal bit rate is in
    // byte 66, in units of 250 Mbit/s (SFF-8472). Without this, 0xFF
    // would be read as ~25.5G and every such module labeled SFP28.
    if (br === 0xFF) {
        const br66 = data[66];

        if (br66 >= 100) {
            return "SFP28 (25G)";
        }

        if (br66 >= 38 && br66 <= 50) {
            return "SFP+ (10G)";
        }

        if (br66 > 0 && br66 <= 10) {
            return "SFP (1G)";
        }
    }

    // Nominal bit rate, only when plausible.
    if (br !== 0xFF && br >= 240) {
        return "SFP28 (25G)";
    }

    if (br !== 0xFF && br >= 90 && br <= 120) {
        return "SFP+ (10G)";
    }

    // 1G Ethernet codes (SFF-8472 byte 6).
    if (data[6] & 0x0F) {
        return "SFP (1G)";
    }

    if (br >= 11 && br <= 16) {
        return "SFP (1G)";
    }

    return "SFP";
}

/**
 * The media label for 512-byte SFP-family dumps.
 */
function sfpMediaLabel(data: Uint8Array): string {
    const connector = data[2];
    const ext = data[36];
    const wl = wavelengthNm(data);

    // Copper twisted pair (RJ45): by connector code or xxBASE-T compliance.
    if (connector === 0x22 || connector === 0x21) {
        if (ext === 0x16 || ext === 0x1C) {
            return "RJ45 (10GBASE-T)";
        }

        if (ext === 0x1D) {
            return "RJ45 (5GBASE-T)";
        }

        if (ext === 0x1E) {
            return "RJ45 (2.5GBASE-T)";
        }

        if (data[6] & 0x08) {
            return "RJ45 (1000BASE-T)";
        }

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

    // No wavelength: cables and direct-attach.
    if (data[8] & 0x04) {
        return "DAC (passive)";
    }

    if (data[8] & 0x08) {
        return "AOC (active)";
    }

    if (data[17] > 0) {
        return "copper";
    }

    if (data[13] > 0 || data[14] > 0) {
        return "SM";
    }

    if (data[15] > 0 || data[16] > 0 || data[18] > 0) {
        return "MM";
    }

    return "";
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

        const media = mediaLabelQSFP(data);

        return media ? `${generation} · ${media}` : generation;
    }

    // SFP family (512-byte dumps, SFF-8472).
    if (data.length === 512 && data[0] === 0x03) {
        const generation = sfpGenerationLabel(data);
        const media = sfpMediaLabel(data);

        return media ? `${generation} · ${media}` : generation;
    }

    return "unknown";
}

/**
 * Media label for QSFP-family dumps (SFF-8636 page 0): the wavelength lives
 * at bytes 186-187 and copper cables show up in the byte 0 extended
 * identifier / compliance bytes; keep it minimal and safe.
 */
function mediaLabelQSFP(data: Uint8Array): string {
    const wl = (data[186] << 8) | data[187];

    if (wl === 850) {
        return "MM 850nm (SR)";
    }

    if (wl === 1310) {
        return "SM 1310nm (LR)";
    }

    if (wl === 1550) {
        return "SM 1550nm (ER)";
    }

    if (wl > 0) {
        return `${wl}nm`;
    }

    return "";
}

/**
 * Verifies the SFF-8472 base and extended checksums of a 512-byte A0h page:
 * CC_BASE (byte 63) is the low byte of the sum of bytes 0-62, CC_EXT
 * (byte 95) the sum of bytes 64-94. The firmware rejects snapshots with bad
 * checksums without a useful error, so callers can warn before uploading.
 *
 * @param {Uint8Array} data - The EEPROM snapshot.
 * @return {{base: boolean, ext: boolean}} Whether each checksum matches.
 */
export function eepromChecksums(data: Uint8Array): { base: boolean; ext: boolean } {
    if (data.length !== 512 || data[0] !== 0x03) {
        // QSFP-family and non-SFP images use a different layout: do not
        // pretend to validate them.
        return {base: true, ext: true};
    }

    const sum = (from: number, to: number) => {
        let total = 0;

        for (let i = from; i <= to; i++) {
            total += data[i];
        }

        return total & 0xFF;
    };

    return {base: sum(0, 62) === data[63], ext: sum(64, 94) === data[95]};
}

/**
 * Reads the identity fields of a SFF-8472/SFF-8636 snapshot: vendor name
 * (bytes 20-35), part number (40-55) and serial number (68-83), space padded.
 *
 * @param {Uint8Array} data - The EEPROM snapshot.
 * @return {{vendor: string, part: string, sn: string}} The trimmed fields.
 */
export function eepromIdentity(data: Uint8Array): { vendor: string; part: string; sn: string } {
    const read = (from: number, len: number) => {
        if (data.length < from + len) {
            return "-";
        }

        return new TextDecoder().decode(data.slice(from, from + len)).trim() || "-";
    };

    return {vendor: read(20, 16), part: read(40, 16), sn: read(68, 16)};
}
