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
cp out.mp4 ../../media/shobdo-demo.mp4
# README GIF: look up, word family, translate, Google Translate (cut times follow timeline.json)
ffmpeg -y -i out.mp4 -filter_complex "[0:v]trim=10.5:16,setpts=PTS-STARTPTS[a];[0:v]trim=22.5:27.5,setpts=PTS-STARTPTS[b];[0:v]trim=34.6:39,setpts=PTS-STARTPTS[c];[0:v]trim=42:46.5,setpts=PTS-STARTPTS[d];[a][b][c][d]concat=n=4:v=1:a=0,fps=8,scale=680:-1:flags=lanczos,split[x][y];[x]palettegen=max_colors=128:stats_mode=diff[p];[y][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle" ../../media/shobdo-demo.gif
```

The Google Translate window is drawn onto the page screenshot by `capture.py`, since headless Chromium can't show the small window Shobdo opens.

Narration lines are in `vo.json`; scene timing, camera moves, cursor paths and captions are in `build.py`.
