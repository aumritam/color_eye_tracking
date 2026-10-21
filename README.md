Using the WebGazer.js API in order to tracking eye movements and color.

# Eye-Tracking Color Identifier

Look at a color on screen and the app tells you what it is: a swatch, a name like "Forest green", and the hex/RGB value. It uses your webcam to estimate where you're looking, then reads the color of the image under your gaze.

Everything runs in your browser. Video from your camera is processed on your own computer and never uploaded.

## How it works

1. **Gaze estimation:** [WebGazer.js](https://webgazer.cs.brown.edu/) (pinned to v3.5.3) uses your webcam and a face-landmark model to guess where on the screen you are looking.
2. **Calibration:** you click 12 red dots (a 3 x 4 grid covering the canvas) five times each while staring at them. This teaches the model your eyes, so it is the biggest factor in accuracy.
3. **Smoothing:** raw webcam gaze is jumpy, so the last 5 predictions are averaged (on top of WebGazer's own Kalman filter).
4. **Color sampling:** the app takes the *median* color of all pixels inside a circle around the gaze point (default radius 45 px), which ignores stray pixels and matches the tracker's real accuracy.
5. **Color naming:** the sampled color is converted to CIELAB and matched to the nearest of ~50 named colors, so you get "Dusty teal" instead of just `#4A8C8A`.

**Important limit:** the app can only read colors from the canvas on the page (the built-in palette or an image you upload). It cannot see other tabs or apps.

## What's in this folder

```
color_eye_tracking/
├── index.html            the whole app (HTML + CSS + JavaScript in one file)
├── README.md             this file
└── mediapipe/
    └── face_mesh/        face-tracking model files (about 17 MB), loaded by WebGazer
```

The `mediapipe/face_mesh/` folder must sit next to `index.html`. WebGazer requests those files from your own server, and if they are missing you get `404` errors and tracking never starts.

## Requirements

- Google Chrome (recommended)
- Python 3 (only used to run a tiny local web server)
- A webcam
- An internet connection, because `index.html` loads WebGazer itself from the jsDelivr CDN

---

## Version 1: Local app with eye tracking (main version)

This is the full app. Camera access only works on `localhost` or HTTPS, which is why you need the small server instead of double-clicking the file.

1. Open a terminal **inside this folder**. In VS Code: right-click the `color_eye_tracking` folder and choose *Open in Integrated Terminal*. Check with:
   ```bash
   pwd && ls
   ```
   You should see `index.html` and `mediapipe` listed.
2. Start the server:
   ```bash
   python3 -m http.server 8000
   ```
   Leave this terminal open. Closing it stops the app.
3. Open **http://localhost:8000** in Chrome. Hard refresh with Cmd+Shift+R (Ctrl+Shift+R on Windows) the first time.
4. Click **Start eye tracking** and allow the camera.
5. **Calibrate:** the page scrolls the canvas into view and shows 12 red dots over it. Look directly at each dot and click it 5 times. Keep your head still and your face inside the green box in the camera preview.
6. When it says "Calibration finished", look around the canvas **without moving your mouse**. The ring shows where the app thinks you are looking.

The terminal should show `200` for the `/mediapipe/face_mesh/...` requests. Press Ctrl+C there when you're done.

### Controls

| Control | What it does |
|---|---|
| **Start eye tracking** | Starts the camera and begins calibration. |
| **Stop eye tracking** (red) | Pauses tracking, hides the camera preview and switches to mouse tracking. |
| **Resume eye tracking** | Resumes tracking and keeps your previous calibration. |
| **Back to mouse tracking** | Switches the readout to your cursor while eye tracking stays running. During calibration it cancels it. |
| **Switch to eye tracking** | Goes back to your eyes without recalibrating. It says **Calibrate eye tracking** if you haven't finished calibrating yet. |
| **Recalibrate** | Clears what the model learned and starts calibration over. Works any time, even while stopped. |
| **Image** | Upload your own picture to identify colors in, instead of the built-in palette. |
| **Radius** | Size of the sampled circle (20 to 100 px). Larger is steadier, smaller is more precise. |
| **Mouse test mode** | Same as the mouse toggle above, as a checkbox. |
| **Gaze ring** | Show or hide the ring. |

Stop pauses tracking but does not turn the camera off, so the camera light stays on until you close or refresh the tab.

### Getting better accuracy

- Light your face from the front, not from behind (no window behind you).
- Put the camera near eye level. Looking down at a laptop screen is the weakest case, because your eyelids cover more of your iris.
- Keep your head at the same height and distance as during calibration. If you shift a lot, press **Recalibrate**.
- Don't move the mouse or scroll the page while eye tracking is on. WebGazer also learns from mouse movement, so a wandering cursor can spoil the calibration.
- Click each calibration dot while actually looking at it. Clicking without looking trains the model on the wrong data.
- Expect roughly 100 to 200 px of error even when everything is good. That is normal for a webcam.

### Tuning (optional)

These are plain constants near the top of the matching section of the script in `index.html`:

| Constant | Default | Effect |
|---|---|---|
| `CAL_COLS`, `CAL_ROWS` | 3, 4 | Calibration grid size. More rows help the bottom half of the image. |
| `CAL_INSET` | 30 | Pixels between the outer dots and the canvas edge. |
| `BUFFER_SIZE` | 5 | Predictions averaged for smoothing. Higher is steadier but laggier. |
| `PREVIEW_W`, `PREVIEW_H` | 180, 135 | Size of the camera preview in the corner. |

---

## Version 2: Mouse test mode (no camera)

Use this to check the color naming or demo the idea without eye tracking. Your cursor stands in for your gaze.

1. Run the app as in Version 1, steps 1 to 3 (or just double-click `index.html`, since mouse mode needs neither the camera nor the local server).
2. Don't click Start. **Mouse test mode** is on by default, so move your cursor over the palette or an uploaded image. You'll see the swatch, name and hex update live.

Mouse mode is also a good way to confirm the naming works before you debug the camera.

---

## Version 3: Google Colab prototype (legacy, not included)

The first prototype ran as a single Google Colab cell that displayed the page inside the notebook. It is **not part of this folder and is no longer maintained**, and it was never confirmed working. Colab's sandboxed output frame can block camera access and cannot load the `mediapipe/face_mesh/` model files, which is the main reason the project moved to the local version. It also lacks the Stop/Resume buttons, the canvas-only calibration and the camera preview fixes.

If you only have Colab available, a workable fallback is to write the page to a file in Colab, download it (`from google.colab import files; files.download("gaze_color.html")`), and run it locally as in Version 1.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `ERR_CONNECTION_REFUSED` at localhost | The server isn't running. Start it again with `python3 -m http.server 8000` from inside this folder. |
| Terminal shows `404` for `/mediapipe/face_mesh/...` | The model folder is missing or in the wrong place. It must be `mediapipe/face_mesh/` next to `index.html` (see below to re-download). |
| `Address already in use` | Use another port: `python3 -m http.server 8001`, then open `http://localhost:8001`. |
| Server serves the wrong files or a directory listing | You started it from the wrong folder. `cd` into this folder first. |
| "WebGazer did not load" | No internet connection, or the CDN is blocked. Check the Network tab in Chrome DevTools. |
| Camera never starts | Click the camera icon in Chrome's address bar and allow access. Make sure no other app is using the camera. |
| Preview or green box disappears | Usually your face left the camera's view. The page re-shows the preview automatically while tracking is on. If it keeps happening, send the first red error from the Chrome Console (Cmd+Option+J). |
| Accurate at the top, poor at the bottom | See "Getting better accuracy" above, then press **Recalibrate**. Raising `CAL_ROWS` also helps. |

### Re-downloading the model files

If `mediapipe/face_mesh/` is missing or incomplete, run this from inside this folder. It pulls the exact files from the same WebGazer version the page uses:

```bash
mkdir -p /tmp/wg && cd /tmp/wg && npm pack webgazer@3.5.3 && tar xzf webgazer-3.5.3.tgz
cd - && cp -r /tmp/wg/package/dist/mediapipe .
```

(A plain `curl` loop over the nine files from `https://cdn.jsdelivr.net/npm/webgazer@3.5.3/dist/mediapipe/face_mesh/` also works but can stall on the larger files.)

## Credits

Built on [WebGazer.js](https://webgazer.cs.brown.edu/) and Google MediaPipe Face Mesh. See WebGazer's license for terms of use.
