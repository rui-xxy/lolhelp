import io, sys

target = r"C:\Users\Administrator\Desktop\个人项目\lolhelp\src\renderer\styles\index.css"
block_path = r"C:\Users\Administrator\Desktop\个人项目\lolhelp\.workbuddy-ai\live-css-block.css"

src = io.open(target, encoding="utf-8").read()
block = io.open(block_path, encoding="utf-8").read()

start_marker = "\n  .live-panel-board {"
end_marker = "\n  .match-result-card {"

start = src.index(start_marker)
end = src.index(end_marker)

print("start", start, "end", end, "removing", end - start, "chars")
print("head:", repr(src[start:start + 40]))
print("tail:", repr(src[end - 40:end]))

new = src[:start] + "\n" + block + src[end + 1:]
io.open(target, "w", encoding="utf-8", newline="\n").write(new)
print("written, new length", len(new))
