import { IconRecord } from './types';
import {
  VSCODE_STABLE_BLUE_SVG,
  ARC_BROWSER_SVG,
  POWERTOYS_SVG,
  WINRAR_SVG,
  CRYSTAL_DISK_INFO_SVG,
  GOG_GALAXY_SVG,
  OBS_STUDIO_SVG,
  SYSINTERNALS_SVG,
} from './assets';

/**
 * Primary verified icon registry with metadata.
 * Keyed by canonical package ID.
 */
export const ICON_REGISTRY: Record<string, IconRecord> = {
  // Browsers
  'Mozilla.Firefox': {
    packageId: 'Mozilla.Firefox',
    name: 'Mozilla Firefox',
    publisher: 'Mozilla',
    sourceType: 'official-cdn',
    verified: true,
    url: 'https://raw.githubusercontent.com/alrra/browser-logos/main/src/firefox/firefox_128x128.png',
    sourceUrl: 'https://github.com/alrra/browser-logos',
    category: 'Browsers',
  },
  'Google.Chrome': {
    packageId: 'Google.Chrome',
    name: 'Google Chrome',
    publisher: 'Google LLC',
    sourceType: 'official-cdn',
    verified: true,
    url: 'https://raw.githubusercontent.com/alrra/browser-logos/main/src/chrome/chrome_128x128.png',
    sourceUrl: 'https://github.com/alrra/browser-logos',
    category: 'Browsers',
  },
  'Brave.Brave': {
    packageId: 'Brave.Brave',
    name: 'Brave Browser',
    publisher: 'Brave Software',
    sourceType: 'official-cdn',
    verified: true,
    url: 'https://raw.githubusercontent.com/alrra/browser-logos/main/src/brave/brave_128x128.png',
    sourceUrl: 'https://github.com/alrra/browser-logos',
    category: 'Browsers',
  },
  'TheBrowserCompany.Arc': {
    packageId: 'TheBrowserCompany.Arc',
    name: 'Arc Browser',
    publisher: 'The Browser Company',
    sourceType: 'official-asset',
    verified: true,
    svgDataUri: ARC_BROWSER_SVG,
    sourceUrl: 'https://arc.net',
    category: 'Browsers',
  },
  'Microsoft.Edge': {
    packageId: 'Microsoft.Edge',
    name: 'Microsoft Edge',
    publisher: 'Microsoft Corporation',
    sourceType: 'official-cdn',
    verified: true,
    url: 'https://raw.githubusercontent.com/alrra/browser-logos/main/src/edge/edge_128x128.png',
    sourceUrl: 'https://github.com/alrra/browser-logos',
    category: 'Browsers',
  },

  // Developer Tools
  'Microsoft.VisualStudioCode': {
    packageId: 'Microsoft.VisualStudioCode',
    name: 'Visual Studio Code',
    publisher: 'Microsoft Corporation',
    sourceType: 'official-asset',
    verified: true,
    // Official Stable Blue VS Code Logo SVG (0ms offline, never green Insiders, orange Exploration, or generic MS logo)
    svgDataUri: VSCODE_STABLE_BLUE_SVG,
    url: 'https://raw.githubusercontent.com/microsoft/vscode/main/resources/linux/code.png',
    sourceUrl: 'https://code.visualstudio.com/brand',
    category: 'Developer Tools',
    notes: 'Official stable blue brand logo with gradients. Prohibits green Insiders/orange Exploration assets.',
  },
  'Git.Git': {
    packageId: 'Git.Git',
    name: 'Git',
    publisher: 'The Git Project',
    sourceType: 'official-cdn',
    verified: true,
    url: 'https://git-scm.com/images/logos/downloads/Git-Icon-1788C.png',
    sourceUrl: 'https://git-scm.com/downloads/logos',
    category: 'Developer Tools',
  },
  'Docker.DockerDesktop': {
    packageId: 'Docker.DockerDesktop',
    name: 'Docker Desktop',
    publisher: 'Docker Inc.',
    sourceType: 'official-cdn',
    verified: true,
    url: 'https://www.docker.com/wp-content/uploads/2022/03/Moby-logo.png',
    sourceUrl: 'https://www.docker.com/company/newsroom/media-resources/',
    category: 'Developer Tools',
  },
  'Rustlang.Rustup': {
    packageId: 'Rustlang.Rustup',
    name: 'Rustup',
    publisher: 'Rust Foundation',
    sourceType: 'official-cdn',
    verified: true,
    url: 'https://www.rust-lang.org/static/images/rust-logo-blk.svg',
    sourceUrl: 'https://www.rust-lang.org/policies/media-guide',
    category: 'Developer Tools',
  },
  'Nodejs.Nodejs': {
    packageId: 'Nodejs.Nodejs',
    name: 'Node.js',
    publisher: 'OpenJS Foundation',
    sourceType: 'official-cdn',
    verified: true,
    url: 'https://nodejs.org/static/images/favicons/favicon.png',
    sourceUrl: 'https://nodejs.org',
    category: 'Developer Tools',
  },
  'Microsoft.WindowsTerminal': {
    packageId: 'Microsoft.WindowsTerminal',
    name: 'Windows Terminal',
    publisher: 'Microsoft Corporation',
    sourceType: 'official-cdn',
    verified: true,
    url: 'https://raw.githubusercontent.com/microsoft/terminal/main/res/terminal.ico',
    sourceUrl: 'https://github.com/microsoft/terminal',
    category: 'Developer Tools',
  },
  'BurntSushi.ripgrep.MSVC': {
    packageId: 'BurntSushi.ripgrep.MSVC',
    name: 'ripgrep',
    publisher: 'Andrew Gallant',
    sourceType: 'curated-registry',
    verified: true,
    url: 'https://avatars.githubusercontent.com/u/1048638?s=128',
    sourceUrl: 'https://github.com/BurntSushi/ripgrep',
    category: 'Developer Tools',
  },
  'Postman.Postman': {
    packageId: 'Postman.Postman',
    name: 'Postman',
    publisher: 'Postman Inc.',
    sourceType: 'curated-registry',
    verified: true,
    url: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/postman.png',
    sourceUrl: 'https://www.postman.com',
    category: 'Developer Tools',
  },

  // Gaming
  'Valve.Steam': {
    packageId: 'Valve.Steam',
    name: 'Steam',
    publisher: 'Valve Corporation',
    sourceType: 'curated-registry',
    verified: true,
    url: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/steam.png',
    sourceUrl: 'https://store.steampowered.com',
    category: 'Gaming',
  },
  'EpicGames.EpicGamesLauncher': {
    packageId: 'EpicGames.EpicGamesLauncher',
    name: 'Epic Games Launcher',
    publisher: 'Epic Games Inc.',
    sourceType: 'curated-registry',
    verified: true,
    url: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/epic-games.png',
    sourceUrl: 'https://store.epicgames.com',
    category: 'Gaming',
  },
  'GOG.Galaxy': {
    packageId: 'GOG.Galaxy',
    name: 'GOG GALAXY',
    publisher: 'GOG sp. z o.o.',
    sourceType: 'official-asset',
    verified: true,
    svgDataUri: GOG_GALAXY_SVG,
    sourceUrl: 'https://www.gog.com/galaxy',
    category: 'Gaming',
  },

  // Media
  'VideoLAN.VLC': {
    packageId: 'VideoLAN.VLC',
    name: 'VLC media player',
    publisher: 'VideoLAN Organization',
    sourceType: 'official-cdn',
    verified: true,
    url: 'https://upload.wikimedia.org/wikipedia/commons/e/e6/VLC_Icon.svg',
    sourceUrl: 'https://www.videolan.org',
    category: 'Multimedia',
  },
  'Spotify.Spotify': {
    packageId: 'Spotify.Spotify',
    name: 'Spotify',
    publisher: 'Spotify AB',
    sourceType: 'curated-registry',
    verified: true,
    url: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/spotify.png',
    sourceUrl: 'https://developer.spotify.com/branding-guidelines',
    category: 'Multimedia',
  },
  'OBSProject.OBSStudio': {
    packageId: 'OBSProject.OBSStudio',
    name: 'OBS Studio',
    publisher: 'OBS Project',
    sourceType: 'official-asset',
    verified: true,
    svgDataUri: OBS_STUDIO_SVG,
    sourceUrl: 'https://obsproject.com',
    category: 'Multimedia',
  },
  'BlenderFoundation.Blender': {
    packageId: 'BlenderFoundation.Blender',
    name: 'Blender',
    publisher: 'Blender Foundation',
    sourceType: 'official-cdn',
    verified: true,
    url: 'https://www.blender.org/wp-content/themes/bthree/assets/icons/apple-touch-icon.png',
    sourceUrl: 'https://www.blender.org/about/logo/',
    category: 'Multimedia',
  },

  // Communication
  'Discord.Discord': {
    packageId: 'Discord.Discord',
    name: 'Discord',
    publisher: 'Discord Inc.',
    sourceType: 'curated-registry',
    verified: true,
    url: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/discord.png',
    sourceUrl: 'https://discord.com/branding',
    category: 'Communication',
  },
  'Telegram.TelegramDesktop': {
    packageId: 'Telegram.TelegramDesktop',
    name: 'Telegram Desktop',
    publisher: 'Telegram FZ-LLC',
    sourceType: 'curated-registry',
    verified: true,
    url: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/telegram.png',
    sourceUrl: 'https://telegram.org',
    category: 'Communication',
  },
  'Signal.Signal': {
    packageId: 'Signal.Signal',
    name: 'Signal',
    publisher: 'Signal Foundation',
    sourceType: 'curated-registry',
    verified: true,
    url: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/signal.png',
    sourceUrl: 'https://signal.org',
    category: 'Communication',
  },

  // Security
  'Bitwarden.Bitwarden': {
    packageId: 'Bitwarden.Bitwarden',
    name: 'Bitwarden',
    publisher: 'Bitwarden Inc.',
    sourceType: 'curated-registry',
    verified: true,
    url: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/bitwarden.png',
    sourceUrl: 'https://bitwarden.com',
    category: 'Security',
  },
  'KeePassXCTeam.KeePassXC': {
    packageId: 'KeePassXCTeam.KeePassXC',
    name: 'KeePassXC',
    publisher: 'KeePassXC Team',
    sourceType: 'curated-registry',
    verified: true,
    url: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/keepassxc.png',
    sourceUrl: 'https://keepassxc.org',
    category: 'Security',
  },
  'WireGuard.WireGuard': {
    packageId: 'WireGuard.WireGuard',
    name: 'WireGuard',
    publisher: 'WireGuard LLC',
    sourceType: 'curated-registry',
    verified: true,
    url: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/wireguard.png',
    sourceUrl: 'https://www.wireguard.com',
    category: 'Security',
  },

  // Productivity
  'Obsidian.Obsidian': {
    packageId: 'Obsidian.Obsidian',
    name: 'Obsidian',
    publisher: 'Dynalist Inc.',
    sourceType: 'curated-registry',
    verified: true,
    url: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/obsidian.png',
    sourceUrl: 'https://obsidian.md',
    category: 'Productivity',
  },
  'Notion.Notion': {
    packageId: 'Notion.Notion',
    name: 'Notion',
    publisher: 'Notion Labs Inc.',
    sourceType: 'curated-registry',
    verified: true,
    url: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/notion.png',
    sourceUrl: 'https://www.notion.so',
    category: 'Productivity',
  },
  'TheDocumentFoundation.LibreOffice': {
    packageId: 'TheDocumentFoundation.LibreOffice',
    name: 'LibreOffice',
    publisher: 'The Document Foundation',
    sourceType: 'curated-registry',
    verified: true,
    url: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/libreoffice.png',
    sourceUrl: 'https://www.libreoffice.org',
    category: 'Productivity',
  },

  // Utilities
  'Microsoft.PowerToys': {
    packageId: 'Microsoft.PowerToys',
    name: 'PowerToys',
    publisher: 'Microsoft Corporation',
    sourceType: 'official-asset',
    verified: true,
    svgDataUri: POWERTOYS_SVG,
    sourceUrl: 'https://github.com/microsoft/PowerToys',
    category: 'Utilities',
  },
  'voidtools.Everything': {
    packageId: 'voidtools.Everything',
    name: 'Everything',
    publisher: 'voidtools',
    sourceType: 'official-cdn',
    verified: true,
    url: 'https://www.voidtools.com/favicon.ico',
    sourceUrl: 'https://www.voidtools.com',
    category: 'Utilities',
  },
  'ShareX.ShareX': {
    packageId: 'ShareX.ShareX',
    name: 'ShareX',
    publisher: 'ShareX Team',
    sourceType: 'official-cdn',
    verified: true,
    url: 'https://getsharex.com/img/ShareX_Logo.png',
    sourceUrl: 'https://getsharex.com',
    category: 'Utilities',
  },
  'Rufus.Rufus': {
    packageId: 'Rufus.Rufus',
    name: 'Rufus',
    publisher: 'Pete Batard',
    sourceType: 'official-cdn',
    verified: true,
    url: 'https://rufus.ie/pics/rufus-128.png',
    sourceUrl: 'https://rufus.ie',
    category: 'Utilities',
  },
  'CrystalDewWorld.CrystalDiskInfo': {
    packageId: 'CrystalDewWorld.CrystalDiskInfo',
    name: 'CrystalDiskInfo',
    publisher: 'Crystal Dew World',
    sourceType: 'official-asset',
    verified: true,
    svgDataUri: CRYSTAL_DISK_INFO_SVG,
    sourceUrl: 'https://crystalmark.info',
    category: 'Utilities',
  },
  'BleachBit.BleachBit': {
    packageId: 'BleachBit.BleachBit',
    name: 'BleachBit',
    publisher: 'Andrew Ziem',
    sourceType: 'official-cdn',
    verified: true,
    url: 'https://raw.githubusercontent.com/bleachbit/bleachbit/master/bleachbit.png',
    sourceUrl: 'https://github.com/bleachbit/bleachbit',
    category: 'Utilities',
  },
  'MarkRussinovich.SysinternalsSuite': {
    packageId: 'MarkRussinovich.SysinternalsSuite',
    name: 'Sysinternals Suite',
    publisher: 'Mark Russinovich / Microsoft',
    sourceType: 'official-asset',
    verified: true,
    svgDataUri: SYSINTERNALS_SVG,
    sourceUrl: 'https://learn.microsoft.com/sysinternals',
    category: 'Utilities',
  },

  // Compression
  '7zip.7zip': {
    packageId: '7zip.7zip',
    name: '7-Zip',
    publisher: 'Igor Pavlov',
    sourceType: 'curated-registry',
    verified: true,
    url: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/7zip.png',
    sourceUrl: 'https://www.7-zip.org',
    category: 'Compression',
  },
  'RARLab.WinRAR': {
    packageId: 'RARLab.WinRAR',
    name: 'WinRAR',
    publisher: 'win.rar GmbH',
    sourceType: 'official-asset',
    verified: true,
    svgDataUri: WINRAR_SVG,
    sourceUrl: 'https://www.rarlab.com',
    category: 'Compression',
  },

  // Hardware & Drivers
  'Nvidia.GeForceExperience': {
    packageId: 'Nvidia.GeForceExperience',
    name: 'NVIDIA GeForce Experience',
    publisher: 'NVIDIA Corporation',
    sourceType: 'curated-registry',
    verified: true,
    url: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/nvidia.png',
    sourceUrl: 'https://www.nvidia.com',
    category: 'Hardware',
  },
  'Logitech.OptionsPlus': {
    packageId: 'Logitech.OptionsPlus',
    name: 'Logitech Options+',
    publisher: 'Logitech Inc.',
    sourceType: 'curated-registry',
    verified: true,
    url: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/logitech.png',
    sourceUrl: 'https://www.logitech.com',
    category: 'Hardware',
  },
};

// Case-insensitive lookup map
const NORMALIZED_LOOKUP = new Map<string, IconRecord>();

function rebuildLookup() {
  NORMALIZED_LOOKUP.clear();
  for (const [key, record] of Object.entries(ICON_REGISTRY)) {
    NORMALIZED_LOOKUP.set(key.toLowerCase(), record);
  }
}
rebuildLookup();

/**
 * Case-insensitive lookup of an application icon record by package ID.
 */
export function getIconRecord(packageId: string): IconRecord | undefined {
  if (!packageId) return undefined;
  return NORMALIZED_LOOKUP.get(packageId.trim().toLowerCase());
}

/**
 * Register or update an icon record at runtime.
 */
export function registerIcon(record: IconRecord): void {
  ICON_REGISTRY[record.packageId] = record;
  NORMALIZED_LOOKUP.set(record.packageId.toLowerCase(), record);
}

/**
 * Checks if a package has a verified icon in the registry.
 */
export function isIconVerified(packageId: string): boolean {
  const rec = getIconRecord(packageId);
  return !!rec && rec.verified;
}
