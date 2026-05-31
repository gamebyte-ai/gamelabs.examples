import { AssetRequest, AssetTypes, GameGridBinding } from "@gamebyte/gamelabsjs";
import { TicTacToeAssetIds } from "../../TicTacToeAssetIds";
import { GameGridObjectCreator } from "./views/GameGridObjectCreator";
import { GameGridsView } from "./views/GameGridsView.three";
import { GameGridsViewController } from "./controllers/GameGridsViewController";

export class TicTacToeGameGridBinding extends GameGridBinding {
  public constructor() {
    super(new GameGridObjectCreator(), GameGridsView, GameGridsViewController);
    this.assetRequestList.addRequest(new AssetRequest(AssetTypes.WorldTexture, TicTacToeAssetIds.Cell, new URL("../../../assets/cell.png", import.meta.url).href));
    this.assetRequestList.addRequest(new AssetRequest(AssetTypes.WorldTexture, TicTacToeAssetIds.ItemX, new URL("../../../assets/Item-x.png", import.meta.url).href));
    this.assetRequestList.addRequest(new AssetRequest(AssetTypes.WorldTexture, TicTacToeAssetIds.ItemO, new URL("../../../assets/item-o.png", import.meta.url).href));
  }
}
