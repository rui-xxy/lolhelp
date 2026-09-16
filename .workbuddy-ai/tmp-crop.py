from PIL import Image

src = r"C:\Users\Administrator\.workbuddy-ai\clipboard-images\clipboard-2026-09-14T18-16-49-626Z-fda0edd0.png"
im = Image.open(src)
out_dir = r"C:\Users\Administrator\Desktop\个人项目\lolhelp\.workbuddy-ai"

crops = {
    "crop-a.png": (0, 0, 700, 40, 2.2),
    "crop-b.png": (30, 40, 700, 125, 2.2),
}
for name, (x1, y1, x2, y2, z) in crops.items():
    c = im.crop((x1, y1, x2, y2))
    c = c.resize((int(c.width * z), int(c.height * z)), Image.LANCZOS)
    p = out_dir + "\\" + name
    c.save(p)
    print("saved", p, c.size)
