import type { CSSProperties } from 'react';
import type { AssistChampionGuide } from '../../../shared/api';
import { GameIcon } from './GameIcon';
import { buildTime, type SkillPlan } from './matchBuildModel';

// 技能加点：先一句话说清「主 Q 副 E 最后 W，前三级怎么点，大招几级点」，
// 下面是逐级的加点表，颜色和上面的主副升对应：主升金色、副升青色、最后升灰色、大招紫色。

type Role = 'main' | 'second' | 'third' | 'ult' | 'other';

export function BuildSkillMatrix({ plan, spells }: {
  plan: SkillPlan;
  spells: AssistChampionGuide['spells'];
}) {
  if (plan.steps.length === 0) return <p className="bd-empty">无加点记录</p>;

  const roleOf = (key: string): Role => {
    if (key === 'R') return 'ult';
    const index = plan.priority.indexOf(key as 'Q' | 'W' | 'E');
    return index === 0 ? 'main' : index === 1 ? 'second' : index === 2 ? 'third' : 'other';
  };
  const spellOf = (key: string) => spells.find((spell) => spell.key === key);
  const columns = Array.from({ length: plan.columnCount }, (_, index) => index);

  return (
    <div className="bd-skills">
      <div className="bd-skills__summary">
        <div className="bd-skills__priority" aria-label={`技能主升顺序：${plan.priority.join(' 大于 ')}`}>
          {plan.priority.map((key, index) => {
            const spell = spellOf(key);
            return (
              <span key={key} className={`bd-skill-chip is-${roleOf(key)}`} title={spell?.name ? `${key} · ${spell.name}` : key}>
                {index > 0 && <i className="bd-skills__gt" aria-hidden="true">›</i>}
                <span className="bd-skill-chip__icon">
                  {spell?.icon ? <GameIcon src={spell.icon} alt="" size={26} /> : <b>{key}</b>}
                  <em>{key}</em>
                </span>
                <small>{index === 0 ? '主升' : index === 1 ? '副升' : '最后'}</small>
              </span>
            );
          })}
        </div>
        <dl className="bd-skills__facts">
          <div><dt>前三级</dt><dd>{plan.opening.join(' → ')}</dd></div>
          {plan.ultimateAt.length > 0 && <div><dt>大招</dt><dd>{plan.ultimateAt.join(' / ')} 级</dd></div>}
        </dl>
      </div>

      <div className="bd-grid" style={{ '--bd-cols': plan.columnCount } as CSSProperties} role="table" aria-label="逐级技能加点">
        <div className="bd-grid__row is-head" role="row">
          <span className="bd-grid__label" role="columnheader">等级</span>
          {columns.map((index) => (
            <span key={index} className={`bd-grid__num${plan.steps[index] ? '' : ' is-pending'}`} role="columnheader">{index + 1}</span>
          ))}
        </div>
        {plan.keys.map((key) => {
          const spell = spellOf(key);
          const role = roleOf(key);
          return (
            <div key={key} className={`bd-grid__row is-${role}`} role="row">
              <span className="bd-grid__label" role="rowheader" title={spell?.name || key}>
                {spell?.icon ? <GameIcon src={spell.icon} alt="" size={22} /> : <i className="bd-grid__noicon" aria-hidden="true" />}
                <b>{key}</b>
              </span>
              {columns.map((index) => {
                const step = plan.steps[index];
                const active = step?.key === key;
                const label = active
                  ? `${index + 1} 级 · ${key}${spell?.name ? ` ${spell.name}` : ''} 升到 ${step.rank} 级 · ${buildTime(step.timestamp)}`
                  : undefined;
                return (
                  <span key={index} className={`bd-grid__cell${active ? ' is-on' : ''}`} role="cell" title={label} aria-label={label}>
                    {active ? <b>{step.rank}</b> : <i aria-hidden="true" />}
                  </span>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
