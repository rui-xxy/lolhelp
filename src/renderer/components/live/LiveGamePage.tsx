import { useState, useEffect } from 'react';
import { Sparkles, Swords, Moon, Sun, Star } from 'lucide-react';
import { motion } from 'framer-motion';

// Mock Data（后续接真实数据后替换）
const blueTeam = [
  { id: 1, name: 'phetmenodi#vn2', champ: 'Qiyana', kda: '25.2', winRate: '55%', matches: 11,
    history: [
      { champ: 'Qiyana', type: '单双', score: '10/10/10', time: '4-2' },
      { champ: 'Qiyana', type: '单双', score: '4/2/2', time: '4-2', win: true },
      { champ: 'Qiyana', type: '单双', score: '4/18/10', time: '4-2' },
      { champ: 'Qiyana', type: '单双', score: '3/10/11', time: '3-31' },
      { champ: 'Qiyana', type: '单双', score: '11/9/14', time: '3-31', win: true },
      { champ: 'Qiyana', type: '单双', score: '18/7/10', time: '3-31', win: true },
    ]
  },
  { id: 2, name: 'DoremonDPT#bunny', champ: 'JarvanIV', kda: '35.4', winRate: '64%', matches: 11,
    history: [
      { champ: 'Nautilus', type: '单双', score: '9/3/5', time: '36分', win: true },
      { champ: 'Veigar', type: '单双', score: '3/4/1', time: '1时' },
      { champ: 'Malzahar', type: '单双', score: '3/4/7', time: '1时' },
      { champ: 'Kaisa', type: '单双', score: '6/7/10', time: '2时', win: true },
      { champ: 'Vex', type: '单双', score: '14/8/15', time: '3时', win: true },
      { champ: 'Kassadin', type: '单双', score: '15/8/13', time: '3时', win: true },
    ]
  },
  { id: 3, name: 'Dạ Mộc Tê#0001', champ: 'Ahri', kda: '28.7', winRate: '27%', matches: 11,
    history: [
      { champ: 'Ahri', type: '单双', score: '0/2/2', time: '36分' },
      { champ: 'Lux', type: '单双', score: '7/9/8', time: '1时' },
      { champ: 'Ahri', type: '单双', score: '4/8/14', time: '2时' },
      { champ: 'Ahri', type: '单双', score: '3/12/21', time: '4-1' },
      { champ: 'Ahri', type: '单双', score: '14/9/13', time: '3-29', win: true },
      { champ: 'Lux', type: '单双', score: '5/10/6', time: '3-29' },
    ]
  },
  { id: 4, name: 'Vào Cả Người#1997', champ: 'Caitlyn', kda: '26.8', winRate: '36%', matches: 11,
    history: [
      { champ: 'Caitlyn', type: '单双', score: '12/7/8', time: '5时' },
      { champ: 'Heimerdinger', type: '单双', score: '5/5/8', time: '5时' },
      { champ: 'Aatrox', type: '单双', score: '2/10/2', time: '6时' },
      { champ: 'Caitlyn', type: '单双', score: '2/5/4', time: '7时' },
      { champ: 'Caitlyn', type: '单双', score: '2/2/6', time: '10时', win: true },
      { champ: 'Heimerdinger', type: '单双', score: '0/1/1', time: '10时' },
    ]
  },
  { id: 5, name: 'Nguyễn Tấn Tài#8888', champ: 'Pantheon', kda: '35.8', winRate: '73%', matches: 11,
    history: [
      { champ: 'Pantheon', type: '单双', score: '0/1/2', time: '31分', win: true },
      { champ: 'Alistar', type: '单双', score: '0/4/11', time: '1时' },
      { champ: 'Pantheon', type: '单双', score: '1/5/16', time: '1时', win: true },
      { champ: 'Pantheon', type: '单双', score: '2/1/6', time: '2时', win: true },
      { champ: 'Lux', type: '单双', score: '2/7/12', time: '2时' },
      { champ: 'Pantheon', type: '单双', score: '4/4/9', time: '3时', win: true },
    ]
  }
];

