/**
 * @module components/test/TestConfig
 * @description Unified test-generation config surface used by Test Lab (and a
 * drop-in replacement for the legacy `TestDials` modal panel). Renders the
 * full Test Dials surface + explorer tuning as a horizontal sub-tab strip
 * styled to match Test Lab's `.tl-*` chip / select primitives.
 *
 * Sub-tabs: Dials | Explorer | Options | Advanced
 *
 * Controlled via `value` / `onChange` so callers own dialsConfig state.
 * Persistence helpers live in `utils/testDialsStorage.js`.
 */
import React, { useMemo, useState } from "react";
import {
  SlidersHorizontal, Cpu, Settings2, Globe, Save, RotateCcw,
} from "lucide-react";
import {
  APPROACH_OPTIONS, PERSPECTIVE_OPTIONS, QUALITY_OPTIONS, FORMAT_OPTIONS,
  TEST_COUNT_OPTIONS, PROFILE_OPTIONS,
  EXPLORE_MODE_OPTIONS, EXPLORER_INTENSITY_PRESETS, EXPLORER_TUNING,
  PARALLEL_WORKERS_TUNING, OPTION_TOGGLES, LANGUAGES, DEFAULT_CONFIG,
} from "../../config/testDialsConfig.js";
import { countActiveDials, saveConfig } from "../../utils/testDialsStorage.js";
// ── Chip primitives — reuse Test Lab's `.tl-chip*` classes ──────────────────
function ChipGroup({ options, selected, onToggle }) {
  return (
    <div className="tl-chip-row">
      {options.map(opt => (
        <button
          key={opt.id}
          type="button"
          className={`tl-chip${selected.includes(opt.id) ? " tl-chip--on" : ""}`}
          onClick={() => onToggle(opt.id)}
          title={opt.desc}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
function RadioChips({ options, value, onChange }) {
  return (
    <div className="tl-chip-row">
      {options.map(opt => (
        <button
          key={opt.id}
          type="button"
          className={`tl-chip${value === opt.id ? " tl-chip--on" : ""}`}
          onClick={() => onChange(opt.id)}
          title={opt.desc}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
const CONFIG_TABS = [
  { id: "dials",    label: "Dials",    icon: SlidersHorizontal },
  { id: "explorer", label: "Explorer", icon: Cpu },
  { id: "options",  label: "Options",  icon: Settings2 },
  { id: "advanced", label: "Advanced", icon: Globe },
];
/**
 * @param {Object}   props
 * @param {Object}   props.value          - Current dialsConfig (DEFAULT_CONFIG shape).
 * @param {Function} props.onChange       - Called with the next dialsConfig.
 * @param {string}   [props.activeTab]    - Controlled active sub-tab id.
 * @param {Function} [props.onTabChange]  - Called when the user clicks a sub-tab.
 * @param {boolean}  [props.showExplorer] - Hide the Explorer tab when the host
 *   flow doesn't crawl (e.g. Generate from Requirement). Default true.
 * @param {boolean}  [props.showFooter]   - Show the Save / Reset footer. Default true.
 */
export default function TestConfig({
  value,
  onChange,
  activeTab,
  onTabChange,
  showExplorer = true,
  showFooter   = true,
}) {
  const cfg = useMemo(() => ({
    ...DEFAULT_CONFIG,
    ...(value || {}),
    options: { ...DEFAULT_CONFIG.options, ...((value || {}).options || {}) },
  }), [value]);
  const [internalTab, setInternalTab] = useState("dials");
  const tab    = activeTab ?? internalTab;
  const setTab = onTabChange ?? setInternalTab;
  const [savedFlash, setSavedFlash] = useState(false);
  // Direct option clicks invalidate the active profile preset.
  function update(patch) {
    onChange?.({ ...cfg, profile: "", ...patch });
  }
  function applyProfile(profileId) {
    const p = PROFILE_OPTIONS.find(x => x.id === profileId);
    if (!p) { onChange?.({ ...cfg, profile: "" }); return; }
    onChange?.({
      ...cfg,
      profile:      p.id,
      approach:     p.approach,
      perspectives: [...p.perspectives],
      quality:      [...p.quality],
      format:       p.format,
      testCount:    p.testCount,
      // Reset explorer tuning so a preset switch doesn't carry over stale values.
      exploreMode:          p.exploreMode || DEFAULT_CONFIG.exploreMode,
      exploreMaxStates:     DEFAULT_CONFIG.exploreMaxStates,
      exploreMaxDepth:      DEFAULT_CONFIG.exploreMaxDepth,
      exploreMaxActions:    DEFAULT_CONFIG.exploreMaxActions,
      exploreActionTimeout: DEFAULT_CONFIG.exploreActionTimeout,
    });
  }
  const togglePerspective = (id) => update({
    perspectives: cfg.perspectives.includes(id)
      ? cfg.perspectives.filter(x => x !== id)
      : [...cfg.perspectives, id],
  });
  const toggleQuality = (id) => update({
    quality: cfg.quality.includes(id)
      ? cfg.quality.filter(x => x !== id)
      : [...cfg.quality, id],
  });
  const toggleOption = (id) => update({
    options: { ...cfg.options, [id]: !cfg.options?.[id] },
  });
  // Detect which intensity preset matches the current tuning, if any.
  const activePreset = EXPLORER_INTENSITY_PRESETS.find(p =>
    Object.entries(p.values).every(([k, v]) => cfg[k] === v),
  )?.id || "custom";
  function handleSave() {
    saveConfig(cfg);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1800);
  }
  const visibleTabs = CONFIG_TABS.filter(t => t.id !== "explorer" || showExplorer);
  const activeCount = countActiveDials(cfg);
  return (
    <div className="tc-wrap">
      {/* ── Sub-tab strip ── */}
      <div className="tc-tabs">
        {visibleTabs.map(t => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              className={`tc-tab${tab === t.id ? " tc-tab--active" : ""}`}
              onClick={() => setTab(t.id)}
            >
              <Icon size={13} />
              {t.label}
            </button>
          );
        })}
        <span className="tc-active-count" title={`${activeCount} dial${activeCount === 1 ? "" : "s"} active`}>
          {activeCount} active
        </span>
      </div>
      {/* ── Dials tab ── */}
      {tab === "dials" && (
        <div className="tc-panel">
          <div className="tl-section">
            <div className="tl-section-label">Quick profile</div>
            <select
              className="tl-select"
              value={cfg.profile || ""}
              onChange={e => applyProfile(e.target.value)}
              style={{ width: "100%" }}
            >
              <option value="">Custom (no preset)</option>
              {PROFILE_OPTIONS.map(p => (
                <option key={p.id} value={p.id}>{p.label} — {p.desc}</option>
              ))}
            </select>
          </div>
          <div className="tl-section">
            <div className="tl-section-label">Coverage approach</div>
            <RadioChips options={APPROACH_OPTIONS} value={cfg.approach}
              onChange={(id) => update({ approach: id })} />
          </div>
          <div className="tl-section">
            <div className="tl-section-label">Number of tests</div>
            <RadioChips options={TEST_COUNT_OPTIONS} value={cfg.testCount}
              onChange={(id) => update({ testCount: id })} />
          </div>
          <div className="tl-section">
            <div className="tl-section-label">Test perspectives</div>
            <ChipGroup options={PERSPECTIVE_OPTIONS}
              selected={cfg.perspectives} onToggle={togglePerspective} />
          </div>
          <div className="tl-section">
            <div className="tl-section-label">Quality checks</div>
            <ChipGroup options={QUALITY_OPTIONS}
              selected={cfg.quality} onToggle={toggleQuality} />
          </div>
          <div className="tl-section">
            <div className="tl-section-label">Output format</div>
            <RadioChips options={FORMAT_OPTIONS} value={cfg.format}
              onChange={(id) => update({ format: id })} />
          </div>
        </div>
      )}
      {/* ── Explorer tab — discovery mode + intensity preset + custom tuning ── */}
      {tab === "explorer" && showExplorer && (
        <div className="tc-panel">
          <div className="tl-section">
            <div className="tl-section-label">Discovery mode</div>
            <div className="tl-mode-grid">
              {EXPLORE_MODE_OPTIONS.map(opt => (
                <div
                  key={opt.id}
                  className={`tl-mode-card${cfg.exploreMode === opt.id ? " tl-mode-card--selected" : ""}`}
                  onClick={() => update({ exploreMode: opt.id })}
                >
                  <div className="tl-mode-icon">{opt.id === "crawl" ? "🔗" : "⚡"}</div>
                  <div className="tl-mode-title">{opt.label}</div>
                  <div className="tl-mode-desc">{opt.desc}</div>
                </div>
              ))}
            </div>
          </div>
          {cfg.exploreMode === "state" && (
            <>
              <div className="tl-section">
                <div className="tl-section-label">Explorer intensity</div>
                <div className="tl-chip-row">
                  {EXPLORER_INTENSITY_PRESETS.map(p => (
                    <button
                      key={p.id}
                      type="button"
                      className={`tl-chip${activePreset === p.id ? " tl-chip--on" : ""}`}
                      onClick={() => onChange?.({ ...cfg, ...p.values })}
                      title={p.desc}
                    >
                      {p.icon} {p.label} <span style={{ color: "var(--text3)", marginLeft: 4 }}>{p.desc}</span>
                    </button>
                  ))}
                  {activePreset === "custom" && (
                    <span className="tl-chip tl-chip--on" style={{ pointerEvents: "none" }}>Custom</span>
                  )}
                </div>
              </div>
              <div className="tl-section">
                <div className="tl-section-label">Custom tuning</div>
                <div className="tc-sliders">
                  {EXPLORER_TUNING.map(t => (
                    <div key={t.id} className="tc-slider">
                      <div className="tc-slider-head">
                        <span className="tc-slider-label">{t.label}</span>
                        <span className="tc-slider-value">{cfg[t.id] ?? t.defaultVal}</span>
                      </div>
                      <input
                        type="range"
                        min={t.min}
                        max={t.max}
                        step={t.step}
                        value={cfg[t.id] ?? t.defaultVal}
                        onChange={e => onChange?.({ ...cfg, [t.id]: parseInt(e.target.value, 10) })}
                        style={{ width: "100%", accentColor: "var(--accent)", cursor: "pointer" }}
                      />
                      <div className="tc-slider-desc">{t.desc}</div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}
      {/* ── Options tab — extra output-tweak toggles ── */}
      {tab === "options" && (
        <div className="tc-panel">
          <div className="tl-section">
            <div className="tl-section-label">Extra options</div>
            <div className="tc-toggle-list">
              {OPTION_TOGGLES.map(opt => {
                const on = !!cfg.options?.[opt.id];
                return (
                  <label key={opt.id} className="tc-toggle-row">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => toggleOption(opt.id)}
                      style={{ accentColor: "var(--accent)", cursor: "pointer", width: 14, height: 14, marginTop: 3 }}
                    />
                    <div>
                      <div className="tc-toggle-title" style={{ fontWeight: on ? 600 : 500 }}>{opt.label}</div>
                      <div className="tc-toggle-desc">{opt.desc}</div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        </div>
      )}
      {/* ── Advanced tab — language, custom instructions, parallelWorkers ── */}
      {tab === "advanced" && (
        <div className="tc-panel">
          <div className="tl-section">
            <div className="tl-section-label">Output language</div>
            <select
              className="tl-select"
              value={cfg.language}
              onChange={e => update({ language: e.target.value })}
              style={{ width: "100%" }}
            >
              {LANGUAGES.map(l => (
                <option key={l.code} value={l.code}>{l.label}</option>
              ))}
            </select>
          </div>
          <div className="tl-section">
            <div className="tl-section-label">Custom instructions</div>
            <textarea
              className="tl-req-area"
              value={cfg.customInstructions || ""}
              onChange={e => {
                if (e.target.value.length <= 500) update({ customInstructions: e.target.value });
              }}
              placeholder="Tell the AI anything else — flows to include, things to avoid, domain context… (max 500 chars)"
              rows={3}
            />
            <div className="tc-char-count">
              {(cfg.customInstructions || "").length} / 500 characters
            </div>
          </div>
          <div className="tl-section">
            <div className="tl-section-label">{PARALLEL_WORKERS_TUNING.label}</div>
            <div className="tc-slider">
              <div className="tc-slider-head">
                <span className="tc-slider-label">Workers</span>
                <span className="tc-slider-value">{cfg.parallelWorkers ?? PARALLEL_WORKERS_TUNING.defaultVal}</span>
              </div>
              <input
                type="range"
                min={PARALLEL_WORKERS_TUNING.min}
                max={PARALLEL_WORKERS_TUNING.max}
                step={PARALLEL_WORKERS_TUNING.step}
                value={cfg.parallelWorkers ?? PARALLEL_WORKERS_TUNING.defaultVal}
                onChange={e => update({ parallelWorkers: parseInt(e.target.value, 10) })}
                style={{ width: "100%", accentColor: "var(--accent)", cursor: "pointer" }}
              />
              <div className="tc-slider-desc">{PARALLEL_WORKERS_TUNING.desc}</div>
            </div>
          </div>
        </div>
      )}
      {/* ── Footer: Save as default / Reset ── */}
      {showFooter && (
        <div className="tc-footer">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={handleSave}
            title="Persist this configuration to localStorage as your default"
            style={savedFlash ? { background: "var(--green-bg)", color: "var(--green)", borderColor: "var(--green)" } : undefined}
          >
            <Save size={13} />
            {savedFlash ? "Saved!" : "Save as default"}
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => onChange?.({ ...DEFAULT_CONFIG })}
            title="Reset all dials to the built-in defaults"
          >
            <RotateCcw size={13} />
            Reset
          </button>
        </div>
      )}
    </div>
  );
}

