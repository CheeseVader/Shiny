function norm(value=''){
  return String(value??'')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g,' ')
    .replace(/\s+/g,' ')
    .trim();
}

const FALLBACK_ALIASES={
  POKEMON:['POKEMON','PKMN','PKM'],
  YUGIOH:['YUGIOH','YU GI OH','YGO'],
  MAGIC:['MAGIC THE GATHERING','MAGIC','MTG'],
  ONEPIECE:['ONE PIECE','ONEPIECE','OPCG'],
  RIFTBOUND:['RIFTBOUND'],
  LORCANA:['LORCANA'],
  DIGIMON:['DIGIMON'],
  DBSFW:['DRAGON BALL SUPER','DBSFW','FUSION WORLD'],
  SWU:['STAR WARS UNLIMITED','SWU'],
  FAB:['FLESH AND BLOOD','FAB'],
  UNIONARENA:['UNION ARENA','UNIONARENA'],
  WEISS:['WEISS SCHWARZ','WEISS'],
  VANGUARD:['CARDFIGHT VANGUARD','VANGUARD']
};

function productText(product={}){
  return norm([
    product.nombre,
    product.descripcion,
    product.sku,
    product.categoria
  ].filter(Boolean).join(' '));
}

function gameTokens(game={}){
  const code=norm(game.catalogo_codigo||game.codigo||'').replace(/\s+/g,'');
  const name=norm(game.nombre||'');
  const values=[
    name,
    norm(game.catalogo_codigo||game.codigo||''),
    ...(FALLBACK_ALIASES[code]||[])
  ].map(norm).filter(Boolean);
  return [...new Set(values)];
}

export function productMatchesGame(product,game){
  if(!product||!game)return false;
  const text=productText(product);
  if(!text)return false;
  return gameTokens(game).some(token=>{
    if(!token)return false;
    if(token.length<=3){
      return (` ${text} `).includes(` ${token} `);
    }
    return text.includes(token);
  });
}

export function detectProductGame(product,games=[]){
  return (games||[]).find(game=>productMatchesGame(product,game))||null;
}

export function isTcgRelatedProduct(product,games=[]){
  const category=norm(product?.categoria||'');

  if(
    category.includes('TCG') ||
    category.includes('SELLADO') ||
    category.includes('BOOSTER')
  ) return true;

  if(detectProductGame(product,games))return true;

  return false;
}

export function genericProducts(products=[],games=[]){
  return (products||[]).filter(p=>!isTcgRelatedProduct(p,games));
}

export function tcgProducts(products=[],games=[],game=null){
  return (products||[]).filter(p=>{
    if(!isTcgRelatedProduct(p,games))return false;
    return game?productMatchesGame(p,game):!!detectProductGame(p,games);
  });
}

export function productMatchesQuery(product,q=''){
  const query=norm(q);
  if(!query)return true;
  const text=productText(product);
  return query.split(' ').filter(Boolean).every(token=>text.includes(token));
}