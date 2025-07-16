import type { PlasmoContentScript } from "plasmo"
import {CONFIG_KEY, DISABLE_LOGS} from "~constants";

export const config: PlasmoContentScript = {
    matches: ["<all_urls>"],
    all_frames: true,
    run_at: "document_start",
}

export {};

import Mellowtel from "mellowtel";
let mellowtel;
(async () => {
    mellowtel = new Mellowtel(CONFIG_KEY,{
        disableLogs: DISABLE_LOGS
    });
    await mellowtel.initContentScript();
})();
