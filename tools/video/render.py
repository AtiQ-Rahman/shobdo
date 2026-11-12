# Renders stage.html frame by frame and encodes the video with the soundtrack.
import json, os, subprocess, sys
from playwright.sync_api import sync_playwright
HERE = os.path.dirname(os.path.abspath(__file__)); os.chdir(HERE)
TL = json.load(open("timeline.json")); FPS = 30
preview = [float(x) for x in sys.argv[2:]] if len(sys.argv) > 1 and sys.argv[1] == "preview" else None
out = sys.argv[1] if len(sys.argv) > 1 and not preview else "out.mp4"
with sync_playwright() as p:
    b = p.chromium.launch(args=["--allow-file-access-from-files"])
    pg = b.new_page(viewport={"width": 1920, "height": 1080})
    pg.add_init_script("window.TL = " + json.dumps(TL))
    pg.goto("file://" + os.path.join(HERE, "stage.html"))
    pg.evaluate("preload()"); pg.wait_for_timeout(500)
    if preview:
        for t in preview:
            pg.evaluate(f"setTime({t})"); pg.wait_for_timeout(60)
            pg.screenshot(path=f"frames/p_{t:05.1f}.png")
        sys.exit()
    n = int(TL["total"] * FPS)
    ff = subprocess.Popen(["ffmpeg", "-y", "-v", "error", "-f", "image2pipe", "-framerate", str(FPS), "-c:v", "mjpeg", "-i", "-",
        "-i", "audio/mix.wav", "-c:v", "libx264", "-preset", "slow", "-crf", "20", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
        "-c:a", "aac", "-b:a", "160k", "-shortest", out], stdin=subprocess.PIPE)
    for i in range(n):
        pg.evaluate(f"setTime({i / FPS})")
        ff.stdin.write(pg.screenshot(type="jpeg", quality=93))
        if i % 300 == 0: print(f"{i}/{n}", flush=True)
    ff.stdin.close(); ff.wait()
    print("done", out)
