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

`npm test` runs the coaching-logic tests. `npm run build` typechecks and builds.

## How a lesson goes

1. **Watch.** The teacher shows the next four counts slowly.
2. **Count-in and dance.** The reference plays beside your camera. A ghost of the target pose sits on your body and limbs turn red where you are off. The teacher stays silent while you move.
3. **One correction.** The music stops and the teacher names the single most useful fix, for example "On count four, lift your left arm higher."
4. **Again.** Clean attempts move you up the speed ladder (60%, 80%, full tempo). The same mistake twice starts a slow drill of just those two counts, arms or feet only.
5. **Build up.** Two four-counts join into an eight, eights link together, and you run from the top until you have the whole routine.

A strip under the caption shows your latest attempts count by count: red where it went wrong, green where it was right.

The interface is deliberately bare: a list of dances, then the tutor screen. Keys on the tutor screen: Space pauses, R shows the section again, S skips it, J hides the joints on the video. Options are set in the address: `?pace=quick` (fewer repeats), `?mirror=0` (use the same side as the teacher instead of mirroring), `?voice=0` (captions only), `?sim=1` (simulated dancer).

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
| Library | `src/lesson/library.ts`, `vite.config.ts` | Saves routines into `public/lessons` while developing, and serves them. |
| Lesson loop | `src/session/session.ts` | Ties it together: watch, count in, record, judge, speak, repeat. |

Thresholds and pacing live in `src/config.ts`.

## The routine library

The home screen lists the routines in the library. Each one is a real video, and every attempt is compared with the joints tracked from it. Routines in the library ship with the app, so anyone who opens it can pick one and start.

### Add a routine

1. Get a video: one dancer, whole body in frame, fixed camera, facing forward. A clean 15 to 30 second performance works best. Trim out talking and camera cuts first, and keep the file small (720p is plenty).
2. Run `npm run dev`, open the app and choose **Add a dance from a video**.
3. Give it a name.
4. Set the beat. Press **Tap the beat** once to start the video, then tap on every count starting on count 1. Or type the tempo and the time of count 1. **Check the counts** plays the video with a click and a number on each count so you can confirm it lines up.
5. Leave **Add to the app's library** ticked and press **Save**. The app tracks the dancer's joints (about a minute for a 20-second routine on a laptop) and writes the routine into `public/lessons/<name>/`.
6. Commit and push `public/lessons`. The routine is now preloaded for everyone.

Untick the box to keep a routine on your own device instead. It is stored in that browser only, and **add to library** beside it in the list moves it into the library later. Nothing is uploaded anywhere either way.

Saving to the library only works under `npm run dev`, because it writes files into the project. A built or deployed copy of the app shows the library but cannot change it.

During practice the tracked joints are drawn over the video; a button hides them.

### What a library routine contains

```
public/lessons/
  index.json            list of routine folders
  my-routine/
    lesson.json         name, tempo, count 1, counts, notes
    poses.json          the tracked joints for every frame
    video.mp4           the reference video
```

### Teaching notes

Add choreographer notes to a routine's `lesson.json`. Sides are the choreographer's own left and right:

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
- Editing teaching notes inside the app. Add them by editing the routine's `lesson.json`.
- Turns, floorwork and travelling steps. Tracking assumes one dancer facing a fixed camera.
