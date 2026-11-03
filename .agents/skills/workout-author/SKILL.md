---
name: workout-author
description: >-
  Author, mutate, or audit workout routines, exercises, and demonstration media for Workout Player.
  Use when adding exercises, converting videos to looping GIFs, tagging taxonomy, or balancing routine structures.
---

# Workout Authoring & Ingestion Runbook

High-signal procedures for creating exercises, encoding media loops, and assembling scientifically balanced routines for Workout Player.

---

## 1. Atomic Exercise Ingestion

Create an exercise, upload a demonstration GIF, tag muscle taxonomy, and attach a tutorial video in a single command using [`scripts/ingest_exercise.py`](./scripts/ingest_exercise.py):

```bash
uv run --directory workout --group dev python ../.agents/skills/workout-author/scripts/ingest_exercise.py \
	--name "<Name>" \
	--laterality <bilateral|unilateral> \
	--category <strength|cardio|technique|mobility|stretch|drill> \
	--discipline <calisthenics|general|boxing|muay_thai|yoga> \
	--mode <reps|time> \
	--quantity <number> \
	--gif </path/to/demo.gif> \
	--youtube "<https://www.youtube.com/watch?v=...>" \
	--primary-muscles <m1> [<m2>] \
	--secondary-muscles <m3> [<m4>] \
	--description "<Execution notes and variation links>"
```

Valid muscle keys: `chest`, `shoulders`, `biceps`, `triceps`, `forearms`, `upper_back`, `lats`, `traps`, `quads`, `hamstrings`, `glutes`, `adductors`, `calves`, `abs`, `obliques`, `lower_back`.

---

## 2. Video to Looping Demonstration GIF

To capture clean exercise loops from YouTube:

1. **Download Execution Section** (yt-dlp):
```bash
yt-dlp --download-sections "*<start_sec>-<end_sec>" -f "best[ext=mp4]/best" -o "/tmp/raw_clip.mp4" "<url>"
```

2. **Encode Crisp, Compact GIF (< 3 MB)**:
```bash
ffmpeg -y -ss <start> -to <end> -i /tmp/raw_clip.mp4 \
	-vf "fps=12,scale=360:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=64[p];[s1][p]paletteuse=dither=bayer" \
	/tmp/exercise_demo.gif
```

---

## 3. Routine Architecture & Biomechanical Guardrails

When assembling or editing routines, enforce the standards in [`WORKOUT_SCIENCE.md`](file:///Users/levontumanyan/repos/games/workout/WORKOUT_SCIENCE.md):

- **1:1 Push-to-Pull Balance**: Match total pushing sets with equal horizontal pulling (e.g. Bedsheet Door Rows, Inverted Rows) and scapular work.
- **Session Duration**: Keep total duration within **40–45 minutes** (never exceed 50 min).
- **Proximity to Failure (RIR)**: Prescribe sets at **1 to 2 RIR** in an **8–14 rep calibration range**. If reps exceed 14, increase leverage (elevation, pause, backpack load) rather than rep count.
- **Step Cues**: Use standardized tempo notation: `2s eccentric + 1s bottom pause`. Never insert redundant per-side or rep notes.
- **Minimal Step Descriptors**: When calling `PUT /api/routines/{id}`, pass clean descriptors (`{"exercise_id": "...", "reps": 12, "cue": "..."}` or `{"rest": 60}`); backend automatically inflates metadata.
