# Match analytics redesign

The two match-detail tabs now share one player-selection component and two explicit layout modules. No game-data service or gameplay automation is changed.

## Layout and interaction

- **Detailed statistics:** stable player header, vertical category navigation, independently scrolling values. Selecting an avatar uses a complete rounded surface and equal-width outline with a check indicator, not a bottom line. The old `headerCompact` scroll-state feedback loop is removed rather than tuned again.
- **Comparison:** exact values remain visible. Positive bars start at zero, signed bars share a centered scale, and text/boolean metrics do not invent a quantitative bar. The primary and comparison tracks have identical widths. All original metric groups, raw-field lookup, search and ten-player comparisons remain available.
- **Events:** chronological stream with champion portraits and player IDs; raw champion aliases are not visible headings. Filters remain on the right when an event is opened; details expand directly below the selected event. Damage is grouped by champion, with skills beneath each champion. Event selection toggles open/closed and Escape closes the panel. Filter counts respect participant scope; timeline navigation does not reset filters.
- **Information density:** rank pills, repetitive instruction text, duplicate selected-player portraits on timeline nodes, and stacked patch styles are removed. Missing damage data is shown as unavailable rather than zero.

## Readability refinement (2026-09-20)

Comparison mode now has named player columns, two full-size numeric values, equal-width quantitative tracks and a signed current-minus-comparison difference visible in each row. Summary values include the comparison player too; the compact viewport preserves both values. UI typography uses a local system text stack with upright glyphs, regular/medium numeric weights and tabular numerals; no font files or dependencies are added.

The event headline count is removed. A full-width three-lane time histogram groups events into 48 time bins, with regular time ticks, nearest-event pointer targeting, preview text, a position marker and previous/next buttons. Arrow keys navigate individual events (including equal timestamps), Home/End jump to bounds, and selection preserves filters. Histogram heights are a visual density cue, not damage values or a kill-difference graph. Fight groups have complete boundaries, separate title bands and inset row dividers; event details remain nested below the selected row.

## Pointer, identity and multi-kill correction

The time cursor follows continuous pointer pixels through a single requestAnimationFrame update; it no longer snaps to the nearest event timestamp. Event lookup affects only the compact pictogram preview. Static histogram lanes are memoized. Hover does not change selection or scroll the list, and releasing a drag commits one event. Preview content is actor portrait / action icon / victim portrait, or actor portrait / objective icon / Chinese lane text. Accessible labels and tooltips retain full context.

Player names in the event stream, roster, damage groups and comparison views use player IDs, not English champion aliases. Comparison column headers stay sticky inside the data scroller and keep both portraits visible at compact widths. Event rows and group headers are slightly shorter without removing group boundaries.

Multi-kill handling accepts both inline CHAMPION_KILL.multiKillLength and separate CHAMPION_SPECIAL_KILL with killType=KILL_MULTI. Explicit notifications are attached to the same killer's matching kill, with duplicate notifications suppressed. Unmatched notifications remain standalone; victim and damage data are not fabricated. A fight window containing several different killers is NOT a multi-kill. When match summaries report multi-kills but their timeline notifications are absent, the filter shows unavailable rather than a false zero. The browser fixture now supplies separate award events, not inline-only synthetic data.

Schema reference: RiotTuxedo's match-v5 transition notes, https://gist.github.com/RiotTuxedo/758ee4d88693b768a880ece93cd78663 (CHAMPION_SPECIAL_KILL is a separate timeline event). This run verified local code and synthetic renderer fixtures; the currently running app's saved debugging endpoint was unavailable, so no claim is made that every historical live match was checked.

## Artwork

Thirty small League client PNG assets (about 193 KiB) are bundled with a SHA-256 provenance manifest. Riot Games owns the artwork; CommunityDragon is the independent source mirror, not an official Riot CDN. The interface no longer needs to request these category and event icons from a mutable `latest` URL while opening a tab. Champion and ability data still use the existing asset services.

## Verification

Run `npm run check` for lint, both TypeScript projects, style budgets and unit tests.

Run `npm run check:match-ui` for a browser regression test against the **actual React components and styles with a synthetic match fixture**. An installed Edge/Chromium browser is used without adding a new dependency. Set `MATCH_UI_BROWSER` for a nonstandard executable location. `MATCH_UI_PROXY` optionally configures only the isolated test-browser session; system proxy settings are not changed.

The browser test checks avatar selection, metrics, comparison scale, fixed header geometry around the former collapse threshold, persistent filters, in-place event details, counts, keyboard close, missing damage and viewport overflow. Local screenshots and `report.json` are written to `.ui-review/`, which is ignored by Git. The fixture does not contact the live game client or change saved matches.

## Captured preview

Open `docs/ui-review/index.html` for captured states of the actual components with synthetic match data. `docs/ui-review/report.json` records the associated browser checks. These are review snapshots, not live match data.

## Review scope

Renderer source files, stylesheet imports, small local images, the test harness, package scripts and this documentation are the intended changes. Temporary migration scripts are not retained. WebCodex's saved result and the user's running checkout are distinct; review/application status must be confirmed separately before claiming the running application has changed.