const redTeam = [
  { id: 6, name: 'Dragùn Gió#5922', champ: 'Graves', kda: '50.4', winRate: '73%', matches: 11,
    history: [
      { champ: 'Aatrox', type: '单双', score: '5/3/9', time: '33分', win: true },
      { champ: 'Darius', type: '单双', score: '8/7/18', time: '1时', win: true },
      { champ: 'Ezreal', type: '单双', score: '7/3/7', time: '1时', win: true },
      { champ: 'Vayne', type: '单双', score: '11/4/11', time: '2时', win: true },
      { champ: 'Nidalee', type: '单双', score: '15/6/6', time: '3-29' },
      { champ: 'Jhin', type: '单双', score: '14/10/10', time: '3-29' },
    ]
  },
  { id: 7, name: 'crooooza#8601', champ: 'Zed', kda: '18.8', winRate: '55%', matches: 11,
    history: [
      { champ: 'Talon', type: '单双', score: '8/13/15', time: '42分' },
      { champ: 'Renekton', type: '单双', score: '12/9/4', time: '1时', win: true },
      { champ: 'Brand', type: '单双', score: '7/12/12', time: '2时' },
      { champ: 'Brand', type: '单双', score: '2/6/16', time: '2时', win: true },
      { champ: 'Zed', type: '单双', score: '4/15/14', time: '4-2', win: true },
      { champ: 'Sylas', type: '单双', score: '6/9/13', time: '4-2', win: true },
    ]
  },
  { id: 8, name: 'iu bé Miu#miuu', champ: 'Fizz', kda: '23.2', winRate: '73%', matches: 11,
    history: [
      { champ: 'Vex', type: '单双', score: '21/5/9', time: '33分', win: true },
      { champ: 'Xerath', type: '单双', score: '4/11/6', time: '1时', win: true },
      { champ: 'Fizz', type: '单双', score: '5/2/3', time: '1时', win: true },
      { champ: 'Ekko', type: '单双', score: '6/4/7', time: '2时', win: true },
      { champ: 'Vex', type: '单双', score: '9/9/5', time: '3-29' },
      { champ: 'Brand', type: '单双', score: '4/12/10', time: '3-29' },
    ]
  },
  { id: 9, name: 'July 14th 2000#VN2', champ: 'Ornn', kda: '19.6', winRate: '45%', matches: 11,
    history: [
      { champ: 'Ornn', type: '单双', score: '3/9/2', time: '23时' },
      { champ: 'Pantheon', type: '单双', score: '7/13/15', time: '4-2' },
      { champ: 'Rumble', type: '单双', score: '12/7/13', time: '4-1', win: true },
      { champ: 'Nautilus', type: '其他', score: '3/13/23', time: '3-31' },
      { champ: 'Nidalee', type: '单双', score: '8/11/8', time: '3-30' },
      { champ: 'LeeSin', type: '单双', score: '7/10/20', time: '3-28', win: true },
    ]
  },
  { id: 10, name: 'hniSgnoC0506#7947', champ: 'Karma', kda: '28.1', winRate: '27%', matches: 11,
    history: [
      { champ: 'Nautilus', type: '灵活', score: '4/12/7', time: '29分' },
      { champ: 'Karma', type: '单双', score: '13/9/22', time: '3-28', win: true },
      { champ: 'Karma', type: '单双', score: '7/4/13', time: '3-28', win: true },
      { champ: 'Nami', type: '单双', score: '11/9/10', time: '3-28' },
      { champ: 'Nautilus', type: '单双', score: '2/9/20', time: '3-27' },
      { champ: 'Sylas', type: '单双', score: '9/10/16', time: '3-27' },
    ]
  }
];

interface PlayerData {
  id: number; name: string; champ: string; kda: string; winRate: string; matches: number;
  history: { champ: string; type: string; score: string; time: string; win?: boolean }[];
}

