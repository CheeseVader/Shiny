/*
 * GMX TCG - Recepción Single / Catálogos R12
 * Cobertura explícita para TODOS los TCG del catálogo GMX actual:
 * POKEMON, MAGIC, YUGIOH, ONEPIECE, RIFTBOUND, LORCANA, FFTCG,
 * DIGIMON, PALWORLD, DBSFW, SWU, FAB, UNIONARENA, WEISS, VANGUARD.
 *
 * No depende de cartas previamente recibidas.
 */

const GENERIC={
  types:['Character','Event','Item','Action','Resource','Token'],
  subtypes:['Standard','Special','Promo'],
  editions:['Standard','Foil','Alternate Art','Promo']
};

const PRESETS={
POKEMON:{
 types:['Pokémon','Trainer','Energy'],
 subtypes:[
  'Basic Pokémon','Stage 1 Pokémon','Stage 2 Pokémon','Baby Pokémon','Restored Pokémon',
  'Pokémon ex','Pokémon-EX','Pokémon-GX','Pokémon V','Pokémon VMAX','Pokémon VSTAR',
  'Pokémon BREAK','Pokémon LEGEND','Radiant Pokémon','Tera Pokémon ex','Mega Evolution Pokémon ex',
  'Item','Supporter','Stadium','Pokémon Tool','Technical Machine','ACE SPEC',
  'Basic Energy','Special Energy'
 ],
 editions:['1st Edition','Unlimited','Shadowless','Holo','Reverse Holo','Non-Holo','Promo']
},
MAGIC:{
 types:['Artifact','Battle','Creature','Enchantment','Instant','Kindred','Land','Planeswalker','Sorcery'],
 subtypes:[
  'Artifact Creature','Equipment','Fortification','Vehicle','Clue','Food','Treasure','Map','Powerstone',
  'Aura','Background','Cartouche','Case','Class','Curse','Role','Room','Rune','Saga','Shrine',
  'Adventure','Lesson','Trap','Basic Land','Desert','Gate','Lair','Locus','Mine','Power-Plant','Sphere','Tower',
  'Siege','Angel','Artificer','Assassin','Avatar','Beast','Bird','Cat','Cleric','Construct','Demon','Dinosaur',
  'Dragon','Druid','Dwarf','Elemental','Elf','Faerie','Giant','Goblin','God','Golem','Human','Hydra','Knight',
  'Merfolk','Monk','Mutant','Ninja','Pirate','Rogue','Samurai','Shaman','Skeleton','Sliver','Soldier',
  'Spirit','Vampire','Warrior','Wizard','Wolf','Zombie'
 ],
 editions:['Normal','Foil','Etched Foil','Borderless','Extended Art','Showcase','Retro Frame','Full Art','Serialized','Promo']
},
YUGIOH:{
 types:['Monster','Spell','Trap','Skill','Token'],
 subtypes:[
  'Normal Monster','Effect Monster','Fusion Monster','Ritual Monster','Synchro Monster','Xyz Monster',
  'Pendulum Monster','Link Monster','Tuner Monster','Flip Monster','Gemini Monster','Spirit Monster',
  'Union Monster','Toon Monster','Normal Spell','Continuous Spell','Equip Spell','Field Spell',
  'Quick-Play Spell','Ritual Spell','Normal Trap','Continuous Trap','Counter Trap','Skill Card','Token'
 ],
 editions:['1st Edition','Unlimited Edition','Limited Edition']
},
ONEPIECE:{
 types:['Leader','Character','Event','Stage','DON!!'],
 subtypes:[
  'Red','Green','Blue','Purple','Black','Yellow',
  'Red/Green','Red/Blue','Red/Black','Red/Yellow','Green/Blue','Green/Purple','Green/Black',
  'Green/Yellow','Blue/Purple','Blue/Black','Blue/Yellow','Purple/Black','Purple/Yellow','Black/Yellow'
 ],
 editions:['Standard','Parallel','Alternate Art','Manga Rare','SP','Treasure Rare','Anniversary','Promo']
},
RIFTBOUND:{
 types:['Champion','Unit','Spell','Gear','Battlefield','Rune'],
 subtypes:['Champion Legend','Signature Unit','Unit','Spell','Gear','Battlefield','Token'],
 editions:['Standard','Foil','Alternate Art','Overnumbered','Ultimate','Promo']
},
LORCANA:{
 types:['Character','Action','Item','Location'],
 subtypes:['Storyborn','Dreamborn','Floodborn','Song','Ally','Hero','Villain'],
 editions:['Standard','Cold Foil','Enchanted','Iconic','Promo']
},
FFTCG:{
 types:['Forward','Backup','Summon','Monster'],
 subtypes:['Fire','Ice','Wind','Earth','Lightning','Water','Light','Dark','Multi-Element'],
 editions:['Standard','Foil','Full Art','Legacy','Promo']
},
DIGIMON:{
 types:['Digi-Egg','Digimon','Tamer','Option'],
 subtypes:[
  'In-Training','Rookie','Champion','Ultimate','Mega',
  'Red','Blue','Yellow','Green','Black','Purple','White',
  'Hybrid','Armor Form','D-Reaper','Appmon','X Antibody'
 ],
 editions:['Standard','Parallel','Alternate Art','Special','Stamped','Promo']
},
PALWORLD:{
 types:['Pal','Trainer','Item','Field'],
 subtypes:['Basic','Evolution','Support','Equipment','Field','Token'],
 editions:['Standard','Foil','Parallel','Alternate Art','Special','Trial Deck','Promo']
},
DBSFW:{
 types:['Leader','Battle','Extra'],
 subtypes:['Red','Blue','Green','Yellow','Black'],
 editions:['Standard','Parallel','Alternate Art','Special','Super Alt Art','Promo']
},
SWU:{
 types:['Leader','Base','Unit','Event','Upgrade'],
 subtypes:[
  'Ground Unit','Space Unit','Token Unit','Bounty','Pilot',
  'Heroism','Villainy','Vigilance','Command','Aggression','Cunning'
 ],
 editions:['Standard','Foil','Hyperspace','Hyperspace Foil','Showcase','Promo']
},
FAB:{
 types:['Action','Attack Reaction','Defense Reaction','Equipment','Hero','Instant','Mentor','Resource','Token','Weapon'],
 subtypes:[
  'Attack','Aura','Item','Ally','Arrow','Attack Action','Action Equipment',
  'Head','Chest','Arms','Legs','Off-Hand','One-Handed','Two-Handed'
 ],
 editions:['Normal','Rainbow Foil','Cold Foil','Marvel','Extended Art','Full Art','Promo']
},
UNIONARENA:{
 types:['Character','Event','Field'],
 subtypes:['Red','Blue','Green','Yellow','Purple'],
 editions:['Standard','Parallel','Alternate Art','SR★','AP','Promo']
},
WEISS:{
 types:['Character','Event','Climax'],
 subtypes:['Yellow','Green','Red','Blue','Trigger','Counter','Assist'],
 editions:['Normal','Foil','Parallel','SP','SSP','SEC','OFR','RRR','SR','Promo']
},
VANGUARD:{
 types:['Unit','Order','Ride Deck Crest'],
 subtypes:[
  'Normal Unit','Trigger Unit','G Unit','Normal Order','Blitz Order','Set Order',
  'Over Trigger','Critical Trigger','Draw Trigger','Front Trigger','Heal Trigger'
 ],
 editions:['Normal','Foil','Parallel','Special Parallel','FR','FFR','SEC','DSR','Promo']
}
};

