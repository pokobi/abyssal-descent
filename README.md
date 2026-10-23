# ABYSSAL DESCENT — 深淵降下

### [▶ ブラウザで遊ぶ（https://pokobi.github.io/abyssal-descent/）](https://pokobi.github.io/abyssal-descent/)

ブラウザで動く3DのFPSローグライトです。インストールいらずで、ページを開けばそのまま遊べます。

> コードはほとんど生成AI（Claude Code）に書いてもらっています。思わぬバグがあったらごめんなさい。

---

## どんなゲーム？

- 深淵の入口から奥まで、エリアをひとつずつ下っていきます。クリアするたびに次の行き先を選べるので、戦闘・商人・宝物庫・イベントとかを選んでルートを組みます。
- ところどころで強いボスが待っています。
- 銃や近接武器、スキル、防具、アイテム、それから「加護」（パッシブ強化）を集めて、毎回違うビルドで挑みます。
- マップ・敵・報酬は毎回ランダムです。

細かい数値や中身はちょくちょく変わるので、ここには書いてません。ゲーム内の図鑑やステータス画面、チュートリアルを見てください。

## 動作環境

- おすすめはPCのブラウザ（Chrome / Edgeの最新版）＋キーボードとマウス
- スマホでも一応動きます（タッチ操作に自動で切り替わります）
- 重いときは、設定の「画質」を「中」か「低」にしてみてください

## 基本操作（初期設定）

| 操作 | キー |
| --- | --- |
| 移動 | W A S D |
| 視点 / 撃つ / 構える | マウス / 左クリック / 右クリック |
| ジャンプ / ダッシュ / しゃがみ | Space / Shift / Ctrl |
| リロード / 調べる・拾う | R / E |
| 武器の切り替え | 1 2 3、マウスホイール |
| スキル | Q X Z V |
| 消耗品 / 投擲物 | 4 5 / G |
| ステータス / 持ち物 | Tab / B |
| ポーズ | Esc |

キー配置は設定画面で変えられます。

## セーブ

- 進行状況はブラウザに自動で保存されて、閉じても途中から再開できます。
- 保存先はそのブラウザの中だけです。別のブラウザやシークレットモードとは共有されません。サイトデータを消すとセーブも消えます。

## ローカルで動かす

ビルドはいりません。フォルダを静的ファイルサーバーで配信して、ブラウザで開くだけです（`index.html` をダブルクリックで直接開くより、サーバー経由のほうが確実です）。

```bash
python -m http.server 8000
```

そのあと `http://localhost:8000/` を開きます。

## ちょっとだけ技術メモ

