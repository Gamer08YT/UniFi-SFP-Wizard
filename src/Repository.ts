import $ from "jquery";

export class Repository {
    // Store Base URL.
    private static baseUrl = "https://api.github.com/repos/posi211/UniFi-SFP-Wizard/"

    // Store count of Templates to load.
    private static needToLoad = 0;

    /**
     * Fetches templates from a specified repository and processes the data.
     * This method makes a GET request to retrieve file listings from the repository,
     * counts JSON files that need to be loaded, and appends options to a select element
     * for files with a specific extension.
     *
     * @return {void} Does not return a value.
     */
    public static fetchTemplates() {
        const url = this.baseUrl + "contents/repository";

        $.get(url, (data) => {
            const nameByFile: { [key: string]: string } = {};

            // @ts-ignore
            const dumpsEntry = data.find(element => element.name === "dumps.json");

            const populateOptions = () => {
                // Remove the static placeholder options (e.g. "Todo") that ship in the
                // markup, keeping only the leading "Select EEPROM Config" prompt.
                $("#sfp-repo option[value]").remove();

                // @ts-ignore
                data.forEach(element => {
                    if (element.name.endsWith(".uieeprom")) {
                        const label = nameByFile[element.name] || element.name.replace(".uieeprom", "");
                        $("#sfp-repo").append(`<option value="${element.name}">${label}</option>`)
                    }
                })

                console.log("Fetched Templates.");
            };

            if (dumpsEntry) {
                $.get(dumpsEntry.download_url, (dumpsData) => {
                    try {
                        const parsed = typeof dumpsData === "string" ? JSON.parse(dumpsData) : dumpsData;

                        if (parsed && Array.isArray(parsed.dumps)) {
                            parsed.dumps.forEach((dump: { file: string, name: string }) => {
                                if (dump.file && dump.name) {
                                    nameByFile[dump.file] = dump.name;
                                }
                            });
                        }
                    } catch (e) {
                        console.warn("Failed to parse dumps.json, falling back to filenames.", e);
                    }

                    populateOptions();
                }).fail(() => {
                    console.warn("Failed to fetch dumps.json, falling back to filenames.");
                    populateOptions();
                });
            } else {
                populateOptions();
            }
        });
    }
}
