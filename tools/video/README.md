# Demo video

Rebuilds `media/shobdo-demo.mp4` from the real extension. Needs Python with `playwright` (Chromium installed), `edge-tts`, `numpy`, and `ffmpeg`.

```sh
cd tools/video
mkdir -p shots audio frames
(cd site && python3 -m http.server 8765 &)     # serves the sample article (and the PDF made from it)
python3 capture.py                             # loads the extension, takes screenshots -> shots/, meta.json
python3 -c 'import json,subprocess; [subprocess.run(["edge-tts","--voice","en-US-AvaNeural","--rate=-4%","--text",t,"--write-media",f"audio/{k}.mp3"]) for k,t in json.load(open("vo.json"))]'
python3 build.py                               # timeline.json + audio/mix.wav (narration, sound effects, music bed)
python3 render.py out.mp4                      # renders stage.html frame by frame and encodes
```

Narration lines are in `vo.json`; scene timing, camera moves, cursor paths and captions are in `build.py`.