- 素のJavaScript（フレームワークもビルドも無し）と [Three.js](https://threejs.org/)（CDNから読み込み）
- テクスチャも効果音もプログラムで生成していて、外部の音声ファイルは使っていません
- `js/` がゲーム本体、`css/` が画面のスタイル、`tests/` は開発用の確認スクリプトです

---

## Credits

Icons: [game-icons.net](https://game-icons.net/) — licensed under [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/).
The silhouettes were recoloured (gradient fill and outline) for this game. Icons used, by author:

- **Lorc** — aerodynamic-harpoon, anchor, angel-outfit, anvil-impact, arrow-flights, arrowhead, autogun, bandage-roll, barbed-arrow, barbed-spear, barbute, battle-axe, beetle-shell, big-wave, biohazard, black-hole-bolas, bolter-gun, bowie-knife, brain, breastplate, bright-explosion, broadsword, broken-heart, bubbling-flask, candle-light, cash, cat, clover, coffin, comet-spark, compass, crested-helmet, crossed-bones, crossed-chains, crossed-swords, crystal-ball, cut-diamond, cycle, dna1, drama-masks, drop, dust-cloud, eagle-emblem, egg-clutch, evil-moon, eyeball, fairy-wand, falling-leaf, feather, feathered-wing, fire-bomb, fire-bottle, firework-rocket, fist, fizzing-flask, flash-grenade, flat-hammer, flat-star, flying-flag, footprint, fountain, gears, ghost, glass-heart, grenade, halberd, hazard-sign, heart-bottle, heart-organ, hood, hourglass, hunting-horn, ice-bomb, ice-cube, imp, imp-laugh, juggler, key, lantern-flame, leather-boot, leather-vest, light-bulb, lightning-storm, linked-rings, locked-chest, magic-lamp, magnet, magnifying-glass, medal, meditation, minigun, mirror-mirror, mountains, mountaintop, mushroom, night-sky, open-book, owl, padlock, pill, plain-dagger, pointing, potion-ball, power-lightning, prayer, radar-dish, rainbow-star, raining, return-arrow, ringing-bell, robe, rocket, round-bottom-flask, run, satellite, scale-mail, scales, screaming, scroll-unfurled, scythe, shining-heart, shiny-apple, skull-crossed-bones, snail, snake, snowflake-2, spanner, spider-web, spiky-explosion, sprout, star-swirl, steeltoe-boots, stone-block, stopwatch, sunbeams, syringe, target-arrows, third-eye, thorny-vine, tombstone, tooth, tornado, treasure-map, trident, trophy, trousers, two-shadows, umbrella, unlit-bomb, virus, visored-helm, volcano, vortex, wheat, whirlwind, wind-slap, wine-glass, wolf-head
- **Delapouite** — amphora, angry-eyes, anticlockwise-rotation, backpack, banjo, bank, barrel, bat, bed, biceps, black-belt, book-cover, book-pile, boomerang, brass-knuckles, brick-wall, card-joker, castle, champagne-cork, chart, check-mark, checkered-flag, cherry, clapperboard, clockwise-rotation, closed-barbute, computer-fan, cricket, desert, door, drum, dynamite, elephant-head, elevator, enrage, expand, fairy, falling-star, fencer, first-aid-kit, flamethrower, flanged-mace, flashlight, fleur-de-lys, flower-star, fog, frozen-body, game-console, gauntlet, gloves, greek-temple, health-potion, heart-beats, herbs-bundle, histogram, hook, house, ice-skate, jester-hat, jewel-crown, jump-across, jumping-dog, katana, kneeling, knocked-out-stars, leg, leg-armor, log, metal-boot, missile-launcher, moai, mona-lisa, mp5, musical-notes, nose-side, ogre, oni, padlock-open, pagoda, pay-money, person, pin, plain-circle, plug, podium-second, podium-winner, prayer-beads, present, price-tag, progression, rabbit, raccoon-head, reload-gun-barrel, revolver, rhinoceros-horn, ribbon-medal, ring, robot-grab, rolling-dices, running-shoe, save-arrow, sawed-off-shotgun, screw, sewing-string, shinto-shrine, shopping-cart, sickle, silenced, smartphone, sparkles, speaker, stop-sign, stun-grenade, suitcase, sunrise, swallow, telescope, toolbox, trash-can, vampire-dracula, vibrating-smartphone, walk, warhammer, weight-lifting-up, wizard-face, zat-gun
- **Skoll** — ak47, brodie-helmet, bullseye, colt-m1911, famas, kevlar-vest, long-legged-spider, machine-gun, open-palm, siren, talk, winchester-rifle
- **Sbed** — ammo-box, cancel, death-skull, laser-gun, medical-pack, rifle, shield, shotgun, water-drop
- **Caro Asercion** — mason-jar, ricochet, slot-machine
- **Carl Olsen** — crossbow, flame
- **DarkZaitzev** — hooded-figure, ninja-head
- **John Redman** — rock, scissors
- **Willdabeast** — chain-mail, round-shield
- **Badges** — crosshair
- **Cathelineau** — earth-worm
- **Faithtoken** — dragon-head
- **Guard13007** — soda-can
- **Irongamer** — armored-pants
- **John Colburn** — pistol-gun
- **Lucas** — cloak
- **Priorblue** — battery-75
- **Seregacthtuf** — sake-bottle
- **Various artists** — infinity
- **Zeromancer** — heart-plus

The attachment icons (optics, muzzles, barrels, magazines, grips, stocks, rounds, triggers) and some gun icons
(sniper / marksman rifles, shotgun, LMG, rocket & grenade launchers, railgun, tesla gun, nail gun, harpoon gun) are original
drawings made for this game; their small corner badges reuse the game-icons.net silhouettes listed above.
