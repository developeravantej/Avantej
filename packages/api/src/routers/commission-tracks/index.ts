/** commission-tracks router — split by domain (400-LOC CI gate). */
import { commissionTracksListProcedures } from "./list.procedures";
import { commissionTracksMutateProcedures } from "./mutate.procedures";

export const commissionTracksRouter = {
	...commissionTracksListProcedures,
	...commissionTracksMutateProcedures,
};
