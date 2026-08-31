/*
 * Shiny TCG Recepción Single - R16
 * Clasificación estricta por TCG.
 *
 * Estructura:
 * Tipo de carta -> Variante -> Tipo -> Atributo
 *
 * Los valores NO se mezclan con cartas capturadas previamente, por lo que
 * valores locales erróneos (ej. "fuego" como Tipo de carta de Pokémon)
 * no aparecen en los selectores.
 */

const NA=['No aplica'];

const YGO_RACES=[
 'Aqua','Beast','Beast-Warrior','Cyberse','Dinosaur','Divine-Beast','Dragon','Fairy',
 'Fiend','Fish','Illusion','Insect','Machine','Plant','Psychic','Pyro','Reptile',
 'Rock','Sea Serpent','Spellcaster','Thunder','Warrior','Winged Beast','Wyrm','Zombie'
];
const YGO_ATTR=['DARK','DIVINE','EARTH','FIRE','LIGHT','WATER','WIND'];

const MAGIC_CREATURE_TYPES=[
 'Angel','Artificer','Assassin','Avatar','Beast','Bird','Cat','Cleric','Construct','Demon',
 'Dinosaur','Dragon','Druid','Dwarf','Elemental','Elf','Faerie','Giant','Goblin','God',
 'Golem','Human','Hydra','Knight','Merfolk','Monk','Mutant','Ninja','Pirate','Rogue',
 'Samurai','Shaman','Skeleton','Sliver','Soldier','Spirit','Vampire','Warrior','Wizard','Wolf','Zombie'
];
const COLORS=['White','Blue','Black','Red','Green','Colorless','Multicolor'];
const ONEPIECE_COLORS=[
 'Red','Green','Blue','Purple','Black','Yellow',
 'Red/Green','Red/Blue','Red/Black','Red/Yellow','Green/Blue','Green/Purple',
 'Green/Black','Green/Yellow','Blue/Purple','Blue/Black','Blue/Yellow',
 'Purple/Black','Purple/Yellow','Black/Yellow'
];

