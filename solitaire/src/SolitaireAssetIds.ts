/**
 * Namespaced identifiers for every asset the example loads through
 * the framework's `AssetManager`. Used by {@link SolitaireApp.loadAssets}
 * to enqueue each asset and by views to retrieve the loaded resource
 * via `assetLoader.getAsset(...)`.
 *
 * Card faces themselves stay procedural — only the shared body
 * artwork is asset-loaded. See `CardObject` for the composition
 * pipeline (loaded PNG + cached rank/suit glyph canvases tinted
 * per use).
 */
export enum SolitaireAssetIds {
  CardFront = "Solitaire.CardFront",
  CardBack = "Solitaire.CardBack",
}
