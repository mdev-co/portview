import type { ClassBPositionReport } from './class-b-position';
import type { StaticData } from './static-data';
import type { PositionReport } from './vessel';

export type AisMessage = PositionReport | StaticData | ClassBPositionReport;

export type AisMessageType = AisMessage['messageType'];
