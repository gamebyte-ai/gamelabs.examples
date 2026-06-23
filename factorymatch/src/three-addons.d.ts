// three ships the addons (examples/jsm) as JS without type declarations; declare
// the minimal surface we use here so the FBXLoader import is typed.
declare module "three/examples/jsm/loaders/FBXLoader.js" {
  import { Loader, LoadingManager, Group } from "three";
  export class FBXLoader extends Loader {
    constructor(manager?: LoadingManager);
    load(
      url: string,
      onLoad: (object: Group) => void,
      onProgress?: (event: ProgressEvent) => void,
      onError?: (event: unknown) => void,
    ): void;
    loadAsync(url: string, onProgress?: (event: ProgressEvent) => void): Promise<Group>;
    parse(data: ArrayBuffer | string, path: string): Group;
  }
}
