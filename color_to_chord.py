# Color -> chord rules, exactly as used in the eye-tracking app's Music mode.
# Paste into a notebook cell. Input: average color (r, g, b), each 0-255.

NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

MIN_SATURATION = 0.12   # less colorful than this  -> rest (silence)
MIN_BRIGHTNESS = 0.12   # darker than this         -> rest
SIZE_STEPS     = [0.25, 0.50, 0.75]  # saturation cut-offs for 2, 3, 4 notes
NEUTRAL_MARGIN = 0.15   # top two channels closer than this -> "neutral"

# Notes added above the root, in semitones, for chord size 1, 2, 3, 4
SHAPES = {
    "major":   [[0], [0, 7], [0, 4, 7],  [0, 4, 7, 11]],
    "minor":   [[0], [0, 7], [0, 3, 7],  [0, 3, 7, 10]],
    "sus":     [[0], [0, 7], [0, 5, 7],  [0, 5, 7, 10]],
    "neutral": [[0], [0, 7], [0, 7, 12], [0, 7, 12, 19]],
}

def color_to_chord(r, g, b, order="hue"):
    mx, mn = max(r, g, b), min(r, g, b)
    delta = mx - mn
    value = mx / 255
    sat = 0 if mx == 0 else delta / mx

    # 1. HUE (0-360 degrees)
    hue = 0
    if delta > 0:
        if mx == r:   hue = ((g - b) / delta) % 6
        elif mx == g: hue = (b - r) / delta + 2
        else:         hue = (r - g) / delta + 4
        hue = (hue * 60) % 360

    if sat < MIN_SATURATION or value < MIN_BRIGHTNESS:
        return None                      # grey / white / black = rest

    # root note: every 30 degrees = 1 semitone, red (0 deg) = C
    sector = round(hue / 30) % 12
    root = sector if order == "hue" else (sector * 7) % 12   # "fifths" = Omnichord order

    # 2. SATURATION -> how many notes (1 to 4)
    size = 1 + sum(sat >= cut for cut in SIZE_STEPS)

    # 3. STRONGEST CHANNEL -> chord quality
    top, second = sorted([r, g, b], reverse=True)[:2]
    margin = (top - second) / mx
    if margin < NEUTRAL_MARGIN:
        quality = "neutral"
    else:
        quality = "major" if mx == r else "minor" if mx == g else "sus"

    notes = [(root + i) % 12 for i in SHAPES[quality][size - 1]]
    return {"root": NOTE_NAMES[root], "quality": quality, "size": size,
            "notes": [NOTE_NAMES[n] for n in notes]}

if __name__ == "__main__":
    for rgb in [(134, 19, 19), (30, 210, 30), (30, 30, 210), (220, 220, 40), (128, 128, 128)]:
        print(rgb, color_to_chord(*rgb))
