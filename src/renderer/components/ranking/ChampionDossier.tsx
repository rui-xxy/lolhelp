import { motion } from 'framer-motion';
import { Flame, Shield, Snowflake, Swords, TrendingDown, TrendingUp } from 'lucide-react';
import { useEffect, useState } from 'react';
import type {
  ChampionCounterSummary,
  ChampionDetail,
  ChampionDetailBuild,
  ChampionDetailRequest,
  ChampionRankingEntry,
  ChampionRankingMode,
  ChampionRankingPosition,
  ChampionRankingRegion,
} from '../../../shared/api';
import { cn } from '../../lib/utils';
import {
  championVerdict,
  formatGames,
  formatPercent,
  formatSigned,
  gameLengthLabel,
  powerCurve,
  primaryRateLabel,
  rankChange,
  thirdRate,
  thirdRateLabel,
  tierLabel,
  tierNote,
  type RankingAverages,
} from './rankingModel';
import {
  GradeChip,
  Portrait,
  SectionTitle,
  SkeletonLines,
  SkillMatrix,
  SkillPriority,
  Sparkline,
  championSplash,
} from './rankingParts';

const ROLE_NAMES: Record<string, string> = {
  Assassin: '刺客',
  Fighter: '战士',
  Mage: '法师',
  Marksman: '射手',
  Support: '辅助',
  Tank: '坦克',
};

const POSITION_NAMES: Record<string, string> = {
  TOP: '上单',
  JUNGLE: '打野',
  MID: '中单',
  ADC: '下路',
  SUPPORT: '辅助',
};

const detailCache = new Map<string, ChampionDetail>();

function useChampionDetail(request: ChampionDetailRequest | null) {
  const key = request ? JSON.stringify(request) : '';
  const [state, setState] = useState<{ key: string; detail: ChampionDetail | null; error: string; loading: boolean }>({
    key: '',
    detail: null,
    error: '',
    loading: false,
  });

  useEffect(() => {
    if (!request) return undefined;
    const cached = detailCache.get(key);
    if (cached) {
      setState({ key, detail: cached, error: '', loading: false });
      return undefined;
    }
    let cancelled = false;
    setState({ key, detail: null, error: '', loading: true });
    window.lolHelper.ranking.getChampionDetail(request)
      .then((result) => {
        if (cancelled) return;
        if (result.detail) detailCache.set(key, result.detail);
        setState({ key, detail: result.detail, error: result.error ?? '', loading: false });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setState({ key, detail: null, error: error instanceof Error ? error.message : '英雄详情获取失败', loading: false });
      });
    return () => {
      cancelled = true;
    };
    // key 已经包含了 request 的全部内容
  }, [key]);

  return state.key === key ? state : { key, detail: null, error: '', loading: Boolean(request) };
}

function BuildRow({ build, compact = false }: { build: ChampionDetailBuild; compact?: boolean }) {
  return (
    <div className={cn('rk-build-row', compact && 'is-compact')}>
      <span className="rk-build-row__items">
        {build.items.map((item, index) => (
          <span key={`${item.id}-${index}`} className="rk-build-row__item">
            {index > 0 && !compact && <i aria-hidden="true">›</i>}
            <img src={item.icon} alt={item.name} title={item.name} loading="lazy" />
          </span>
        ))}
      </span>
      <span className="rk-build-row__stats">
        <b className="num">{formatPercent(build.winRate)}</b>
        <small className="num">{formatPercent(build.pickRate)} · {formatGames(build.games)}场</small>
      </span>
    </div>
  );
}

function MatchupList({ title, icon: Icon, tone, matchups }: {
  title: string;
  icon: typeof Swords;
  tone: 'tough' | 'easy';
  matchups: ChampionCounterSummary[];
}) {
  if (!matchups.length) return null;
  return (
    <div className={cn('rk-matchups', `rk-matchups--${tone}`)}>
      <span className="rk-matchups__title"><Icon className="size-3.5" />{title}</span>
      <div className="rk-matchups__list">
        {matchups.map((matchup) => (
          <span key={matchup.champion.id} className="rk-matchup" title={`${matchup.champion.name} · ${formatGames(matchup.games)} 场`}>
            <Portrait src={matchup.champion.avatar} fallbackId={matchup.champion.id} name={matchup.champion.name} size={34} />
            <small>{matchup.champion.name}</small>
            <b className="num">{formatPercent(matchup.winRate)}</b>
          </span>
        ))}
      </div>
    </div>
  );
}

