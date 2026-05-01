import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { api } from "../../api.js";
import { API_PATH } from "../../utils/apiBase.js";
import { useSseStream } from "../../hooks/useSseStream.js";
import LiveBrowserView from "./LiveBrowserView.jsx";

export default function RecorderModal({ open, onClose, onSaved, projectId, defaultUrl = "" }) {
  const [phase, setPhase] = useState("idle");
  const [startUrl, setStartUrl] = useState(defaultUrl);
  const [sessionId, setSessionId] = useState(null);
  const [actions, setActions] = useState([]);
  const [frames, setFrames] = useState([]);
  const [name, setName] = useState("");
  const [assertKind, setAssertKind] = useState("assertVisible");
  const [assertSelector, setAssertSelector] = useState("");
  const [assertValue, setAssertValue] = useState("");
  const [assertLabel, setAssertLabel] = useState("");
  const [error, setError] = useState(null);
  const [viewport, setViewport] = useState({ width: 1280, height: 720 });
  const pollRef = useRef(null);
  const sessionIdRef = useRef(null);
  const projectIdRef = useRef(projectId);
  const lastMoveRef = useRef(0);

  const handleInput = useCallback((event) => {
    const sid = sessionIdRef.current;
    const pid = projectIdRef.current;
    if (!sid || !pid) return;
    if (event.type === "mouseMoved") {
      const now = Date.now();
      if (now - lastMoveRef.current < 33) return;
      lastMoveRef.current = now;
    }
    api.recordInput(pid, sid, event).catch(() => {});
  }, []);

  useEffect(() => { setStartUrl(defaultUrl); }, [defaultUrl]);
  useEffect(() => { sessionIdRef.current = sessionId; }, [sessionId]);
  useEffect(() => { projectIdRef.current = projectId; }, [projectId]);

  const sseUrl = sessionId ? `${API_PATH}/runs/${sessionId}/events` : null;
  useSseStream(sseUrl, useCallback((event) => {
    if (event?.type === "frame" && event.data) setFrames([event.data]);
  }, []), Boolean(sessionId));

  useEffect(() => {
    return () => {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      if (sessionIdRef.current && projectIdRef.current) {
        api.recordDiscard(projectIdRef.current, sessionIdRef.current).catch(() => {});
        sessionIdRef.current = null;
      }
    };
  }, []);

  async function handleStart() {
    setError(null);
    setActions([]);
    setFrames([]);
    if (!startUrl || !/^https?:\/\//i.test(startUrl)) {
      setError("Enter a valid http(s) URL to record from.");
      return;
    }
    const stale = sessionIdRef.current;
    if (stale) {
      api.recordDiscard(projectIdRef.current || projectId, stale).catch(() => {});
      sessionIdRef.current = null;
      setSessionId(null);
    }
    teardownStreams();
    setPhase("starting");
    try {
      const { sessionId: sid, viewport: vp } = await api.recordStart(projectId, { startUrl });
      setSessionId(sid);
      if (vp && vp.width > 0 && vp.height > 0) setViewport({ width: vp.width, height: vp.height });
      setPhase("recording");
      pollRef.current = setInterval(async () => {
        try {
          const status = await api.recordStatus(projectId, sid);
          setActions(status.actions || []);
        } catch (e) {
          if (e.status === 404) { clearInterval(pollRef.current); pollRef.current = null; }
        }
      }, 1200);
    } catch (e) {
      setError(e.message || "failed to start recorder");
      setPhase("error");
    }
  }

  async function handleStopAndSave() {
    if (!sessionId) return;
    setPhase("stopping");
    setError(null);
    try {
      const result = await api.recordStop(projectId, sessionId, {
        name: name.trim() || `Recorded flow @ ${new Date().toISOString()}`,
      });
      teardownStreams();
      sessionIdRef.current = null;
      setSessionId(null);
      onSaved?.(result.test);
      onClose?.();
    } catch (e) {
      setError(e.message || "failed to stop recorder");
      setPhase("error");
    }
  }

  async function handleAddAssertion() {
    if (!sessionId) return;
    if (assertKind !== "assertUrl" && !assertSelector.trim()) {
      setError("Selector is required for this verification."); return;
    }
    if ((assertKind === "assertText" || assertKind === "assertValue" || assertKind === "assertUrl") && !assertValue.trim()) {
      setError("Value is required for this verification."); return;
    }
    setError(null);
    try {
      await api.recordAddAssertion(projectId, sessionId, {
        kind: assertKind,
        selector: assertKind === "assertUrl" ? undefined : assertSelector.trim(),
        label: assertLabel.trim() || undefined,
        value: assertValue.trim() || undefined,
      });
      setAssertValue("");
    } catch (e) {
      setError(e.message || "failed to add verification");
    }
  }

  function teardownStreams() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }

  function handleCancel() {
    if (sessionId) api.recordDiscard(projectId, sessionId).catch(() => {});
    teardownStreams();
    sessionIdRef.current = null;
    setPhase("idle");
    setSessionId(null);
    onClose?.();
  }

  if (!open) return null;

  const isIdle = phase === "idle" || phase === "error" || phase === "starting";

  return createPortal(
    <div style={{
      position: "fixed",
      top: 0, left: 0, right: 0, bottom: 0,
      width: "100vw", height: "100vh",
      zIndex: 99999,
      background: "var(--bg)",
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
      cursor: "default",
    }}>

      {/* ── Top bar ── */}
      <div style={{
        height: 52,
        borderBottom: "1px solid var(--border)",
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "0 20px",
        flexShrink: 0,
        background: "var(--bg)",
      }}>
        <span style={{ fontSize: 20 }}>🎥</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: "0.95rem", lineHeight: 1.2 }}>Record a test</div>
          <div style={{ fontSize: "0.74rem", color: "var(--text3)" }}>
            Interact with the app in the live browser — every click, fill, and navigation is captured as a Playwright step.
          </div>
        </div>
        <button
          onClick={handleCancel}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "6px 14px", borderRadius: 6,
            border: "1px solid var(--border)", background: "var(--bg2)",
            color: "var(--text)", fontSize: "0.82rem", fontWeight: 600,
            cursor: "pointer", whiteSpace: "nowrap",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          {phase === "recording" || phase === "stopping" ? "Discard & Exit" : "Exit"}
        </button>
      </div>

      {/* ── IDLE: clean centred form, no repeated title ── */}
      {isIdle && (
        <div style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "auto",
          background: "var(--bg)",
        }}>
          <div style={{ width: 560 }}>

            {/* Section title */}
            <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--text)", marginBottom: 20 }}>
              New recording
            </div>

            {/* Two fields stacked, each with its own label */}
            <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 24 }}>

              {/* Test name */}
              <div>
                <label style={{
                  display: "block", fontSize: "0.82rem", fontWeight: 600,
                  color: "var(--text)", marginBottom: 6,
                }}>
                  Test name
                </label>
                <input
                  className="input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Login happy path"
                  style={{ width: "100%", fontSize: "0.9rem" }}
                />
              </div>

              {/* Starting URL */}
              <div>
                <label style={{
                  display: "flex", alignItems: "center", gap: 4,
                  fontSize: "0.82rem", fontWeight: 600,
                  color: "var(--text)", marginBottom: 6,
                }}>
                  Starting URL
                  <span style={{ color: "var(--accent)", fontSize: "0.9rem" }}>*</span>
                </label>
                <input
                  className="input"
                  value={startUrl}
                  onChange={(e) => setStartUrl(e.target.value)}
                  placeholder="https://example.com"
                  style={{ width: "100%", fontSize: "0.9rem" }}
                  onKeyDown={(e) => e.key === "Enter" && handleStart()}
                  autoFocus
                />
              </div>
            </div>

            {error && (
              <div className="banner banner-error" style={{ marginBottom: 16 }}>{error}</div>
            )}

            {/* Divider */}
            <div style={{ borderTop: "1px solid var(--border)", marginBottom: 20 }} />

            {/* Actions */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button className="btn btn-ghost" onClick={handleCancel}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleStart}
                disabled={phase === "starting"}
                style={{ minWidth: 148 }}
              >
                {phase === "starting" ? "Launching…" : "Launch recorder"}
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ── RECORDING: two-column grid ── */}
      {!isIdle && (
        <div style={{
          flex: 1,
          overflow: "auto",
          padding: 20,
          display: "grid",
          gridTemplateColumns: "1fr 300px",
          gap: 16,
          cursor: "default",
        }}>
          <div>
            <LiveBrowserView
              frames={frames}
              label={sessionId || ""}
              onInput={handleInput}
              viewportW={viewport.width}
              viewportH={viewport.height}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", minHeight: 300 }}>
            <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
              Captured steps ({actions.length})
            </div>
            <div style={{ flex: 1, overflow: "auto", border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg2)" }}>
              {actions.length === 0 ? (
                <div style={{ padding: 16, fontSize: "0.76rem", color: "var(--text3)", fontStyle: "italic" }}>
                  No actions captured yet. Click, type, or navigate in the live browser on the left.
                </div>
              ) : (
                <ol style={{ margin: 0, padding: "10px 14px 10px 30px", fontSize: "0.75rem", fontFamily: "var(--font-mono)", color: "var(--text2)" }}>
                  {actions.map((a, i) => (
                    <li key={i} style={{ marginBottom: 4, lineHeight: 1.5 }}>
                      <span style={{ fontWeight: 700, color: "var(--accent)" }}>{a.kind}</span>
                      {a.selector && <span style={{ color: "var(--text3)" }}> → {a.selector}</span>}
                      {a.value && <span style={{ color: "var(--green)" }}> = "{a.value.slice(0, 40)}"</span>}
                      {a.url && <span style={{ color: "var(--blue)" }}> {a.url}</span>}
                      {a.key && <span style={{ color: "var(--amber)" }}> {a.key}</span>}
                    </li>
                  ))}
                </ol>
              )}
            </div>

            {phase === "recording" && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
                  Add verification
                </div>
                <select className="input" value={assertKind} onChange={(e) => setAssertKind(e.target.value)} style={{ width: "100%", marginBottom: 6 }}>
                  <option value="assertVisible">Element visible</option>
                  <option value="assertText">Element contains text</option>
                  <option value="assertValue">Field has value</option>
                  <option value="assertUrl">URL contains</option>
                </select>
                {assertKind !== "assertUrl" && (
                  <input
                    className="input"
                    value={assertSelector}
                    onChange={(e) => setAssertSelector(e.target.value)}
                    placeholder='selector (e.g. role=button[name="Checkout"])'
                    style={{ width: "100%", marginBottom: 6 }}
                  />
                )}
                <input
                  className="input"
                  value={assertLabel}
                  onChange={(e) => setAssertLabel(e.target.value)}
                  placeholder="friendly label (optional)"
                  style={{ width: "100%", marginBottom: 6 }}
                />
                {(assertKind === "assertText" || assertKind === "assertValue" || assertKind === "assertUrl") && (
                  <input
                    className="input"
                    value={assertValue}
                    onChange={(e) => setAssertValue(e.target.value)}
                    placeholder={assertKind === "assertUrl" ? "URL fragment or regex text" : "expected value"}
                    style={{ width: "100%", marginBottom: 8 }}
                  />
                )}
                <button className="btn btn-ghost" onClick={handleAddAssertion} style={{ width: "100%", marginBottom: 12 }}>
                  Add verification step
                </button>
                <label className="text-sm font-semi" style={{ display: "block", marginBottom: 6 }}>Test name</label>
                <input
                  className="input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Login happy path"
                  style={{ width: "100%", marginBottom: 10 }}
                />
                <button
                  className="btn btn-primary"
                  onClick={handleStopAndSave}
                  disabled={actions.length === 0 || phase === "stopping"}
                  style={{ width: "100%" }}
                >
                  {phase === "stopping" ? "Saving…" : `Stop & save (${actions.length})`}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  , document.body);
}