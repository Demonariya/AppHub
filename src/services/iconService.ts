import { Package } from '../types';

/**
 * Curated authentic high-resolution icons hosted on high-uptime CDNs and verified endpoints.
 * All URLs have been verified to return HTTP 200 with legitimate image payloads.
 */
const VERIFIED_ICONS: Record<string, string> = {
  // Browsers
  'Mozilla.Firefox': 'https://raw.githubusercontent.com/alrra/browser-logos/main/src/firefox/firefox_128x128.png',
  'Google.Chrome': 'https://raw.githubusercontent.com/alrra/browser-logos/main/src/chrome/chrome_128x128.png',
  'Brave.Brave': 'https://raw.githubusercontent.com/alrra/browser-logos/main/src/brave/brave_128x128.png',
  'TheBrowserCompany.Arc': 'https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://arc.net&size=128',
  'Microsoft.Edge': 'https://raw.githubusercontent.com/alrra/browser-logos/main/src/edge/edge_128x128.png',

  // Development
  'Microsoft.VisualStudioCode': 'https://raw.githubusercontent.com/microsoft/vscode/main/resources/linux/code.png',
  'Git.Git': 'https://git-scm.com/images/logos/downloads/Git-Icon-1788C.png',
  'Docker.DockerDesktop': 'https://www.docker.com/wp-content/uploads/2022/03/Moby-logo.png',
  'Nodejs.Nodejs': 'https://nodejs.org/static/images/favicons/favicon.png',
  'Rustlang.Rustup': 'https://www.rust-lang.org/static/images/rust-logo-blk.svg',
  'Microsoft.WindowsTerminal': 'https://raw.githubusercontent.com/microsoft/terminal/main/res/terminal.ico',
  'BurntSushi.ripgrep.MSVC': 'https://avatars.githubusercontent.com/u/1048638?s=128',
  'Postman.Postman': 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/postman.png',

  // Gaming
  'Valve.Steam': 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/steam.png',
  'EpicGames.EpicGamesLauncher': 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/epic-games.png',
  'GOG.Galaxy': 'https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://www.gog.com&size=128',

  // Multimedia
  'VideoLAN.VLC': 'https://upload.wikimedia.org/wikipedia/commons/e/e6/VLC_Icon.svg',
  'Spotify.Spotify': 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/spotify.png',
  'OBSProject.OBSStudio': 'https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://obsproject.com&size=128',
  'BlenderFoundation.Blender': 'https://www.blender.org/wp-content/themes/bthree/assets/icons/apple-touch-icon.png',

  // Communication
  'Discord.Discord': 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/discord.png',
  'Telegram.TelegramDesktop': 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/telegram.png',
  'Signal.Signal': 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/signal.png',

  // Security
  'Bitwarden.Bitwarden': 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/bitwarden.png',
  'KeePassXCTeam.KeePassXC': 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/keepassxc.png',
  'WireGuard.WireGuard': 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/wireguard.png',

  // Productivity
  'Obsidian.Obsidian': 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/obsidian.png',
  'Notion.Notion': 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/notion.png',
  'TheDocumentFoundation.LibreOffice': 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/libreoffice.png',

  // Utilities & System
  'Microsoft.PowerToys': 'https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://learn.microsoft.com/windows/powertoys&size=128',
  'voidtools.Everything': 'https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://www.voidtools.com&size=128',
  'ShareX.ShareX': 'https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://getsharex.com&size=128',
  'Rufus.Rufus': 'https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://rufus.ie&size=128',
  'CrystalDewWorld.CrystalDiskInfo': 'https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://crystalmark.info/en/software/crystaldiskinfo/&size=128',
  'BleachBit.BleachBit': 'https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://www.bleachbit.org&size=128',
  'MarkRussinovich.SysinternalsSuite': 'https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://learn.microsoft.com/sysinternals&size=128',

  // Compression
  '7zip.7zip': 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/7zip.png',
  'RARLab.WinRAR': 'https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://www.rarlab.com&size=128',

  // Hardware
  'Nvidia.GeForceExperience': 'https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://www.nvidia.com&size=128',
  'Logitech.OptionsPlus': 'https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://www.logitech.com&size=128',
};

/**
 * Returns an authentic high-resolution icon URL for any WinGet package.
 * Prioritizes verified CDNs, then dynamic high-resolution Google Favicon V2 (size=128).
 */
export function getAppIconUrl(pkg: Package): string {
  // 1. Direct verified CDN icon
  if (VERIFIED_ICONS[pkg.id]) {
    return VERIFIED_ICONS[pkg.id];
  }

  // 2. Package-provided icon if valid URL and not pointing to dead repos
  if (pkg.icon && pkg.icon.startsWith('http') && !pkg.icon.includes('raw.githubusercontent.com/microsoft/winget-pkgs')) {
    return pkg.icon;
  }

  // 3. Dynamic Google Favicon V2 (size=128) using official homepage origin
  if (pkg.homepage && pkg.homepage.startsWith('http')) {
    try {
      const url = new URL(pkg.homepage);
      return `https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(
        url.origin
      )}&size=128`;
    } catch {
      // ignore
    }
  }

  // 4. Default Microsoft WinGet icon feed
  return `https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://microsoft.com&size=128`;
}

/**
 * Secondary fallback URL if the primary image encounters a network error
 */
export function getSecondaryIconFallback(pkg: Package): string {
  if (pkg.homepage) {
    try {
      const url = new URL(pkg.homepage);
      return `https://www.google.com/s2/favicons?domain=${url.hostname}&sz=128`;
    } catch {
      // ignore
    }
  }
  return `https://www.google.com/s2/favicons?domain=microsoft.com&sz=128`;
}