const RULES={
 POKEMON:{
  editions:['1st Edition','Unlimited','Shadowless','Holo','Reverse Holo','Non-Holo','Promo'],
  categories:{
   'Pokémon':{
    variants:['Basic Pokémon','Stage 1 Pokémon','Stage 2 Pokémon','Baby Pokémon','Restored Pokémon','Pokémon ex','Pokémon-EX','Pokémon-GX','Pokémon V','Pokémon VMAX','Pokémon VSTAR','Radiant Pokémon','Tera Pokémon ex'],
    types:['Grass','Fire','Water','Lightning','Psychic','Fighting','Darkness','Metal','Dragon','Colorless','Fairy'],
    attributes:NA
   },
   'Trainer':{
    variants:['Item','Supporter','Stadium','Pokémon Tool','Technical Machine','ACE SPEC'],
    types:NA,attributes:NA
   },
   'Energy':{
    variants:['Basic Energy','Special Energy'],
    types:['Grass','Fire','Water','Lightning','Psychic','Fighting','Darkness','Metal','Colorless'],
    attributes:NA
   }
  }
 },
 YUGIOH:{
  editions:['1st Edition','Unlimited Edition','Limited Edition'],
  categories:{
   'Monster':{
    variants:['Normal Monster','Effect Monster','Fusion Monster','Ritual Monster','Synchro Monster','Xyz Monster','Pendulum Monster','Link Monster','Tuner Monster','Flip Monster','Gemini Monster','Spirit Monster','Union Monster','Toon Monster','Token'],
    types:YGO_RACES,attributes:YGO_ATTR
   },
   'Spell':{
    variants:['Normal Spell','Continuous Spell','Equip Spell','Field Spell','Quick-Play Spell','Ritual Spell'],
    types:NA,attributes:NA
   },
   'Trap':{
    variants:['Normal Trap','Continuous Trap','Counter Trap'],
    types:NA,attributes:NA
   }
  }
 },
 MAGIC:{
  editions:['Normal','Foil','Etched Foil','Borderless','Extended Art','Showcase','Retro Frame','Full Art','Serialized','Promo'],
  categories:{
   'Creature':{variants:['Normal','Legendary','Artifact Creature','Enchantment Creature'],types:MAGIC_CREATURE_TYPES,attributes:COLORS},
   'Artifact':{variants:['Artifact','Equipment','Vehicle','Clue','Food','Treasure','Map','Powerstone'],types:NA,attributes:COLORS},
   'Enchantment':{variants:['Enchantment','Aura','Saga','Class','Curse','Shrine','Room'],types:NA,attributes:COLORS},
   'Instant':{variants:['Instant'],types:NA,attributes:COLORS},
   'Sorcery':{variants:['Sorcery'],types:NA,attributes:COLORS},
   'Planeswalker':{variants:['Planeswalker'],types:NA,attributes:COLORS},
   'Land':{variants:['Basic Land','Nonbasic Land','Legendary Land','Snow Land'],types:['Plains','Island','Swamp','Mountain','Forest','Desert','Gate'],attributes:NA},
   'Battle':{variants:['Siege'],types:NA,attributes:COLORS}
  }
 },
 ONEPIECE:{
  editions:['Standard','Parallel','Alternate Art','Manga Rare','SP','Treasure Rare','Anniversary','Promo'],
  categories:{
   'Leader':{variants:['Leader'],types:NA,attributes:ONEPIECE_COLORS},
   'Character':{variants:['Character'],types:NA,attributes:ONEPIECE_COLORS},
   'Event':{variants:['Event'],types:NA,attributes:ONEPIECE_COLORS},
   'Stage':{variants:['Stage'],types:NA,attributes:ONEPIECE_COLORS},
   'DON!!':{variants:['DON!!'],types:NA,attributes:NA}
  }
 },
 RIFTBOUND:{
  editions:['Standard','Foil','Alternate Art','Overnumbered','Ultimate','Promo'],
  categories:{
   'Champion':{variants:['Champion Legend','Signature Champion'],types:NA,attributes:['Calm','Chaos','Fury','Mind','Order','Body']},
   'Unit':{variants:['Unit','Signature Unit'],types:NA,attributes:['Calm','Chaos','Fury','Mind','Order','Body']},
   'Spell':{variants:['Spell'],types:NA,attributes:['Calm','Chaos','Fury','Mind','Order','Body']},
   'Gear':{variants:['Gear'],types:NA,attributes:['Calm','Chaos','Fury','Mind','Order','Body']},
   'Battlefield':{variants:['Battlefield'],types:NA,attributes:NA},
   'Rune':{variants:['Rune'],types:NA,attributes:['Calm','Chaos','Fury','Mind','Order','Body']}
  }
 },
 LORCANA:{
  editions:['Standard','Cold Foil','Enchanted','Iconic','Promo'],
  categories:{
   'Character':{variants:['Storyborn','Dreamborn','Floodborn'],types:['Hero','Villain','Ally'],attributes:['Amber','Amethyst','Emerald','Ruby','Sapphire','Steel']},
   'Action':{variants:['Action','Song'],types:NA,attributes:['Amber','Amethyst','Emerald','Ruby','Sapphire','Steel']},
   'Item':{variants:['Item'],types:NA,attributes:['Amber','Amethyst','Emerald','Ruby','Sapphire','Steel']},
   'Location':{variants:['Location'],types:NA,attributes:['Amber','Amethyst','Emerald','Ruby','Sapphire','Steel']}
  }
 },
 FFTCG:{
  editions:['Standard','Foil','Full Art','Legacy','Promo'],
  categories:{
   'Forward':{variants:['Forward'],types:NA,attributes:['Fire','Ice','Wind','Earth','Lightning','Water','Light','Dark','Multi-Element']},
   'Backup':{variants:['Backup'],types:NA,attributes:['Fire','Ice','Wind','Earth','Lightning','Water','Light','Dark','Multi-Element']},
   'Summon':{variants:['Summon'],types:NA,attributes:['Fire','Ice','Wind','Earth','Lightning','Water','Light','Dark','Multi-Element']},
   'Monster':{variants:['Monster'],types:NA,attributes:['Fire','Ice','Wind','Earth','Lightning','Water','Light','Dark','Multi-Element']}
  }
 },
 DIGIMON:{
  editions:['Standard','Parallel','Alternate Art','Special','Stamped','Promo'],
  categories:{
   'Digi-Egg':{variants:['Digi-Egg'],types:['In-Training'],attributes:['Red','Blue','Yellow','Green','Black','Purple','White']},
   'Digimon':{variants:['Rookie','Champion','Ultimate','Mega','Hybrid','Armor Form'],types:NA,attributes:['Red','Blue','Yellow','Green','Black','Purple','White']},
   'Tamer':{variants:['Tamer'],types:NA,attributes:['Red','Blue','Yellow','Green','Black','Purple','White']},
   'Option':{variants:['Option'],types:NA,attributes:['Red','Blue','Yellow','Green','Black','Purple','White']}
  }
 },
 PALWORLD:{
  editions:['Standard','Foil','Parallel','Alternate Art','Special','Trial Deck','Promo'],
  categories:{
   'Pal':{variants:['Pal'],types:NA,attributes:['Grass','Fire','Water','Electric','Ground','Ice','Dragon','Dark','Neutral']},
   'Trainer':{variants:['Trainer','Support'],types:NA,attributes:NA},
   'Item':{variants:['Item','Equipment'],types:NA,attributes:NA},
   'Field':{variants:['Field'],types:NA,attributes:NA}
  }
 },
 DBSFW:{
  editions:['Standard','Parallel','Alternate Art','Special','Super Alt Art','Promo'],
  categories:{
   'Leader':{variants:['Leader'],types:NA,attributes:['Red','Blue','Green','Yellow','Black']},
   'Battle':{variants:['Battle'],types:NA,attributes:['Red','Blue','Green','Yellow','Black']},
   'Extra':{variants:['Extra'],types:NA,attributes:['Red','Blue','Green','Yellow','Black']}
  }
 },
 SWU:{
  editions:['Standard','Foil','Hyperspace','Hyperspace Foil','Showcase','Promo'],
  categories:{
   'Leader':{variants:['Leader'],types:NA,attributes:['Heroism','Villainy','Vigilance','Command','Aggression','Cunning']},
   'Base':{variants:['Base'],types:NA,attributes:['Vigilance','Command','Aggression','Cunning']},
   'Unit':{variants:['Ground Unit','Space Unit','Token Unit'],types:NA,attributes:['Heroism','Villainy','Vigilance','Command','Aggression','Cunning']},
   'Event':{variants:['Event'],types:NA,attributes:['Heroism','Villainy','Vigilance','Command','Aggression','Cunning']},
   'Upgrade':{variants:['Upgrade','Bounty','Pilot'],types:NA,attributes:['Heroism','Villainy','Vigilance','Command','Aggression','Cunning']}
  }
 },
 FAB:{
  editions:['Normal','Rainbow Foil','Cold Foil','Marvel','Extended Art','Full Art','Promo'],
  categories:{
   'Action':{variants:['Action','Attack Action'],types:['Attack','Aura','Item','Ally','Arrow'],attributes:['Generic','Brute','Guardian','Mechanologist','Ninja','Ranger','Runeblade','Warrior','Wizard','Illusionist','Assassin','Draconic','Elemental','Light','Shadow']},
   'Attack Reaction':{variants:['Attack Reaction'],types:NA,attributes:['Generic','Brute','Guardian','Mechanologist','Ninja','Ranger','Runeblade','Warrior','Wizard','Assassin']},
   'Defense Reaction':{variants:['Defense Reaction'],types:NA,attributes:['Generic','Guardian','Warrior','Ninja','Ranger','Runeblade','Assassin']},
   'Equipment':{variants:['Head','Chest','Arms','Legs','Off-Hand'],types:NA,attributes:['Generic','Brute','Guardian','Mechanologist','Ninja','Ranger','Runeblade','Warrior','Wizard','Illusionist','Assassin']},
   'Hero':{variants:['Young Hero','Adult Hero'],types:NA,attributes:['Brute','Guardian','Mechanologist','Ninja','Ranger','Runeblade','Warrior','Wizard','Illusionist','Assassin']},
   'Instant':{variants:['Instant'],types:NA,attributes:['Generic','Wizard','Runeblade','Illusionist']},
   'Weapon':{variants:['One-Handed','Two-Handed'],types:NA,attributes:['Brute','Guardian','Mechanologist','Ninja','Ranger','Runeblade','Warrior','Wizard','Assassin']}
  }
 },
 UNIONARENA:{
  editions:['Standard','Parallel','Alternate Art','SR★','AP','Promo'],
  categories:{
   'Character':{variants:['Character'],types:NA,attributes:['Red','Blue','Green','Yellow','Purple']},
   'Event':{variants:['Event'],types:NA,attributes:['Red','Blue','Green','Yellow','Purple']},
   'Field':{variants:['Field'],types:NA,attributes:['Red','Blue','Green','Yellow','Purple']}
  }
 },
 WEISS:{
  editions:['Normal','Foil','Parallel','SP','SSP','SEC','OFR','RRR','SR','Promo'],
  categories:{
   'Character':{variants:['Character'],types:NA,attributes:['Yellow','Green','Red','Blue']},
   'Event':{variants:['Event','Counter'],types:NA,attributes:['Yellow','Green','Red','Blue']},
   'Climax':{variants:['Climax'],types:['Comeback','Choice','Door','Gate','Gold Bar','Book','Shot','Standby','Wind'],attributes:['Yellow','Green','Red','Blue']}
  }
 },
 VANGUARD:{
  editions:['Normal','Foil','Parallel','Special Parallel','FR','FFR','SEC','DSR','Promo'],
  categories:{
   'Unit':{variants:['Normal Unit','Trigger Unit','G Unit'],types:['Grade 0','Grade 1','Grade 2','Grade 3','Grade 4'],attributes:['Dark States','Dragon Empire','Keter Sanctuary','Brandt Gate','Stoicheia','Lyrical Monasterio']},
   'Order':{variants:['Normal Order','Blitz Order','Set Order'],types:['Grade 0','Grade 1','Grade 2','Grade 3'],attributes:['Dark States','Dragon Empire','Keter Sanctuary','Brandt Gate','Stoicheia','Lyrical Monasterio']},
   'Ride Deck Crest':{variants:['Ride Deck Crest'],types:NA,attributes:['Dark States','Dragon Empire','Keter Sanctuary','Brandt Gate','Stoicheia','Lyrical Monasterio']}
  }
 }
};

