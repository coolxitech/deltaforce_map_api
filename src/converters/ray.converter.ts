import type { Box, GameData, Item, Player } from '../interface';
import type { BoxData, ItemData, PlayerData, RawData } from '../interface/ray';

interface ItemInfo {
  objectID?: string | number;
  objectName?: string;
  avgPrice?: number;
  grade?: number;
}

const ROLE_NAME_MAP_OFFICIAL: Record<number, string> = {
  2100654105: 'wl',
  2100654106: 'mxw',
  2100654107: 'fy',
  2100654108: 'ln',
  2100654109: 'myr',
  2100654110: 'hl',
  2100654115: 'wll',
  2100654116: 'g',
  2100654117: 'sl',
  2100654118: 'wm',
  2100654119: 'zj',
  2100654120: 'yy',
  2100654121: 'bt',
} as const;

const ROLE_ALIAS_MAP: Record<string, string> = {
  bt: '四眼仔',
  zj: '张姐',
  yy: '老登',
  wm: '神秘静步男',
  mxw: '麦晓鼠',
  ln: '红温娜',
  myr: '牢大',
  sl: '教官',
  wll: '神秘堵桥男',
  g: '女医',
  fy: '疯医',
  wl: '威风的龙',
  hl: '花来!',
  default: 'Boss',
  a: '机哥',
} as const;

const MAP_NAME: Record<number, string> = {
  0: '',
  1: 'bks',
  2: 'cgxg',
  3: 'htjd',
  4: 'daba',
  5: 'cxjy',
} as const;

interface RayFullState {
  boxes: Map<string, Box>;
  items: Map<string, Item>;
  players: Map<string, Player>;
  bots: Map<string, Player>;
}

export class RayDataConverter {
  private state: RayFullState | null = null;

  reset(): void {
    this.state = null;
  }

  getPlayersByTeam(): Map<number, Player[]> {
    if (!this.state) {
      return new Map();
    }

    const teamMap = new Map<number, Player[]>();

    for (const player of this.state.players.values()) {
      const players = teamMap.get(player.teamId) ?? [];
      players.push(player);
      teamMap.set(player.teamId, players);
    }

    const bots = Array.from(this.state.bots.values());

    if (bots.length > 0) {
      teamMap.set(-1, bots);
    }

    return teamMap;
  }

  convert(
    raw: RawData,
    itemsInfo: ItemInfo[] = [],
    cheatTeamId = raw.t ?? -1,
  ): GameData {
    const isDelta = raw.type === 'delta';

    if (!isDelta || !this.state) {
      this.state = createEmptyState();
    }

    this.convertBots(raw);
    this.convertBoxes(raw);
    this.convertItems(raw, itemsInfo);
    this.convertPlayers(raw, cheatTeamId);

    return {
      boxes: Array.from(this.state.boxes.values()),
      items: Array.from(this.state.items.values()),
      map: { name: MAP_NAME[raw.m] ?? 'unknown' },
      players: [
        ...Array.from(this.state.players.values()),
        ...Array.from(this.state.bots.values()),
      ],
    };
  }

  private convertBots(raw: RawData): void {
    const state = this.requireState();

    if (!raw.a) {
      return;
    }

    state.bots.clear();

    const bots = Array.isArray(raw.a) ? raw.a : (raw.a.u ?? []);

    bots.forEach((bot, index) => {
      if (bot.d === 0) {
        return;
      }

      state.bots.set(`bot_${bot.cx}_${bot.cy}_${index}`, {
        name: `AI_${index}`,
        isBot: true,
        isBoss: bot.b === 1,
        isCheater: false,
        role: 0,
        roleName: 'AI',
        roleAlias: 'AI',
        weapon: '',
        health: bot.h ?? 100,
        helmet: 0,
        helmetDurability: 0,
        armor: 0,
        armorDurability: 0,
        teamId: -1,
        position: {
          x: bot.cx,
          y: bot.cy,
          z: 0,
        },
      });
    });
  }

  private convertBoxes(raw: RawData): void {
    const state = this.requireState();

    if (!raw.b) {
      return;
    }

    if (Array.isArray(raw.b)) {
      state.boxes.clear();
      raw.b.forEach((box) => state.boxes.set(boxKey(box), toBox(box)));
      return;
    }

    raw.b.d?.forEach((box) => state.boxes.delete(boxKey(box)));
    raw.b.u?.forEach((box) => state.boxes.set(boxKey(box), toBox(box)));
  }

  private convertItems(raw: RawData, itemsInfo: ItemInfo[]): void {
    const state = this.requireState();

    if (!raw.i) {
      return;
    }

    if (Array.isArray(raw.i)) {
      state.items.clear();
      raw.i.forEach((item) => {
        const convertedItem = toItem(item, itemsInfo);
        state.items.set(itemKey(convertedItem), convertedItem);
      });
      return;
    }

    raw.i.d?.forEach((item) => {
      const convertedItem = toItem(item, itemsInfo);
      state.items.delete(itemKey(convertedItem));
    });
    raw.i.u?.forEach((item) => {
      const convertedItem = toItem(item, itemsInfo);
      state.items.set(itemKey(convertedItem), convertedItem);
    });
  }

