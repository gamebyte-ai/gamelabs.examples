import { SlotType } from "../constants/SlotType";
import type { IPile } from "../models/IPile";
import type { ScoreConfig } from "../SolitaireConfig";

/**
 * Pure lookup from a scoring event to its point delta. Every scoring
 * value is sourced from {@link ScoreConfig} — tweak the config to
 * tweak the rule everywhere it fires.
 *
 * Returns 0 for combinations the player can't reach in normal play
 * (e.g. stock-as-origin) so the same call is safe in any code path
 * without an explicit guard.
 */
export class ScoreCalculator {
  public static forMove(origin: IPile, target: IPile, score: ScoreConfig): number {
    const points = score.movePoints;
    switch (origin.type) {
      case SlotType.Waste:
        if (target.type === SlotType.Foundation) return points.wasteToFoundation;
        if (target.type === SlotType.Tableau) return points.wasteToTableau;
        return 0;
      case SlotType.Tableau:
        if (target.type === SlotType.Foundation) return points.tableauToFoundation;
        if (target.type === SlotType.Tableau) return points.tableauToTableau;
        return 0;
      case SlotType.Foundation:
        if (target.type === SlotType.Foundation) return points.foundationToFoundation;
        if (target.type === SlotType.Tableau) return points.foundationToTableau;
        return 0;
      default:
        return 0;
    }
  }

  public static forAutoFlipReveal(score: ScoreConfig): number {
    return score.autoFlipReveal;
  }

  public static forStockDraw(score: ScoreConfig): number {
    return score.stockDraw;
  }

  public static forStockRecycle(score: ScoreConfig): number {
    return score.stockRecycle;
  }

  public static forUndoPenalty(score: ScoreConfig): number {
    return score.undoPenalty;
  }
}
