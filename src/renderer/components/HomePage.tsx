import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  AppSettings,
  AssistSettings,
  FriendInfo,
  LiveBattleInfo,
  PlayerDossier,
  PlayerLookupResult,
  SavedMatchFollowAlertPreview,
} from '../../shared/api';
import { SAVED_MATCHES_CHANGED_EVENT } from './match/savedMatchesStore';
import type { View } from './AppShell';
import { broadcastSettingsChanged, SETTINGS_CHANGED_EVENT } from '../lib/events';
import { IdentityBanner } from './home/IdentityBanner';
import { Wardrobe, type HallTarget } from './home/Wardrobe';
import { ProfilesCard } from './home/ProfilesCard';
import { FeedCard } from './home/FeedCard';
import { CollectionHall } from './home/CollectionHall';
import { collectionTotals, frequentChampions, useConfigProfiles, useMyCollection } from './home/homeData';

// 首页 = 我的衣帽间：
// 上面是名片（生涯背景原画 + 段位战绩 + 现在在干嘛 + 钱包 + 常用开关），
// 左下是衣橱（常玩英雄 × 皮肤，进收藏馆看全部），右下是设置方案（换号一键用上）和关注动态。

interface HomePageProps {
  active: boolean;
  connected: boolean;
  regionName: string;
  onNavigate: (view: View) => void;
  onPlayerSearch: (name: string, region?: string) => void;
  onOpenFollow: () => void;
}

const SPLASH = 'https://game.gtimg.cn/images/lol/act/img/skin/big';
const CDRAGON_SPLASH = 'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-splashes/';

