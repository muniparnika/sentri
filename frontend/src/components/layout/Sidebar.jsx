import React, { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { Home, FolderKanban, CheckSquare, PlayCircle, BarChart3, Bot, Server,
    Settings, ChevronDown, Check, ChevronRight
} from "lucide-react";
import AppLogo from "./AppLogo.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import { userHasRole } from "../../utils/roles.js";
import { api } from "../../api.js";

const NAV_GROUPS = [
  {
    label: "Core",
    items: [
      { to: "/dashboard", icon: Home, label: "Dashboard", tour: "tour-dashboard" },
      { to: "/projects",  icon: FolderKanban, label: "Projects",  tour: "tour-projects" },
      { to: "/tests",     icon: CheckSquare, label: "Tests", tour: "tour-tests" },
    ],
  },
  {
    label: "Activity",
    items: [
      { to: "/runs",    icon: PlayCircle, label: "Runs" },
      { to: "/reports", icon: BarChart3, label: "Reports" },
    ],
  },
  {
    label: "Automation",
    items: [
      { to: "/automation", icon: Bot, label: "Automation" },
      { to: "/system",     icon: Server, label: "System" },
    ],
  },
];

/** Tiny coloured avatar generated from workspace initials. */
function WorkspaceAvatar({ name }) {
  const initials = (name || "W")
    .split(/\s+/)
    .slice(0, 2)
    .map(w => w[0])
    .join("")
    .toUpperCase();

  /* Deterministic hue from name characters */
  const hue = Array.from(name || "W").reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360;

  return (
    <span style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      width: 28, height: 28, borderRadius: 7, flexShrink: 0,
      background: `hsl(${hue},50%,88%)`,
      color: `hsl(${hue},55%,32%)`,
      fontSize: "0.68rem", fontWeight: 700, letterSpacing: "0.02em",
      border: `1px solid hsl(${hue},40%,80%)`,
    }}>
      {initials}
    </span>
  );
}