function DetailBody({ detail, mode, averages }: { detail: ChampionDetail; mode: ChampionRankingMode; averages: RankingAverages }) {
  const curve = powerCurve(detail.gameLengths);
  const maxLength = Math.max(...detail.gameLengths.map((point) => point.winRate), 50);
  const minLength = Math.min(...detail.gameLengths.map((point) => point.winRate), 50);
  const rune = detail.runes[0];
  const skill = detail.skills[0];
  const rateLabel = primaryRateLabel(mode);

  return (
    <>
      {detail.trend.length > 1 && (
        <section className="rk-dossier__section">
          <SectionTitle title="版本走势" hint={`近 ${detail.trend.length} 个版本的${rateLabel}`} />
          <Sparkline
            values={detail.trend.map((point) => point.winRate)}
            labels={detail.trend.map((point) => `${point.version} 版本${point.rank ? ` · 第 ${point.rank}` : ''}`)}
            reference={averages.winRate}
          />
        </section>
      )}

      {detail.gameLengths.length > 1 && (
        <section className="rk-dossier__section">
          <SectionTitle title="强势期" hint={curve.label} />
          <div className="rk-curve">
            {detail.gameLengths.map((point, index) => {
              const height = 18 + ((point.winRate - minLength) / Math.max(0.5, maxLength - minLength)) * 82;
              return (
                <span
                  key={point.minute}
                  className={cn('rk-curve__bar', point.winRate >= 50 ? 'is-up' : 'is-down', curve.peak === point && 'is-peak')}
                  title={`${gameLengthLabel(point.minute, index)} 分钟 · 胜率 ${formatPercent(point.winRate)}`}
                >
                  <i style={{ height: `${height}%` }} />
                  <b className="num">{point.winRate.toFixed(1)}</b>
                  <small className="num">{gameLengthLabel(point.minute, index)}′</small>
                </span>
              );
            })}
          </div>
          <p className="rk-dossier__note">{curve.note}</p>
        </section>
      )}

      {(detail.core.length > 0 || detail.boots.length > 0) && (
        <section className="rk-dossier__section">
          <SectionTitle title="核心出装" hint="胜率 · 使用率" />
          <div className="rk-build-list">
            {detail.core.slice(0, 3).map((build, index) => <BuildRow key={`core-${index}`} build={build} />)}
          </div>
          <div className="rk-build-pair">
            {detail.boots[0] && (
              <div>
                <small>鞋子</small>
                <BuildRow build={detail.boots[0]} compact />
              </div>
            )}
            {detail.starters[0] && (
              <div>
                <small>出门装</small>
                <BuildRow build={detail.starters[0]} compact />
              </div>
            )}
          </div>
        </section>
      )}

      {rune && (
        <section className="rk-dossier__section">
          <SectionTitle title="符文" hint={`${formatPercent(rune.winRate)} 胜率 · ${formatPercent(rune.pickRate)} 使用`} />
          <div className="rk-rune">
            {rune.keystone && (
              <span className="rk-rune__keystone" title={rune.keystone.name}>
                <img src={rune.keystone.icon} alt={rune.keystone.name} />
                <small>{rune.keystone.name}</small>
              </span>
            )}
            <span className="rk-rune__rows">
              <span className="rk-rune__row">
                {rune.primaryStyle && <img className="is-style" src={rune.primaryStyle.icon} alt={rune.primaryStyle.name} title={rune.primaryStyle.name} />}
                {rune.primary.map((item) => <img key={item.id} src={item.icon} alt={item.name} title={item.name} />)}
              </span>
              <span className="rk-rune__row is-secondary">
                {rune.secondaryStyle && <img className="is-style" src={rune.secondaryStyle.icon} alt={rune.secondaryStyle.name} title={rune.secondaryStyle.name} />}
                {rune.secondary.map((item) => <img key={item.id} src={item.icon} alt={item.name} title={item.name} />)}
              </span>
            </span>
          </div>
          {detail.spells[0] && (
            <div className="rk-spells">
              <small>召唤师技能</small>
              {detail.spells[0].items.map((spell) => <img key={spell.id} src={spell.icon} alt={spell.name} title={spell.name} />)}
              <span className="num">{formatPercent(detail.spells[0].pickRate)}</span>
            </div>
          )}
        </section>
      )}

      {skill && (
        <section className="rk-dossier__section">
          <SectionTitle title="技能加点" hint={<SkillPriority keys={skill.priority} />} />
          {skill.order.length > 0 && <SkillMatrix order={skill.order} />}
        </section>
      )}

      {(detail.toughMatchups.length > 0 || detail.easyMatchups.length > 0) && (
        <section className="rk-dossier__section">
          <SectionTitle title="对位" hint="你对上他们的胜率" />
          <MatchupList title="难缠对手" icon={Shield} tone="tough" matchups={detail.toughMatchups} />
          <MatchupList title="容易拿捏" icon={Swords} tone="easy" matchups={detail.easyMatchups} />
        </section>
      )}
    </>
  );
}

