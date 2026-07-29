// Frozen mid-tournament snapshot of the 2023 FIFA Women's World Cup: Groups A,
// B and D–H complete, Group C two matchdays in with its final round (Matches 37
// and 38) still to play.
//
// Taken from the committed (real) results rather than invented, so the clinch,
// elimination and projection engines meet an authentic configuration.
//
// WHY GROUP C. The sibling viewers freeze a group whose WINNER is already
// decided while second place is open. No group here offers that: only two
// matchdays are played by this point, so the largest possible lead is three
// points and nobody is mathematically clear at the top. Group C gives a better
// shape anyway — Spain and Japan are both on 6 points against two sides on 0
// who can reach at most 3, so BOTH qualification slots are already locked while
// the ORDER between them is not. They meet in Match 37, so a single result
// decides which takes Winner C and which takes Runner-up C, and therefore which
// Round-of-16 tie each one enters. That is exactly the seam the entry-slot
// enumeration has to get right.
//
// Match 38 (Costa Rica v Zambia) is left open alongside it: the final matchday
// kicks off simultaneously, as every group's does, and it cannot change who
// qualifies.
//
// Regenerate from src/data/matches.js by taking every Group match's committed
// score except 37 and 38. Do NOT hand-edit individual scores — a fixture that
// disagrees with the committed data is worse than none, because the engines
// still run and the assertions still pass.
//
// Map of match number -> [t1, t2] final score.
export const GROUP_STAGE_MD3 = {"1":[1,0],"2":[1,0],"3":[0,2],"4":[0,0],"5":[3,0],"6":[0,5],"7":[1,0],"8":[1,0],"9":[3,0],"10":[1,0],"11":[0,0],"12":[2,1],"13":[4,0],"14":[1,0],"15":[6,0],"16":[2,0],"17":[0,1],"18":[0,0],"19":[2,1],"20":[5,0],"21":[2,0],"22":[2,3],"23":[1,1],"24":[2,0],"25":[1,0],"26":[1,0],"27":[2,2],"28":[2,1],"29":[0,1],"30":[5,0],"31":[1,2],"32":[0,1],"33":[0,0],"34":[6,0],"35":[0,4],"36":[0,0],"39":[1,6],"40":[0,2],"41":[0,0],"42":[0,7],"43":[3,6],"44":[0,0],"45":[0,2],"46":[3,2],"47":[1,1],"48":[1,0]}