const ALIASES={
 POKEMON:'POKEMON',PKM:'POKEMON',PKMN:'POKEMON',
 MAGIC:'MAGIC',MTG:'MAGIC',
 YUGIOH:'YUGIOH',YGO:'YUGIOH',
 ONEPIECE:'ONEPIECE',OPCG:'ONEPIECE',
 RIFTBOUND:'RIFTBOUND',
 LORCANA:'LORCANA',LOR:'LORCANA',
 FFTCG:'FFTCG',
 DIGIMON:'DIGIMON',DIGI:'DIGIMON',
 PALWORLD:'PALWORLD',
 DBSFW:'DBSFW',DBS:'DBSFW',
 SWU:'SWU',
 FAB:'FAB',
 UNIONARENA:'UNIONARENA',
 WEISS:'WEISS',
 VANGUARD:'VANGUARD'
};

function norm(value=''){
 return String(value??'')
   .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
   .toUpperCase().replace(/[^A-Z0-9]+/g,'').trim();
}

export function tcgReceptionPreset(game={}){
 const values=[game.catalogo_codigo,game.codigo,game.game_code,game.nombre].map(norm).filter(Boolean);
 for(const raw of values){
   const key=ALIASES[raw]||raw;
   if(PRESETS[key]) return {...PRESETS[key],key,covered:true};

   if(raw.includes('POKEMON')) return {...PRESETS.POKEMON,key:'POKEMON',covered:true};
   if(raw.includes('MAGIC')||raw.includes('GATHERING')) return {...PRESETS.MAGIC,key:'MAGIC',covered:true};
   if(raw.includes('YUGIOH')) return {...PRESETS.YUGIOH,key:'YUGIOH',covered:true};
   if(raw.includes('ONEPIECE')) return {...PRESETS.ONEPIECE,key:'ONEPIECE',covered:true};
   if(raw.includes('RIFTBOUND')) return {...PRESETS.RIFTBOUND,key:'RIFTBOUND',covered:true};
   if(raw.includes('LORCANA')) return {...PRESETS.LORCANA,key:'LORCANA',covered:true};
   if(raw.includes('FINALFANTASY')) return {...PRESETS.FFTCG,key:'FFTCG',covered:true};
   if(raw.includes('DIGIMON')) return {...PRESETS.DIGIMON,key:'DIGIMON',covered:true};
   if(raw.includes('PALWORLD')) return {...PRESETS.PALWORLD,key:'PALWORLD',covered:true};
   if(raw.includes('DRAGONBALL')) return {...PRESETS.DBSFW,key:'DBSFW',covered:true};
   if(raw.includes('STARWARS')) return {...PRESETS.SWU,key:'SWU',covered:true};
   if(raw.includes('FLESHANDBLOOD')) return {...PRESETS.FAB,key:'FAB',covered:true};
   if(raw.includes('UNIONARENA')) return {...PRESETS.UNIONARENA,key:'UNIONARENA',covered:true};
   if(raw.includes('WEISS')) return {...PRESETS.WEISS,key:'WEISS',covered:true};
   if(raw.includes('VANGUARD')) return {...PRESETS.VANGUARD,key:'VANGUARD',covered:true};
 }
 return {...GENERIC,key:'GENERIC',covered:false};
}

export function mergeReceptionOptions(...groups){
 const map=new Map();
 for(const group of groups){
   for(const value of (Array.isArray(group)?group:[])){
     const clean=String(value??'').trim();
     if(!clean) continue;
     const key=clean.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
     if(!map.has(key)) map.set(key,clean);
   }
 }
 return [...map.values()].sort((a,b)=>a.localeCompare(b,'es',{sensitivity:'base'}));
}

export const GMX_TCG_R12_COVERED_CODES=Object.freeze([
 'POKEMON','MAGIC','YUGIOH','ONEPIECE','RIFTBOUND','LORCANA','FFTCG',
 'DIGIMON','PALWORLD','DBSFW','SWU','FAB','UNIONARENA','WEISS','VANGUARD'
]);
