/**
 * 物资
 * @param id 物资id
 * @param name 物资名称
 * @param position 物资位置
 * @param grade 物资等级
 * @param price 物资价值
 */
export interface Item {
  id?: string;
  name: string;
  position: Position;
  grade: number;
  price: number;
}

/**
 * 地图信息
 * @param name 地图名称
 */
export interface Map {
  name: string;
}
/**
 * 玩家信息
 * @param {string|number} id 玩家id
 * @param {string} name 玩家名称
 * @param {boolean} isBot 是否人机
 * @param {boolean} isBoss 是否BOSS
 * @param {boolean} isCheater 是否在作弊者队伍
 * @param {number} role 角色ID
 * @param {string} roleName 角色名称
 * @param {string} roleAlias 角色别名
 * @param {string} weapon 武器名称
 * @param {number} health 玩家生命值
 * @param {number} helmet 玩家头盔等级
 * @param {number} armor 玩家护甲等级
 * @param {number} [helmetDurability] 玩家头盔耐久度
 * @param {number} [armorDurability] 玩家护甲耐久度
 * @param {number} teamId 队伍id
 * @param {Position} position 玩家位置
 */
export interface Player {
  id?: string | number;
  name: string;
  isBot: boolean;
  isBoss: boolean;
  isCheater: boolean;
  cheaterOwner?: boolean;
  role?: number;
  roleName: string;
  roleAlias: string;
  weapon: string;
  health: number;
  helmet?: number;
  armor?: number;
  helmetDurability?: number;
  armorDurability?: number;
  teamId: number;
  position: Position;
}

/**
 * 死亡盒子
 * @param isBot 是否人机盒子 a
 * @param position 位置 b,c
 */
export interface Box {
  isBot?: boolean;
  position: Position;
}

export interface Position {
  x: number;
  y: number;
  z?: number;
  angle?: number;
}

export interface GameData {
  boxes: Box[];
  items: Item[];
  map: Map;
  players: Player[];
}