// 塔罗牌卡组件
function TarotCard({ player, isRedTeam, isLoaded, index }: { player: PlayerData; isRedTeam?: boolean; isLoaded: boolean; index: number }) {
  return (
    <div className="group relative w-[196px] shrink-0 [perspective:1200px]">
      <motion.div
        className="relative h-full w-full [transform-style:preserve-3d]"
        initial={{ rotateY: 180 }}
        animate={{ rotateY: isLoaded ? 0 : 180 }}
        transition={{ duration: 1.2, delay: index * 0.15, type: 'spring', stiffness: 45, damping: 15 }}
      >
        {/* ===== 正面（数据） ===== */}
        <div className="relative w-full overflow-hidden rounded-sm border-2 border-[#b8956a] bg-[#fbf9f6] shadow-[0_4px_12px_rgba(139,115,85,0.15)] [backface-visibility:hidden]">
          <div className="pointer-events-none absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(circle at 50% 50%, #8b7355 1px, transparent 1px)', backgroundSize: '16px 16px' }} />

          {/* 头部 */}
          <div className={`relative border-b-2 border-[#b8956a] p-1.5 ${isRedTeam ? 'bg-gradient-to-br from-[#fff0f0] to-[#fbf9f6]' : 'bg-gradient-to-br from-[#f0f4ff] to-[#fbf9f6]'}`}>
            <div className="absolute left-0 top-0 h-px w-full bg-gradient-to-r from-transparent via-[#b8956a] to-transparent opacity-30" />
            <div className="flex items-center gap-1.5">
              <div className="relative size-8 shrink-0 overflow-hidden rounded-full border border-[#b8956a] shadow-inner">
                <img src={`https://ddragon.leagueoflegends.com/cdn/14.8.1/img/champion/${player.champ}.png`} alt={player.champ} className="h-full w-full scale-110 object-cover" />
              </div>
              <div className="flex min-w-0 flex-col">
                <span className="w-full truncate font-serif text-[11px] font-bold text-[#4a3b2c]">{player.name}</span>
                <div className="mt-0.5 flex items-center gap-1">
                  {isRedTeam ? <Sun size={9} className="text-[#c75b5b]" /> : <Moon size={9} className="text-[#5b8bc7]" />}
                  <span className="text-[9px] font-serif font-bold uppercase tracking-widest text-[#8b7355]">{isRedTeam ? 'Sun Arcana' : 'Moon Arcana'}</span>
                </div>
              </div>
            </div>
          </div>

          {/* 数据三宫格 */}
          <div className="grid grid-cols-3 gap-[1px] border-b-2 border-[#b8956a] bg-[#b8956a]">
            <div className="flex flex-col items-center bg-[#fbf9f6] py-0.5">
              <span className="mb-0.5 font-serif text-[8px] font-bold uppercase leading-none tracking-wider text-[#8b7355]">KDA</span>
              <span className="font-mono text-[11px] font-bold leading-none text-[#4a3b2c]">{player.kda}</span>
            </div>
            <div className="flex flex-col items-center bg-[#fbf9f6] py-0.5">
              <span className="mb-0.5 font-serif text-[8px] font-bold uppercase leading-none tracking-wider text-[#8b7355]">Win Rate</span>
              <span className={`font-mono text-[11px] font-bold leading-none ${parseInt(player.winRate) >= 50 ? 'text-[#4e8c61]' : 'text-[#c75b5b]'}`}>{player.winRate}</span>
            </div>
            <div className="flex flex-col items-center bg-[#fbf9f6] py-0.5">
              <span className="mb-0.5 font-serif text-[8px] font-bold uppercase leading-none tracking-wider text-[#8b7355]">Matches</span>
              <span className="font-mono text-[11px] font-bold leading-none text-[#4a3b2c]">{player.matches}</span>
            </div>
          </div>

          {/* 历史战绩 */}
          <div className="space-y-px bg-[#f5f2eb] p-1">
            <div className="mb-1 flex items-center justify-center gap-1.5 opacity-60">
              <div className="h-px flex-1 bg-gradient-to-r from-transparent to-[#b8956a]" />
              <Star size={7} className="text-[#b8956a]" />
              <div className="h-px flex-1 bg-gradient-to-l from-transparent to-[#b8956a]" />
            </div>
            {player.history.map((h, idx) => (
              <div key={idx} className="group/row flex items-center justify-between rounded border border-[#e8e3db] bg-[#fbf9f6] px-1.5 py-0.5 transition-all hover:border-[#b8956a] hover:shadow-sm">
                <div className="flex items-center gap-1.5">
                  <div className="size-4 shrink-0 overflow-hidden rounded-full border border-[#b8956a]/60 opacity-90">
                    <img src={`https://ddragon.leagueoflegends.com/cdn/14.8.1/img/champion/${h.champ}.png`} alt={h.champ} className="h-full w-full scale-110 object-cover" />
                  </div>
                  <span className="w-[20px] font-serif text-[9px] font-bold text-[#6b5d4f]">{h.type}</span>
                </div>
                <span className={`font-mono text-[11px] font-bold tracking-tight ${h.win ? 'text-[#4e8c61]' : 'text-[#c75b5b]'}`}>{h.score}</span>
                <span className="w-[30px] text-right font-mono text-[10px] font-bold tracking-tighter text-[#4a3b2c]">{h.time}</span>
              </div>
            ))}
            <div className="mt-1 flex items-center justify-center gap-1.5 opacity-60">
              <div className="h-px w-6 bg-gradient-to-r from-transparent to-[#b8956a]" />
              <div className="size-1 rounded-full bg-[#b8956a]" />
              <div className="h-px w-6 bg-gradient-to-l from-transparent to-[#b8956a]" />
            </div>
          </div>

          {/* 四角装饰 */}
          <div className="absolute left-1 top-1 size-2 border-t-[1.5px] border-l-[1.5px] border-[#b8956a]" />
          <div className="absolute right-1 top-1 size-2 border-t-[1.5px] border-r-[1.5px] border-[#b8956a]" />
          <div className="absolute bottom-1 left-1 size-2 border-b-[1.5px] border-l-[1.5px] border-[#b8956a]" />
          <div className="absolute bottom-1 right-1 size-2 border-b-[1.5px] border-r-[1.5px] border-[#b8956a]" />
        </div>

        {/* ===== 背面（封面） ===== */}
        <div className="absolute inset-0 flex h-full w-full flex-col items-center justify-center overflow-hidden rounded-sm border-2 border-[#b8956a] bg-[#fbf9f6] shadow-[0_4px_12px_rgba(139,115,85,0.15)] [backface-visibility:hidden] [transform:rotateY(180deg)]">
          <div className="pointer-events-none absolute inset-0 opacity-[0.05]" style={{ backgroundImage: 'radial-gradient(circle at 50% 50%, #8b7355 1px, transparent 1px)', backgroundSize: '12px 12px' }} />
          <div className="absolute inset-2 border border-[#b8956a]/40" />
          <div className="absolute inset-3 border border-[#b8956a]/20" />
          <div className="absolute left-1 top-1 size-4 border-t-[1.5px] border-l-[1.5px] border-[#b8956a]" />
          <div className="absolute right-1 top-1 size-4 border-t-[1.5px] border-r-[1.5px] border-[#b8956a]" />
          <div className="absolute bottom-1 left-1 size-4 border-b-[1.5px] border-l-[1.5px] border-[#b8956a]" />
          <div className="absolute bottom-1 right-1 size-4 border-b-[1.5px] border-r-[1.5px] border-[#b8956a]" />
          <div className="absolute top-8 flex w-full flex-col items-center">
            <Star size={10} className="mb-1 text-[#b8956a] opacity-80" />
            <span className="font-serif text-[10px] font-bold uppercase tracking-[0.4em] text-[#8b7355]">Destiny</span>
            <div className="mt-1 h-px w-16 bg-gradient-to-r from-transparent via-[#b8956a] to-transparent opacity-50" />
          </div>
          <div className="relative mt-2 flex items-center justify-center">
            <div className="absolute size-[110px] rotate-45 border border-[#b8956a]/40" />
            <div className="absolute size-[95px] rotate-45 border border-[#b8956a]/20" />
            <div className="absolute size-[130px] animate-[spin_30s_linear_infinite] rounded-full border border-dashed border-[#b8956a]/50" />
            <div className="absolute size-[140px] rounded-full border border-[#b8956a]/20" />
            <div className="relative z-10 size-20 overflow-hidden rounded-full border-[3px] border-[#b8956a] bg-[#fbf9f6] shadow-[0_0_20px_rgba(184,149,106,0.3)]">
              <img src={`https://ddragon.leagueoflegends.com/cdn/14.8.1/img/champion/${player.champ}.png`} alt={player.champ} className="h-full w-full scale-110 object-cover opacity-90 mix-blend-multiply" />
            </div>
          </div>
          <div className="absolute bottom-10 flex w-full flex-col items-center px-4">
            <span className="w-full truncate text-center font-serif text-[13px] font-bold text-[#4a3b2c]">{player.name}</span>
            <div className="mt-1.5 flex w-full items-center justify-center gap-2 opacity-80">
              <div className="h-px flex-1 bg-gradient-to-r from-transparent to-[#b8956a]" />
              <span className="font-mono text-[9px] uppercase tracking-widest text-[#b8956a]">{player.champ}</span>
              <div className="h-px flex-1 bg-gradient-to-l from-transparent to-[#b8956a]" />
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

export function LiveGamePage() {
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setIsLoaded(true), 2500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-[#f5ebd9] font-serif text-[#4a3b2c]">
      {/* 背景：羊皮纸纹理 + 渐变 + 对角虚线 */}
      <div className="pointer-events-none absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cream-paper.png')] opacity-40 mix-blend-multiply" />
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-[#f5ebd9] via-[#f0e6d2] to-[#e8dcc4]" />
      <div className="pointer-events-none absolute inset-0 z-0 opacity-[0.35]" style={{ backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='60' height='60' viewBox='0 0 60 60'><path d='M0 0 L60 60 M60 0 L0 60' stroke='%23b8956a' stroke-width='1' stroke-dasharray='5 5' opacity='0.5'/><path d='M27 30 L33 30 M30 27 L30 33 M-3 0 L3 0 M0 -3 L0 3 M57 0 L63 0 M60 -3 L60 3 M-3 60 L3 60 M0 57 L0 63 M57 60 L63 60 M60 57 L60 63' stroke='%23b8956a' stroke-width='1.5' stroke-linecap='round' opacity='1'/></svg>")`, backgroundSize: '60px 60px' }} />
      <div className="pointer-events-none absolute left-1/2 top-1/4 size-[600px] -translate-x-1/2 rounded-full bg-[#d4c5b0]/20 blur-[120px]" />

      {/* 主体内容（标题栏已移到 AppShell headerExtra） */}
      <div className="flex flex-1 items-center justify-center overflow-auto p-3">
        <div className="flex min-w-max flex-col pb-3">
          {/* 蓝队 */}
          <div className="flex gap-1">
            {blueTeam.map((player, idx) => <TarotCard key={player.id} player={player} isLoaded={isLoaded} index={idx} />)}
          </div>
          {/* 中央分隔线 */}
          <div className="my-1 flex w-full items-center gap-3 opacity-60">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-[#b8956a] to-transparent" />
            <Swords size={12} className="text-[#b8956a]" />
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-[#b8956a] to-transparent" />
          </div>
          {/* 红队 */}
          <div className="flex gap-1">
            {redTeam.map((player, idx) => <TarotCard key={player.id} player={player} isRedTeam isLoaded={isLoaded} index={idx + 5} />)}
          </div>
        </div>
      </div>
    </div>
  );
}