export default function Sidebar({ open }) {
  const { user, login } = useAuth();
  const isAdmin = userHasRole(user, "admin");
  const navigate = useNavigate();
  const [wsMenuOpen, setWsMenuOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const hasMultipleWorkspaces = user?.workspaces?.length > 1;

  async function handleSwitchWorkspace(workspaceId) {
    if (workspaceId === user?.workspaceId || switching) return;
    setSwitching(true);
    try {
      const { user: updated } = await api.switchWorkspace(workspaceId);
      login(updated);
      setWsMenuOpen(false);
      navigate("/dashboard");
    } catch (err) {
      console.error("Workspace switch failed:", err);
    } finally {
      setSwitching(false);
    }
  }

  return (
    <aside
      className={open ? "sidebar-open" : ""}
      style={{
        width: 216,
        background: "var(--surface)",
        borderRight: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
        position: "sticky",
        top: 0,
        height: "100vh",
        overflowY: "auto",
        overflowX: "hidden",
      }}
    >
      {/* ── Logo ── */}
      <div style={{ padding: "18px 16px 16px", borderBottom: "1px solid var(--border)" }}>
        <AppLogo size={28} variant="full" />
      </div>

      {/* ── Workspace Switcher ── */}
      <div style={{ padding: "10px 10px 8px", borderBottom: "1px solid var(--border)", position: "relative" }}>
        <button
          onClick={() => hasMultipleWorkspaces && setWsMenuOpen(o => !o)}
          style={{
            display: "flex", alignItems: "center", gap: 9, width: "100%",
            padding: "7px 8px", borderRadius: "var(--radius)", border: "none",
            background: wsMenuOpen ? "var(--bg2)" : "transparent",
            cursor: hasMultipleWorkspaces ? "pointer" : "default",
            textAlign: "left", transition: "background 0.12s",
          }}
          onMouseEnter={e => { if (hasMultipleWorkspaces) e.currentTarget.style.background = "var(--bg2)"; }}
          onMouseLeave={e => { if (!wsMenuOpen) e.currentTarget.style.background = "transparent"; }}
        >
          <WorkspaceAvatar name={user?.workspaceName || "My Workspace"} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: "0.8rem", fontWeight: 600, color: "var(--text)",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.3,
            }}>
              {user?.workspaceName || "My Workspace"}
            </div>
            <div style={{ fontSize: "0.69rem", color: "var(--text3)", textTransform: "capitalize", lineHeight: 1.3 }}>
              {user?.workspaceRole || "Personal"}
            </div>
          </div>
          {hasMultipleWorkspaces && (
            <ChevronDown
              size={13} color="var(--text3)"
              style={{ flexShrink: 0, transition: "transform 0.15s", transform: wsMenuOpen ? "rotate(180deg)" : "none" }}
            />
          )}
        </button>

        {/* Workspace dropdown */}
        {wsMenuOpen && hasMultipleWorkspaces && (
          <div style={{
            position: "absolute", left: 8, right: 8, top: "100%", zIndex: 50,
            background: "var(--surface)", border: "1px solid var(--border)",
            borderRadius: "var(--radius)", boxShadow: "var(--shadow)",
            padding: "4px 0", marginTop: 4, maxHeight: 200, overflowY: "auto",
          }}>
            {user.workspaces.map(ws => {
              const isCurrent = ws.id === user.workspaceId;
              return (
                <button
                  key={ws.id}
                  onClick={() => handleSwitchWorkspace(ws.id)}
                  disabled={switching}
                  style={{
                    display: "flex", alignItems: "center", gap: 8, width: "100%",
                    padding: "7px 10px", border: "none", borderRadius: 0,
                    background: isCurrent ? "var(--accent-bg)" : "transparent",
                    cursor: isCurrent ? "default" : "pointer",
                    textAlign: "left", fontSize: "0.78rem", color: "var(--text)",
                    transition: "background 0.1s",
                  }}
                  onMouseEnter={e => { if (!isCurrent) e.currentTarget.style.background = "var(--bg2)"; }}
                  onMouseLeave={e => { if (!isCurrent) e.currentTarget.style.background = "transparent"; }}
                >
                  <WorkspaceAvatar name={ws.name} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: isCurrent ? 600 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {ws.name}
                    </div>
                    <div style={{ fontSize: "0.65rem", color: "var(--text3)", textTransform: "capitalize" }}>
                      {ws.role}{ws.isOwner ? " · Owner" : ""}
                    </div>
                  </div>
                  {isCurrent && <Check size={13} color="var(--accent)" style={{ flexShrink: 0 }} />}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Nav groups ── */}
      <nav style={{ padding: "14px 10px", flex: 1, display: "flex", flexDirection: "column", gap: 20 }}>
        {NAV_GROUPS.map(group => (
          <div key={group.label}>
            {/* Section label */}
            <div style={{
              fontSize: "0.64rem", fontWeight: 700, letterSpacing: "0.09em",
              textTransform: "uppercase", color: "var(--text3)",
              padding: "0 8px", marginBottom: 5, userSelect: "none",
            }}>
              {group.label}
            </div>

            {/* Nav items */}
            <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
              {group.items.map(item => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className="nav-link"
                  data-tour={item.tour || undefined}
                  style={({ isActive }) => ({
                    display: "flex", alignItems: "center", gap: 9,
                    padding: "7px 10px", borderRadius: "var(--radius)",
                    fontWeight: isActive ? 600 : 400, fontSize: "0.86rem",
                    color: isActive ? "var(--accent)" : "var(--text2)",
                    background: isActive ? "var(--accent-bg)" : "transparent",
                    textDecoration: "none", transition: "all 0.12s",
                    position: "relative",
                  })}
                >
                  {({ isActive }) => (
                    <>
                      {isActive && (
                        <span style={{
                          position: "absolute", left: 0, top: "50%",
                          transform: "translateY(-50%)",
                          width: 3, height: 18, borderRadius: "0 3px 3px 0",
                          background: "var(--accent)",
                        }} />
                      )}
                      <item.icon size={16} style={{ flexShrink: 0 }} strokeWidth={isActive ? 2.4 : 1.6} />
                      <span>{item.label}</span>
                      {isActive && (
                        <ChevronRight size={12} style={{ marginLeft: "auto", flexShrink: 0 }} color="var(--accent)" />
                      )}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* ── Settings footer (admin only) ── */}
      {isAdmin && (
        <div style={{ padding: "10px 10px 14px", borderTop: "1px solid var(--border)" }}>
          <NavLink
            to="/settings"
            className="nav-link"
            data-tour="tour-settings"
            style={({ isActive }) => ({
              display: "flex", alignItems: "center", gap: 9,
              padding: "7px 10px", borderRadius: "var(--radius)",
              fontWeight: isActive ? 600 : 400, fontSize: "0.86rem",
              color: isActive ? "var(--accent)" : "var(--text2)",
              background: isActive ? "var(--accent-bg)" : "transparent",
              textDecoration: "none", transition: "all 0.12s",
            })}
          >
            <Settings size={15} strokeWidth={1.8} />
            <span>Settings</span>
          </NavLink>
        </div>
      )}
    </aside>
  );
}