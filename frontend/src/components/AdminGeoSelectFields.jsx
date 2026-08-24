import {useEffect,useMemo,useState} from 'react';
import {publicApi} from '../services/publicApi.js';

export default function AdminGeoSelectFields({
  value,
  onChange,
  includeAddress=true,
  required=false,
  labels={}
}){
  const v=value||{};
  const [countries,setCountries]=useState([]);
  const [states,setStates]=useState([]);
  const [cities,setCities]=useState([]);
  const [postalCodes,setPostalCodes]=useState([]);
  const [settlements,setSettlements]=useState([]);
  const [loading,setLoading]=useState({countries:false,states:false,cities:false,zips:false,settlements:false});
  const [message,setMessage]=useState('');

  const country=v.pais||v.country||'México';
  const state=v.estado||v.state||'';
  const city=v.ciudad||v.city||v.municipio||'';
  const zip=v.cp||v.zip||'';
  const settlement=v.colonia||v.settlement||'';
  const address=v.direccion||v.address||'';

  function patch(data){
    onChange?.({
      ...v,
      ...data,
      pais:data.pais??data.country??country,
      estado:data.estado??data.state??state,
      ciudad:data.ciudad??data.city??city,
      municipio:data.municipio??data.city??city,
      cp:data.cp??data.zip??zip,
      colonia:data.colonia??data.settlement??settlement,
      direccion:data.direccion??data.address??address
    });
  }

  useEffect(()=>{
    let active=true;
    setLoading(x=>({...x,countries:true}));
    publicApi('/api/public/geo/countries')
      .then(r=>{if(active)setCountries(r.data||[]);})
      .catch(e=>{if(active)setMessage(`No fue posible cargar países: ${e.message}`);})
      .finally(()=>{if(active)setLoading(x=>({...x,countries:false}));});
    return()=>{active=false};
  },[]);

  useEffect(()=>{
    if(country!=='México'){setStates([]);return;}
    let active=true;
    setLoading(x=>({...x,states:true}));
    setMessage('');
    publicApi('/api/public/geo/states')
      .then(r=>{
        if(!active)return;
        const rows=r.data||[];
        setStates(rows);
        if(!rows.length)setMessage('El catálogo geográfico de México está vacío. Ejecuta la restauración geográfica incluida en 10.6.2.4.1.1.');
      })
      .catch(e=>{if(active){setStates([]);setMessage(`No fue posible cargar estados: ${e.message}`);}})
      .finally(()=>{if(active)setLoading(x=>({...x,states:false}));});
    return()=>{active=false};
  },[country]);

  useEffect(()=>{
    if(!state){setCities([]);return;}
    let active=true;
    setLoading(x=>({...x,cities:true}));
    publicApi(`/api/public/geo/cities?state=${encodeURIComponent(state)}`)
      .then(r=>{if(active)setCities(r.data||[]);})
      .catch(e=>{if(active){setCities([]);setMessage(`No fue posible cargar ciudades/municipios: ${e.message}`);}})
      .finally(()=>{if(active)setLoading(x=>({...x,cities:false}));});
    return()=>{active=false};
  },[state]);

  useEffect(()=>{
    if(!state||!city){setPostalCodes([]);return;}
    let active=true;
    setLoading(x=>({...x,zips:true}));
    publicApi(`/api/public/geo/postal-codes?state=${encodeURIComponent(state)}&city=${encodeURIComponent(city)}`)
      .then(r=>{if(active)setPostalCodes(r.data||[]);})
      .catch(e=>{if(active){setPostalCodes([]);setMessage(`No fue posible cargar códigos postales: ${e.message}`);}})
      .finally(()=>{if(active)setLoading(x=>({...x,zips:false}));});
    return()=>{active=false};
  },[state,city]);

  useEffect(()=>{
    if(!zip){setSettlements([]);return;}
    let active=true;
    setLoading(x=>({...x,settlements:true}));
    publicApi(`/api/public/geo/settlements?cp=${encodeURIComponent(zip)}`)
      .then(r=>{
        if(!active)return;
        const rows=r.data||[];
        setSettlements(rows);
        const match=rows.find(x=>(x.colonia||'')===settlement)||rows[0];
        if(match){
          patch({
            estado:match.estado||state,
            ciudad:match.ciudad||match.municipio||city,
            municipio:match.municipio||match.ciudad||city
          });
        }
      })
      .catch(e=>{if(active){setSettlements([]);setMessage(`No fue posible cargar colonias: ${e.message}`);}})
      .finally(()=>{if(active)setLoading(x=>({...x,settlements:false}));});
    return()=>{active=false};
  },[zip]);

  const uniqueSettlements=useMemo(()=>{
    const map=new Map();
    for(const x of settlements){
      const key=String(x.colonia||'').trim();
      if(key&&!map.has(key))map.set(key,x);
    }
    return [...map.values()];
  },[settlements]);

  return <div className="admin-geo-block">
    <div className="admin-geo-grid">
      <label>{labels.country||'País'}
        <select value={country} disabled={loading.countries} onChange={e=>patch({
          pais:e.target.value,estado:'',ciudad:'',municipio:'',cp:'',colonia:''
        })}>
          {(countries.length?countries:[{code:'MX',name:'México'}]).map(c=>
            <option key={c.code||c.name} value={c.name}>{c.name}</option>
          )}
        </select>
      </label>

      <label>{labels.state||'Estado'}
        <select required={required} value={state} disabled={country!=='México'||loading.states} onChange={e=>patch({
          estado:e.target.value,ciudad:'',municipio:'',cp:'',colonia:''
        })}>
          <option value="">{loading.states?'Cargando estados…':'Selecciona estado'}</option>
          {states.map(x=><option key={x} value={x}>{x}</option>)}
        </select>
      </label>

      <label>{labels.city||'Municipio / Ciudad'}
        <select required={required} value={city} disabled={!state||loading.cities} onChange={e=>patch({
          ciudad:e.target.value,municipio:e.target.value,cp:'',colonia:''
        })}>
          <option value="">{loading.cities?'Cargando…':'Selecciona municipio / ciudad'}</option>
          {cities.map(x=><option key={x} value={x}>{x}</option>)}
        </select>
      </label>

      <label>{labels.zip||'Código postal'}
        <select required={required} value={zip} disabled={!city||loading.zips} onChange={e=>patch({
          cp:e.target.value,colonia:''
        })}>
          <option value="">{loading.zips?'Cargando CP…':'Selecciona CP'}</option>
          {postalCodes.map(x=><option key={x} value={x}>{x}</option>)}
        </select>
      </label>

      <label>{labels.settlement||'Colonia / Asentamiento'}
        <select value={settlement} disabled={!zip||loading.settlements} onChange={e=>{
          const row=uniqueSettlements.find(x=>(x.colonia||'')===e.target.value);
          patch({
            colonia:e.target.value,
            estado:row?.estado||state,
            municipio:row?.municipio||city,
            ciudad:row?.ciudad||row?.municipio||city
          });
        }}>
          <option value="">{loading.settlements?'Cargando colonias…':'Selecciona colonia'}</option>
          {uniqueSettlements.map((x,i)=><option key={`${x.colonia}-${i}`} value={x.colonia||''}>
            {x.colonia||'Sin colonia'}{x.tipo_asentamiento?` · ${x.tipo_asentamiento}`:''}
          </option>)}
        </select>
      </label>

      {includeAddress?<label className="admin-geo-address">{labels.address||'Dirección'}
        <input value={address} onChange={e=>patch({direccion:e.target.value})} placeholder="Calle, número exterior/interior"/>
      </label>:null}
    </div>

    {message?<div className="admin-geo-message">{message}</div>:null}
  </div>;
}
