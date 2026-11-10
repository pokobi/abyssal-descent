'use strict';
// The recorded sounds (snd/), by the name audio.js asks for them: f the files (one is taken each time, never the same twice running),
// v its level, p how far its pitch may wander, rate its speed (a voice played slower is a bigger throat), wet how much of the room it
// gets. A sound that is not listed here, or whose files have not arrived, is synthesized as before. Where each file comes from: snd/SOURCES.md
// (made by a script from the sources; every one of them CC0)
(function () {
  window.G = window.G || {};
  G.SND = {
 "step_stone": { "f": [  "step_stone_1.ogg",  "step_stone_2.ogg",  "step_stone_3.ogg",  "step_stone_4.ogg",  "step_stone_5.ogg",  "step_stone_6.ogg" ], "v": 0.9, "p": 0.05, "wet": 0.22 },
 "step_grass": { "f": [  "step_grass_1.ogg",  "step_grass_2.ogg",  "step_grass_3.ogg",  "step_grass_4.ogg",  "step_grass_5.ogg",  "step_grass_6.ogg" ], "v": 1.3, "p": 0.05, "wet": 0.12 },
 "impact_wood": { "f": [  "impact_wood_1.ogg",  "impact_wood_2.ogg",  "impact_wood_3.ogg",  "impact_wood_4.ogg",  "impact_wood_5.ogg" ], "v": 0.8, "p": 0.08, "wet": 0.25 },
 "impact_metal": { "f": [  "impact_metal_1.ogg",  "impact_metal_2.ogg",  "impact_metal_3.ogg",  "impact_metal_4.ogg",  "impact_metal_5.ogg",  "impact_metal_6.ogg" ], "v": 0.7, "p": 0.08, "wet": 0.3 },
 "break_wood": { "f": [  "break_wood_1.ogg",  "break_wood_2.ogg",  "break_wood_3.ogg",  "break_wood_4.ogg",  "break_wood_5.ogg",  "break_wood_6.ogg" ], "v": 1.0, "p": 0.08, "wet": 0.3 },
 "coins": { "f": [  "coins_1.ogg",  "coins_2.ogg" ], "v": 0.9, "p": 0.06, "wet": 0.15 },
 "pickup": { "f": [  "pickup_1.ogg",  "pickup_2.ogg",  "pickup_3.ogg",  "pickup_4.ogg" ], "v": 0.7, "p": 0.06, "wet": 0.1 },
 "chest_unlock": { "f": [  "chest_unlock_1.ogg",  "chest_unlock_2.ogg" ], "v": 0.9, "p": 0.04, "wet": 0.25 },
 "chest_pry": { "f": [  "chest_pry_1.ogg",  "chest_pry_2.ogg",  "chest_pry_3.ogg" ], "v": 0.9, "p": 0.05, "wet": 0.25 },
 "ui_open": { "f": [  "ui_open_1.ogg",  "ui_open_2.ogg",  "ui_open_3.ogg",  "ui_open_4.ogg" ], "v": 0.7, "p": 0.04, "wet": 0.08 },
 "ui_back": { "f": [  "ui_back_1.ogg" ], "v": 0.7, "p": 0.04, "wet": 0.08 },
 "ui_card": { "f": [  "ui_card_1.ogg",  "ui_card_2.ogg",  "ui_card_3.ogg" ], "v": 0.7, "p": 0.05, "wet": 0.08 },
 "ui_buy": { "f": [  "ui_buy_1.ogg",  "ui_buy_2.ogg" ], "v": 0.9, "p": 0.05, "wet": 0.1 }
};
})();