export function ChampionDossier({
  entry,
  mode,
  averages,
  total,
  region,
  tier,
  position,
}: {
  entry: ChampionRankingEntry | null;
  mode: Exclude<ChampionRankingMode, 'hextech'>;
  averages: RankingAverages;
  total: number;
  region: ChampionRankingRegion;
  tier: string;
  position: ChampionRankingPosition;
}) {
  const detailPosition = position === 'ALL' ? entry?.mainPosition ?? 'TOP' : position;
  const request: ChampionDetailRequest | null = entry
    ? { mode, championId: entry.champion.id, region, tier, position: mode === 'ranked' ? detailPosition : 'ALL' }
    : null;
  const state = useChampionDetail(request);

  if (!entry) {
    return (
      <aside className="rk-dossier rk-dossier--empty">
        <Flame className="size-5" />
        <span>选一位英雄，看看他现在强不强</span>
      </aside>
    );
  }

  const verdict = championVerdict(entry, averages, mode);
  const label = tierLabel(entry.tier);
  const change = rankChange(entry);
  const third = thirdRate(entry, mode);
  const winDelta = entry.winRate - averages.winRate;
  const roles = entry.champion.tags.map((tag) => ROLE_NAMES[tag] ?? tag).filter(Boolean);
  const VerdictIcon = verdict.tone === 'strong' || verdict.tone === 'good'
    ? TrendingUp
    : verdict.tone === 'neutral' ? Snowflake : TrendingDown;

  return (
    <motion.aside
      key={`${entry.champion.id}-${mode}`}
      className="rk-dossier"
      initial={{ opacity: 0.6 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.18 }}
    >
      <div className="rk-dossier__scroll">
        <header className={cn('rk-dossier__hero', `rk-tone--${label === 'S+' ? 'splus' : label.toLowerCase()}`)}>
          <img className="rk-dossier__splash" src={championSplash(entry.champion.alias)} alt="" draggable={false} />
          <div className="rk-dossier__identity">
            <Portrait src={entry.champion.avatar} fallbackId={entry.champion.id} name={entry.champion.name} size={56} />
            <div>
              <p>
                {entry.champion.title}
                {roles.length > 0 && <span> · {roles.join(' / ')}</span>}
                {mode === 'ranked' && <span> · {POSITION_NAMES[detailPosition] ?? ''}</span>}
              </p>
              <h2>{entry.champion.name}</h2>
            </div>
            <div className="rk-dossier__rank">
              <GradeChip label={label} title={tierNote(entry.tier)} />
              <span className="num">#{entry.rank}<small>/{total}</small></span>
            </div>
          </div>
        </header>

        <div className={cn('rk-verdict', `rk-verdict--${verdict.tone}`)}>
          <VerdictIcon className="size-4" />
          <div>
            <strong>{verdict.headline}</strong>
            <ul>
              {verdict.reasons.map((reason) => <li key={reason}>{reason}</li>)}
            </ul>
          </div>
        </div>

        <div className="rk-dossier__stats">
          <span className={winDelta >= 0 ? 'is-up' : 'is-down'}>
            <small>{primaryRateLabel(mode)}</small>
            <b className="num">{formatPercent(entry.winRate)}</b>
            <em className="num">{formatSigned(winDelta)} vs 平均</em>
          </span>
          <span>
            <small>登场率</small>
            <b className="num">{formatPercent(entry.pickRate)}</b>
            <em className="num">{entry.roleRate !== null ? `本位置占 ${formatPercent(entry.roleRate, 0)}` : `${formatGames(entry.games)} 场`}</em>
          </span>
          <span>
            <small>{thirdRateLabel(mode)}</small>
            <b className="num">{formatPercent(third)}</b>
            <em className="num">
              {change === null ? (entry.kda !== null ? `KDA ${entry.kda.toFixed(2)}` : '') : change === 0 ? '排名持平' : change > 0 ? `排名 ↑${change}` : `排名 ↓${Math.abs(change)}`}
            </em>
          </span>
        </div>

        {state.detail ? (
          <DetailBody detail={state.detail} mode={mode} averages={averages} />
        ) : state.loading ? (
          <section className="rk-dossier__section">
            <SkeletonLines count={5} />
          </section>
        ) : state.error ? (
          <p className="rk-dossier__error">详细出装暂时拿不到：{state.error}</p>
        ) : null}

        <footer className="rk-dossier__foot num">{formatGames(entry.games)} 场样本 · OP.GG</footer>
      </div>
    </motion.aside>
  );
}
