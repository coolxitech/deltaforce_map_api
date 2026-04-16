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

  const rawData = data as any;

  // 只要包含核心数据字段之一（a:机器人, b:盒子, i:物资, p:玩家），或者包含地图信息m
  return (
    typeof rawData.m === 'number' ||
    Array.isArray(rawData.a) ||
    Array.isArray(rawData.b) ||
    Array.isArray(rawData.i) ||
    Array.isArray(rawData.p) ||
    (rawData.a && (rawData.a.u || rawData.a.d)) ||
    (rawData.b && (rawData.b.u || rawData.b.d)) ||
    (rawData.i && (rawData.i.u || rawData.i.d)) ||
    (rawData.p && (rawData.p.u || rawData.p.d))
  );
}
