import React from "react";

export default function ProviderDropdown({ providers = [], activeProvider, onSelect }) {
  return (
    <select className="input" value={activeProvider || ""} onChange={(e) => onSelect?.(e.target.value)}>
      {providers.map((p) => (
        <option key={p.id} value={p.id}>{p.name}</option>
      ))}
    </select>
  );
}
