import re

path = r"C:\Users\Administrator\Desktop\个人项目\_akari\out\renderer\assets\OngoingGamePanel.vue_vue_type_script_setup_true_lang-7zI0hvSl.js"
src = open(path, encoding="utf-8", errors="replace").read()

for marker in ['"flex"', "flex:", "solo:", "UNRANKED", "RANKED_SOLO", "RANKED_FLEX", "championPoints", "championLevel"]:
    hits = [m.start() for m in re.finditer(re.escape(marker), src)]
    print("=" * 100)
    print(marker, "->", len(hits), hits[:8])
    for h in hits[:2]:
        print(src[max(0, h - 700):h + 700])
        print("-" * 60)