  private convertPlayers(raw: RawData, cheatTeamId: number): void {
    const state = this.requireState();

    if (!raw.p) {
      return;
    }

    if (Array.isArray(raw.p)) {
      state.players.clear();
      raw.p.forEach((player) => {
        if (isDeadPlayer(player)) {
          return;
        }

        const convertedPlayer = toPlayer(player, cheatTeamId);
        state.players.set(playerKey(convertedPlayer), convertedPlayer);
      });
      return;
    }

    raw.p.d?.forEach((player) => deletePlayerByName(state, player.n));
    raw.p.u?.forEach((player) => {
      if (isDeadPlayer(player)) {
        deletePlayerByName(state, sanitizeString(player.n));
        return;
      }

      const existingEntry = findPlayerEntryByName(
        state,
        sanitizeString(player.n),
      );

      if (!existingEntry) {
        return;
      }

      const [key, existingPlayer] = existingEntry;
      state.players.set(key, mergePlayer(existingPlayer, player, cheatTeamId));
    });
  }

  private requireState(): RayFullState {
    if (!this.state) {
      this.state = createEmptyState();
    }

    return this.state;
  }
}

const defaultRayDataConverter = new RayDataConverter();

export function resetRayState(): void {
  defaultRayDataConverter.reset();
}

export function convertRayData(
  raw: RawData,
  itemsInfo: ItemInfo[] = [],
  cheatTeamId = raw.t ?? -1,
): GameData {
  return defaultRayDataConverter.convert(raw, itemsInfo, cheatTeamId);
}

export function getRayPlayersByTeam(): Map<number, Player[]> {
  return defaultRayDataConverter.getPlayersByTeam();
}

function createEmptyState(): RayFullState {
  return {
    boxes: new Map(),
    items: new Map(),
    players: new Map(),
    bots: new Map(),
  };
}

function toBox(box: BoxData): Box {
  return {
    isBot: box.i === 0,
    position: {
      x: box.cx,
      y: box.cy,
      z: box.z ?? 0,
    },
  };
}

function toItem(item: ItemData, itemsInfo: ItemInfo[]): Item {
  const info = itemsInfo.find((value) => value.objectName === item.n);

  return {
    id: info?.objectID?.toString() ?? item.n,
    name: info?.objectName ?? item.n,
    price: info?.avgPrice ?? item.p ?? 0,
    grade: info?.grade ?? item.v ?? 0,
    position: {
      x: item.cx,
      y: item.cy,
    },
  };
}

function toPlayer(player: PlayerData, cheatTeamId: number): Player {
  const roleName = ROLE_NAME_MAP_OFFICIAL[player.o] ?? 'default';

  return {
    name: sanitizeString(player.n || 'unknown'),
    isBot: false,
    isBoss: false,
    isCheater: cheatTeamId === player.t,
    role: player.o,
    roleName,
    roleAlias: ROLE_ALIAS_MAP[roleName] ?? '',
    weapon: sanitizeString(player.w || 'unknown'),
    health: player.h ?? 100,
    helmet: player.hl ?? 0,
    helmetDurability: player.hh ?? 0,
    armor: player.bl ?? 0,
    armorDurability: player.bh ?? 0,
    teamId: player.t ?? 0,
    position: {
      x: player.cx ?? 0,
      y: player.cy ?? 0,
      z: player.z ?? 0,
      angle: player.e,
    },
  };
}

function sanitizeString(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\u0000+$/, '').trim();
}

function mergePlayer(
  existingPlayer: Player,
  player: PlayerData,
  cheatTeamId: number,
): Player {
  const roleName =
    player.o === undefined
      ? existingPlayer.roleName
      : (ROLE_NAME_MAP_OFFICIAL[player.o] ?? existingPlayer.roleName);

  return {
    ...existingPlayer,
    ...(player.bh !== undefined && { armorDurability: player.bh }),
    ...(player.bl !== undefined && { armor: player.bl }),
    ...(player.h !== undefined && { health: player.h }),
    ...(player.hh !== undefined && { helmetDurability: player.hh }),
    ...(player.hl !== undefined && { helmet: player.hl }),
    ...(player.w !== undefined && { weapon: player.w }),
    ...(player.o !== undefined && {
      role: player.o,
      roleName,
      roleAlias: ROLE_ALIAS_MAP[roleName] ?? existingPlayer.roleAlias,
    }),
    ...(player.t !== undefined && {
      teamId: player.t,
      isCheater: cheatTeamId === player.t,
    }),
    position: {
      ...existingPlayer.position,
      ...(player.cx !== undefined && { x: player.cx }),
      ...(player.cy !== undefined && { y: player.cy }),
      ...(player.z !== undefined && { z: player.z }),
      ...(player.e !== undefined && { angle: player.e }),
    },
  };
}

function isDeadPlayer(player: PlayerData): boolean {
  return player.d === 2 || player.f === 1;
}

function deletePlayerByName(state: RayFullState, playerName: string): void {
  const entry = findPlayerEntryByName(state, playerName);

  if (entry) {
    state.players.delete(entry[0]);
  }
}

function findPlayerEntryByName(
  state: RayFullState,
  playerName: string,
): [string, Player] | null {
  for (const entry of state.players.entries()) {
    if (entry[1].name === playerName) {
      return entry;
    }
  }

  return null;
}

function boxKey(box: BoxData): string {
  return `${box.cx},${box.cy}`;
}

function itemKey(item: Item): string {
  return `${item.name}|${item.position.x},${item.position.y}|${item.grade}|${item.price}`;
}

function playerKey(player: Player): string {
  return `${player.teamId}_${player.name}`;
}