export function HomePage({ active, connected, regionName, onNavigate, onPlayerSearch, onOpenFollow }: HomePageProps) {
  const [self, setSelf] = useState<PlayerLookupResult | null>(null);
  const [selfError, setSelfError] = useState('');
  const [loadingSelf, setLoadingSelf] = useState(false);
  const [dossier, setDossier] = useState<PlayerDossier | null>(null);
  const [battle, setBattle] = useState<LiveBattleInfo | null>(null);
  const [follows, setFollows] = useState<SavedMatchFollowAlertPreview[]>([]);
  const [friends, setFriends] = useState<FriendInfo[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [hall, setHall] = useState<HallTarget | null>(null);
  const [toast, setToast] = useState<{ id: number; text: string; tone: 'ok' | 'error' } | null>(null);

  const collection = useMyCollection(active && connected);
  const profiles = useConfigProfiles(active);

  const loadSelf = useCallback(async () => {
    setLoadingSelf(true);
    setSelfError('');
    try {
      const result = await window.lolHelper.match.search({ name: '', pageSize: 20 });
      if (result.error) {
        setSelfError(result.error);
      } else {
        setSelf(result);
        const puuid = result.profile?.puuid;
        if (puuid) {
          window.lolHelper.match.getPlayerDossier(puuid).then(setDossier).catch(() => undefined);
        }
      }
    } catch (error) {
      setSelfError(error instanceof Error ? error.message : '读取战绩失败');
    } finally {
      setLoadingSelf(false);
      setNow(Date.now());
    }
  }, []);

  const loadSide = useCallback(async () => {
    const [catalog, friendList, appSettings, battleInfo] = await Promise.allSettled([
      window.lolHelper.match.getSavedMatchesCatalog(),
      window.lolHelper.lcu.getFriends(),
      window.lolHelper.db.getSettings(),
      window.lolHelper.live.getBattle(),
    ]);
    if (catalog.status === 'fulfilled') {
      setFollows([...catalog.value.followAlerts].sort((a, b) => b.detectedAt - a.detectedAt).slice(0, 4));
    }
    if (friendList.status === 'fulfilled') setFriends(friendList.value);
    if (appSettings.status === 'fulfilled') setSettings(appSettings.value);
    if (battleInfo.status === 'fulfilled') setBattle(battleInfo.value);
    setNow(Date.now());
  }, []);

  useEffect(() => {
    if (!active) return;
    void loadSide();
  }, [active, loadSide]);

  useEffect(() => {
    if (connected) void loadSelf();
  }, [connected, loadSelf]);

  useEffect(() => {
    const unsubscribe = window.lolHelper.live.onStateChanged(() => {
      void window.lolHelper.live.getBattle().then(setBattle).catch(() => undefined);
    });
    const onSavedChanged = () => void loadSide();
    const onSettingsChanged = () => {
      void window.lolHelper.db.getSettings().then(setSettings).catch(() => undefined);
    };
    window.addEventListener(SAVED_MATCHES_CHANGED_EVENT, onSavedChanged);
    window.addEventListener(SETTINGS_CHANGED_EVENT, onSettingsChanged);
    return () => {
      unsubscribe();
      window.removeEventListener(SAVED_MATCHES_CHANGED_EVENT, onSavedChanged);
      window.removeEventListener(SETTINGS_CHANGED_EVENT, onSettingsChanged);
    };
  }, [loadSide]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(null), toast.tone === 'error' ? 6000 : 3500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const notify = useCallback((text: string, tone: 'ok' | 'error' = 'ok') => setToast({ id: Date.now(), text, tone }), []);

  const toggleAssist = (key: keyof AssistSettings, value: boolean) => {
    if (!settings) return;
    const nextAssist = { ...settings.assist, [key]: value } as AssistSettings;
    setSettings({ ...settings, assist: nextAssist });
    void window.lolHelper.db.updateSettings({ assist: nextAssist }).then((saved) => {
      setSettings(saved);
      broadcastSettingsChanged('home');
    }).catch(() => {
      setSettings(settings);
    });
  };

  const matches = useMemo(() => self?.matches ?? [], [self]);
  const profile = self?.profile ?? null;
  const data = collection.data;
  const wardrobe = useMemo(() => (data ? frequentChampions(data, matches, 10) : []), [data, matches]);
  const totals = useMemo(() => (data ? collectionTotals(data) : null), [data]);
  const favoriteOrder = useMemo(() => wardrobe.map((item) => item.champion.id), [wardrobe]);

  // 名片背景：客户端里设的生涯背景；没设就用最常玩英雄身上最好的那款皮肤
  const art = useMemo(() => {
    const backgroundId = dossier?.backgroundSkinId;
    if (backgroundId) {
      return { splash: `${SPLASH}${backgroundId}.jpg`, fallback: `${CDRAGON_SPLASH}${Math.floor(backgroundId / 1000)}/${backgroundId}.jpg` };
    }
    const top = wardrobe[0];
    const skin = top?.skins.find((item) => item.owned && !item.isBase) ?? top?.skins.find((item) => item.isBase);
    if (skin) return { splash: skin.splash, fallback: skin.splashFallback };
    const championId = matches[0]?.championId;
    return championId ? { splash: `${SPLASH}${championId * 1000}.jpg` } : null;
  }, [dossier, matches, wardrobe]);

  return (
    <div className="hm-page">
      <div className="hm">
        <IdentityBanner
          connected={connected}
          loading={loadingSelf}
          error={selfError}
          profile={profile}
          matches={matches}
          summary={self?.summary ?? null}
          dossier={dossier}
          regionName={regionName}
          art={art}
          battle={battle}
          wallet={data?.wallet ?? null}
          settings={settings}
          onToggle={toggleAssist}
          onRefresh={() => {
            void loadSelf();
            collection.reload();
          }}
          onOpenHistory={() => profile && onPlayerSearch(profile.riotId)}
          onOpenLive={() => onNavigate('live')}
        />

        <Wardrobe
          connected={connected}
          loading={collection.loading}
          error={collection.error}
          champions={wardrobe}
          totals={totals}
          onReload={collection.reload}
          onOpenHall={(target) => setHall(target ?? {})}
        />

        <div className="hm-side">
          <ProfilesCard profiles={profiles} connected={connected} onManage={() => onNavigate('settings')} onNotice={notify} />
          <FeedCard follows={follows} friends={friends} now={now} onPlayerSearch={onPlayerSearch} onOpenFollow={onOpenFollow} />
        </div>
      </div>

      <CollectionHall
        open={hall !== null}
        collection={data}
        loading={collection.loading}
        error={collection.error}
        favoriteOrder={favoriteOrder}
        target={hall}
        onReload={collection.reload}
        onClose={() => setHall(null)}
      />

      {toast && (
        <div key={toast.id} className="hm-toast" data-tone={toast.tone} role="status">
          {toast.text}
        </div>
      )}
    </div>
  );
}
