import { describe, expect, it } from "vitest";
import { buildTaxRateCheck } from "./reviewChecks";
import { resolvedItem, summary, rawObservation } from "./reviewChecksTestHelpers";

describe("buildTaxRateCheck", () => {
  describe("buildTaxRateCheck", () => {
    it("同一基準の明細合計が印字対象額と一致すれば一致", () => {
      const check = buildTaxRateCheck({
        items: [resolvedItem()],
        taxSummaries: [summary()],
      });
      expect(check.status).toBe("matched");
      expect(check.rows[0].currentYen).toBe(100);
      expect(check.rows[0].matchKind).toBe("exact");
    });

    it("サマリの順序を保ったまま税率ごとの行を返す", () => {
      const check = buildTaxRateCheck({
        items: [
          resolvedItem({ id: "a", printedAmountYen: 100, amountYen: "100" }),
          resolvedItem({
            id: "b",
            taxRatePercent: 10,
            printedAmountYen: 200,
            amountYen: "200",
          }),
        ],
        taxSummaries: [
          summary({ taxRatePercent: 10, taxableAmountYen: 200, taxYen: 20 }),
          summary({ taxableAmountYen: 100 }),
        ],
      });
      expect(check.rows.map((row) => row.taxRatePercent)).toEqual([10, 8]);
      expect(check.status).toBe("matched");
    });

    it("差額のみを報告し、原因は推測しない", () => {
      const check = buildTaxRateCheck({
        items: [resolvedItem({ printedAmountYen: 150, amountYen: "150" })],
        taxSummaries: [summary()],
      });
      expect(check.status).toBe("mismatch");
      expect(check.rows[0].differenceYen).toBe(50);
      expect(check.rows[0].reason).toBeUndefined();
    });

    it("直接印字の証拠がある対象額は±1円でも不一致", () => {
      const check = buildTaxRateCheck({
        items: [resolvedItem({ printedAmountYen: 101, amountYen: "101" })],
        taxSummaries: [summary()],
        rawObservation: rawObservation([
          { rawText: "8%対象 100", amountYen: 100, lineRoleCandidates: ["tax"] },
        ]),
      });
      expect(check.status).toBe("mismatch");
      expect(check.rows[0].differenceYen).toBe(1);
    });

    it("直接印字の証拠がない対象額は±1円を近似一致として扱う", () => {
      const check = buildTaxRateCheck({
        items: [resolvedItem({ printedAmountYen: 101, amountYen: "101" })],
        taxSummaries: [summary()],
        rawObservation: rawObservation([
          { rawText: "合計 1,080", amountYen: 1080, lineRoleCandidates: ["total"] },
        ]),
      });
      expect(check.status).toBe("matched");
      expect(check.rows[0].matchKind).toBe("approx");
      expect(check.rows[0].differenceYen).toBe(1);
    });

    it("rawObservation が無い下書きも±1円を近似一致として扱う", () => {
      const check = buildTaxRateCheck({
        items: [resolvedItem({ printedAmountYen: 101, amountYen: "101" })],
        taxSummaries: [summary()],
      });
      expect(check.status).toBe("matched");
      expect(check.rows[0].matchKind).toBe("approx");
    });

    it("直接印字の証拠は税率が一致する内訳にだけ適用する", () => {
      const check = buildTaxRateCheck({
        items: [
          resolvedItem({ id: "a", taxRatePercent: 8, printedAmountYen: 501, amountYen: "501" }),
          resolvedItem({ id: "b", taxRatePercent: 10, printedAmountYen: 501, amountYen: "501" }),
        ],
        taxSummaries: [
          summary({ taxRatePercent: 8, taxableAmountYen: 500 }),
          summary({ taxRatePercent: 10, taxableAmountYen: 500, taxYen: 50 }),
        ],
        rawObservation: rawObservation([
          { rawText: "8%対象 500", amountYen: 500, lineRoleCandidates: ["tax"] },
        ]),
      });
      // 「8%対象 500」の印字は8%の内訳だけの証拠になる
      expect(check.rows.find((row) => row.taxRatePercent === 8)).toMatchObject({
        status: "mismatch",
        differenceYen: 1,
      });
      // 10%側は証拠を流用されないので±1円は近似一致を維持する
      expect(check.rows.find((row) => row.taxRatePercent === 10)).toMatchObject({
        status: "matched",
        matchKind: "approx",
        differenceYen: 1,
      });
    });

    it("税率表記のない印字行は同一対象額の内訳が複数あると証拠にしない", () => {
      const check = buildTaxRateCheck({
        items: [
          resolvedItem({ id: "a", taxRatePercent: 8, printedAmountYen: 501, amountYen: "501" }),
          resolvedItem({ id: "b", taxRatePercent: 10, printedAmountYen: 501, amountYen: "501" }),
        ],
        taxSummaries: [
          summary({ taxRatePercent: 8, taxableAmountYen: 500 }),
          summary({ taxRatePercent: 10, taxableAmountYen: 500, taxYen: 50 }),
        ],
        rawObservation: rawObservation([
          { rawText: "対象 500", amountYen: 500, lineRoleCandidates: ["tax"] },
        ]),
      });
      for (const rate of [8, 10]) {
        expect(check.rows.find((row) => row.taxRatePercent === rate)).toMatchObject({
          status: "matched",
          matchKind: "approx",
        });
      }
    });

    it("明細金額を空にした行は税率別集計でも比較不能にする", () => {
      const check = buildTaxRateCheck({
        items: [resolvedItem({ amountYen: "", printedAmountYen: 100 })],
        taxSummaries: [summary()],
      });
      expect(check.status).toBe("uncomparable");
      expect(check.rows[0].reason).toContain("明細金額");
    });

    it("±2円の差は証拠の有無に関わらず不一致", () => {
      const check = buildTaxRateCheck({
        items: [resolvedItem({ printedAmountYen: 102, amountYen: "102" })],
        taxSummaries: [summary()],
      });
      expect(check.status).toBe("mismatch");
    });

    it("割引は対象商品の税率バケットに印字額を集計する", () => {
      const check = buildTaxRateCheck({
        items: [
          resolvedItem({ id: "p1", taxRatePercent: 8 }),
          resolvedItem({
            id: "d1",
            itemName: "値引",
            lineType: "discount",
            discountTargetItemId: "p1",
            printedAmountYen: -20,
            amountYen: "-20",
          }),
        ],
        taxSummaries: [summary({ taxableAmountYen: 80 })],
      });
      expect(check.status).toBe("matched");
      expect(check.rows[0].currentYen).toBe(80);
    });

    it("同じ商品を対象にする複数割引をすべて集計する", () => {
      const check = buildTaxRateCheck({
        items: [
          resolvedItem({ id: "p1", taxRatePercent: 8 }),
          resolvedItem({
            id: "d1",
            itemName: "値引1",
            lineType: "discount",
            discountTargetItemId: "p1",
            printedAmountYen: -10,
            amountYen: "-10",
          }),
          resolvedItem({
            id: "d2",
            itemName: "値引2",
            lineType: "discount",
            discountTargetItemId: "p1",
            printedAmountYen: -10,
            amountYen: "-10",
          }),
        ],
        taxSummaries: [summary({ taxableAmountYen: 80 })],
      });
      expect(check.status).toBe("matched");
      expect(check.rows[0].currentYen).toBe(80);
    });

    it("割引対象が未確定なら全体を比較不能にする", () => {
      const check = buildTaxRateCheck({
        items: [
          resolvedItem({ id: "p1" }),
          resolvedItem({
            id: "d1",
            itemName: "値引",
            lineType: "discount",
            printedAmountYen: -20,
            amountYen: "-20",
          }),
        ],
        taxSummaries: [summary()],
      });
      expect(check.status).toBe("uncomparable");
      expect(check.reason).toContain("割引対象");
    });

    it("税率未確定の明細があると全体を比較不能にする", () => {
      const check = buildTaxRateCheck({
        items: [
          resolvedItem({ id: "p1" }),
          resolvedItem({
            id: "u1",
            taxResolutionStatus: "unresolved",
            taxRatePercent: null,
            amountBasis: "unknown",
            taxResolutionSource: undefined,
          }),
        ],
        taxSummaries: [summary()],
      });
      expect(check.status).toBe("uncomparable");
      expect(check.rows[0].reason).toContain("未確定");
    });

    it("対象額の税込／税抜が未確定ならその行だけ比較不能", () => {
      const check = buildTaxRateCheck({
        items: [resolvedItem()],
        taxSummaries: [summary({ taxableAmountBasis: "unknown", taxMode: "unknown" })],
      });
      expect(check.status).toBe("uncomparable");
      expect(check.rows[0].reason).toContain("税込／税抜");
    });

    it("対象額が税抜なのに税込明細を含む行は比較不能", () => {
      const check = buildTaxRateCheck({
        items: [resolvedItem({ amountBasis: "tax_included" })],
        taxSummaries: [summary()],
      });
      expect(check.status).toBe("uncomparable");
      expect(check.blockerCode).toBe("basis-conflict");
      expect(check.affectedItemIds).toEqual(["item-1"]);
      expect(check.focusTarget).toBe("item-1");
      expect(check.reason).toContain("一致していません");
    });

    it("サマリに無い税率の明細は未確定行として追加する", () => {
      const check = buildTaxRateCheck({
        items: [
          resolvedItem({ id: "a" }),
          resolvedItem({ id: "b", taxRatePercent: 10, printedAmountYen: 200 }),
        ],
        taxSummaries: [summary()],
      });
      expect(check.status).toBe("uncomparable");
      const extra = check.rows.find((row) => row.taxRatePercent === 10);
      expect(extra?.printedYen).toBeUndefined();
      expect(extra?.currentYen).toBe(200);
      expect(extra?.reason).toContain("印字の対象額");
    });

    it("サマリなしは比較不能で行も出さない", () => {
      const check = buildTaxRateCheck({ items: [resolvedItem()], taxSummaries: [] });
      expect(check.status).toBe("uncomparable");
      expect(check.rows).toEqual([]);
    });
  });
});
