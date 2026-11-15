# Color Eye Tracking

Look at a picture and the app tells you what color you are looking at: a swatch, a name like "Forest green", and the hex/RGB value. It can also turn what you look at into music. It uses your webcam to estimate where you're looking, then reads the image under your gaze.

Everything runs in your browser. Video from your camera is processed on your own computer and never uploaded.

## How it works

1. **Gaze estimation:** [WebGazer.js](https://webgazer.cs.brown.edu/) (v3.5.3, stored in this folder as `webgazer.js`) uses your webcam and a face-landmark model to guess where on the screen you are looking.
2. **Calibration:** you click 12 red dots (a 3 x 4 grid covering the image) five times each while staring at them. This teaches the model your eyes, so it is the biggest factor in accuracy.
3. **Smoothing ("friction"):** raw webcam gaze is jumpy, so the app takes the middle value of the last few guesses, ignores tiny wobbles and eases the ring toward the new spot instead of snapping to it. One slider controls how strong this is (on top of WebGazer's own Kalman filter).
4. **Color sampling:** the app takes the *median* color of all pixels inside a circle around the gaze point (default radius 45 px), which ignores stray pixels and matches the tracker's real accuracy.
5. **Color naming:** the sampled color is converted to CIELAB and matched to the nearest of ~50 named colors, so you get "Dusty teal" instead of just `#4A8C8A`.
6. **Music mode (optional):** two instruments, each in its own tab. The **Omnichord** turns the color under your gaze into a chord. The **PCA Pad** turns the *kind of area* you look at (calm or busy, bright or dark) into a chord, using Anjali's PCA analysis. Music mode is a separate button, so you can test eye tracking in silence.

**Important limit:** the app can only read the image on the page (the built-in palette or an image you upload). It cannot see other tabs or apps.

## What's in this folder

```
color_eye_tracking/
├── index.html             the whole app (HTML + CSS + JavaScript in one file)
├── pca-omnisphere.js      the PCA Pad tab: Anjali's PCA analysis + the pad instrument
├── webgazer.js            WebGazer 3.5.3, stored locally so no internet is needed
├── serve.py               tiny local server (always serves the newest files)
├── color_to_chord.py      the ORIGINAL color -> chord rules as Python (see note below)
├── music_mode_rundown.md  notes on Music mode
├── START_HERE.txt         the four-line quick start
├── README.md              this file
└── mediapipe/
    └── face_mesh/         face-tracking model files (about 17 MB), loaded by WebGazer
```

`webgazer.js`, `pca-omnisphere.js` and the `mediapipe/face_mesh/` folder must all sit next to `index.html`. If any is missing, the page can't find it: a missing `webgazer.js` gives
