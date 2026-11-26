import $ from "jquery";
import i18next from "i18next";

export class Repository {
    // Store Base URL.
    private static baseUrl = "https://api.github.com/repos/Gamer08YT/UniFi-SFP-Wizard/"

    // jsDelivr CDN fallbacks: the GitHub contents API is rate limited to 60
    // requests per hour per IP, which mobile carriers routinely exhaust with
    // their shared CGNAT addresses (the repository list then silently
    // disappears). jsDelivr has no such practical limits.
    private static cdnListUrl = "https://data.jsdelivr.com/v1/packages/gh/Gamer08YT/UniFi-SFP-Wizard@master";
    private static cdnFileUrl = "https://cdn.jsdelivr.net/gh/Gamer08YT/UniFi-SFP-Wizard@master/repository/";

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
        let files: string[] = [];
        let listingOk = false;

        // Primary: GitHub contents API (also yields per-file download URLs).
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

        // Fallback: jsDelivr package listing (no strict rate limits).
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
            const nameByFile: { [key: string]: string } = {};

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

            // Remove the static placeholder options (e.g. "Todo") that ship in
            // the markup, keeping only the leading "Select EEPROM Config" prompt.
            $("#sfp-repo option[value]").remove();
            $("#profile-repo-list option").remove();

            files.forEach(name => {
                const label = nameByFile[name] || name.replace(".uieeprom", "");
                $("#sfp-repo").append(`<option value="${name}">${label}</option>`);
                $("#profile-repo-list").append(`<option value="${name}">${label}</option>`);
            });

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
     * Returns the download URL for a repository file. Prefers the URL
     * reported by the GitHub API listing; when the listing was unavailable
     * (e.g. rate limited on mobile networks), serves the file from the
     * jsDelivr CDN instead.
     *
     * @param {string} filename - The file name inside the repository folder.
     * @return {string} A direct download URL for the file.
     */
    public static getFileUrl(filename: string): string {
        if (Repository.fileUrls[filename]) {
            return Repository.fileUrls[filename];
        }

        return Repository.cdnFileUrl + filename;
    }
}
