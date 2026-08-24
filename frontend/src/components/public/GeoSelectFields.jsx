import { useEffect,useState } from 'react';
import { publicApi } from '../../services/publicApi.js';

export default function GeoSelectFields({value,onChange,includeAddress=true}){
  const v=value||{};
  const [countries,setCountries]=useState([]);
  const [states,setStates]=useState([]);
  const [cities,setCities]=useState([]);
  const [postalCodes,setPostalCodes]=useState([]);
  const [settlements,setSettlements]=useState([]);

  useEffect(()=>{publicApi('/api/public/geo/countries').then(r=>setCountries(r.data||[])).catch(()=>{});},[]);
  useEffect(()=>{
    if((v.country||'México')!=='México'){setStates([]);return;}
    publicApi('/api/public/geo/states').then(r=>setStates(r.data||[])).catch(()=>{});
  },[v.country]);
  useEffect(()=>{
    if(!v.state){setCities([]);return;}
    publicApi(`/api/public/geo/cities?state=${encodeURIComponent(v.state)}`).then(r=>setCities(r.data||[])).catch(()=>{});
  },[v.state]);
  useEffect(()=>{
    if(!v.state||!v.city){setPostalCodes([]);return;}
    publicApi(`/api/public/geo/postal-codes?state=${encodeURIComponent(v.state)}&city=${encodeURIComponent(v.city)}`).then(r=>setPostalCodes(r.data||[])).catch(()=>{});
  },[v.state,v.city]);
  useEffect(()=>{
    if(!v.zip){setSettlements([]);return;}
    publicApi(`/api/public/geo/settlements?cp=${encodeURIComponent(v.zip)}`).then(r=>setSettlements(r.data||[])).catch(()=>{});
  },[v.zip]);

  function set(key,val,clear=[]){
    onChange?.({...v,[key]:val,...Object.fromEntries(clear.map(k=>[k,'']))});
  }

  return <div className="geo-select-grid">
    <label>País<select value={v.country||'México'} onChange={e=>set('country',e.target.value,['state','city','zip','settlement'])}>
      {(countries.length?countries:[{code:'MX',name:'México'}]).map(c=><option key={c.code} value={c.name}>{c.name}</option>)}
    </select></label>
    <label>Estado<select required value={v.state||''} onChange={e=>set('state',e.target.value,['city','zip','settlement'])}>
      <option value="">Selecciona estado</option>{states.map(x=><option key={x} value={x}>{x}</option>)}
    </select></label>
    <label>Ciudad / municipio<select required value={v.city||''} onChange={e=>set('city',e.target.value,['zip','settlement'])}>
      <option value="">Selecciona ciudad</option>{cities.map(x=><option key={x} value={x}>{x}</option>)}
    </select></label>
    <label>Código postal<select required value={v.zip||''} onChange={e=>set('zip',e.target.value,['settlement'])}>
      <option value="">Selecciona CP</option>{postalCodes.map(x=><option key={x} value={x}>{x}</option>)}
    </select></label>
    <label>Colonia / asentamiento<select value={v.settlement||''} onChange={e=>set('settlement',e.target.value)}>
      <option value="">Selecciona colonia</option>{settlements.map((x,i)=><option key={`${x.colonia}-${i}`} value={x.colonia||''}>{x.colonia||'Sin colonia'}{x.tipo_asentamiento?` · ${x.tipo_asentamiento}`:''}</option>)}
    </select></label>
    {includeAddress?<label className="span2">Calle y número<input required value={v.address||''} onChange={e=>set('address',e.target.value)} placeholder="Calle, número exterior/interior"/></label>:null}
  </div>;
}
