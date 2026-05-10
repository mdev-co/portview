import type { ClassBPositionReport } from './class-b-position';
import type { ClassBStaticData } from './class-b-static';
import type { StaticData } from './static-data';
import type { PositionReport } from './vessel';

export type AisMessage = PositionReport | StaticData | ClassBPositionReport | ClassBStaticData;

export type AisMessageType = AisMessage['messageType'];
