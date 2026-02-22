import $ from "jquery";

export class Repository {
    // Store Base URL.
    private static baseUrl = "https://api.github.com/repos/Gamer08YT/UniFi-SFP-Wizard/"

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

        // Get Request to GitHub API.
        $.get(url, (data) => {
            // @ts-ignore
            data.forEach(element => {
                if (element.name.endsWith(".json")) {
                    this.needToLoad++;
                }
            })


            // @ts-ignore
            data.forEach(element => {
                if (element.name.endsWith(".uieeprom")) {
                    $("#sfp-repo").append(`<option value="${element.name}">${element.name}</option>`)
                }
            })

            console.log("Fetched Templates.");
        });
    }
}
