import { useEffect,useMemo,useState } from 'react';
import { useSearchParams } from 'react-router';
import { publicApi } from '../../services/publicApi.js';
import { usePublicStore } from '../../contexts/PublicStoreContext.jsx';
import ProductCard from '../../components/public/ProductCard.jsx';
import { genericProducts,productMatchesQuery } from '../../utils/publicCatalogClassification.js';

export default function StoreCatalogPage(){
  const {store,liveUpdate}=usePublicStore();
  const [params,setParams]=useSearchParams();
  const [rows,setRows]=useState([]);
  const [games,setGames]=useState([]);
  const [loading,setLoading]=useState(true);

  const q=params.get('q')||'';
  const category=params.get('category')||'';

  useEffect(()=>{
    let active=true;
    setLoading(true);

    Promise.all([
      publicApi('/api/public/products?limit=100'),
      publicApi('/api/public/tcg/games')
    ]).then(([p,g])=>{
      if(!active)return;
      setRows(p.data||[]);
      setGames(g.data||[]);
    }).finally(()=>{
      if(active)setLoading(false);
    });

    return ()=>{active=false;};
  },[]);

  useEffect(()=>{
    if(!liveUpdate?.version)return;
    const changes=liveUpdate.changes||[];
    setRows(current=>current.map(p=>{
      const hit=changes.find(c=>c.type==='PRODUCT'&&String(c.id)===String(p.id));
      return hit?{...p,stock_disponible:Number(hit.stock)}:p;
    }));
  },[liveUpdate?.version]);

  const generic=useMemo(()=>genericProducts(rows,games),[rows,games]);

  const categories=useMemo(
    ()=>[...new Set(generic.map(x=>String(x.categoria||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b)),
    [generic]
  );

  const visible=useMemo(
    ()=>generic.filter(p=>
      (!category||String(p.categoria||'')===category) &&
      productMatchesQuery(p,q)
    ),
    [generic,category,q]
  );

  const currency=store?.settings?.['public.store.currency']||'MXN';

  return <main className="public-page">
    <div className="public-page-head">
      <small>CATÁLOGO GENERAL</small>
      <h1>Productos</h1>
      <p>Artículos generales que no pertenecen a un TCG específico.</p>
    </div>

    <div className="catalog-toolbar">
      <input
        value={q}
        onChange={e=>setParams(x=>{
          const n=new URLSearchParams(x);
          e.target.value?n.set('q',e.target.value):n.delete('q');
          return n;
        })}
        placeholder="Buscar producto, SKU o categoría"
      />
      <select
        value={category}
        onChange={e=>setParams(x=>{
          const n=new URLSearchParams(x);
          e.target.value?n.set('category',e.target.value):n.delete('category');
          return n;
        })}
      >
        <option value="">Todas las categorías</option>
        {categories.map(c=><option key={c} value={c}>{c}</option>)}
      </select>
    </div>

    {loading
      ?<div className="public-empty">Cargando productos…</div>
      :visible.length
        ?<div className="public-products-grid">
          {visible.map(p=><ProductCard key={p.row_id} product={p} currency={currency}/>)}
        </div>
        :<div className="public-empty">No encontramos productos generales con esos filtros.</div>
    }
  </main>;
}