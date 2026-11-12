# DanceTutor

Pick a dance and an AI teacher coaches you through it. You learn four counts at a time in front of your camera, get one correction after each attempt, and build the pieces into the full routine the way a dance class does.

## Run it

```bash
npm install
npm run setup:pose   # optional: downloads the body-tracking model so the app works offline
npm run dev
```

Open the address Vite prints. Use Chrome, and allow camera access.

Useful links while developing:

- `/?sim=1` practises with a simulated dancer instead of the camera. It makes a few mistakes and improves as the teacher corrects it, so you can work on the app without dancing.
- `/?sim=1&pace=quick` is the same with fewer repeats. It is a good backup for a live demo.
- `/builder.html` exports a routine as files, for sharing it in the repo (see below).

`npm test` runs the coaching-logic tests. `npm run build` typechecks and builds.

## How a lesson goes

1. **Watch.** The teacher shows the next four counts slowly.
2. **Count-in and dance.** The reference plays beside your camera. A ghost of the target pose sits on your body and limbs turn red where you are off. The teacher stays silent while you move.
3. **One correction.** The music stops and the teacher names the single most useful fix, for example "On count four, lift your left arm higher."
4. **Again.** Clean attempts move you up the speed ladder (60%, 80%, full tempo). The same mistake twice starts a slow drill of just those two counts, arms or feet only.
5. **Build up.** Two four-counts join into an eight, eights link together, and you run from the top until you have the whole routine.

The progress strip shows every attempt count by count, and the review screen compares your first try at each section with your latest.

## How it works

| Part | Where | What it does |
| --- | --- | --- |
| Body tracking | `src/pose/tracker.ts` | MediaPipe Pose Landmarker in the browser. Nothing is uploaded. |
| Comparison | `src/coach/compare.ts` | Per count, finds how early or late you were, then how far each limb was from the target at that timing. |
| Describing the fix | `src/coach/describe.ts` | Turns "left arm is off" into "left arm is too low". |
| Choosing the correction | `src/coach/select.ts` | Ranks errors by size, how much the choreographer said the limb matters, how often it has recurred, and tracking confidence. |
| Lesson plan | `src/coach/planner.ts` | The add-on method: learn, join, link, from the top, with speed ladder, drills and "come back to it later". |
| What the teacher says | `src/coach/phrasing.ts` | Sentence templates, spoken with the browser's built-in voice. |
| Clock and sound | `src/audio/transport.ts` | Plays a range at any speed, keeps the reference video in step, sounds clicks or a drum beat. |
| Reference tracking | `src/lesson/track.ts` | Tracks the dancer in a reference video, frame by frame, to get the joints to compare against. |
| Lesson loop | `src/session/session.ts` | Ties it together: watch, count in, record, judge, speak, repeat. |

Thresholds and pacing live in `src/config.ts`.

## Add a routine from a video

The teacher on the left is a real video, and every attempt is compared with the joints tracked from it.

1. Film or pick a video: one dancer, whole body in frame, fixed camera, facing forward.
2. On the home screen choose **Add a routine from a video** and pick the file.
3. Set the beat. Press **Tap the beat** once to start the video, then tap on every count starting on count 1. Or type the tempo and the time of count 1. **Check the counts** plays the video with a click and a number on each count so you can confirm it lines up.
4. **Save routine.** The app tracks the dancer's joints through the video (about a minute for a 20-second routine on a laptop) and the routine appears on the home screen.

The video and its joints are stored in that browser only. Nothing is uploaded.

During practice the tracked joints are drawn over the video; a button hides them.

### Sharing a routine with the team

Routines added in the app live in one browser. To ship a routine with the repo so everyone has it:

1. Open `/builder.html`, process the video and download `lesson.json` and `poses.json`.
2. Put them with the video in `public/lessons/<name>/`, and add `"<name>"` to `public/lessons/index.json`.

### Teaching notes

Routines in `public/lessons` can carry choreographer notes in `lesson.json`. Sides are the choreographer's own left and right:

```json
"notes": [
  { "count": 4, "group": "right_arm", "importance": "essential", "cue": "The {right} arm finishes straight up." },
  { "count": "all", "group": "torso", "importance": "free" }
]
```

`importance` is `essential` (tight tolerance), `normal`, or `free` (not judged). Groups are `left_arm`, `right_arm`, `left_leg`, `right_leg` and `torso`. Without notes every limb is judged at the normal tolerance.

## Not built yet

- A conversational voice model for the teacher (spoken questions such as "which foot?", and voice control of replay and speed). The teacher currently uses templates and the browser's speech.
- Recorded count clips. The count-in is spoken by the browser's voice, which does not land exactly on the beat.
- Latency calibration. Camera delay is a fixed estimate in `src/config.ts`.
- Editing teaching notes inside the app. Routines added from a video have none until you export them and edit `lesson.json`.
- Turns, floorwork and travelling steps. Tracking assumes one dancer facing a fixed camera.
