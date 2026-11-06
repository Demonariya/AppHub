import { useEffect, useMemo, useState } from "react";
import {
  AppWindow, ArrowDownToLine, ArrowUpCircle, BookMarked, Boxes, Check,
  ChevronRight, Compass, Download, Grid2X2, HardDrive,
  Home, LoaderCircle, Moon, Package, Search, Settings, ShieldCheck, Sun,
  Terminal, Trash2, RefreshCw, AlertCircle
} from "lucide-react";
import { winget } from "./services/winget";
import type { CommandResult, PackageRow, SourceRow, WingetStatus } from "./types";

type Page = "Home" | "Discover" | "Categories" | "Installed" | "Updates" | "Downloads" | "Library" | "Package Sources" | "Settings";
const nav: { label: Page; icon: typeof Home }[] = [
  { label: "Home", icon: Home }, { label: "Discover", icon: Compass },
  { label: "Categories", icon: Grid2X2 }, { label: "Installed", icon: HardDrive },
  { label: "Updates", icon: ArrowUpCircle }, { label: "Downloads", icon: Download },
  { label: "Library", icon: BookMarked }, { label: "Package Sources", icon: Boxes },
  { label: "Settings", icon: Settings },
];

function App() {
  const [page, setPage] = useState<Page>("Home");
  const [query, setQuery] = useState("");
  const [packages, setPackages] = useState<PackageRow[]>([]);
  const [installed, setInstalled] = useState<PackageRow[]>([]);
  const [updates, setUpdates] = useState<PackageRow[]>([]);
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [status, setStatus] = useState<WingetStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [dark, setDark] = useState(true);
  const [selected, setSelected] = useState<PackageRow | null>(null);
  const [activity, setActivity] = useState<CommandResult | null>(null);

  const refresh = async () => {
    setBusy(true);
    try {
      const [s, i, u, so] = await Promise.all([winget.status(), winget.installed(), winget.updates(), winget.sources()]);
      setStatus(s); setInstalled(i); setUpdates(u); setSources(so);
    } catch (e) { setNotice(String(e)); }
    finally { setBusy(false); }
  };
  useEffect(() => { void refresh(); }, []);
  useEffect(() => { document.documentElement.dataset.theme = dark ? "dark" : "light"; }, [dark]);

  const runSearch = async (value = query) => {
    setBusy(true); setPage("Discover");
    try { setPackages(await winget.search(value.trim())); }
    catch (e) { setNotice(String(e)); }
    finally { setBusy(false); }
  };
  const runAction = async (kind: "install" | "uninstall" | "upgrade", item: PackageRow) => {
    if (!window.confirm(kind + " " + item.name + " (" + item.id + ")? WinGet will run the package operation.")) return;
    setBusy(true); setNotice("");
    try {
      const result = await winget[kind](item.id);
      setActivity(result);
      setNotice(result.success ? kind + " completed." : kind + " failed. See operation output.");
      if (result.success) await refresh();
    } catch (e) { setNotice(String(e)); }
    finally { setBusy(false); }
  };
  const visible = page === "Installed" ? installed : page === "Updates" ? updates : packages;
  const title = page === "Home" ? "Your software, in one place." : page;
  const summary = useMemo(() => ({ installed: installed.length, updates: updates.length, sources: sources.length }), [installed, updates, sources]);

  const packageCard = (p: PackageRow, action: "install" | "uninstall" | "upgrade") => (
    <article className="package-card" key={p.id}>
      <div className="app-icon"><AppWindow size={21} /></div>
      <div className="package-info"><strong>{p.name}</strong><span>{p.id}</span><small>{p.version}{p.available_version ? " → " + p.available_version : ""}</small></div>
      <button className="icon-button" title={action} disabled={busy} onClick={() => void runAction(action, p)}>
        {action === "install" ? <ArrowDownToLine size={17}/> : action === "upgrade" ? <ArrowUpCircle size={17}/> : <Trash2 size={17}/>}
      </button>
      <button className="text-button" onClick={() => setSelected(p)}>Details <ChevronRight size={14}/></button>
    </article>
  );

  return <div className="shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><Package size={20}/></div><div><b>AppHub</b><small>PACKAGE MANAGER</small></div></div>
      <div className="nav-label">WORKSPACE</div>
      <nav>{nav.map(({label, icon: Icon}) => <button key={label} className={"nav-item " + (page === label ? "active" : "")} onClick={() => { setPage(label); setSelected(null); }}>
        <Icon size={17}/><span>{label}</span>{label === "Updates" && updates.length > 0 && <em>{updates.length}</em>}
      </button>)}</nav>
      <div className="sidebar-bottom">
        <div className="source-state"><span className={status?.available ? "dot good" : "dot bad"}/><span>{status?.available ? "WinGet connected" : "WinGet unavailable"}</span></div>
        <div className="profile"><div className="avatar">A</div><div><b>Local device</b><small>Windows package store</small></div><ShieldCheck size={16}/></div>
      </div>
    </aside>
    <main className="main">
      <header className="topbar">
        <div className="breadcrumbs">AppHub <span>/</span> {page}</div>
        <div className="top-actions">
          <div className="searchbox"><Search size={16}/><input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === "Enter" && void runSearch()} placeholder="Search apps and package IDs..." /><kbd>↵</kbd></div>
          <button className="icon-button" onClick={() => void refresh()} title="Refresh"><RefreshCw size={17}/></button>
          <button className="icon-button" onClick={() => setDark(!dark)} title="Toggle theme">{dark ? <Sun size={17}/> : <Moon size={17}/>}</button>
        </div>
      </header>
      <section className="content">
        {notice && <div className="notice"><AlertCircle size={16}/><span>{notice}</span><button onClick={() => setNotice("")}>Dismiss</button></div>}
        {selected ? <div className="detail-view">
          <button className="back-link" onClick={() => setSelected(null)}>← Back to {page}</button>
          <div className="detail-head"><div className="app-icon large"><AppWindow size={30}/></div><div><h1>{selected.name}</h1><p>{selected.id}</p></div></div>
          <div className="detail-grid"><div className="detail-panel"><label>Package ID</label><b>{selected.id}</b></div><div className="detail-panel"><label>Installed version</label><b>{selected.version || "Not installed / unknown"}</b></div><div className="detail-panel"><label>Available version</label><b>{selected.available_version || "Not reported"}</b></div><div className="detail-panel"><label>Source</label><b>{selected.source || "WinGet source"}</b></div></div>
          <div className="detail-actions">
            <button className="primary" onClick={() => void runAction(installed.some(x => x.id === selected.id) ? "upgrade" : "install", selected)}>{installed.some(x => x.id === selected.id) ? "Update" : "Install"}</button>
            {installed.some(x => x.id === selected.id) && <button className="secondary" onClick={() => void runAction("uninstall", selected)}>Uninstall</button>}
            <button className="secondary" onClick={() => void navigator.clipboard.writeText(selected.id)}>Copy package ID</button>
          </div>
        </div> : page === "Home" ? <>
          <div className="hero"><div className="eyebrow"><span className="eyebrow-dot"/> WINDOWS PACKAGE MANAGEMENT</div><h1>{title}</h1><p>Discover, install and maintain software through the trusted WinGet package manager.</p><button className="primary" onClick={() => { setPage("Discover"); void runSearch(""); }}>Explore catalog <ChevronRight size={16}/></button><div className="hero-orbit"><div className="orbit-ring"/><div className="orbit-core"><Package size={38}/></div><div className="orbit-chip chip-one"><Check size={14}/> Verified source</div><div className="orbit-chip chip-two"><ArrowUpCircle size={14}/> Updates</div></div></div>
          <div className="stat-grid"><div className="stat-card"><span>Installed apps</span><strong>{summary.installed}</strong><small>Detected by WinGet</small></div><div className="stat-card"><span>Available updates</span><strong>{summary.updates}</strong><small>Ready to review</small></div><div className="stat-card"><span>Package sources</span><strong>{summary.sources}</strong><small>Configured on this device</small></div></div>
          <div className="section-head"><div><h2>Recently available updates</h2><p>Updates reported by your local WinGet configuration.</p></div><button className="subtle-link" onClick={() => setPage("Updates")}>View all <ChevronRight size={14}/></button></div>
          {updates.slice(0,4).map(p => packageCard(p,"upgrade"))}
          {updates.length === 0 && <div className="empty"><Check size={22}/><b>You're up to date</b><span>No available updates were reported.</span></div>}
        </> : page === "Settings" ? <><div className="page-heading"><div className="eyebrow">PREFERENCES</div><h1>Settings</h1><p>AppHub appearance and local package manager status.</p></div><div className="settings-row"><div><b>Appearance</b><span>Switch between graphite dark and light themes.</span></div><button className="secondary" onClick={() => setDark(!dark)}>{dark ? "Dark theme" : "Light theme"} · Toggle</button></div><div className="settings-row"><div><b>WinGet status</b><span>{status?.available ? "WinGet " + (status.version || "") + " detected" : "WinGet not detected"}</span></div><button className="secondary" onClick={() => void refresh()}>Check again</button></div></> :
        page === "Package Sources" ? <><div className="page-heading"><div className="eyebrow">CONFIGURATION</div><h1>Package sources</h1><p>Sources configured in WinGet. Only add sources you trust.</p></div>{sources.map(s => <div className="source-row" key={s.name}><div className="source-icon"><Boxes size={18}/></div><div><b>{s.name}</b><span>{s.argument}</span></div><small>{s.type}</small></div>)}{sources.length === 0 && <div className="empty">No source information available.</div>}</> :
        page === "Categories" ? <><div className="page-heading"><div className="eyebrow">BROWSE</div><h1>Categories</h1><p>Search WinGet using a category keyword. Classification is not inferred when package metadata is unavailable.</p></div><div className="category-grid">{["Browsers","Development","Gaming","Multimedia","Communication","Security","Productivity","Utilities","System Tools","Compression","Drivers & Hardware"].map(c => <button className="category-card" key={c} onClick={() => { setQuery(c); void runSearch(c); }}><Grid2X2 size={19}/><b>{c}</b><ChevronRight size={15}/></button>)}</div></> :
        page === "Downloads" || page === "Library" ? <><div className="page-heading"><div className="eyebrow">PERSONAL</div><h1>{page}</h1><p>{page === "Downloads" ? "WinGet does not expose a reliable universal download queue through its CLI output." : "Favorites and collections will be stored locally in a future library module."}</p></div><div className="empty"><Package size={22}/><b>{page === "Downloads" ? "No tracked downloads" : "Your library is ready to grow"}</b><span>{page === "Downloads" ? "Install activity is not presented as download progress." : "Browse packages and manage installed software from here."}</span></div></> :
        <><div className="page-heading"><div className="eyebrow">{page === "Updates" ? "MAINTENANCE" : page === "Installed" ? "ON THIS DEVICE" : "PACKAGE CATALOG"}</div><h1>{page}</h1><p>{page === "Installed" ? "Applications currently reported by WinGet." : page === "Updates" ? "Packages with updates reported by WinGet." : "Search the live WinGet catalog. Results are not bundled with AppHub."}</p></div>
          {page === "Discover" && <div className="filter-line"><button className="secondary" onClick={() => void runSearch()}>Search WinGet <Search size={15}/></button><span>{packages.length} results</span></div>}
          {busy && <div className="loading"><LoaderCircle className="spin" size={18}/> Querying WinGet…</div>}
          {(page === "Discover" ? packages : visible).map(p => packageCard(p, page === "Updates" ? "upgrade" : page === "Installed" ? "uninstall" : "install"))}
          {!busy && (page === "Discover" ? packages : visible).length === 0 && <div className="empty"><Search size={22}/><b>No packages to show</b><span>{page === "Discover" ? "Enter a package name or ID and press Enter." : "No rows were returned by WinGet."}</span></div>}
        </>}
        {activity && <details className="output-panel"><summary><Terminal size={15}/> Last WinGet operation output · exit code {activity.code ?? "unknown"}</summary><pre>{activity.stdout + (activity.stderr ? "\n" + activity.stderr : "")}</pre></details>}
        <footer>AppHub <span>0.1.0</span><span>Powered by WinGet</span></footer>
      </section>
    </main>
  </div>;
}

export default App;
