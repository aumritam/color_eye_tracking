# Eye-Tracking Color Identifier: Music Mode Rundown
(Version 2026-10-29i. Python version of all the rules: `color_to_chord.py`, checked against the app: 120/120 scanner stops and 300/300 chords identical.)

## 1. What the whole app does
1. **Eye tracking.** Your webcam (WebGazer.js) guesses where on the screen you are looking. You calibrate by clicking 12 red dots over the image 5 times each. A ring shows where it thinks you look.
2. **Smoothing ("friction").** The ring's position is the middle value of the last few guesses, tiny wobbles are ignored, and the ring eases toward the new spot. One slider (0 to 100, default 50) sets how heavy it feels.
3. **Color under the ring.** The app takes the **median** red, green and blue of all pixels in a circle (radius slider, default 45 px), then names it by matching to the nearest of about 50 named colors (in CIELAB color space).
4. **Other parts:** Start/Stop button, "back to mouse tracking", Recalibrate, image upload, head-position warning, mouse test mode (cursor instead of eyes).
5. **Music mode (button).** Independent of eye tracking, so you can test eyes in silence. Two layers: the **chord** (from where you look) and the optional **scanner** (a line that sweeps the whole image).

## 2. The chord (from your eyes)
The color under the ring is turned into **hue, saturation, brightness**:
- brightness = biggest of R, G, B divided by 255
- saturation = (biggest - smallest) / biggest
- hue = the usual color wheel angle, 0 to 360 degrees

**Root note (from hue).** sector = round(hue / 30), wrapping at 12. Each 30 degrees is one semitone: red = C, orange = C#, yellow = D, lime = D#, green = E, teal = F, cyan = F#, sky = G, blue = G#, violet = A, magenta = A#, pink = B. (A menu switches to the Omnichord's circle-of-fifths order: note = sector x 7 mod 12.)

**Chord size (from saturation).** 1 note, plus 1 for each cut-off reached: 0.25, 0.50, 0.75. So pale = 1 to 2 notes, vivid = 4 notes.

**Chord quality (from the strongest color channel).** If the biggest channel beats the second biggest by at least 15% of the biggest: red strongest = major, green strongest = minor, blue strongest = sus. If it's closer than that (yellow, cyan, magenta) = neutral open chord.

| Quality | 1 note | 2 notes | 3 notes | 4 notes |
|---|---|---|---|---|
| Major | 0 | 0, 7 | 0, 4, 7 | 0, 4, 7, 11 |
| Minor | 0 | 0, 7 | 0, 3, 7 | 0, 3, 7, 10 |
| Sus | 0 | 0, 7 | 0, 5, 7 | 0, 5, 7, 10 |
| Neutral | 0 | 0, 7 | 0, 7, 12 | 0, 7, 12, 19 |

(numbers = semitones above the root.) The chord sits near C3: root note number = 48 + root, minus 12 if root is F# or higher.

**Grey, white and black** (saturation under 0.12, or brightness under 0.12) have no hue, so they play an open root + fifth + octave in the **current key**: the root of the last colored chord (C if none yet). Brightness under 0.35 = an octave lower ("deep"), over 0.70 = an octave higher ("bright"), else normal.

**Anti-flutter.** A new chord must be looked at for 0.16 s before it plays (0.35 s before silence when you look off the image). A 60 ms heartbeat makes this work even when the eyes or mouse hold still.

**Chord buttons.** A grid of 12 roots x 4 qualities (Maj, Min, Sus, Open). It lights up the chord playing. Hold a button to play that chord yourself.

## 3. The scanner (button, off by default)
**The line.** A thin line sweeps left to right across the image in **30 seconds**, then restarts. It stops **12 times** (every 2.5 s). At each stop it reads **12 colors down the line**: 12 evenly spaced heights, the median color of a small box (12 px wide, about 22 px tall) at each.

**One note per color. Nothing is hidden.** For each of the 12 colors:
1. Find its hue note (same hue rule as above).
2. **Fit to the chord's scale.** Move that note to the nearest note of the scale of the chord your eyes are playing (like the Omnichord): major and open chords = major scale (0,2,4,5,7,9,11), minor = natural minor (0,2,3,5,7,8,10), sus = mixolydian (0,2,4,5,7,9,10), counted from the chord's root. If no chord has played yet: C major. So scanner and chord always agree.
3. **Pick the octave nearest the previous note** (range C5 to C7), so the tune walks in small steps instead of leaping. The first note takes the lowest option.
4. **Repeats climb.** If the same note comes up again row after row, each repeat goes up a third (2 scale steps), so you can hear it repeating. When it would go above C7 it drops an octave at a time until it fits. A different note starts fresh.
5. **Grey, white, black** play by brightness: the scale notes from C3 up to C7 form a ladder; black = bottom, white = top, greys in between (position = round(brightness x (ladder length - 1))).

