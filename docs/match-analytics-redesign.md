# Match analytics redesign

The two match-detail tabs now share one player-selection component and two explicit layout modules. No game-data service or gameplay automation is changed.

## Layout and interaction

- **Detailed statistics:** stable player header, vertical category navigation, independently scrolling values. Selecting an avatar uses a complete rounded surface and equal-width outline with a check indicator, not a bottom line. The old `headerCompact` scroll-state feedback loop is removed rather than tuned again.
- **Comparison:** exact values remain visible. Positive bars start at zero, signed bars share a centered scale, and text/boolean metrics do not invent a quantitative bar. The primary and comparison tracks have identical widths. All original metric groups, raw-field lookup, search and ten-player comparisons remain available.
- **Events:** chronological stream with hero name as primary identity and player ID as secondary identity. Filters remain on the right when an event is opened; details expand directly below the selected event. Damage is grouped by champion, with skills beneath each champion. Event selection toggles open/closed and Escape closes the panel. Filter counts respect participant scope; timeline navigation does not reset filters.
- **Information density:** rank pills, repetitive instruction text, duplicate selected-player portraits on timeline nodes, and stacked patch styles are removed. Missing damage data is shown as unavailable rather than zero.

## Readability refinement (2026-09-20)

Comparison mode now has named player columns, two full-size numeric values, equal-width quantitative tracks and a signed current-minus-comparison difference visible in each row. Summary values include the comparison player too; the compact viewport preserves both values. UI typography uses a local system text stack with upright glyphs, regular/medium numeric weights and tabular numerals; no font files or dependencies are added.

The event headline count is removed. A full-width three-lane time histogram groups events into 48 time bins, with regular time ticks, nearest-event pointer targeting, preview text, a position marker and previous/next buttons. Arrow keys navigate individual events (including equal timestamps), Home/End jump to bounds, and selection preserves filters. Histogram heights are a visual density cue, not damage values or a kill-difference graph. Fight groups have complete boundaries, separate title bands and inset row dividers; event details remain nested below the selected row.

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
