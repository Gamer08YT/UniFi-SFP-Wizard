import $ from "jquery";
import i18next from "i18next";
import {eepromIdentity, moduleTypeLabel} from "./ModuleType";
import {escapeHtml} from "./Html";

export class Repository {
    // Store Base URL.
    private static baseUrl = "https://api.github.com/repos/Gamer08YT/UniFi-SFP-Wizard/"

    // jsDelivr CDN fallbacks: the GitHub contents API is rate limited to 60
    // requests per hour per IP, which mobile carriers routinely exhaust with
    // their shared CGNAT addresses (the repository list then silently
    // disappears). jsDelivr has no such practical limits.
    private static cdnListUrl = "https://data.jsdelivr.com/v1/packages/gh/Gamer08YT/UniFi-SFP-Wizard@master";
    private static cdnFileUrl = "https://cdn.jsdelivr.net/gh/Gamer08YT/UniFi-SFP-Wizard@master/repository/";

    // The copy of the repository served next to the app (./repository/).
    // Preferred source: no rate limits, no external dependency, works from a
    // mirror or an offline copy. dumps.json doubles as the index. Files listed
    // here are fetched locally instead of from GitHub/jsDelivr.
    private static localBase = "./repository/";
    private static localFiles = new Set<string>();

    // Friendly names from dumps.json, keyed by file name.
    private static labels: { [filename: string]: string } = {};

    // Part/serial number -> friendly name, built from the locally served
    // dumps. The Wizard's own lists only expose type/part/serial/size, so this
    // lets them show the same readable names as the repository.
    private static catalogPromise: Promise<{ byPart: Map<string, string>; bySerial: Map<string, string> }> | null = null;

    // Per-file download URLs from the GitHub API listing (when available).
    private static fileUrls: { [filename: string]: string } = {};
    /**
     * Fetches templates from a specified repository and processes the data.
     * This method makes a GET request to retrieve file listings from the repository,
     * counts JSON files that need to be loaded, and appends options to a select element
     * for files with a specific extension.
     *
     * @return {void} Does not return a value.
     */
    public static async fetchTemplates() {
        // The listing may change between calls: drop the derived catalog.
        Repository.catalogPromise = null;
        let files: string[] = [];
        let listingOk = false;

        const localLabels: { [filename: string]: string } = {};

        // Primary: the repository copy served next to the app.
        try {
            const response = await fetch(Repository.localBase + "dumps.json", {cache: "no-cache"});

            if (response.ok) {
                const data = await response.json();

                if (data && Array.isArray(data.dumps)) {
                    data.dumps.forEach((dump: { file: string, name: string }) => {
                        if (dump.file && dump.file.endsWith(".uieeprom")) {
                            files.push(dump.file);
                            Repository.localFiles.add(dump.file);

                            if (dump.name) {
                                localLabels[dump.file] = dump.name;
                            }
                        }
                    });
                }

                listingOk = files.length > 0;
            }
        } catch (e) {
            console.warn("Local repository listing failed, trying GitHub.", e);
        }

        // Fallback 1: GitHub contents API (also yields per-file download URLs).
        if (!listingOk) {
            try {
                const response = await fetch(Repository.baseUrl + "contents/repository");

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }

                // @ts-ignore
                const data = await response.json();

                // @ts-ignore
                data.forEach(element => {
                    if (element.name.endsWith(".uieeprom")) {
                        files.push(element.name);
                    }

                    if (element.download_url) {
                        Repository.fileUrls[element.name] = element.download_url;
                    }
                });

                listingOk = true;
            } catch (e) {
                console.warn("GitHub contents API failed, trying the jsDelivr listing.", e);
            }
        }