**Direction.** Even stops play the 12 notes top to bottom, odd stops bottom to top.

**Rhythm and feel.**
- **Phrases:** the notes are cut into little groups of 3, 3, 2, 4 (then repeating), with a short breath (0.8 of a note gap) between groups.
- **Swing:** every second note inside a group is late by 0.25 of a note gap.
- **Note gap:** chosen so a whole stop (12 notes + breaths + the closing note) fits in about 2.2 s, never under 0.13 s or over 0.5 s. For 12 notes it comes out near 0.15 s.
- **Human wobble:** each note's time moves randomly by up to +/-0.02 s, and loudness by +/-10%.
- **Loudness** = 0.2 x brightness factor (0.6 + 0.4 x brightness) x color factor (0.75 + 0.25 x saturation; greys use 0.5) x phrase shape (first note of a group x1.3, last of a group x0.9, others x1.0) x the random +/-10%.
- **Ring (how long it rings)** = 0.7 for pale colors up to 1.4 for vivid ones (greys 1.05).
- **Closing note:** after the 12, one soft (85%) long (x1.6 ring) note on the chord's root or fifth, in the octave nearest the last note, so each run lands "home". It has no dot because it isn't a color.
- **Pan:** low notes sit left, high notes right: pan = (note - 48) / 48 x 1.4 - 0.7, kept between -0.7 and 0.7.

**On screen:** the line, 12 dots on it showing each color (they swell when their note plays), and 12 note keys under the chord grid that light up.

## 4. The sounds
**Chord pad** (from your eyes). Each chord note = 2 sawtooth waves slightly out of tune (-7 and +7 cents) + a sine an octave lower at 70%, through a low-pass filter (cutoff 7x the note, max 4200 Hz). Notes fade in and out slowly, and notes shared between two chords keep playing without restarting. Then: a 3600 Hz tone filter, chorus (22 ms delay wobbling at 0.4 Hz, 60% wet), a 2.4 s reverb at 30%, a compressor so nothing clips, and the volume slider (volume squared x 0.9).

**Scanner note** = **75% pluck + 25% bell** (setting `harsh` = 0.75).
- *Pluck part* (like the pad, so they blend): triangle wave (rings 1.8 s), a little sawtooth (+3 cents, 22%, 1.2 s), sine at 2x the pitch (35%, 1.0 s), sine at 3x (12%, 0.6 s). 6 ms soft strike. Passes through a low-pass whose cutoff is 1600 + 5400 x min(1, loudness/0.28) Hz, so harder notes are brighter and soft notes are rounder. Then the same filter, chorus and reverb as the pad.
- *Bell part* (a struck bar): sine at 1x (rings 3.5 s), plus overtones at 2.76x (22%, 0.55 s) and 5.40x (7%, 0.22 s). Those overtones are deliberately not neat multiples: that is what makes it sound like a real xylophone or wind chime. Low-pass 5200 Hz, its own 3.6 s reverb at 70%.
- All ring times are multiplied by the note's ring value.
- **Extra space just for scanner notes:** 80% of each note is also sent to a 4.2 s reverb (fully wet) and a left/right echo (0.34 s on the left, 0.51 s on the right; each repeat is 38% as loud and duller; echo level 32%).

## 5. What I added, in order
1. Music mode button, chord from the color under the ring, Omnichord-style chord-button grid, strum plate, synth, volume, hue/fifths order menu.
2. Strum plate removed (asked), then the scanner added as its replacement: line sweeps in 30 s, 12 colors down it, notes one by one.
3. Wind-chime sound, up/down direction per stop, spacing that fills the gap between stops.
4. Scanner notes fitted to the chord's scale so they never clash.
5. Every color sounds: nothing merged away, repeats climb a third, grey/white/black play by brightness (scanner) and as open chords (eye tracking).
6. Sound moved to 75% pluck / 25% bell so it blends with the chord.
7. This round: stepwise octave choice (no big leaps), phrases and swing, accents and loudness from brightness/saturation, longer ring for vivid colors, brighter tone for harder notes, a closing chord note, extra reverb and echo.

## 6. Honest notes
- My reading of the hue-to-note rule (red = C, chromatic) is an assumption. Your notebook may differ; change `root_of()` (Python) or `rootOf()` (app).
- I tested the maths exactly (Python matches the app) and the audio by rendering it and measuring pitches, loudness and clipping, but I have not heard it with ears, and I haven't tried it with a real camera.
- I couldn't open omnichord.amplib.app. The layout follows the real Omnichord's chord-button grid.
- On the built-in palette every column has one hue, so the scanner mostly plays climbing repeats. A photo gives a much more varied tune.
- Every number above is a constant you can change: the `MUSIC` and `SCAN` objects in `index.html` (and the same names in `color_to_chord.py`).
