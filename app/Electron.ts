import {app, BrowserWindow} from 'electron';
import * as path from "node:path";

class Electron {
    private windowInstance: BrowserWindow | null = null;

    /**
     * Constructor for initializing the main class instance. Sets up necessary functionality by
     * registering listeners and configuring the taskbar.
     *
     * @return {void} This constructor does not return a value.
     */
    constructor() {
        this.registerListeners();
    }

    /**
     * Creates and initializes a new browser window with specified configurations.
     * The window will have a predefined size, minimum dimensions, and loading a specific HTML file.
     *
     * @return {void} Does not return a value.
     */
    private createWindow(): void {
        this.windowInstance = new BrowserWindow({
            width: 1100,
            minWidth: 800,
            minHeight: 950,
            height: 1000,
            icon: path.join(__dirname, "../build/icon.png"),
            autoHideMenuBar: true,
            webPreferences: {
                preload: path.join(__dirname, "preload.js"),
                devTools: true
            },
        });

        // Print Debug Message.
        console.log("Window Created");

        // Load Page from Asar Archive.
        this.windowInstance.loadFile("dist/index.html");
    }

    /**
     * Registers event listeners for the application lifecycle.
     * Handles application readiness, window activation, and behavior when all windows are closed.
     *
     * @return {void} Does not return a value.
     */
    private registerListeners(): void {
        console.log("Registering Listeners");

        app.whenReady().then(() => {
            // Change Temp Workdir.
            //this.setWorkdir();

            // Create Window.
            this.createWindow();

            app.on("activate", () => {
                if (BrowserWindow.getAllWindows().length === 0) this.createWindow();
            });
        });

        app.on("window-all-closed", () => {
            if (process.platform !== "darwin") app.quit();
        });
    }

    /**
     * Sets the flash state of the current window instance.
     *
     * @param {boolean} state - A boolean value indicating whether to enable or disable the flash effect.
     * @return {void} Does not return a value.
     */
    private setFlash(state: boolean) {
        this.windowInstance?.flashFrame(state);
    }

    /**
     * Sets the current working directory to the "dist" folder located relative to the directory of the script.
     *
     * @return {void} This method does not return a value.
     */
    private setWorkdir(): void {
        const workDir = path.join(__dirname);

        process.chdir(workDir);

        console.log(`Working Directory: ${workDir}`);
    }
}

// Start the application.
new Electron();