        // Fallback 2: jsDelivr package listing (no strict rate limits).
        if (!listingOk) {
            try {
                const response = await fetch(Repository.cdnListUrl);

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }

                // @ts-ignore
                const data = await response.json();

                const findRepositoryFiles = (nodes: any[]): string[] => {
                    const found: string[] = [];

                    for (const node of nodes ?? []) {
                        if (node.type === "directory") {
                            if (node.name === "repository") {
                                for (const file of node.files ?? []) {
                                    if (file.type === "file" && file.name.endsWith(".uieeprom")) {
                                        found.push(file.name);
                                    }
                                }
                            } else {
                                found.push(...findRepositoryFiles(node.files));
                            }
                        }
                    }

                    return found;
                };

                files = findRepositoryFiles(data.files);
            } catch (e) {
                console.warn("jsDelivr listing failed too.", e);
            }
        }

        if (files.length > 0) {
            // Optional friendlier labels from dumps.json (non-critical).
            // Labels: already known when the local listing delivered them,
            // otherwise read from dumps.json (non-critical).
            const nameByFile: { [filename: string]: string } = Object.assign({}, localLabels);

            if (Object.keys(nameByFile).length === 0) {
                try {
                    const dumpsResponse = await fetch(Repository.getFileUrl("dumps.json"));

                    if (dumpsResponse.ok) {
                        const dumpsData = await dumpsResponse.json();

                        if (dumpsData && Array.isArray(dumpsData.dumps)) {
                            dumpsData.dumps.forEach((dump: { file: string, name: string }) => {
                                if (dump.file && dump.name) {
                                    nameByFile[dump.file] = dump.name;
                                }
                            });
                        }
                    }
                } catch (e) {
                    console.warn("Failed to fetch dumps.json, falling back to filenames.", e);
                }
            }

            // Remember the names so the Wizard's own lists can reuse them.
            Repository.labels = nameByFile;

            // Remove the static placeholder options (e.g. "Todo") that ship in
            // the markup, keeping only the leading "Select EEPROM Config" prompt.
            $("#sfp-repo option[value]").remove();
            $("#profile-repo-list option").remove();

            files.forEach(name => {
                const label = nameByFile[name] || name.replace(".uieeprom", "");

                // Both the file name and the label come from the repository,
                // so they are escaped before being interpolated into markup.
                $("#sfp-repo").append(`<option value="${escapeHtml(name)}">${escapeHtml(label)}</option>`);
                $("#profile-repo-list").append(`<option value="${escapeHtml(name)}">${escapeHtml(label)}</option>`);
            });

            // Best-effort enrichment: fetch each profile (they are small)
            // and append the module type (SFP/SFP+/SFP28, media) read from
            // the EEPROM bytes to both list entries.
            Repository.enrichLabels(files);

            console.log("Fetched Templates.");
        } else {
            // Make the failure visible instead of leaving a silently empty list.
            const error = `<option value="" disabled>${i18next.t("common:repository-unavailable")}</option>`;

            $("#sfp-repo option[value]").remove();
            $("#sfp-repo").append(error);
            $("#profile-repo-list option").remove();
            $("#profile-repo-list").append(error);
        }
    }

    /**
     * Part/serial number -> readable name, derived from the dumps served by
     * this deployment. The Wizard's Profile Store only reports type, part
     * number, serial and size, so the callers use this to show repository
     * names ("IBM/Blade Network BN-CKM-SP-SR 10GBase-SR") instead of bare part
     * numbers. Built once and cached; empty when the deployment does not ship
     * the repository folder.
     *
     * @return {Promise<{byPart: Map<string, string>, bySerial: Map<string, string>}>} The lookup tables.
     */
    public static async catalog(): Promise<{ byPart: Map<string, string>; bySerial: Map<string, string> }> {
        if (Repository.catalogPromise === null) {
            Repository.catalogPromise = Repository.buildCatalog();
        }

        return Repository.catalogPromise;
    }

    /**
     * Builds the catalog by reading each locally served dump once.
     */
    private static async buildCatalog(): Promise<{ byPart: Map<string, string>; bySerial: Map<string, string> }> {
        const byPart = new Map<string, string>();
        const bySerial = new Map<string, string>();

        // Make sure the listing (and the names) are known.
        if (Repository.localFiles.size === 0 && Object.keys(Repository.labels).length === 0) {
            try {
                await Repository.fetchTemplates();
            } catch (e) {
                console.warn("Catalog: repository listing unavailable.", e);
            }
        }

        for (const filename of Array.from(Repository.localFiles)) {
            try {
                const response = await fetch(Repository.getFileUrl(filename));

                if (!response.ok) {
                    continue;
                }

                const bytes = new Uint8Array(await response.arrayBuffer());
                const identity = eepromIdentity(bytes);
                const label = Repository.labels[filename] || `${identity.vendor} ${identity.part}`;

                if (identity.part !== "-") {
                    byPart.set(identity.part, label);
                }

                if (identity.sn !== "-") {
                    bySerial.set(identity.sn, label);
                }
            } catch (e) {
                console.warn(`Catalog: failed to read '${filename}'.`, e);
            }
        }

        return {byPart, bySerial};
    }

    /**
     * Returns the download URL for a repository file. Prefers the URL
     * reported by the GitHub API listing; when the listing was unavailable
     * (e.g. rate limited on mobile networks), serves the file from the
     * jsDelivr CDN instead.
     *
     * @param {string} filename - The file name inside the repository folder.
     * @return {string} A direct download URL for the file.
     */
    public static getFileUrl(filename: string): string {
        // Files served next to the app are fetched from there.
        if (Repository.localFiles.has(filename)) {
            return Repository.localBase + encodeURIComponent(filename);
        }

        if (Repository.fileUrls[filename]) {
            return Repository.fileUrls[filename];
        }

        return Repository.cdnFileUrl + encodeURIComponent(filename);
    }

    /**
     * Best-effort enrichment of the repository lists: fetches each profile
     * (they are small) and appends the module type (SFP/SFP+/SFP28, media)
     * read from the EEPROM bytes to both list entries. Failures leave the
     * plain labels.
     *
     * @param {string[]} files - The file names listed in the repository.
     * @return {void} Does not return a value (results land in the DOM).
     */
    private static enrichLabels(files: string[]): void {
        files.forEach(name => {
            fetch(Repository.getFileUrl(name)).then(async response => {
                if (!response.ok) {
                    return;
                }

                const bytes = new Uint8Array(await response.arrayBuffer());
                const type = moduleTypeLabel(bytes);

                $("#sfp-repo").find(`option[value="${name}"]`).add(`#profile-repo-list option[value="${name}"]`).each((_, element) => {
                    const $element = $(element);

                    $element.text($element.text().split(" [")[0] + ` [${type}]`);
                });
            }).catch(() => {
                // Ignore: labels stay without the type hint.
            });
        });
    }
}
