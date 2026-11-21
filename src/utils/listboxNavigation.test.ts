import { describe, expect, it } from "vitest";
import { getListboxTargetIndex } from "./listboxNavigation";

describe("getListboxTargetIndex", () => {
  const base = { columnCount: 4, currentIndex: 0, itemCount: 7 };

  it("ArrowRight/ArrowLeft は前後の選択肢へ1つ移動する", () => {
    expect(getListboxTargetIndex({ ...base, key: "ArrowRight" })).toBe(1);
    expect(getListboxTargetIndex({ ...base, currentIndex: 3, key: "ArrowLeft" })).toBe(2);
  });

  it("左右の端では移動せず現在位置を返す", () => {
    expect(getListboxTargetIndex({ ...base, key: "ArrowLeft" })).toBe(0);
    expect(getListboxTargetIndex({ ...base, currentIndex: 6, key: "ArrowRight" })).toBe(6);
  });

  it("ArrowDown/ArrowUp は列数ぶん上下の行へ移動する", () => {
    expect(getListboxTargetIndex({ ...base, key: "ArrowDown" })).toBe(4);
    expect(getListboxTargetIndex({ ...base, currentIndex: 5, key: "ArrowUp" })).toBe(1);
  });

  it("上下の端では移動せず現在位置を返す", () => {
    expect(getListboxTargetIndex({ ...base, key: "ArrowUp" })).toBe(0);
    expect(getListboxTargetIndex({ ...base, currentIndex: 6, key: "ArrowDown" })).toBe(6);
    expect(getListboxTargetIndex({ ...base, currentIndex: 5, key: "ArrowDown" })).toBe(5);
  });

  it("Home/End は先頭・末尾へ移動する", () => {
    expect(getListboxTargetIndex({ ...base, currentIndex: 3, key: "Home" })).toBe(0);
    expect(getListboxTargetIndex({ ...base, currentIndex: 3, key: "End" })).toBe(6);
  });

  it("ナビゲーション対象外のキーは null を返す", () => {
    expect(getListboxTargetIndex({ ...base, key: "Enter" })).toBeNull();
    expect(getListboxTargetIndex({ ...base, key: "Tab" })).toBeNull();
    expect(getListboxTargetIndex({ ...base, key: "a" })).toBeNull();
  });
});
