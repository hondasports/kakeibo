import { describe, expect, it } from "vitest";
import { item, Row, map, check } from "./testHelpers";

describe("725 production receipt regressions (items 715-721 binding)", () => {
  it("717 binds quantity row to the tobacco product", () => {
    check(
      map(
        [
          item("キリン 世界のKソルテ 軽", 106),
          item("カルピスソーダ", 85),
          item("キャメル・メンソール・コ", 1060),
        ],
        [
          ["キリン 世界のKソルテ 軽 ¥106", 106, "¥106"],
          ["カルピスソーダ ¥85", 85, "¥85"],
          ["キャメル・メンソール・コ", null],
          ["530@x 2個 ¥1060", 1060, "¥1060"],
          ["(内)税対象額 8% ¥191", 191, "¥191", "tax"],
          ["(内)税額 8% ¥14", 14, "¥14", "tax"],
          ["(内)税対象額 10% ¥1060", 1060, "¥1060", "tax"],
          ["(内)税額 10% ¥96", 96, "¥96", "tax"],
        ],
        1251,
      ),
      3,
      1251,
    );
  });

  it("718 matches markers, widths and quantity suffixes without doubling bread", () => {
    check(
      map(
        [
          item("焼き立てパン１８０", 180),
          item("焼き立てパン１９０", 380),
          item("焼き立てパン２１０", 840),
        ],
        [
          ["◎焼き立てパン１８０ ¥180込", 180, "¥180"],
          ["◎焼き立てパン１９０ ¥380込", 380, "¥380"],
          ["190 @＊2", null],
          ["◎焼き立てパン２１０ ¥840込", 840, "¥840"],
          ["210 @＊4", null],
          ["8%対象額(込) ¥1400", 1400, "¥1400", "tax"],
          ["内税額 8% ¥104", 104, "¥104", "tax"],
        ],
        1400,
      ),
      3,
      1400,
    );
  });

  it("719 binds code/amount rows to named products", () => {
    const result = map(
      [item("ファンウェアベスト GY L1", 4780), item("接触冷感コンプレッシ NF30", 998)].map((i) => ({
        ...i,
        categoryName: "衣服",
      })),
      [
        ["20 ファンウェアベスト GY L1", null],
        ["24151788 4,780", 4780, "4,780"],
        ["20 接触冷感コンプレッシ NF30", null],
        ["20144678 998", 998, "998"],
        ["10%対象 ¥5778", 5778, "¥5778", "tax"],
        ["10%対象消費税 ¥525", 525, "¥525", "tax"],
      ],
      5778,
    );
    check(result, 2, 5778);
    expect(result.items!.map((i) => i.categoryId)).toEqual(["衣服", "衣服"]);
  });

  it("720 preserves repeated meat and missing products without duplicate recovery", () => {
    const amounts = [
      158, 196, 198, 88, 88, 762, 462, 467, 98, 98, 196, 158, 198, 158, 228, 828, 238, 108, 109, 78,
      88, 108, 118, 228, 148, 98, 516, 298, 248, 258, 256, 779,
    ];
    const names = [
      "キャベツ",
      "にら",
      "ブロッコリー",
      "えのき",
      "ぶなしめじ",
      "骨取り銀鮭切身(解凍",
      "豚小間切落し",
      "豚小間切落し",
      "濃くておいしいもめ",
      "濃くておいしいきぬ",
      "もっちりうまい濃厚",
      "しいたけ昆布",
      "コロコロチキンコン",
      "新鮮!使い切りロース",
      "ヤクルト糖質・カロリ",
      "別海の特選牛乳",
      "ネオソフト",
      "サンミー",
      "ゆごね",
      "チョコフランス",
      "熟ふわロールつぶあんマ",
      "やわらか北海道ミルク",
      "ファボールサンドコー",
      "ネオレーズンバターロ",
      "コッペパン(ジャム&",
      "バゲット",
      "極み鮮卵",
      "コンソメ顆粒",
      "カロリーハーフマヨネ",
      "ひとくちさん",
      "日清ソース焼そばカ",
      "料理のための清酒",
    ];
    const result = map(
      names.map((n, i) => item(n, amounts[i])),
      [
        ...names.map((n, i): Row => [
          `${i === 31 ? "" : "※ "}${n} ¥${amounts[i]}`,
          amounts[i],
          `¥${amounts[i]}`,
        ]),
        ["外税 8% ¥582", 582, "¥582", "tax"],
        ["外税 10% ¥77", 77, "¥77", "tax"],
        ["税率8%対象額 ¥7860", 7860, "¥7860", "tax"],
        ["(内)消費税等8% ¥582", 582, "¥582", "tax"],
        ["税率10%対象額 ¥856", 856, "¥856", "tax"],
        ["(内)消費税等10% ¥77", 77, "¥77", "tax"],
        ["※は軽減税率(8%)適用商品です", null, undefined, "unknown"],
      ],
      8716,
    );
    check(result, 32, 8716);
    expect(
      result.items!.filter((i) => i.itemName === "豚小間切落し").map((i) => i.printedAmountYen),
    ).toEqual([462, 467]);
    expect(
      result.items!.filter((i) => i.taxRatePercent === 10).map((i) => i.printedAmountYen),
    ).toEqual([779]);
    expect(result.items!.reduce((sum, i) => sum + (i.allocatedTaxYen ?? 0), 0)).toBe(659);
  });

  it("721 keeps discounts and normalizes the single external subtotal", () => {
    const amounts = [
      128, 256, 158, 98, 98, 38, 426, -43, 196, 196, 88, 228, 828, 128, 78, 78, 208, 198, 98, 98,
      98, 98, 516, 499, 148, 318, 128, 128, 389, 98, 88, 199, 216, 174, -16, 258, -10,
    ];
    const names = [
      "はくさい",
      "こまつな",
      "洋にんじん(大袋)",
      "えのき",
      "ぶなしめじ",
      "シャキシャキっとしたも",
      "トリプルミンチ(牛・",
      "割引10%",
      "濃くておいしいきぬ",
      "もっちりうまい濃厚",
      "竹輪",
      "ヤクルト糖質・カロリ",
      "別海の特選牛乳",
      "サンミー",
      "ミルクフランス",
      "チョコフランス",
      "超熟ロールレーズン",
      "プチケーキ",
      "生めろんぱん クラ",
      "生めろんぱん",
      "牛乳仕込みのミルク",
      "バゲット",
      "ミックス玉子",
      "ウルラ EXVオリ",
      "ひとくちさん",
      "麻婆豆腐の素甘口",
      "どん兵衛きつねうどん",
      "どん兵衛肉うどんミニ",
      "サッポロ一番みそラー",
      "旨みの一杯味噌らーめん",
      "ショッパーズ生姜香る醤",
      "お椀で食べるカップ",
      "あっさりカップヌー",
      "たまねぎ(バラ)",
      "M002玉ねぎ3玉",
      "マルちゃん焼き",
      "M001東洋水産よりどり",
    ];
    const result = map(
      names.map((n, i) => item(n, amounts[i])),
      [
        ...names.map((n, i): Row => [`※ ${n} ¥${amounts[i]}`, amounts[i], `¥${amounts[i]}`]),
        ["小計 ¥6910", 6910, "¥6910", "subtotal"],
        ["外税8% ¥552", 552, "¥552", "tax"],
      ],
      7462,
    );
    check(result, 37, 7462);
    expect(
      result.items!.filter((i) => i.printedAmountYen! < 0).map((i) => i.printedAmountYen),
    ).toEqual([-43, -16, -10]);
    expect(result.reviewReasons).toContain("user_confirmation_required");
  });
});