const ALIASES={
 POKEMON:'POKEMON',PKM:'POKEMON',PKMN:'POKEMON',
 YUGIOH:'YUGIOH',YGO:'YUGIOH',
 MAGIC:'MAGIC',MTG:'MAGIC',
 ONEPIECE:'ONEPIECE',OPCG:'ONEPIECE',
 RIFTBOUND:'RIFTBOUND',
 LORCANA:'LORCANA',LOR:'LORCANA',
 FFTCG:'FFTCG',DIGIMON:'DIGIMON',DIGI:'DIGIMON',
 PALWORLD:'PALWORLD',DBSFW:'DBSFW',DBS:'DBSFW',
 SWU:'SWU',FAB:'FAB',UNIONARENA:'UNIONARENA',
 WEISS:'WEISS',VANGUARD:'VANGUARD'
};

function norm(v=''){
 return String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .toUpperCase().replace(/[^A-Z0-9]+/g,'').trim();
}

export function strictTcgRuleR16(game={}){
 const vals=[game.catalogo_codigo,game.codigo,game.game_code,game.nombre].map(norm).filter(Boolean);
 for(const raw of vals){
  const key=ALIASES[raw]||raw;
  if(RULES[key]) return {...RULES[key],key};
  if(raw.includes('POKEMON')) return {...RULES.POKEMON,key:'POKEMON'};
  if(raw.includes('YUGIOH')) return {...RULES.YUGIOH,key:'YUGIOH'};
  if(raw.includes('MAGIC')||raw.includes('GATHERING')) return {...RULES.MAGIC,key:'MAGIC'};
  if(raw.includes('ONEPIECE')) return {...RULES.ONEPIECE,key:'ONEPIECE'};
  if(raw.includes('RIFTBOUND')) return {...RULES.RIFTBOUND,key:'RIFTBOUND'};
  if(raw.includes('LORCANA')) return {...RULES.LORCANA,key:'LORCANA'};
  if(raw.includes('FINALFANTASY')) return {...RULES.FFTCG,key:'FFTCG'};
  if(raw.includes('DIGIMON')) return {...RULES.DIGIMON,key:'DIGIMON'};
  if(raw.includes('PALWORLD')) return {...RULES.PALWORLD,key:'PALWORLD'};
  if(raw.includes('DRAGONBALL')) return {...RULES.DBSFW,key:'DBSFW'};
  if(raw.includes('STARWARS')) return {...RULES.SWU,key:'SWU'};
  if(raw.includes('FLESHANDBLOOD')) return {...RULES.FAB,key:'FAB'};
  if(raw.includes('UNIONARENA')) return {...RULES.UNIONARENA,key:'UNIONARENA'};
  if(raw.includes('WEISS')) return {...RULES.WEISS,key:'WEISS'};
  if(raw.includes('VANGUARD')) return {...RULES.VANGUARD,key:'VANGUARD'};
 }
 return {key:'UNKNOWN',editions:[],categories:{}};
}

export function categoriesR16(rule){
 return Object.keys(rule?.categories||{});
}
export function categoryRuleR16(rule,category){
 return rule?.categories?.[category] || {variants:[],types:[],attributes:[]};
}
export function normalizeR16List(values){
 return [...new Set((Array.isArray(values)?values:[]).map(v=>String(v||'').trim()).filter(Boolean))];
}
export function serializeClassificationR16({variant='',type='',attribute=''}={}){
 return [
  variant ? `VAR:${variant}` : '',
  type && type!=='No aplica' ? `TIPO:${type}` : '',
  attribute && attribute!=='No aplica' ? `ATR:${attribute}` : ''
 ].filter(Boolean).join(' | ');
}
