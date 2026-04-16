import { RawData } from './ray';

export interface WebSocketConnectedMessageMap {
  ray: RawData;
}

export type WebSocketServerVersion = keyof WebSocketConnectedMessageMap;

export type WebSocketConnectedMessage<
  TVersion extends WebSocketServerVersion = WebSocketServerVersion,
> = WebSocketConnectedMessageMap[TVersion];

export type WebSocketConnectedMessageGuard<
  TVersion extends WebSocketServerVersion = WebSocketServerVersion,
> = (data: unknown) => data is WebSocketConnectedMessageMap[TVersion];

export const websocketConnectedMessageGuards: {
  [TVersion in WebSocketServerVersion]: WebSocketConnectedMessageGuard<TVersion>;
} = {
  ray: isRayRawData,
};

export function isRayRawData(data: unknown): data is RawData {
  if (typeof data !== 'object' || data === null) {
    return false;
  }

  const d = data as Record<string, unknown>;

  // 只要包含核心数据字段之一（a:机器人, b:盒子, i:物资, p:玩家），或者包含地图信息m
  return (
    typeof d['m'] === 'number' ||
    Array.isArray(d['a']) ||
    Array.isArray(d['b']) ||
    Array.isArray(d['i']) ||
    Array.isArray(d['p']) ||
    (!!d['a'] &&
      typeof d['a'] === 'object' &&
      ('u' in d['a'] || 'd' in d['a'])) ||
    (!!d['b'] &&
      typeof d['b'] === 'object' &&
      ('u' in d['b'] || 'd' in d['b'])) ||
    (!!d['i'] &&
      typeof d['i'] === 'object' &&
      ('u' in d['i'] || 'd' in d['i'])) ||
    (!!d['p'] && typeof d['p'] === 'object' && ('u' in d['p'] || 'd' in d['p']))
  );
}
