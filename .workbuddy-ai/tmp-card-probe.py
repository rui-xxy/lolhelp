import re

path = r"C:\Users\Administrator\Desktop\个人项目\_akari\out\renderer\assets\OngoingGamePanel.vue_vue_type_script_setup_true_lang-7zI0hvSl.js"
src = open(path, encoding="utf-8", errors="replace").read()

for marker in [
    "PlayerInfoCard.self",
    "PlayerInfoCard.premade",
    "PlayerInfoCard.soloKills",
    "PlayerInfoCard.winRatePopover",
    "PlayerInfoCard.position.recentlyPlayed",
    "shortTiers.UNRANKED",
    "PlayerInfoCard.champion.masteryPoints",
]:
    for m in re.finditer(re.escape(marker), src):
        s = max(0, m.start() - 900)
        e = min(len(src), m.start() + 900)
        print("=" * 100)
        print(marker, "@", m.start())
        print(src[s:e])
        print()
        break
