import { useEffect,useMemo,useState } from 'react';
import { useSearchParams } from 'react-router';
import { publicApi } from '../../services/publicApi.js';
import { usePublicStore } from '../../contexts/PublicStoreContext.jsx';
import StoreSlideshow from '../../components/public/StoreSlideshow.jsx';
import TcgCard from '../../components/public/TcgCard.jsx';
import ProductCard from '../../components/public/ProductCard.jsx';
import { productMatchesQuery,tcgProducts } from '../../utils/publicCatalogClassification.js';

export default function StoreTcgPage(){
  const {store,liveUpdate}=usePublicStore();
  const [params,setParams]=useSearchParams();
  const [games,setGames]=useState([]);
  const [rows,setRows]=useState([]);
  const [products,setProducts]=useState([]);
  const [loading,setLoading]=useState(true);

  const gameId=params.get('gameId')||'';
  const q=params.get('q')||'';
  const view=params.get('view')||'all';

  useEffect(()=>{
    let active=true;
    setLoading(true);

    Promise.all([
      publicApi('/api/public/tcg/games'),
      publicApi(`/api/public/tcg?limit=96&gameId=${encodeURIComponent(gameId)}&search=${encodeURIComponent(q)}`),
      publicApi('/api/public/products?limit=100')
    ]).then(([g,t,p])=>{
      if(!active)return;
      setGames(g.data||[]);
      setRows(t.data||[]);
      setProducts(p.data||[]);
    }).finally(()=>{
      if(active)setLoading(false);
    });

    return ()=>{active=false;};
  },[gameId,q]);

  useEffect(()=>{
    if(!liveUpdate?.version)return;
    const changes=liveUpdate.changes||[];

    setRows(current=>current.map(x=>{
      const hit=changes.find(c=>c.type==='TCG'&&String(c.id)===String(x.id_inventario));
      return hit?{...x,stock:Number(hit.stock),stock_disponible:Number(hit.stock)}:x;
    }));

    setProducts(current=>current.map(p=>{
      const hit=changes.find(c=>c.type==='PRODUCT'&&String(c.id)===String(p.id));
      return hit?{...p,stock_disponible:Number(hit.stock)}:p;
    }));
  },[liveUpdate?.version]);

  const selectedGame=useMemo(
    ()=>games.find(g=>String(g.id_juego)===String(gameId))||null,
    [games,gameId]
  );

  const sealed=useMemo(
    ()=>tcgProducts(products,games,selectedGame).filter(p=>productMatchesQuery(p,q)),
    [products,games,selectedGame,q]
  );

  const currency=store?.settings?.['public.store.currency']||'MXN';
  const showSingles=view==='all'||view==='singles';
  const showSealed=view==='all'||view==='sealed';

  function setView(next){
    setParams(current=>{
      const n=new URLSearchParams(current);
      next==='all'?n.delete('view'):n.set('view',next);
      return n;
    });
  }

  const title=selectedGame?.nombre||'Trading Card Games';

  return <main className="public-page tcg-public-page">
    <StoreSlideshow slides={store?.zones?.TCG_TOP||[]} settings={store?.settings||{}} variant="wide"/>

    <div className="public-page-head">
      <small>TRADING CARD GAMES</small>
      <h1>{title}</h1>
      <p>Singles, producto sellado y artículos relacionados con este TCG.</p>
    </div>

    <div className="catalog-toolbar">
      <input
        value={q}
        onChange={e=>setParams(x=>{
          const n=new URLSearchParams(x);
          e.target.value?n.set('q',e.target.value):n.delete('q');
          return n;
        })}
        placeholder="Buscar carta, producto, SKU o número"
      />
      <select
        value={gameId}
        onChange={e=>setParams(x=>{
          const n=new URLSearchParams(x);
          e.target.value?n.set('gameId',e.target.value):n.delete('gameId');
          return n;
        })}
      >
        <option value="">Todos los TCG</option>
        {games.map(g=><option key={g.id_juego} value={g.id_juego}>{g.nombre}</option>)}
      </select>
    </div>

    <div className="gmx-public-tcg-tabs" role="tablist" aria-label="Tipo de catálogo TCG">
      <button type="button" className={view==='all'?'active':''} onClick={()=>setView('all')}>Todo</button>
      <button type="button" className={view==='singles'?'active':''} onClick={()=>setView('singles')}>Singles</button>
      <button type="button" className={view==='sealed'?'active':''} onClick={()=>setView('sealed')}>Sellado y accesorios</button>
    </div>

    {loading?<div className="public-empty">Cargando catálogo TCG…</div>:null}

    {!loading&&showSingles?
      <section className="gmx-public-tcg-section">
        <div className="public-section-head">
          <div><small>CARTAS INDIVIDUALES</small><h2>Singles</h2></div>
          <span className="gmx-public-result-count">{rows.length} resultado{rows.length===1?'':'s'}</span>
        </div>
        {rows.length
          ?<div className="public-products-grid">{rows.map(x=><TcgCard key={x.row_id} item={x} currency={currency}/>)}</div>
          :<div className="public-empty gmx-public-empty-compact">No hay singles disponibles con estos filtros.</div>}
      </section>
      :null
    }

    {!loading&&showSealed?
      <section className="gmx-public-tcg-section">
        <div className="public-section-head">
          <div><small>PRODUCTO TCG</small><h2>Sellado y accesorios</h2></div>
          <span className="gmx-public-result-count">{sealed.length} resultado{sealed.length===1?'':'s'}</span>
        </div>
        {sealed.length
          ?<div className="public-products-grid">{sealed.map(p=><ProductCard key={`product-${p.row_id}`} product={p} currency={currency}/>)}</div>
          :<div className="public-empty gmx-public-empty-compact">No hay producto sellado o accesorios relacionados disponibles.</div>}
      </section>
      :null
    }
  </main>;
}