# Eye-Tracking Color Identifier

Look at a color on screen and the app tells you what it is: a swatch, a name like "Forest green", and the hex/RGB value. It uses your webcam to estimate where you're looking, then reads the color of the image under your gaze.

Everything runs in your browser. Video from your camera is processed on your own computer and never uploaded.

## How it works

1. **Gaze estimation:** [WebGazer.js](https://webgazer.cs.brown.edu/) (pinned to v3.5.3) uses your webcam and a face-landmark model to guess where on the screen you are looking.
2. **Calibration:** you click 12 red dots (a 3 x 4 grid covering the canvas) five times each while staring at them. This teaches the model your eyes, so it is the biggest factor in accuracy.
3. **Smoothing ("friction"):** raw webcam gaze is jumpy, so the app takes the middle value of the last few guesses, ignores tiny wobbles and eases the ring toward the new spot instead of snapping to it. One slider controls how strong this is (on top of WebGazer's own Kalman filter).
4. **Color sampling:** the app takes the *median* color of all pixels inside a circle around the gaze point (default radius 45 px), which ignores stray pixels and matches the tracker's real accuracy.
5. **Color naming:** the sampled color is converted to CIELAB and matched to the nearest of ~50 named colors, so you get "Dusty teal" instead of just `#4A8C8A`.
6. **Music mode (optional):** the same sampled color can also play a chord, Omnichord style (see below). It is a separate button, so you can test eye tracking in silence.

**Important limit:** the app can only read colors from the canvas on the page (the built-in palette or an image you upload). It cannot see other tabs or apps.

## What's in this folder

```
color_eye_tracking/
├── index.html            the whole app (HTML + CSS + JavaScript in one file)
├── serve.py              tiny local server (always serves the newest files)
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
   python3 serve.py
   ```
   It prints the folder it is serving and the version of `index.html` (the same version shown at the bottom of the page's Instructions panel). `serve.py` works like `python3 -m http.server 8000`, but tells the browser never to keep old copies, so after you replace a file a normal refresh shows the new one.
   Leave this terminal open. Closing it stops the app.
3. Open **http://localhost:8000** in Chrome. Hard refresh with Cmd+Shift+R (Ctrl+Shift+R on Windows) the first time.
4. Click **Start eye tracking** and allow the camera.
5. **Calibrate:** the page scrolls the canvas into view and shows 12 red dots over it. Look directly at each dot and click it 5 times. Keep your head still and your face inside the green box in the camera preview.
6. When it says "Calibration finished", look around the canvas. The ring shows where the app thinks you are looking. If it is off, look at a spot and click it to correct it (see below).

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
| **Friction** | How heavy the ring feels (0 to 100, default 50). Higher = steadier ring that drags behind your eyes. Lower = quicker but shakier. |
| **Head position message** | A small badge shown while eye tracking. It compares where your eyes are now to where they were during calibration and tells you if you've drifted. |
| **Mouse test mode** | Same as the mouse toggle above, as a checkbox. |
| **Gaze ring** | Show or hide the ring. |
| **Music mode** | Turns the color-to-chord music on or off (see Music mode below). |

Stop pauses tracking but does not turn the camera off, so the camera light stays on until you close or refresh the tab.

### Music mode (Omnichord style)

Click **Music mode** (works with eye tracking *and* mouse test mode). A panel opens in the sidebar and the color under the ring becomes a chord that plays continuously. Grey, white and black also play (see below). Only looking off the canvas is silent. Click the button again to turn it off; with it off, nothing makes any sound.

**How a color becomes a chord** (the "hue scanner" rules):

| Color property | Decides | Details |
|---|---|---|
| **Hue** | Root note | Red = C, then each 30 degrees goes up a semitone: orange C#, yellow D, lime D#, green E, ... blue G#, ... magenta A#. |
| **Saturation** | Chord size (1 to 4 notes) | Pale = 1 or 2 notes (root, then root + fifth), medium = 3 (triad), vivid = 4 (seventh). |
| **Strongest RGB channel** | Chord quality | Red-dominant = major, green-dominant = minor, blue-dominant = sus (suspended). When two channels are close (yellow, cyan, magenta) = open "neutral" chords (root, fifth, octave). |

Examples: vivid red = Cmaj7, medium green = Em, vivid blue = G#7sus4, yellow = D open chord.

**Grey, white and black** have no hue, so they play an open root + fifth + octave chord in the *current key* (the root of the last colored chord, or C if there was none): black sounds an octave lower (deep), mid greys in the middle, white an octave higher (bright).

**What you see and hear**

- A **chord readout** (name, notes, and why that color gave that chord).
- An **Omnichord-style chord-button grid** (12 roots x Major / Minor / Sus / Open) that lights up the chord being played. You can also hold a button to play a chord yourself.
- **Volume** slider, and a menu to switch the root order from the hue scanner's chromatic order to the Omnichord's circle-of-fifths order.

**Scanner (hue scanner):** the **Scanner: Off/On** button in the Music panel (off by default). A thin line sweeps left to right across the image in **30 seconds**, then starts over. It stops 12 times along the way. Each stop samples **12 colors down the line** (the 12 dots) and plays **every one of them, one by one**, so nothing in the image is hidden.

- **In the chord's scale.** Each hue becomes a note, then moves to the nearest note of the scale of the chord that eye tracking is playing (major and open chords: major scale; minor: natural minor; sus: mixolydian), like the Omnichord. Scanner and chord always agree. If no chord has played yet it uses C major.
- **Repeats climb.** When the same note comes up row after row, each repeat steps up a third (2 scale steps), so a run of one color is a rising arpeggio and you can hear it repeating. A different note starts again from the bottom. When it gets too high (above C7) it wraps back down.
- **Grey, white and black play too,** by brightness: black is the lowest note (about C3), white the highest (C7), greys in between, all in the chord's scale.
- **Up and down.** One stop plays its 12 notes top to bottom, the next plays them bottom to top, and so on. Notes are spread over about 2.2 s so the music keeps flowing.
- **Sound.** 75% the plucked chord sound (triangle + a little saw + overtones, run through the same filter, chorus and reverb as the pad so it blends) and 25% soft struck-bar bell. A small random wobble in timing and loudness; low notes sit left, high notes right. Dots and the note keys light up as notes play.

Constants are in the `SCAN` object: `sweepSeconds`, `steps`, `fillSeconds`, `minGap`, `maxGap`, `baseMidi`, `topMidi`, `greyLowMidi`, `repeatStep` (2 = a third; 7 would be an octave), `velocity`, `harsh` (0 = all bell, 1 = all pluck; default 0.75), and the `SCALES` table. The sound is the `mallet()` function.

To keep gaze jitter from sounding like fluttering, a new color must be looked at for about 0.16 s before the chord changes (0.35 s before it rests). Sound pauses when the tab is hidden. The chord is always a sustained pad. The optional Scanner (below) adds a slow xylophone on top.

Tuning constants (the `MUSIC` object in `index.html`): `minSaturation`, `minBrightness` (below these = grey/black, no hue), `sizeSteps` (saturation cut-offs for 2/3/4 notes), `neutralMargin` (how close channels must be to count as neutral), `holdMs`, `restHoldMs`.

Note: the hue-to-note mapping above is my reading of the hue scanner project (red = C, chromatic). If your notebook maps hue differently, change `rootOf()` in `index.html`.

### Getting better accuracy

Webcam eye tracking is rough: even in good conditions expect 100 px or so of error. WebGazer only looks at tiny pictures of your two eyes and has no idea where your head is, so most accuracy problems come down to the head moving or to too little calibration data. What the app does about it, and what you can do:

**Built in**

- **Bigger calibration memory.** WebGazer normally remembers only its last 50 clicks and forgets the rest. The calibration is 60 clicks (12 dots x 5), so the first dots used to be thrown away. The app now keeps 120.
- **Learns from clicks only.** WebGazer normally also learns from wherever your mouse moves, which is wrong whenever your eyes and your cursor are in different places. That is turned off, so you can move the mouse freely.
- **Head position message.** Warns you when your head has moved away from where it was during calibration (sideways, up/down, closer or farther).
- **Friction slider.** Steadier ring (see Controls).
- **Calibration dots only over the canvas, in a 3 x 4 grid.** Every training sample comes from the area you actually look at.

**What you can do**

- **Click to correct.** If the ring is off, look at the exact spot where you want it, then click that spot. Each click is a new training sample. A few corrections in the area that is wrong (often the bottom) help a lot.
- Light your face from the front, not from behind (no window behind you).
- Put the camera near eye level. Looking down at a laptop screen is the weakest case, because your eyelids cover more of your iris. Tilt the screen or raise the laptop if you can.
- Sit at the same distance and height as during calibration, and keep your head still. If the head message turns red, move back or press **Recalibrate**.
- Click each calibration dot while actually looking at it, and don't blink on the click. Clicking without looking trains the model on the wrong data.
- Glasses can cause glare in the eye pictures. Tilt your head slightly or reduce screen glare if you see it.

### Tuning (optional)

These are plain constants in the script in `index.html`. The Friction slider's starting value is the `value="50"` on the `id="fric"` slider in the HTML:

| Constant | Default | Effect |
|---|---|---|
| `CAL_COLS`, `CAL_ROWS` | 3, 4 | Calibration grid size. More rows help the bottom half of the image. |
| `CAL_INSET` | 30 | Pixels between the outer dots and the canvas edge. |
| `MEMORY` | 120 | How many calibration clicks WebGazer remembers. Bigger = more data but a little more work per frame. |
| `HEAD_OK`, `HEAD_BAD` | 0.15, 0.30 | How far your head can shift before the badge turns "drifting" / "moved a lot" (as a fraction of the distance between your eyes). |
| `ZOOM_OK`, `ZOOM_BAD` | 0.07, 0.15 | Same idea for moving closer to or farther from the camera. |
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
| `ERR_CONNECTION_REFUSED` at localhost | The server isn't running. Start it again with `python3 serve.py` from inside this folder. |
| The page looks old (for example, no **Friction** slider) | You're looking at an old copy. Check the version line at the bottom of the Instructions panel (it should match the version `serve.py` printed). Fix: stop the old server (Ctrl+C in its terminal), make sure you're in the folder with the newest `index.html`, run `python3 serve.py`, and refresh. If `serve.py` says "OLD", that folder still has the old file. |
| Terminal shows `404` for `/mediapipe/face_mesh/...` | The model folder is missing or in the wrong place. It must be `mediapipe/face_mesh/` next to `index.html` (see below to re-download). |
| `Address already in use` / "Port 8000 is already in use" | An older server is still running. Stop it with Ctrl+C in its terminal, or use another port: `python3 serve.py 8001` and open `http://localhost:8001`. |
| Server serves the wrong files or a directory listing | You started it from the wrong folder. `cd` into this folder first. |
| "WebGazer did not load" | No internet connection, or the CDN is blocked. Check the Network tab in Chrome DevTools. |
| Camera never starts | Click the camera icon in Chrome's address bar and allow access. Make sure no other app is using the camera. |
| Preview or green box disappears | Usually your face left the camera's view. The page re-shows the preview automatically while tracking is on. If it keeps happening, send the first red error from the Chrome Console (Cmd+Option+J). |
| Accurate at the top, poor at the bottom | See "Getting better accuracy" above: raise the camera to eye level, then **Recalibrate** and use click-to-correct near the bottom. Raising `CAL_ROWS` also helps. |
| Ring is shaky | Raise the **Friction** slider. |
| Ring feels sluggish | Lower the **Friction** slider. |
| No sound in Music mode | Click the Music button (browsers only allow audio after a click), check the Volume slider and your system volume, and make sure the ring is over the image (off the canvas is silent). |
| Head badge says "Face not found" | Your face left the camera's view or the lighting dropped. Move back into the green box. |

### Re-downloading the model files

If `mediapipe/face_mesh/` is missing or incomplete, run this from inside this folder. It pulls the exact files from the same WebGazer version the page uses:

```bash
mkdir -p /tmp/wg && cd /tmp/wg && npm pack webgazer@3.5.3 && tar xzf webgazer-3.5.3.tgz
cd - && cp -r /tmp/wg/package/dist/mediapipe .
```

(A plain `curl` loop over the nine files from `https://cdn.jsdelivr.net/npm/webgazer@3.5.3/dist/mediapipe/face_mesh/` also works but can stall on the larger files.)

## Credits

Built on [WebGazer.js](https://webgazer.cs.brown.edu/) and Google MediaPipe Face Mesh. See WebGazer's license for terms of use.
