/** Current game lifecycle state. */
export type GameStatus = "playing" | "won" | "lost";

/** Why the game was lost (drives which end banner shows). Null while not lost. */
export type LoseReason = "time" | "tray";
