/**
 * listbox 内のキーボード移動（矢印キー・Home/End）の移動先インデックスを返す。
 * 移動先がない端では現在位置を返し、対象外のキーでは null を返す。
 * columnCount はグリッド状に並ぶ選択肢の1行あたりの列数。
 */
export function getListboxTargetIndex({
  columnCount,
  currentIndex,
  itemCount,
  key,
}: {
  columnCount: number;
  currentIndex: number;
  itemCount: number;
  key: string;
}): number | null {
  const lastIndex = itemCount - 1;
  switch (key) {
    case "ArrowLeft":
      return Math.max(currentIndex - 1, 0);
    case "ArrowRight":
      return Math.min(currentIndex + 1, lastIndex);
    case "ArrowUp": {
      const target = currentIndex - columnCount;
      return target >= 0 ? target : currentIndex;
    }
    case "ArrowDown": {
      const target = currentIndex + columnCount;
      return target <= lastIndex ? target : currentIndex;
    }
    case "Home":
      return 0;
    case "End":
      return lastIndex;
    default:
      return null;
  }
}
